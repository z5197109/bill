# web_app.py
import os
import uuid
import base64
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import config
from app.bill_parser import BillParser
from app.storage import ExcelSaver, DatabaseSaver
from app.enhanced_storage import EnhancedDatabaseManager, EnhancedBill, CategoryRule, CategoryGroup
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
    # Optional: could check if bills exist, but keep simple
    deleted = enhanced_db.delete_ledger(ledger_id)
    return jsonify({'success': deleted})

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
                'error': 'No bill data provided'
            }), 400
        
        bills = data['bills']
        if not bills:
            return jsonify({
                'success': False,
                'error': 'No bills to save'
            }), 400
        
        saved_count = 0
        errors = []
        
        for bill_data in bills:
            try:
                # Validate required fields
                required_fields = ['merchant', 'amount', 'filename']
                for field in required_fields:
                    if field not in bill_data:
                        raise ValueError(f"Missing required field: {field}")
                if not (bill_data.get('category') or bill_data.get('category_id')):
                    raise ValueError("Missing required field: category")
                
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
                    ledger_id=bill_data.get('ledger_id') or data.get('ledger_id') or get_ledger_id_from_request()
                )
                
                # Validate amount
                if bill.amount < 0:
                    raise ValueError("Amount cannot be negative")
                
                # Save to enhanced database
                enhanced_db.save_bill(bill)
                saved_count += 1
                
            except Exception as save_error:
                error_msg = f"Failed to save bill {bill_data.get('filename', 'unknown')}: {str(save_error)}"
                errors.append(error_msg)
        
        # Determine response
        if saved_count > 0:
            message = f"Successfully saved {saved_count} bill(s)"
            if errors:
                message += f", but {len(errors)} failed"
            
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
                'message': 'No bills were saved',
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
        return jsonify({'success': False, 'error': 'No files provided'}), 400

    files = request.files.getlist('files')
    if not files or all(f.filename == '' for f in files):
        return jsonify({'success': False, 'error': 'No files selected'}), 400

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
            errors.append(f"File {filename}: Unsupported file type")
            continue

        file_id = str(uuid.uuid4())

        # ✅ 只读一次：拿到 bytes，用于写盘 + 预览
        image_bytes = f.read()
        if not image_bytes:
            errors.append(f"File {filename}: Empty file")
            continue

        temp_path = os.path.join(config.OUTPUT_DIR, f"temp_{file_id}_{filename}")
        try:
            with open(temp_path, "wb") as fp:
                fp.write(image_bytes)
        except Exception as e:
            errors.append(f"File {filename}: Save failed - {str(e)}")
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
            ledger_id=ledger_id
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
                'error': 'No data provided'
            }), 400
        
        # Validate required fields
        required_fields = ['merchant', 'amount']
        for field in required_fields:
            if field not in data or data[field] in (None, ''):
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        if not (data.get('category') or data.get('category_id')):
            return jsonify({
                'success': False,
                'error': 'Missing required field: category'
            }), 400
        
        # Create new bill
        bill = EnhancedBill(
            filename=data.get('filename', 'manual_entry'),
            merchant=str(data['merchant']).strip(),
            amount=float(data['amount']),
            category=str(data.get('category') or '').strip(),
            category_id=data.get('category_id'),
            bill_date=data.get('bill_date', ''),
            raw_text=data.get('raw_text', []),
            is_manual=True,
            ledger_id=data.get('ledger_id') or get_ledger_id_from_request()
        )
        
        # Validate amount
        if bill.amount < 0:
            return jsonify({
                'success': False,
                'error': 'Amount cannot be negative'
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
                'is_manual': bill.is_manual
            }
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Invalid data: {str(e)}'
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
                'error': 'No data provided'
            }), 400
        
        # Get existing bill
        bill = enhanced_db.get_bill(bill_id)
        if not bill:
            return jsonify({
                'success': False,
                'error': 'Bill not found'
            }), 404
        
        # Update fields
        if 'merchant' in data:
            bill.merchant = str(data['merchant']).strip()
        if 'amount' in data:
            bill.amount = float(data['amount'])
            if bill.amount < 0:
                return jsonify({
                    'success': False,
                    'error': 'Amount cannot be negative'
                }), 400
        if 'category' in data:
            bill.category = str(data['category']).strip()
        if 'category_id' in data:
            bill.category_id = data['category_id']
        if 'bill_date' in data:
            bill.bill_date = data['bill_date']
        if 'filename' in data:
            bill.filename = data['filename']
        
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
                'is_manual': bill.is_manual
            }
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Invalid data: {str(e)}'
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
                'message': 'Bill deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Bill not found'
            }), 404
            
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
        init_processors()
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        
        ledger_id = get_ledger_id_from_request()
        summary = enhanced_db.get_spending_summary(start_date, end_date, keyword, major, minor, ledger_id)
        
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
        init_processors()
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        
        ledger_id = get_ledger_id_from_request()
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
        init_processors()
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        
        # Get daily data and aggregate by week
        ledger_id = get_ledger_id_from_request()
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
        init_processors()
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')

        # Get all daily data and aggregate by year
        ledger_id = get_ledger_id_from_request()
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
        init_processors()
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        keyword = request.args.get('keyword')
        major = request.args.get('major')
        minor = request.args.get('minor')
        
        ledger_id = get_ledger_id_from_request()
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
        
        # Get budget information from ledger
        ledgers = enhanced_db.list_ledgers()
        current_ledger = next((l for l in ledgers if l['id'] == ledger_id), None)
        total_budget = current_ledger['monthly_budget'] if current_ledger else 0.0
        
        # Calculate budget status
        used_amount = monthly_summary['total_amount']
        used_percentage = (used_amount / total_budget * 100) if total_budget > 0 else 0
        
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
                'monthly_spending': used_amount,
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
                'error': 'No data provided'
            }), 400

        major = str(data.get('major', '')).strip()
        minor = str(data.get('minor', '')).strip()
        if not major:
            return jsonify({
                'success': False,
                'error': 'Missing required field: major'
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
        ledger_id = get_ledger_id_from_request()
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400

        existing = enhanced_db.get_category_group(category_id)
        if not existing:
            return jsonify({
                'success': False,
                'error': 'Category not found'
            }), 404

        major = str(data.get('major', existing.major)).strip()
        minor = str(data.get('minor', existing.minor)).strip()
        if not major:
            return jsonify({
                'success': False,
                'error': 'Missing required field: major'
            }), 400

        existing.major = major
        existing.minor = minor
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
                'message': 'Category deleted successfully'
            })
        if result['in_use'] > 0:
            return jsonify({
                'success': False,
                'error': f"Category is used by {result['in_use']} rule(s). Update rules first."
            }), 400
        return jsonify({
            'success': False,
            'error': 'Category not found'
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
                'is_weak': rule.is_weak,
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
                'error': 'No data provided'
            }), 400
        
        # Validate required fields
        required_fields = ['keyword']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        if not (data.get('category') or data.get('category_id')):
            return jsonify({
                'success': False,
                'error': 'Missing required field: category'
            }), 400
        
        # Create new rule
        rule = CategoryRule(
            keyword=str(data['keyword']).strip(),
            category=str(data.get('category') or '').strip(),
            category_id=data.get('category_id'),
            priority=int(data.get('priority', 1)),
            is_weak=bool(data.get('is_weak', False)),
            ledger_id=ledger_id
        )

        # category resolution happens in storage; still ensure provided data is not empty
        if not rule.category and not rule.category_id:
            return jsonify({'success': False, 'error': 'Category is required'}), 400
        
        # Validate keyword uniqueness
        existing_rules = enhanced_db.get_category_rules(ledger_id)
        for existing_rule in existing_rules:
            if existing_rule.keyword.lower() == rule.keyword.lower():
                return jsonify({
                    'success': False,
                    'error': f'Keyword "{rule.keyword}" already exists'
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
                'is_weak': rule.is_weak,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at,
                'ledger_id': rule.ledger_id
            }
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Invalid data: {str(e)}'
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
                'error': 'No data provided'
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
                'error': 'Rule not found'
            }), 404
        
        # Update fields
        if 'keyword' in data:
            new_keyword = str(data['keyword']).strip()
            # Check for keyword uniqueness (excluding current rule)
            for existing_rule in existing_rules:
                if existing_rule.id != rule_id and existing_rule.keyword.lower() == new_keyword.lower():
                    return jsonify({
                        'success': False,
                        'error': f'Keyword "{new_keyword}" already exists'
                    }), 400
            rule.keyword = new_keyword
        
        if 'category' in data:
            new_category = str(data['category']).strip()
            rule.category = new_category
        if 'category_id' in data:
            rule.category_id = data['category_id']
        if 'priority' in data:
            rule.priority = int(data['priority'])
        if 'is_weak' in data:
            rule.is_weak = bool(data['is_weak'])
        
        # Save updated rule
        enhanced_db.save_category_rule(rule)
        
        return jsonify({
            'success': True,
            'rule': {
                'id': rule.id,
                'keyword': rule.keyword,
                'category': rule.category,
                'priority': rule.priority,
                'is_weak': rule.is_weak,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at,
                'ledger_id': rule.ledger_id
            }
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': f'Invalid data: {str(e)}'
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
                'message': 'Category rule deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Rule not found'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({
        'success': False,
        'error': 'File too large. Maximum size is 16MB.'
    }), 413

@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(e):
    """Handle internal server errors"""
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
    # Ensure static directory exists
    if not os.path.exists('static'):
        os.makedirs('static')
    
    print("🚀 启动 SnapLedger Web 应用...")
    print("📱 访问地址: http://localhost:5000")
    app.run(debug=False, host='127.0.0.1', port=5000, use_reloader=False)
