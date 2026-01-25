# web_app.py
import os
import uuid
import base64
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import config
from app.bill_parser import BillParser, _load_templates_from_file, _compile_template
from app.storage import ExcelSaver, DatabaseSaver
from app.enhanced_storage import EnhancedDatabaseManager, EnhancedBill, CategoryRule, CategoryGroup, RecurringRule
from datetime import date
try:
    from PIL import Image
except ImportError:
    Image = None


def _make_preview_base64(image_bytes: bytes, max_side: int = 900, jpeg_quality: int = 75) -> str:
    """
    生成缩略预览图（强烈建议），大幅减少返回体积和接口耗时
    - max_side: 预览图最长边
    - jpeg_quality: 预览图质量
    """
    if Image is None:
        # 没有 PIL 就直接返回原图 base64（会很大、很慢）
        return base64.b64encode(image_bytes).decode("utf-8")

    from io import BytesIO

    try:
        with Image.open(BytesIO(image_bytes)) as img:
            img = img.convert("RGB")
            w, h = img.size
            m = max(w, h)
            if m > max_side:
                scale = max_side / m
                img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.BILINEAR)

            out = BytesIO()
            img.save(out, format="JPEG", quality=jpeg_quality, optimize=False)
            return base64.b64encode(out.getvalue()).decode("utf-8")
    except Exception:
        # 出错就兜底返回原图
        return base64.b64encode(image_bytes).decode("utf-8")

# Initialize Flask app
app = Flask(__name__, static_folder='static')
CORS(app)  # Enable CORS for API endpoints

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}


import os
import threading
import time


# Global variables for processing
bill_parser = None
excel_saver = None
db_saver = None
enhanced_db = None
_default_ledger_id = None


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

import threading
import os

_init_lock = threading.Lock()

