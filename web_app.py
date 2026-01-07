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

# Global variables for processing
bill_parser = None
excel_saver = None
db_saver = None
enhanced_db = None


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

import threading
import os

_init_lock = threading.Lock()

def init_processors():
    """Initialize bill processing components (thread-safe)"""
    global bill_parser, excel_saver, db_saver, enhanced_db

    # 快速路径
    if bill_parser is not None:
        return

    with _init_lock:
        # 双重检查，防止并发重复初始化
        if bill_parser is None:
            # 这里建议显式传你优化过的参数（见第2点）
            cpu = os.cpu_count() or 8
            cpu_threads = min(8, max(2, cpu // 2))  # 经验值：别开太大，避免和线程池打架

            bill_parser = BillParser(
                max_side=640,       # 你第4步的更快预处理默认值
                jpeg_quality=30,
                use_gpu=True,       # 有GPU再改 True
                cpu_threads=cpu_threads
            )

            # 下面这些如果 upload 接口用不到，建议延迟初始化（见第3点）
            excel_saver = ExcelSaver()
            db_saver = DatabaseSaver()
            enhanced_db = EnhancedDatabaseManager()

def format_category_name(major, minor):
    major = str(major or '').strip()
    minor = str(minor or '').strip()
    return f"{major}/{minor}" if minor else major

@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory('static', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Serve static files"""
    return send_from_directory('static', filename)

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
                required_fields = ['merchant', 'amount', 'category', 'filename']
                for field in required_fields:
                    if field not in bill_data:
                        raise ValueError(f"Missing required field: {field}")
                
                # Create enhanced bill object
                from app.enhanced_storage import EnhancedBill
                bill = EnhancedBill(
                    filename=bill_data['filename'],
                    merchant=str(bill_data['merchant']).strip(),
                    amount=float(bill_data['amount']),
                    category=str(bill_data['category']).strip(),
                    bill_date=bill_data.get('bill_date', ''),
                    raw_text=[],  # We don't have raw_text in the save request
                    is_manual=bill_data.get('is_manual', False)
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
    try:
        # ✅ 确保 init_processors() 内部是“只初始化一次”
        init_processors()

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

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

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
            minor=minor
        )
        total_count = enhanced_db.get_bills_count(
            start_date=start_date,
            end_date=end_date,
            category=category,
            keyword=keyword,
            major=major,
            minor=minor
        )
        
        # Convert to JSON format
        bills_data = []
        for bill in bills:
            bills_data.append({
                'id': bill.id,
                'filename': bill.filename,
                'merchant': bill.merchant,
                'amount': bill.amount,
                'category': bill.category,
                'bill_date': bill.bill_date,
                'created_at': bill.created_at,
                'updated_at': bill.updated_at,
                'is_manual': bill.is_manual
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
        required_fields = ['merchant', 'amount', 'category']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Create new bill
        bill = EnhancedBill(
            filename=data.get('filename', 'manual_entry'),
            merchant=str(data['merchant']).strip(),
            amount=float(data['amount']),
            category=str(data['category']).strip(),
            bill_date=data.get('bill_date', ''),
            raw_text=data.get('raw_text', []),
            is_manual=True
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
        
        summary = enhanced_db.get_spending_summary(start_date, end_date, keyword, major, minor)
        
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
        
        daily_data = enhanced_db.get_daily_spending(start_date, end_date, keyword, major, minor)
        
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
        daily_data = enhanced_db.get_daily_spending(start_date, end_date, keyword, major, minor)
        
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
        daily_data = enhanced_db.get_daily_spending(start_date, end_date, keyword, major, minor)
        
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
        
        summary = enhanced_db.get_spending_summary(start_date, end_date, keyword, major, minor)
        
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
        init_processors()
        groups = enhanced_db.get_category_groups()
        groups_data = []
        for group in groups:
            groups_data.append({
                'id': group.id,
                'major': group.major,
                'minor': group.minor,
                'full_name': format_category_name(group.major, group.minor),
                'created_at': group.created_at,
                'updated_at': group.updated_at
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

        group = CategoryGroup(major=major, minor=minor)
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
        init_processors()
        
        rules = enhanced_db.get_category_rules()
        
        # Convert to JSON format
        rules_data = []
        for rule in rules:
            rules_data.append({
                'id': rule.id,
                'keyword': rule.keyword,
                'category': rule.category,
                'priority': rule.priority,
                'is_weak': rule.is_weak,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at
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
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        # Validate required fields
        required_fields = ['keyword', 'category']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Create new rule
        rule = CategoryRule(
            keyword=str(data['keyword']).strip(),
            category=str(data['category']).strip(),
            priority=int(data.get('priority', 1)),
            is_weak=bool(data.get('is_weak', False))
        )

        if not enhanced_db.category_exists(rule.category):
            return jsonify({
                'success': False,
                'error': f'Category "{rule.category}" does not exist. Please create it first.'
            }), 400
        
        # Validate keyword uniqueness
        existing_rules = enhanced_db.get_category_rules()
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
                'category': rule.category,
                'priority': rule.priority,
                'is_weak': rule.is_weak,
                'created_at': rule.created_at,
                'updated_at': rule.updated_at
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
            if not enhanced_db.category_exists(new_category):
                return jsonify({
                    'success': False,
                    'error': f'Category "{new_category}" does not exist. Please create it first.'
                }), 400
            rule.category = new_category
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
                'updated_at': rule.updated_at
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
    app.run(debug=True, host='0.0.0.0', port=5000)