def init_processors(*, need_parser=False, need_savers=False, need_db=False):
    global bill_parser, excel_saver, db_saver, enhanced_db, _default_ledger_id

    # ✅ 快速路径：本次需要的都准备好才 return
    if ((not need_parser or bill_parser is not None) and
        (not need_savers or (excel_saver is not None and db_saver is not None)) and
        (not need_db or enhanced_db is not None)):
        return

    with _init_lock:
        if need_parser and bill_parser is None:
            cpu = os.cpu_count() or 8
            cpu_threads = min(8, max(2, cpu // 2))

            bill_parser = BillParser(
                max_side=1280,
                jpeg_quality=80,
                use_gpu=True,
                cpu_threads=cpu_threads,
                debug=True,
                templates_path="templates.json"
            )

        if need_savers:
            if excel_saver is None:
                excel_saver = ExcelSaver()
            if db_saver is None:
                db_saver = DatabaseSaver()

        if need_db and enhanced_db is None:
            enhanced_db = EnhancedDatabaseManager()
            _default_ledger_id = enhanced_db.get_default_ledger_id()

        if bill_parser is not None and enhanced_db is not None:
            # 让模板解析使用数据库中的最新分类规则
            bill_parser.category_rules_loader = lambda: enhanced_db.get_category_rules(_default_ledger_id)


_ocr_ready = threading.Event()
_ocr_error = None


def get_ledger_id_from_request():
    try:
        lid = request.args.get('ledger_id') or request.form.get('ledger_id') or (request.get_json() or {}).get('ledger_id')
        if lid in (None, '', 'null'):
            return _default_ledger_id
        return int(lid)
    except Exception:
        return _default_ledger_id

def ensure_recurring_bills(ledger_id):
    try:
        if enhanced_db is not None:
            enhanced_db.generate_recurring_bills(ledger_id)
    except Exception as e:
        print(f"[Recurring] generate failed: {e}")

def warmup_ocr_async():
    global _ocr_error
    try:
        # 只初始化 OCR 相关（你用按需 init 的话）
        init_processors(need_parser=True)  # 或 need_parser=True, need_db=True 看你 parse 依赖
        # 可选：做一次空跑/小图 warmup，让第一次上传更快
        # bill_parser.parse(r"data\bills\0107_1.jpg")  # 有现成样例图的话
        _ocr_ready.set()
        print("✅ [Warmup] OCR ready")
    except Exception as e:
        _ocr_error = e
        _ocr_ready.set()
        print(f"❌ [Warmup] OCR init failed: {e}")

def start_warmup_once():
    # Flask debug reloader：只在真正的子进程做 warmup
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        threading.Thread(target=warmup_ocr_async, daemon=True).start()

start_warmup_once()


def format_category_name(major, minor):
    major = str(major or '').strip()
    minor = str(minor or '').strip()
    return f"{major}/{minor}" if minor else major

@app.route('/')
def index():
    """Serve the main HTML page (React build preferred)"""
    react_root = os.path.join(app.static_folder, 'react')
    react_index = os.path.join(react_root, 'index.html')
    if os.path.exists(react_index):
        return send_from_directory(react_root, 'index.html')
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Serve static files from legacy or React build output"""
    base_path = os.path.join(app.static_folder, filename)
    react_root = os.path.join(app.static_folder, 'react')
    react_path = os.path.join(react_root, filename)

    if os.path.exists(base_path):
        return send_from_directory(app.static_folder, filename)
    if os.path.exists(react_path):
        return send_from_directory(react_root, filename)
    # fallback to React index for SPA routing if build exists
    if os.path.exists(os.path.join(react_root, 'index.html')):
        return send_from_directory(react_root, 'index.html')
    return send_from_directory(app.static_folder, 'index.html')

# === Ledger API ===

@app.route('/api/ledgers', methods=['GET'])
def list_ledgers():
    init_processors(need_db=True)
    ledgers = enhanced_db.list_ledgers()
    return jsonify({'success': True, 'ledgers': ledgers})


@app.route('/api/ledgers', methods=['POST'])
def create_ledger():
    init_processors(need_db=True)
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    budget = float(data.get('monthly_budget') or 0)
    if not name:
        return jsonify({'success': False, 'error': '账本名称不能为空'}), 400
    ledger_id = enhanced_db.save_ledger({'name': name, 'monthly_budget': budget})
    return jsonify({'success': True, 'ledger_id': ledger_id})


@app.route('/api/ledgers/<int:ledger_id>', methods=['PUT'])
def update_ledger(ledger_id):
    init_processors(need_db=True)
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    budget = float(data.get('monthly_budget') or 0)
    if not name:
        return jsonify({'success': False, 'error': '账本名称不能为空'}), 400
    enhanced_db.save_ledger({'id': ledger_id, 'name': name, 'monthly_budget': budget})
    return jsonify({'success': True})


@app.route('/api/ledgers/<int:ledger_id>', methods=['DELETE'])
def delete_ledger(ledger_id):
    init_processors(need_db=True)
    global _default_ledger_id
    ledgers = enhanced_db.list_ledgers()
    if len(ledgers) <= 1:
        return jsonify({'success': False, 'error': '至少保留一个账本', 'code': 'last_ledger'}), 400
    if not any(l.get('id') == ledger_id for l in ledgers):
        return jsonify({'success': False, 'error': '账本不存在', 'code': 'not_found'}), 404
    deleted = enhanced_db.delete_ledger(ledger_id)
    if deleted:
        _default_ledger_id = enhanced_db.get_default_ledger_id()
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '删除失败'}), 500


@app.route('/api/ledger-backups', methods=['GET'])
def list_ledger_backups():
    init_processors(need_db=True)
    backups = enhanced_db.list_ledger_backups()
    return jsonify({'success': True, 'backups': backups})


@app.route('/api/ledger-backups/<int:backup_id>/restore', methods=['POST'])
def restore_ledger_backup(backup_id):
    init_processors(need_db=True)
    global _default_ledger_id
    result = enhanced_db.restore_ledger_backup(backup_id)
    if not result.get('success'):
        code = result.get('error') or 'restore_failed'
        msg_map = {
            'backup_not_found': '备份不存在',
            'backup_invalid': '备份格式有误',
            'ledger_exists': '账本已存在，无法恢复',
            'restore_failed': '恢复失败',
        }
        return jsonify({'success': False, 'error': msg_map.get(code, '恢复失败'), 'code': code}), 400
    _default_ledger_id = enhanced_db.get_default_ledger_id()
    return jsonify({'success': True, 'ledger_id': result.get('ledger_id'), 'ledger_name': result.get('ledger_name')})


@app.route('/api/ledger-backups/<int:backup_id>', methods=['DELETE'])
def delete_ledger_backup(backup_id):
    init_processors(need_db=True)
    deleted = enhanced_db.delete_ledger_backup(backup_id)
    if deleted:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '备份不存在'}), 404

@app.route('/api/save', methods=['POST'])
def save_bills():
    """Save processed and edited bill data"""
    try:
        # Initialize processors if not already done
        init_processors()
        
        # Get JSON data from request
        data = request.get_json()
        if not data or 'bills' not in data:
            return jsonify({
                'success': False,
                'error': '同一分类下关键词已存在'
            }), 400
        
        bills = data['bills']
        if not bills:
            return jsonify({
                'success': False,
                'error': '没有可保存的账单'
            }), 400
        
        saved_count = 0
        errors = []
        
        for bill_data in bills:
            try:
                # Validate required fields
                required_fields = ['merchant', 'amount', 'filename']
                for field in required_fields:
                    if field not in bill_data:
                        raise ValueError(f"缺少必填字段: {field}")
                if not (bill_data.get('category') or bill_data.get('category_id')):
                    raise ValueError("缺少必填字段: category")
                
                # Create enhanced bill object
                from app.enhanced_storage import EnhancedBill
                bill = EnhancedBill(
                    filename=bill_data['filename'],
                    merchant=str(bill_data['merchant']).strip(),
                    amount=float(bill_data['amount']),
                    category=str(bill_data.get('category') or '').strip(),
                    category_id=bill_data.get('category_id'),
                    bill_date=bill_data.get('bill_date', ''),
                    raw_text=[],  # We don't have raw_text in the save request
                    is_manual=bill_data.get('is_manual', False),
                    ledger_id=bill_data.get('ledger_id') or data.get('ledger_id') or get_ledger_id_from_request(),
                    include_in_budget=bool(bill_data.get('include_in_budget', True))
                )
                
                # Validate amount
                if bill.amount < 0:
                    raise ValueError("金额不能为负数")
                
                # Save to enhanced database
                enhanced_db.save_bill(bill)
                saved_count += 1
                
            except Exception as save_error:
                error_msg = f"保存账单失败 {bill_data.get('filename', 'unknown')}: {str(save_error)}"
                errors.append(error_msg)
        
        # Determine response
        if saved_count > 0:
            message = f"成功保存了 {saved_count} 笔账单"
            if errors:
                message += f",  {len(errors)} 笔失败"
            
            return jsonify({
                'success': True,
                'saved_count': saved_count,
                'message': message,
                'errors': errors
            })
        else:
            return jsonify({
                'success': False,
                'saved_count': 0,
                'message': '未保存任何账单',
                'errors': errors
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/upload', methods=['POST'])
def upload_files():
    """Handle multiple file uploads and process bills"""
    # try:
    # ✅ 确保 init_processors() 内部是“只初始化一次”
    init_processors(need_parser=True, need_savers=True, need_db=True)


    ledger_id = request.form.get('ledger_id') or get_ledger_id_from_request()
    if bill_parser:
        bill_parser.category_rules_loader = lambda: enhanced_db.get_category_rules(ledger_id)

    if 'files' not in request.files:
        return jsonify({'success': False, 'error': '未提供文件'}), 400

    files = request.files.getlist('files')
    if not files or all(f.filename == '' for f in files):
        return jsonify({'success': False, 'error': '未选择文件'}), 400

    bill_date = request.form.get('bill_date') or date.today().strftime('%Y-%m-%d')

    results = []
    errors = []

    # 先把有效文件收集起来：保存临时文件 + 生成缩略预览
    items = []  # 每个元素：{id, filename, temp_path, preview_b64}
    for f in files:
        if not f or f.filename == '':
            continue

        filename = secure_filename(f.filename)

        if not allowed_file(filename):
            errors.append(f"文件 {filename}: 不支持的文件类型")
            continue

        file_id = str(uuid.uuid4())

        # ✅ 只读一次：拿到 bytes，用于写盘 + 预览
        image_bytes = f.read()
        if not image_bytes:
            errors.append(f"文件 {filename}: 空文件")
            continue

        temp_path = os.path.join(config.OUTPUT_DIR, f"temp_{file_id}_{filename}")
        try:
            with open(temp_path, "wb") as fp:
                fp.write(image_bytes)
        except Exception as e:
            errors.append(f"文件 {filename}: 保存失败 - {str(e)}")
            continue

        preview_b64 = _make_preview_base64(image_bytes, max_side=900, jpeg_quality=75)

        items.append({
            "id": file_id,
            "filename": filename,
            "temp_path": temp_path,
            "preview_b64": preview_b64,
        })

    if not items:
        return jsonify({'success': True, 'results': [], 'errors': errors})

    # ✅ 并行 OCR：一次性批处理（你前面优化的 parse_batch 在这里才吃满收益）
    ocr_start = time.perf_counter()
    print(f"🧾 [OCR] 开始识别 {len(items)} 张账单...")
    paths = [it["temp_path"] for it in items]
    bill_datas = bill_parser.parse_batch(paths)  # 内部会自动计算 max_workers（你已加第3步联动）
    
    # debug
    for i, d in enumerate(bill_datas):
        dbg = d.get("_debug", {})
        print(f"[{i}] tpl={d.get('_template')} merchant={d.get('merchant')}")
        print("item", dbg.get("item"))
        print("indexed_scoped_lines head", dbg.get("indexed_scoped_lines", [])[:8])


    ocr_elapsed = time.perf_counter() - ocr_start
    print(f"✅ [OCR] 完成识别 {len(items)} 张账单，耗时 {ocr_elapsed:.2f}s")

    # 组装结果 + 清理临时文件
    for it, bill_data in zip(items, bill_datas):
        err = bill_data.get("error")
        result = {
            'id': it["id"],
            'filename': it["filename"],
            'merchant': bill_data.get('merchant', ''),
            'amount': bill_data.get('amount', 0.0),
            'category': bill_data.get('category', ''),
            'raw_text': bill_data.get('raw_text', []),

            # ✅ 返回缩略预览（不建议返回原图，会很慢）
            'image_data': it["preview_b64"],
            'bill_date': bill_date,
            'error': err
        }
        results.append(result)
        if err:
            errors.append(f"File {it['filename']}: {err}")

    # ✅ 统一清理临时文件
    for it in items:
        try:
            if os.path.exists(it["temp_path"]):
                os.remove(it["temp_path"])
        except OSError:
            pass

    return jsonify({'success': True, 'results': results, 'errors': errors})

    # except Exception as e:
    #     return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Get available categories for dropdown"""
    try:
        init_processors()
        categories = enhanced_db.list_category_names()
        if not categories:
            categories = list(set(config.CATEGORY_RULES.values()))
            categories.sort()
        return jsonify({
            'success': True,
            'categories': categories
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# === Enhanced API Endpoints ===

@app.route('/api/bills', methods=['GET'])
def get_bills():
    """Get bills with filtering and pagination"""
    try:
        init_processors()
        
        # Get query parameters
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        category = request.args.get('category')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        include_in_budget_raw = request.args.get('include_in_budget')
        include_in_budget = None
        if include_in_budget_raw is not None:
            if str(include_in_budget_raw).lower() in ('1', 'true', 'yes'):
                include_in_budget = True
            elif str(include_in_budget_raw).lower() in ('0', 'false', 'no'):
                include_in_budget = False
        sort_by = request.args.get('sort_by')
        sort_order = request.args.get('sort_order')
        ledger_id = get_ledger_id_from_request()
        
        # Validate limit
        if limit > 1000:
            limit = 1000
        
        bills = enhanced_db.get_bills(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
            category=category,
            keyword=keyword,
            major=major,
            minor=minor,
            ledger_id=ledger_id,
            sort_by=sort_by,
            sort_order=sort_order
        )
        total_count = enhanced_db.get_bills_count(
            start_date=start_date,
            end_date=end_date,
            category=category,
            keyword=keyword,
            major=major,
            minor=minor,
            ledger_id=ledger_id
        )
        
        # Convert to JSON format
        bills_data = []
        for bill in bills:
            bills_data.append({
                'id': bill.id,
                'filename': bill.filename,
                'merchant': bill.merchant,
                'amount': bill.amount,
                'category_id': bill.category_id,
                'category': bill.category,
                'bill_date': bill.bill_date,
                'created_at': bill.created_at,
                'updated_at': bill.updated_at,
                'is_manual': bill.is_manual,
                'include_in_budget': bill.include_in_budget,
                'ledger_id': bill.ledger_id
            })
        
        return jsonify({
            'success': True,
            'bills': bills_data,
            'count': len(bills_data),
            'total_count': total_count
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/bills', methods=['POST'])
def create_bill():
    """Create a new bill manually"""
    try:
        init_processors()
        
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': '未提供数据'
            }), 400
        
        # Validate required fields
        required_fields = ['merchant', 'amount']
        for field in required_fields:
            if field not in data or data[field] in (None, ''):
                return jsonify({
                    'success': False,
                    'error': f'缺少必填字段: {field}'
                }), 400
        if not (data.get('category') or data.get('category_id')):
            return jsonify({
                'success': False,
                'error': '缺少必填字段: category'
            }), 400
        
        # Create new bill
        bill = EnhancedBill(
            filename=data.get('filename', '手动录入'),
            merchant=str(data['merchant']).strip(),
            amount=float(data['amount']),
            category=str(data.get('category') or '').strip(),
            category_id=data.get('category_id'),
            bill_date=data.get('bill_date', ''),
            raw_text=data.get('raw_text', []),
            is_manual=True,
            ledger_id=data.get('ledger_id') or get_ledger_id_from_request(),
            include_in_budget=bool(data.get('include_in_budget', True))
        )
        
        # Validate amount
        if bill.amount < 0:
            return jsonify({
                'success': False,
                'error': '金额不能为负数'
            }), 400
        
        # Save to database
        bill_id = enhanced_db.save_bill(bill)
        bill.id = bill_id
        
        return jsonify({
            'success': True,
            'bill': {
                'id': bill.id,
                'filename': bill.filename,
                'merchant': bill.merchant,
                'amount': bill.amount,
                'category_id': bill.category_id,
                'category': bill.category,
                'bill_date': bill.bill_date,
                'created_at': bill.created_at,
                'updated_at': bill.updated_at,
                'is_manual': bill.is_manual,
                'include_in_budget': bill.include_in_budget
            }
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'无效数据: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/bills/<int:bill_id>', methods=['PUT'])
def update_bill(bill_id):
    """Update an existing bill"""
    try:
        init_processors()
        
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': '未提供数据'
            }), 400
        
        # Get existing bill
        bill = enhanced_db.get_bill(bill_id)
        if not bill:
            return jsonify({
                'success': False,
                'error': '账单不存在'
            }), 404
        
        # Update fields
        if 'merchant' in data:
            bill.merchant = str(data['merchant']).strip()
        if 'amount' in data:
            bill.amount = float(data['amount'])
            if bill.amount < 0:
                return jsonify({
                    'success': False,
                    'error': '金额不能为负数'
                }), 400
        if 'category' in data:
            bill.category = str(data['category']).strip()
        if 'category_id' in data:
            bill.category_id = data['category_id']
        if 'bill_date' in data:
            bill.bill_date = data['bill_date']
        if 'filename' in data:
            bill.filename = data['filename']
        if 'include_in_budget' in data:
            bill.include_in_budget = bool(data['include_in_budget'])
        
        # Save updated bill
        enhanced_db.save_bill(bill)
        
        return jsonify({
            'success': True,
            'bill': {
                'id': bill.id,
                'filename': bill.filename,
                'merchant': bill.merchant,
                'amount': bill.amount,
                'category_id': bill.category_id,
                'category': bill.category,
                'bill_date': bill.bill_date,
                'created_at': bill.created_at,
                'updated_at': bill.updated_at,
                'is_manual': bill.is_manual,
                'include_in_budget': bill.include_in_budget
            }
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'无效数据: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/bills/<int:bill_id>', methods=['DELETE'])
def delete_bill(bill_id):
    """Delete a bill"""
    try:
        init_processors()
        
        deleted = enhanced_db.delete_bill(bill_id)
        
        if deleted:
            return jsonify({
                'success': True,
                'message': '账单删除成功'
            })
        else:
            return jsonify({
                'success': False,
                'error': '账单不存在'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/bills/batch-delete', methods=['POST'])
def batch_delete_bills():
    """Batch delete bills"""
    try:
        init_processors(need_db=True)
        
        data = request.get_json()
        bill_ids = data.get('bill_ids', [])
        ledger_id = data.get('ledger_id')
        
        if not bill_ids:
            return jsonify({
                'success': False,
                'error': '未提供账单ID'
            }), 400
            
        deleted_count = 0
        for bill_id in bill_ids:
            if enhanced_db.delete_bill(bill_id):
                deleted_count += 1
        
        return jsonify({
            'success': True,
            'message': f'成功删除 {deleted_count} 笔账单',
            'deleted_count': deleted_count
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/bills/batch-update-budget', methods=['POST'])
def batch_update_budget():
    """Batch update bills budget inclusion"""
    try:
        init_processors(need_db=True)
        
        data = request.get_json()
        bill_ids = data.get('bill_ids', [])
        include_in_budget = data.get('include_in_budget', True)
        ledger_id = data.get('ledger_id')
        
        if not bill_ids:
            return jsonify({
                'success': False,
                'error': '未提供账单ID'
            }), 400
            
        updated_count = 0
        for bill_id in bill_ids:
            if enhanced_db.update_bill_budget_status(bill_id, include_in_budget):
                updated_count += 1
        
        return jsonify({
            'success': True,
            'message': f'成功更新 {updated_count} 笔账单',
            'updated_count': updated_count
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# === Analytics API Endpoints ===

@app.route('/api/analytics/summary', methods=['GET'])
def get_analytics_summary():
    """Get overall spending summary"""
    try:
        init_processors(need_db=True)

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        include_in_budget_raw = request.args.get('include_in_budget')
        include_in_budget = None
        if include_in_budget_raw is not None:
            if str(include_in_budget_raw).lower() in ('1', 'true', 'yes'):
                include_in_budget = True
            elif str(include_in_budget_raw).lower() in ('0', 'false', 'no'):
                include_in_budget = False
        
        ledger_id = get_ledger_id_from_request()
        ensure_recurring_bills(ledger_id)
        summary = enhanced_db.get_spending_summary(
            start_date, end_date, keyword, major, minor, ledger_id, include_in_budget=include_in_budget
        )
        
        return jsonify({
            'success': True,
            'summary': summary
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analytics/daily', methods=['GET'])
def get_daily_analytics():
    """Get daily spending data"""
    try:
        init_processors(need_db=True)
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        
        ledger_id = get_ledger_id_from_request()
        ensure_recurring_bills(ledger_id)
        daily_data = enhanced_db.get_daily_spending(start_date, end_date, keyword, major, minor, ledger_id)
        
        return jsonify({
            'success': True,
            'daily_data': daily_data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analytics/weekly', methods=['GET'])
def get_weekly_analytics():
    """Get weekly spending data"""
    try:
        init_processors(need_db=True)
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        
        # Get daily data and aggregate by week
        ledger_id = get_ledger_id_from_request()
        ensure_recurring_bills(ledger_id)
        daily_data = enhanced_db.get_daily_spending(start_date, end_date, keyword, major, minor, ledger_id)
        
        # Group by week
        weekly_data = {}
        for day in daily_data:
            # Get week start date (Monday)
            from datetime import datetime, timedelta
            date_obj = datetime.strptime(day['date'], '%Y-%m-%d')
            week_start = date_obj - timedelta(days=date_obj.weekday())
            week_key = week_start.strftime('%Y-%m-%d')
            
            if week_key not in weekly_data:
                weekly_data[week_key] = {
                    'week_start': week_key,
                    'amount': 0,
                    'count': 0
                }
            
            weekly_data[week_key]['amount'] += day['amount']
            weekly_data[week_key]['count'] += day['count']
        
        # Convert to list and sort
        weekly_list = list(weekly_data.values())
        weekly_list.sort(key=lambda x: x['week_start'], reverse=True)
        
        return jsonify({
            'success': True,
            'weekly_data': weekly_list
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analytics/yearly', methods=['GET'])
def get_yearly_analytics():
    """Get yearly spending data"""
    try:
        init_processors(need_db=True)
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')

        # Get all daily data and aggregate by year
        ledger_id = get_ledger_id_from_request()
        ensure_recurring_bills(ledger_id)
        daily_data = enhanced_db.get_daily_spending(start_date, end_date, keyword, major, minor, ledger_id)
        
        # Group by year
        yearly_data = {}
        for day in daily_data:
            year = day['date'][:4]  # Extract year from YYYY-MM-DD
            
            if year not in yearly_data:
                yearly_data[year] = {
                    'year': year,
                    'amount': 0,
                    'count': 0
                }
            
            yearly_data[year]['amount'] += day['amount']
            yearly_data[year]['count'] += day['count']
        
        # Convert to list and sort
        yearly_list = list(yearly_data.values())
        yearly_list.sort(key=lambda x: x['year'], reverse=True)
        
        return jsonify({
            'success': True,
            'yearly_data': yearly_list
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analytics/categories', methods=['GET'])
def get_category_analytics():
    """Get category breakdown"""
    try:
        init_processors(need_db=True)
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        
        ledger_id = get_ledger_id_from_request()
        ensure_recurring_bills(ledger_id)
        summary = enhanced_db.get_spending_summary(start_date, end_date, keyword, major, minor, ledger_id)
        
        # Format category data for frontend
        category_data = []
        for category, data in summary['categories'].items():
            category_data.append({
                'category': category,
                'amount': data['amount'],
                'count': data['count'],
                'percentage': (data['amount'] / summary['total_amount'] * 100) if summary['total_amount'] > 0 else 0
            })
        
        # Sort by amount descending
        category_data.sort(key=lambda x: x['amount'], reverse=True)
        
        return jsonify({
            'success': True,
            'category_data': category_data,
            'total_amount': summary['total_amount']
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# === Dashboard API Endpoints ===

@app.route('/api/dashboard/summary', methods=['GET'])
def get_dashboard_summary():
    """Get dashboard summary data including monthly spending, budget status, and top categories"""
    try:
        init_processors(need_db=True)
        
        ledger_id = get_ledger_id_from_request()
        ensure_recurring_bills(ledger_id)
        
        # Get current month date range
        from datetime import datetime, date
        import calendar
        
        today = date.today()
        month_start = today.replace(day=1).strftime('%Y-%m-%d')
        last_day = calendar.monthrange(today.year, today.month)[1]
        month_end = today.replace(day=last_day).strftime('%Y-%m-%d')
        
        # Get monthly spending summary
        monthly_summary = enhanced_db.get_spending_summary(
            start_date=month_start,
            end_date=month_end,
            ledger_id=ledger_id
        )
        monthly_budget_summary = enhanced_db.get_spending_summary(
            start_date=month_start,
            end_date=month_end,
            ledger_id=ledger_id,
            include_in_budget=True
        )
        
        # Get budget information from ledger
        ledgers = enhanced_db.list_ledgers()
        current_ledger = next((l for l in ledgers if l['id'] == ledger_id), None)
        total_budget = current_ledger['monthly_budget'] if current_ledger else 0.0
        
        # Calculate budget status
        used_amount = monthly_budget_summary['total_amount']
        used_percentage = (used_amount / total_budget * 100) if total_budget > 0 else 0
        non_budget_spending = max(0.0, monthly_summary['total_amount'] - used_amount)
        
        # Calculate time progress (how much of the month has passed)
        days_in_month = last_day
        current_day = today.day
        time_progress = (current_day / days_in_month * 100)
        
        # Get top 3 categories
        top_categories = []
        category_items = list(monthly_summary['categories'].items())
        category_items.sort(key=lambda x: x[1]['amount'], reverse=True)
        
        # Category icon mapping
        category_icons = {
            '住房': {'icon': '🏠', 'color': '#ff7875'},
            '餐饮': {'icon': '🍽️', 'color': '#ffa940'},
            '购物': {'icon': '🛒', 'color': '#73d13d'},
            '交通': {'icon': '🚗', 'color': '#40a9ff'},
            '娱乐': {'icon': '🎮', 'color': '#b37feb'},
            '医疗': {'icon': '🏥', 'color': '#ff85c0'},
            '教育': {'icon': '📚', 'color': '#36cfc9'},
            '其他': {'icon': '📦', 'color': '#95de64'}
        }
        
        for category_name, category_data in category_items[:3]:
            # Extract major category for icon mapping
            major_category = category_name.split('/')[0] if '/' in category_name else category_name
            icon_info = category_icons.get(major_category, category_icons['其他'])
            
            top_categories.append({
                'category': category_name,
                'amount': category_data['amount'],
                'count': category_data['count'],
                'icon': icon_info['icon'],
                'color': icon_info['color']
            })
        
        return jsonify({
            'success': True,
            'data': {
                'monthly_spending': monthly_summary['total_amount'],
                'non_budget_spending': non_budget_spending,
                'budget_info': {
                    'total_budget': total_budget,
                    'used_amount': used_amount,
                    'used_percentage': round(used_percentage, 1),
                    'time_progress': round(time_progress, 1),
                    'remaining_budget': total_budget - used_amount
                },
                'top_categories': top_categories,
                'metadata': {
                    'month': today.strftime('%Y-%m'),
                    'ledger_id': ledger_id,
                    'last_updated': datetime.now().isoformat()
                }
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/bills/export', methods=['GET'])
def export_bills():
    """Export bills as CSV with filters"""
    try:
        init_processors()

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')

        bills = enhanced_db.get_bills(
            limit=100000,
            offset=0,
            start_date=start_date,
            end_date=end_date,
            category=None,
            keyword=keyword,
            major=major,
            minor=minor
        )

        import csv
        import io
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['关键词', '类别', '金额', '日期'])
        for bill in bills:
            writer.writerow([
                bill.merchant,
                bill.category,
                bill.amount,
                bill.bill_date
            ])

        csv_content = output.getvalue()
        output.close()
        response = app.response_class(
            response='\ufeff' + csv_content,
            mimetype='text/csv; charset=utf-8'
        )
        response.headers['Content-Disposition'] = 'attachment; filename=bills_export.csv'
        return response
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# === Category Group Management API Endpoints ===

@app.route('/api/config/category-groups', methods=['GET'])
def get_category_groups():
    """Get all category groups"""
    try:
        init_processors(need_db=True, need_parser=True)
        ledger_id = get_ledger_id_from_request()
        groups = enhanced_db.get_category_groups(ledger_id)
        groups_data = []
        for group in groups:
            groups_data.append({
                'id': group.id,
                'major': group.major,
                'minor': group.minor,
                'full_name': format_category_name(group.major, group.minor),
                'ledger_id': group.ledger_id
                # 'created_at': group.created_at,
                # 'updated_at': group.updated_at
            })
        return jsonify({
            'success': True,
            'categories': groups_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config/category-groups', methods=['POST'])
def create_category_group():
    """Create a category group"""
    try:
        init_processors()
        data = request.get_json()
        ledger_raw = data.get('ledger_id') if data else None
        ledger_id = None if ledger_raw in (None, '', 'null') else int(ledger_raw) if ledger_raw is not None else get_ledger_id_from_request()
        if not data:
            return jsonify({
                'success': False,
                'error': '未提供数据'
            }), 400

        major = str(data.get('major', '')).strip()
        minor = str(data.get('minor', '')).strip()
        if not major:
            return jsonify({
                'success': False,
                'error': '缺少必填字段: major'
            }), 400

        if enhanced_db.category_group_conflict(major, minor, ledger_id):
            return jsonify({
                'success': False,
                'error': '分类已存在'
            }), 400

        group = CategoryGroup(major=major, minor=minor, ledger_id=ledger_id)
        group_id = enhanced_db.save_category_group(group)
        group.id = group_id

        return jsonify({
            'success': True,
            'category': {
                'id': group.id,
                'major': group.major,
                'minor': group.minor,
                'full_name': format_category_name(group.major, group.minor),
                'created_at': group.created_at,
                'updated_at': group.updated_at
            }
        })
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config/category-groups/<int:category_id>', methods=['PUT'])
def update_category_group(category_id):
    """Update a category group"""
    try:
        init_processors()
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': '未提供数据'
            }), 400

        existing = enhanced_db.get_category_group(category_id)
        if not existing:
            return jsonify({
                'success': False,
                'error': '分类不存在'
            }), 404

        major = str(data.get('major', existing.major)).strip()
        minor = str(data.get('minor', existing.minor)).strip()
        if not major:
            return jsonify({
                'success': False,
                'error': '缺少必填字段: major'
            }), 400

        if 'ledger_id' in data:
            ledger_raw = data.get('ledger_id')
            ledger_id = None if ledger_raw in (None, '', 'null') else int(ledger_raw)
        else:
            ledger_id = existing.ledger_id
        if enhanced_db.category_group_conflict(major, minor, ledger_id, exclude_id=category_id):
            return jsonify({
                'success': False,
                'error': '分类已存在'
            }), 400

        existing.major = major
        existing.minor = minor
        existing.ledger_id = ledger_id
        enhanced_db.save_category_group(existing)

        return jsonify({
            'success': True,
            'category': {
                'id': existing.id,
                'major': existing.major,
                'minor': existing.minor,
                'full_name': format_category_name(existing.major, existing.minor),
                'created_at': existing.created_at,
                'updated_at': existing.updated_at
            }
        })
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config/category-groups/<int:category_id>', methods=['DELETE'])
def delete_category_group(category_id):
    """Delete a category group"""
    try:
        init_processors()
        result = enhanced_db.delete_category_group(category_id)

        if result['deleted']:
            return jsonify({
                'success': True,
                'message': '分类删除成功'
            })
        if result['in_use'] > 0:
            return jsonify({
                'success': False,
                'error': f"分类被 {result['in_use']} 条规则使用。请先更新这些规则。"
            }), 400
        return jsonify({
            'success': False,
            'error': '分类不存在'
        }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# === Configuration Management API Endpoints ===

@app.route('/api/config/categories', methods=['GET'])
def get_category_rules():
    """Get all category rules"""
    try:
        init_processors(need_db=True)
        ledger_id = get_ledger_id_from_request()
        rules = enhanced_db.get_category_rules(ledger_id)

        
        # Convert to JSON format
        rules_data = []
        for rule in rules:
            rules_data.append({
                'id': rule.id,
                'keyword': rule.keyword,
                'category_id': rule.category_id,
                'category': rule.category,
                'priority': rule.priority,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at,
                'ledger_id': rule.ledger_id
            })
        
        return jsonify({
            'success': True,
            'rules': rules_data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config/categories', methods=['POST'])
def create_category_rule():
    """Create a new category rule"""
    try:
        init_processors()
        
        data = request.get_json()
        ledger_raw = data.get('ledger_id') if data else None
        ledger_id = None if ledger_raw in (None, '', 'null') else int(ledger_raw) if ledger_raw is not None else get_ledger_id_from_request()
        if not data:
            return jsonify({
                'success': False,
                'error': '未提供数据'
            }), 400
        
        # Validate required fields
        required_fields = ['keyword']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({
                    'success': False,
                    'error': f'缺少必填字段: {field}'
                }), 400
        if not (data.get('category') or data.get('category_id')):
            return jsonify({
                'success': False,
                'error': '缺少必填字段: category'
            }), 400
        
        # Create new rule
        rule = CategoryRule(
            keyword=str(data['keyword']).strip(),
            category=str(data.get('category') or '').strip(),
            category_id=data.get('category_id'),
            priority=int(data.get('priority', 2)),
            ledger_id=ledger_id
        )

        # category resolution happens in storage; still ensure provided data is not empty
        if not rule.category and not rule.category_id:
            return jsonify({'success': False, 'error': '必须指定分类'}), 400
        
        category_name = rule.category
        if rule.category_id:
            category_group = enhanced_db.get_category_group(rule.category_id)
            if category_group:
                category_name = format_category_name(category_group.major, category_group.minor)
        if enhanced_db.category_rule_combo_conflict(rule.keyword, category_name, ledger_id):
            return jsonify({
                'success': False,
                'error': '同一分类下关键词已存在'
            }), 400
        
        # Save to database
        rule_id = enhanced_db.save_category_rule(rule)
        rule.id = rule_id
        
        return jsonify({
            'success': True,
            'rule': {
                'id': rule.id,
                'keyword': rule.keyword,
                'category_id': rule.category_id,
                'category': rule.category,
                'priority': rule.priority,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at,
                'ledger_id': rule.ledger_id
            }
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'无效数据: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config/categories/<int:rule_id>', methods=['PUT'])
def update_category_rule(rule_id):
    """Update an existing category rule"""
    try:
        init_processors()
        
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': '未提供数据'
            }), 400
        
        # Get existing rule
        existing_rules = enhanced_db.get_category_rules()
        rule = None
        for r in existing_rules:
            if r.id == rule_id:
                rule = r
                break
        
        if not rule:
            return jsonify({
                'success': False,
                'error': '规则不存在'
            }), 404
        
        # Update fields
        if 'keyword' in data:
            new_keyword = str(data['keyword']).strip()
            rule.keyword = new_keyword
        
        if 'category' in data:
            new_category = str(data['category']).strip()
            rule.category = new_category
        if 'category_id' in data:
            rule.category_id = data['category_id']
        if 'priority' in data:
            rule.priority = int(data['priority'])
        if 'ledger_id' in data:
            ledger_raw = data.get('ledger_id')
            rule.ledger_id = None if ledger_raw in (None, '', 'null') else int(ledger_raw)

        category_name = rule.category
        if rule.category_id:
            category_group = enhanced_db.get_category_group(rule.category_id)
            if category_group:
                category_name = format_category_name(category_group.major, category_group.minor)
        if enhanced_db.category_rule_combo_conflict(rule.keyword, category_name, rule.ledger_id, exclude_id=rule_id):
            return jsonify({
                'success': False,
                'error': '同一分类下关键词已存在'
            }), 400
        
        # Save updated rule
        enhanced_db.save_category_rule(rule)
        
        return jsonify({
            'success': True,
            'rule': {
                'id': rule.id,
                'keyword': rule.keyword,
                'category': rule.category,
                'priority': rule.priority,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at,
                'ledger_id': rule.ledger_id
            }
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'无效数据: {str(e)}'
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config/categories/<int:rule_id>', methods=['DELETE'])
def delete_category_rule(rule_id):
    """Delete a category rule"""
    try:
        init_processors()
        
        deleted = enhanced_db.delete_category_rule(rule_id)
        
        if deleted:
            return jsonify({
                'success': True,
                'message': '分类规则删除成功'
            })
        else:
            return jsonify({
                'success': False,
                'error': '规则不存在'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# === Recurring Rules API Endpoints ===

def _parse_schedule_values(schedule_type, raw_value):
    if raw_value is None:
        raise ValueError('缺少必填字段: schedule_value')
    if isinstance(raw_value, list):
        values = [int(v) for v in raw_value]
    elif isinstance(raw_value, str):
        raw_value = raw_value.strip()
        if not raw_value:
            values = []
        elif ',' in raw_value:
            values = [int(v) for v in raw_value.split(',') if v.strip()]
        else:
            values = [int(raw_value)]
    else:
        values = [int(raw_value)]

    limit = 7 if schedule_type == 'weekly' else 31
    filtered = sorted({v for v in values if 1 <= int(v) <= limit})
    if not filtered:
        raise ValueError('无效的 schedule_value')
    return filtered

@app.route('/api/recurring-rules', methods=['GET'])
def get_recurring_rules():
    """Get recurring bill rules for current ledger"""
    try:
        init_processors(need_db=True)
        ledger_id = get_ledger_id_from_request()
        ensure_recurring_bills(ledger_id)
        rules = enhanced_db.get_recurring_rules(ledger_id)
        rules_data = []
        for rule in rules:
            rules_data.append({
                'id': rule.id,
                'ledger_id': rule.ledger_id,
                'amount': rule.amount,
                'keyword': rule.keyword,
                'category_id': rule.category_id,
                'category': rule.category,
                'note': rule.note,
                'schedule_type': rule.schedule_type,
                'schedule_value': rule.schedule_value,
                'start_date': rule.start_date,
                'end_date': rule.end_date,
                'enabled': rule.enabled,
                'include_in_budget': rule.include_in_budget,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at,
            })
        return jsonify({'success': True, 'rules': rules_data})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/recurring-rules', methods=['POST'])
def create_recurring_rule():
    """Create a recurring bill rule"""
    try:
        init_processors()
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '未提供数据'}), 400

        ledger_raw = data.get('ledger_id')
        ledger_id = None if ledger_raw in (None, '', 'null') else int(ledger_raw) if ledger_raw is not None else get_ledger_id_from_request()

        schedule_type = str(data.get('schedule_type', '')).strip()
        schedule_value = data.get('schedule_value')
        start_date = str(data.get('start_date', '')).strip()
        if not (data.get('category') or data.get('category_id')):
            return jsonify({'success': False, 'error': '缺少必填字段: category'}), 400
        if schedule_type not in ('weekly', 'monthly'):
            return jsonify({'success': False, 'error': '无效的 schedule_type'}), 400
        try:
            schedule_values = _parse_schedule_values(schedule_type, schedule_value)
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        if not start_date:
            return jsonify({'success': False, 'error': '缺少必填字段: start_date'}), 400

        rule = RecurringRule(
            ledger_id=ledger_id,
            amount=float(data.get('amount') or 0),
            keyword=str(data.get('keyword') or '').strip(),
            category_id=data.get('category_id'),
            category=str(data.get('category') or '').strip(),
            note=str(data.get('note') or '').strip(),
            schedule_type=schedule_type,
            schedule_value=schedule_values,
            start_date=start_date,
            end_date=str(data.get('end_date') or '').strip() or None,
            enabled=bool(data.get('enabled', True)),
            include_in_budget=bool(data.get('include_in_budget', True)),
        )

        rule_id = enhanced_db.save_recurring_rule(rule)
        rule.id = rule_id
        return jsonify({
            'success': True,
            'rule': {
                'id': rule.id,
                'ledger_id': rule.ledger_id,
                'amount': rule.amount,
                'keyword': rule.keyword,
                'category_id': rule.category_id,
                'category': rule.category,
                'note': rule.note,
                'schedule_type': rule.schedule_type,
                'schedule_value': rule.schedule_value,
                'start_date': rule.start_date,
                'end_date': rule.end_date,
                'enabled': rule.enabled,
                'include_in_budget': rule.include_in_budget,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at,
            }
        })
    except ValueError as e:
        return jsonify({'success': False, 'error': f'无效数据: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/recurring-rules/<int:rule_id>', methods=['PUT'])
def update_recurring_rule(rule_id):
    """Update a recurring bill rule"""
    try:
        init_processors()
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '未提供数据'}), 400

        rule = enhanced_db.get_recurring_rule(rule_id)
        if not rule:
            return jsonify({'success': False, 'error': '规则不存在'}), 404

        if 'amount' in data:
            rule.amount = float(data.get('amount') or 0)
        if 'keyword' in data:
            rule.keyword = str(data.get('keyword') or '').strip()
        if 'category' in data:
            rule.category = str(data.get('category') or '').strip()
        if 'category_id' in data:
            rule.category_id = data.get('category_id')
        if 'note' in data:
            rule.note = str(data.get('note') or '').strip()
        if 'schedule_type' in data:
            rule.schedule_type = str(data.get('schedule_type') or '').strip()
        if 'schedule_value' in data:
            rule.schedule_value = data.get('schedule_value')
        if 'start_date' in data:
            rule.start_date = str(data.get('start_date') or '').strip()
        if 'end_date' in data:
            rule.end_date = str(data.get('end_date') or '').strip() or None
        if 'enabled' in data:
            rule.enabled = bool(data.get('enabled'))
        if 'include_in_budget' in data:
            rule.include_in_budget = bool(data.get('include_in_budget'))

        if rule.schedule_type not in ('weekly', 'monthly'):
            return jsonify({'success': False, 'error': 'Invalid schedule_type'}), 400
        try:
            rule.schedule_value = _parse_schedule_values(rule.schedule_type, rule.schedule_value)
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        if not rule.start_date:
            return jsonify({'success': False, 'error': '缺少必填字段: start_date'}), 400
        if not (rule.category or rule.category_id):
            return jsonify({'success': False, 'error': '缺少必填字段: category'}), 400

        enhanced_db.save_recurring_rule(rule)
        return jsonify({
            'success': True,
            'rule': {
                'id': rule.id,
                'ledger_id': rule.ledger_id,
                'amount': rule.amount,
                'keyword': rule.keyword,
                'category_id': rule.category_id,
                'category': rule.category,
                'note': rule.note,
                'schedule_type': rule.schedule_type,
                'schedule_value': rule.schedule_value,
                'start_date': rule.start_date,
                'end_date': rule.end_date,
                'enabled': rule.enabled,
                'include_in_budget': rule.include_in_budget,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at,
            }
        })
    except ValueError as e:
        return jsonify({'success': False, 'error': f'无效数据: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/recurring-rules/<int:rule_id>', methods=['DELETE'])
def delete_recurring_rule(rule_id):
    """Delete a recurring bill rule"""
    try:
        init_processors()
        deleted = enhanced_db.delete_recurring_rule(rule_id)
        if deleted:
            return jsonify({'success': True, 'message': '周期性规则删除成功'})
        return jsonify({'success': False, 'error': '规则不存在'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# === Template Management API Endpoints ===

@app.route('/api/templates/ocr', methods=['POST'])
def ocr_for_template():
    """OCR识别图片，返回文本行用于创建模板"""
    try:
        init_processors(need_parser=True)
        
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': '没有上传文件'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': '文件名为空'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': '不支持的文件格式'}), 400
        
        # 读取文件内容
        image_bytes = file.read()
        
        # 保存临时文件
        temp_filename = f"temp_{uuid.uuid4().hex}.jpg"
        temp_path = os.path.join('data', 'bills', temp_filename)
        os.makedirs(os.path.dirname(temp_path), exist_ok=True)
        
        with open(temp_path, 'wb') as f:
            f.write(image_bytes)
        
        try:
            # 预处理图片
            processed_path, is_temp = bill_parser._preprocess_image(temp_path)
            
            try:
                # OCR识别
                ocr_lines = bill_parser.ocr_engine.run(processed_path, timeout=None)
                lines = [str(getattr(x, "text", "") or "").strip() for x in ocr_lines]
                lines = [l for l in lines if l]
                
                # 生成预览图
                preview_base64 = _make_preview_base64(image_bytes, max_side=800, jpeg_quality=75)
                
                return jsonify({
                    'success': True,
                    'data': {
                        'lines': lines,
                        'preview': f"data:image/jpeg;base64,{preview_base64}",
                        'temp_filename': temp_filename
                    }
                })
            finally:
                if is_temp and os.path.exists(processed_path):
                    try:
                        os.remove(processed_path)
                    except OSError:
                        pass
        except Exception as e:
            # 清理临时文件
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            raise e
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/templates', methods=['GET'])
def get_templates():
    """获取所有模板"""
    try:
        import json
        templates_path = "templates.json"
        
        if not os.path.exists(templates_path):
            return jsonify({'success': True, 'data': []})
        
        with open(templates_path, 'r', encoding='utf-8') as f:
            templates = json.load(f)
        
        return jsonify({'success': True, 'data': templates})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/templates', methods=['POST'])
def create_template():
    """创建新模板"""
    try:
        import json
        import shutil
        from datetime import datetime
        
        data = request.get_json()
        template = data.get('template')
        
        if not template:
            return jsonify({'success': False, 'error': '模板数据为空'}), 400
        
        templates_path = "templates.json"
        
        # 读取现有模板
        templates = []
        if os.path.exists(templates_path):
            # 备份
            backup_path = f"{templates_path}.bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            shutil.copy2(templates_path, backup_path)
            
            with open(templates_path, 'r', encoding='utf-8') as f:
                templates = json.load(f)
        
        # 检查是否已存在同名模板
        template_name = template.get('name')
        existing_index = None
        for i, t in enumerate(templates):
            if t.get('name') == template_name:
                existing_index = i
                break
        
        # 替换或添加
        if existing_index is not None:
            templates[existing_index] = template
        else:
            templates.append(template)
        
        # 保存
        with open(templates_path, 'w', encoding='utf-8') as f:
            json.dump(templates, f, ensure_ascii=False, indent=2)

        # Reload templates for the running parser
        if bill_parser is not None:
            raw_templates = _load_templates_from_file(templates_path)
            bill_parser.templates = [_compile_template(x) for x in raw_templates]
            bill_parser.templates.sort(key=lambda t: t.priority, reverse=True)
        
        # 清理临时文件
        temp_filename = data.get('temp_filename')
        if temp_filename:
            temp_path = os.path.join('data', 'bills', temp_filename)
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
        
        return jsonify({
            'success': True,
            'message': '模板保存成功',
            'data': template
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/templates/<template_name>', methods=['DELETE'])
def delete_template(template_name):
    """删除模板"""
    try:
        import json
        import shutil
        from datetime import datetime
        
        templates_path = "templates.json"
        
        if not os.path.exists(templates_path):
            return jsonify({'success': False, 'error': '模板文件不存在'}), 404
        
        # 备份
        backup_path = f"{templates_path}.bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(templates_path, backup_path)
        
        # 读取并过滤
        with open(templates_path, 'r', encoding='utf-8') as f:
            templates = json.load(f)
        
        filtered_templates = [t for t in templates if t.get('name') != template_name]
        
        if len(filtered_templates) == len(templates):
            return jsonify({'success': False, 'error': '模板不存在'}), 404
        
        # 保存
        with open(templates_path, 'w', encoding='utf-8') as f:
            json.dump(filtered_templates, f, ensure_ascii=False, indent=2)
        
        return jsonify({'success': True, 'message': '模板删除成功'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({
        'success': False,
        'error': '文件过大。最大允许 16MB。'
    }), 413

@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({
        'success': False,
        'error': '接口不存在'
    }), 404

@app.errorhandler(500)
def internal_error(e):
    """Handle internal server errors"""
    return jsonify({
        'success': False,
        'error': '服务器内部错误'
    }), 500

if __name__ == '__main__':
    # Ensure static directory exists
    if not os.path.exists('static'):
        os.makedirs('static')
    
    print("🚀 启动 账单助手 Web 应用...")
    print("📱 访问地址: http://localhost:5000")
    app.run(debug=False, host='127.0.0.1', port=5000, use_reloader=False)
