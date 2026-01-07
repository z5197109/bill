# enhanced_storage.py - Enhanced storage system with new features
import os
import datetime
import sqlite3
import json
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import config


@dataclass
class EnhancedBill:
    """Enhanced bill data model"""
    id: Optional[int] = None
    filename: str = ""
    merchant: str = ""
    amount: float = 0.0
    category: str = ""
    bill_date: str = ""  # YYYY-MM-DD format
    created_at: str = ""
    updated_at: str = ""
    raw_text: List[str] = None
    is_manual: bool = False
    
    def __post_init__(self):
        if self.raw_text is None:
            self.raw_text = []
        if not self.bill_date:
            self.bill_date = datetime.date.today().strftime("%Y-%m-%d")
        if not self.created_at:
            self.created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not self.updated_at:
            self.updated_at = self.created_at


@dataclass
class CategoryRule:
    """Category rule data model"""
    id: Optional[int] = None
    keyword: str = ""
    category: str = ""
    priority: int = 1
    is_weak: bool = False
    created_at: str = ""
    updated_at: str = ""
    
    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not self.updated_at:
            self.updated_at = self.created_at


@dataclass
class CategoryGroup:
    """Category group data model"""
    id: Optional[int] = None
    major: str = ""
    minor: str = ""
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not self.updated_at:
            self.updated_at = self.created_at

class EnhancedDatabaseManager:
    """Enhanced database manager with new schema and features"""
    
    def __init__(self, db_name=config.DB_PATH):
        self.db_name = db_name
        self.init_db()
    
    def init_db(self):
        """Initialize enhanced database schema"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        # Check if we need to migrate existing bills table
        cursor.execute("PRAGMA table_info(bills)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'bill_date' not in columns:
            # Migrate existing table
            self._migrate_bills_table(cursor)
        
        # Create enhanced bills table if it doesn't exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS bills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_time TEXT,  -- Keep for backward compatibility
                image_name TEXT,
                merchant TEXT,
                category TEXT,
                amount REAL,
                raw_text TEXT,
                bill_date TEXT,
                created_at TEXT,
                updated_at TEXT,
                is_manual INTEGER DEFAULT 0
            )
        ''')
        
        # Create category_rules table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS category_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT UNIQUE NOT NULL,
                category TEXT NOT NULL,
                priority INTEGER DEFAULT 1,
                is_weak INTEGER DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            )
        ''')

        # Create categories table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                major TEXT NOT NULL,
                minor TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                UNIQUE(major, minor)
            )
        ''')
        
        # Create indexes for performance
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON bills(bill_date)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_bills_category ON bills(category)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_category_rules_keyword ON category_rules(keyword)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_categories_major_minor ON categories(major, minor)')
        
        # Initialize category rules from config if table is empty
        cursor.execute('SELECT COUNT(*) FROM category_rules')
        if cursor.fetchone()[0] == 0:
            self._init_category_rules_from_config(cursor)

        # Initialize categories from existing rules or config if table is empty
        cursor.execute('SELECT COUNT(*) FROM categories')
        if cursor.fetchone()[0] == 0:
            self._init_categories_from_rules_and_config(cursor)
        else:
            self._sync_categories_from_rules(cursor)
        
        conn.commit()
        conn.close()
        print(f"📘 [Enhanced DB] 数据库连接就绪: {self.db_name}")
    
    def _migrate_bills_table(self, cursor):
        """Migrate existing bills table to new schema"""
        print("🔄 [DB Migration] 正在升级数据库架构...")
        
        # Add new columns to existing table
        try:
            cursor.execute('ALTER TABLE bills ADD COLUMN bill_date TEXT')
            cursor.execute('ALTER TABLE bills ADD COLUMN created_at TEXT')
            cursor.execute('ALTER TABLE bills ADD COLUMN updated_at TEXT')
            cursor.execute('ALTER TABLE bills ADD COLUMN is_manual INTEGER DEFAULT 0')
            
            # Update existing records with default values
            cursor.execute('''
                UPDATE bills 
                SET bill_date = date(record_time),
                    created_at = record_time,
                    updated_at = record_time
                WHERE bill_date IS NULL
            ''')
            
            print("✅ [DB Migration] 数据库架构升级完成")
        except sqlite3.OperationalError as e:
            if "duplicate column name" not in str(e):
                raise e
    
    def _init_category_rules_from_config(self, cursor):
        """Initialize category rules from config file"""
        print("🔄 [DB Init] 正在从配置文件初始化分类规则...")
        
        for keyword, category in config.CATEGORY_RULES.items():
            is_weak = 1 if keyword in config.WEAK_KEYWORDS else 0
            priority = 1 if is_weak else 2
            now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            cursor.execute('''
                INSERT INTO category_rules (keyword, category, priority, is_weak, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (keyword, category, priority, is_weak, now, now))
        
        print("✅ [DB Init] 分类规则初始化完成")

    def _format_category_name(self, major: str, minor: str) -> str:
        major = (major or "").strip()
        minor = (minor or "").strip()
        return f"{major}/{minor}" if minor else major

    def _split_category_name(self, category_name: str) -> CategoryGroup:
        if not category_name:
            return CategoryGroup(major="", minor="")
        parts = category_name.split('/', 1)
        if len(parts) == 2:
            return CategoryGroup(major=parts[0].strip(), minor=parts[1].strip())
        return CategoryGroup(major=category_name.strip(), minor="")

    def _init_categories_from_rules_and_config(self, cursor):
        """Initialize categories from existing rules and config"""
        print("🔄 [DB Init] 正在初始化分类目录...")
        categories = set()

        cursor.execute('SELECT DISTINCT category FROM category_rules')
        for row in cursor.fetchall():
            if row[0]:
                categories.add(row[0])

        for category in set(config.CATEGORY_RULES.values()):
            if category:
                categories.add(category)

        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for category_name in categories:
            group = self._split_category_name(category_name)
            if not group.major:
                continue
            cursor.execute('''
                INSERT OR IGNORE INTO categories (major, minor, created_at, updated_at)
                VALUES (?, ?, ?, ?)
            ''', (group.major, group.minor, now, now))

        print("✅ [DB Init] 分类目录初始化完成")

    def _sync_categories_from_rules(self, cursor):
        """Ensure categories table covers categories referenced by rules"""
        cursor.execute('SELECT DISTINCT category FROM category_rules')
        rows = cursor.fetchall()
        if not rows:
            return
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for row in rows:
            if not row[0]:
                continue
            group = self._split_category_name(row[0])
            if not group.major:
                continue
            cursor.execute('''
                INSERT OR IGNORE INTO categories (major, minor, created_at, updated_at)
                VALUES (?, ?, ?, ?)
            ''', (group.major, group.minor, now, now))
    
    # Bills CRUD operations
    def save_bill(self, bill: EnhancedBill) -> int:
        """Save a bill to database"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        bill.updated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        raw_text_json = json.dumps(bill.raw_text, ensure_ascii=False)
        
        if bill.id:
            # Update existing bill
            cursor.execute('''
                UPDATE bills 
                SET image_name=?, merchant=?, category=?, amount=?, raw_text=?,
                    bill_date=?, updated_at=?, is_manual=?
                WHERE id=?
            ''', (bill.filename, bill.merchant, bill.category, bill.amount, 
                  raw_text_json, bill.bill_date, bill.updated_at, 
                  int(bill.is_manual), bill.id))
            bill_id = bill.id
        else:
            # Insert new bill
            cursor.execute('''
                INSERT INTO bills (record_time, image_name, merchant, category, amount, 
                                 raw_text, bill_date, created_at, updated_at, is_manual)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (bill.created_at, bill.filename, bill.merchant, bill.category, 
                  bill.amount, raw_text_json, bill.bill_date, bill.created_at, 
                  bill.updated_at, int(bill.is_manual)))
            bill_id = cursor.lastrowid
        
        conn.commit()
        conn.close()
        return bill_id
    
    def get_bill(self, bill_id: int) -> Optional[EnhancedBill]:
        """Get a bill by ID"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM bills WHERE id = ?', (bill_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return self._row_to_bill(row)
        return None
    
    def _append_category_filter(self, query: str, params: List[Any], categories: Optional[List[str]]) -> str:
        if categories is None:
            return query
        if not categories:
            return f"{query} AND 0"
        placeholders = ','.join(['?'] * len(categories))
        query += f' AND category IN ({placeholders})'
        params.extend(categories)
        return query

    def _fetch_category_names_by_major_minor(self, cursor, major: str = None, minor: str = None) -> Optional[List[str]]:
        if not major and not minor:
            return None
        query = 'SELECT major, minor FROM categories WHERE 1=1'
        params = []
        if major:
            query += ' AND major = ?'
            params.append(major)
        if minor:
            query += ' AND minor = ?'
            params.append(minor)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [self._format_category_name(row[0], row[1]) for row in rows]

    def get_bills(self, limit: int = 100, offset: int = 0, 
                  start_date: str = None, end_date: str = None,
                  category: str = None, keyword: str = None,
                  major: str = None, minor: str = None) -> List[EnhancedBill]:
        """Get bills with filtering and pagination"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        query = 'SELECT * FROM bills WHERE 1=1'
        params = []
        
        if start_date:
            query += ' AND bill_date >= ?'
            params.append(start_date)
        
        if end_date:
            query += ' AND bill_date <= ?'
            params.append(end_date)
        
        categories_filter = None
        if category:
            categories_filter = [category]
        elif major or minor:
            categories_filter = self._fetch_category_names_by_major_minor(cursor, major, minor)
        query = self._append_category_filter(query, params, categories_filter)

        if keyword:
            keyword_like = f'%{keyword}%'
            query += ' AND (merchant LIKE ? OR raw_text LIKE ?)'
            params.extend([keyword_like, keyword_like])
        
        query += ' ORDER BY bill_date DESC, created_at DESC LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_bill(row) for row in rows]

    def get_bills_count(self, start_date: str = None, end_date: str = None,
                        category: str = None, keyword: str = None,
                        major: str = None, minor: str = None) -> int:
        """Get total bill count with filtering"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        query = 'SELECT COUNT(*) FROM bills WHERE 1=1'
        params = []

        if start_date:
            query += ' AND bill_date >= ?'
            params.append(start_date)

        if end_date:
            query += ' AND bill_date <= ?'
            params.append(end_date)

        categories_filter = None
        if category:
            categories_filter = [category]
        elif major or minor:
            categories_filter = self._fetch_category_names_by_major_minor(cursor, major, minor)
        query = self._append_category_filter(query, params, categories_filter)

        if keyword:
            keyword_like = f'%{keyword}%'
            query += ' AND (merchant LIKE ? OR raw_text LIKE ?)'
            params.extend([keyword_like, keyword_like])

        cursor.execute(query, params)
        count = cursor.fetchone()[0] or 0
        conn.close()
        return count
    
    def delete_bill(self, bill_id: int) -> bool:
        """Delete a bill by ID"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM bills WHERE id = ?', (bill_id,))
        deleted = cursor.rowcount > 0
        
        conn.commit()
        conn.close()
        return deleted
    
    def _row_to_bill(self, row) -> EnhancedBill:
        """Convert database row to EnhancedBill object"""
        raw_text = json.loads(row[6]) if row[6] else []
        
        return EnhancedBill(
            id=row[0],
            filename=row[2] or "",
            merchant=row[3] or "",
            amount=row[5] or 0.0,
            category=row[4] or "",
            bill_date=row[7] or datetime.date.today().strftime("%Y-%m-%d"),
            created_at=row[8] or row[1],  # Fallback to record_time
            updated_at=row[9] or row[1],  # Fallback to record_time
            raw_text=raw_text,
            is_manual=bool(row[10]) if len(row) > 10 else False
        )
    
    # Category Rules CRUD operations
    def get_category_rules(self) -> List[CategoryRule]:
        """Get all category rules"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM category_rules ORDER BY priority DESC, keyword')
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_category_rule(row) for row in rows]
    
    def save_category_rule(self, rule: CategoryRule) -> int:
        """Save a category rule"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        rule.updated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if rule.id:
            # Update existing rule
            cursor.execute('''
                UPDATE category_rules 
                SET keyword=?, category=?, priority=?, is_weak=?, updated_at=?
                WHERE id=?
            ''', (rule.keyword, rule.category, rule.priority, 
                  int(rule.is_weak), rule.updated_at, rule.id))
            rule_id = rule.id
        else:
            # Insert new rule
            cursor.execute('''
                INSERT INTO category_rules (keyword, category, priority, is_weak, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (rule.keyword, rule.category, rule.priority, 
                  int(rule.is_weak), rule.created_at, rule.updated_at))
            rule_id = cursor.lastrowid
        
        conn.commit()
        conn.close()
        return rule_id
    
    def delete_category_rule(self, rule_id: int) -> bool:
        """Delete a category rule"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM category_rules WHERE id = ?', (rule_id,))
        deleted = cursor.rowcount > 0
        
        conn.commit()
        conn.close()
        return deleted
    
    def _row_to_category_rule(self, row) -> CategoryRule:
        """Convert database row to CategoryRule object"""
        return CategoryRule(
            id=row[0],
            keyword=row[1],
            category=row[2],
            priority=row[3],
            is_weak=bool(row[4]),
            created_at=row[5],
            updated_at=row[6]
        )

    # Category Groups CRUD operations
    def get_category_groups(self) -> List[CategoryGroup]:
        """Get all category groups"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM categories ORDER BY major, minor')
        rows = cursor.fetchall()
        conn.close()
        return [self._row_to_category_group(row) for row in rows]

    def get_category_group(self, category_id: int) -> Optional[CategoryGroup]:
        """Get a category group by ID"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM categories WHERE id = ?', (category_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return self._row_to_category_group(row)
        return None

    def get_category_group_by_name(self, category_name: str) -> Optional[CategoryGroup]:
        """Get a category group by full name"""
        group = self._split_category_name(category_name)
        if not group.major:
            return None
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM categories WHERE major = ? AND minor = ?', (group.major, group.minor))
        row = cursor.fetchone()
        conn.close()
        if row:
            return self._row_to_category_group(row)
        return None

    def category_exists(self, category_name: str) -> bool:
        """Check if a category exists"""
        return self.get_category_group_by_name(category_name) is not None

    def save_category_group(self, group: CategoryGroup) -> int:
        """Save a category group and propagate renames to rules"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if group.id:
            cursor.execute('SELECT major, minor FROM categories WHERE id = ?', (group.id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                raise ValueError("Category not found")

            old_name = self._format_category_name(row[0], row[1])
            new_name = self._format_category_name(group.major, group.minor)
            group.updated_at = now

            try:
                cursor.execute('''
                    UPDATE categories
                    SET major = ?, minor = ?, updated_at = ?
                    WHERE id = ?
                ''', (group.major, group.minor, group.updated_at, group.id))
            except sqlite3.IntegrityError:
                conn.close()
                raise ValueError("Category already exists")

            if old_name != new_name:
                cursor.execute('''
                    UPDATE category_rules
                    SET category = ?
                    WHERE category = ?
                ''', (new_name, old_name))
                cursor.execute('''
                    UPDATE bills
                    SET category = ?
                    WHERE category = ?
                ''', (new_name, old_name))
            group_id = group.id
        else:
            group.created_at = now
            group.updated_at = now
            try:
                cursor.execute('''
                    INSERT INTO categories (major, minor, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                ''', (group.major, group.minor, group.created_at, group.updated_at))
            except sqlite3.IntegrityError:
                conn.close()
                raise ValueError("Category already exists")
            group_id = cursor.lastrowid

        conn.commit()
        conn.close()
        return group_id

    def delete_category_group(self, category_id: int) -> Dict[str, Any]:
        """Delete a category group if not used by rules"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        cursor.execute('SELECT major, minor FROM categories WHERE id = ?', (category_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return {'deleted': False, 'in_use': 0}

        category_name = self._format_category_name(row[0], row[1])
        cursor.execute('SELECT COUNT(*) FROM category_rules WHERE category = ?', (category_name,))
        in_use = cursor.fetchone()[0]

        if in_use > 0:
            conn.close()
            return {'deleted': False, 'in_use': in_use}

        cursor.execute('DELETE FROM categories WHERE id = ?', (category_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return {'deleted': deleted, 'in_use': 0}

    def list_category_names(self) -> List[str]:
        """Get full category names for dropdowns"""
        groups = self.get_category_groups()
        names = [self._format_category_name(group.major, group.minor) for group in groups]
        return [name for name in names if name]

    def _row_to_category_group(self, row) -> CategoryGroup:
        """Convert database row to CategoryGroup object"""
        return CategoryGroup(
            id=row[0],
            major=row[1],
            minor=row[2],
            created_at=row[3],
            updated_at=row[4]
        )
    
    # Analytics methods
    def get_spending_summary(self, start_date: str = None, end_date: str = None,
                             keyword: str = None, major: str = None,
                             minor: str = None) -> Dict[str, Any]:
        """Get spending summary for a date range"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        query = 'SELECT SUM(amount), COUNT(*) FROM bills WHERE 1=1'
        params = []
        
        if start_date:
            query += ' AND bill_date >= ?'
            params.append(start_date)
        
        if end_date:
            query += ' AND bill_date <= ?'
            params.append(end_date)

        categories_filter = self._fetch_category_names_by_major_minor(cursor, major, minor)
        query = self._append_category_filter(query, params, categories_filter)

        if keyword:
            keyword_like = f'%{keyword}%'
            query += ' AND (merchant LIKE ? OR raw_text LIKE ?)'
            params.extend([keyword_like, keyword_like])
        
        cursor.execute(query, params)
        total_amount, bill_count = cursor.fetchone()
        
        # Get category breakdown
        category_query = query.replace('SUM(amount), COUNT(*)', 'category, SUM(amount), COUNT(*)')
        category_query += ' GROUP BY category ORDER BY SUM(amount) DESC'
        
        cursor.execute(category_query, params)
        categories = {}
        for row in cursor.fetchall():
            categories[row[0]] = {'amount': row[1], 'count': row[2]}
        
        conn.close()
        
        return {
            'total_amount': total_amount or 0.0,
            'bill_count': bill_count or 0,
            'categories': categories,
            'period_start': start_date,
            'period_end': end_date
        }
    
    def get_daily_spending(self, start_date: str = None, end_date: str = None,
                           keyword: str = None, major: str = None,
                           minor: str = None) -> List[Dict[str, Any]]:
        """Get daily spending data"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        query = '''
            SELECT bill_date, SUM(amount), COUNT(*)
            FROM bills 
            WHERE 1=1
        '''
        params = []
        
        if start_date:
            query += ' AND bill_date >= ?'
            params.append(start_date)
        
        if end_date:
            query += ' AND bill_date <= ?'
            params.append(end_date)

        categories_filter = self._fetch_category_names_by_major_minor(cursor, major, minor)
        query = self._append_category_filter(query, params, categories_filter)

        if keyword:
            keyword_like = f'%{keyword}%'
            query += ' AND (merchant LIKE ? OR raw_text LIKE ?)'
            params.extend([keyword_like, keyword_like])
        
        query += ' GROUP BY bill_date ORDER BY bill_date DESC'
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                'date': row[0],
                'amount': row[1],
                'count': row[2]
            }
            for row in rows
        ]


# Backward compatibility - Enhanced versions of existing classes
class EnhancedExcelSaver:
    """Enhanced Excel saver with date support"""
    
    def __init__(self, filename=config.EXCEL_PATH):
        self.filename = filename
        self.init_file()
    
    def init_file(self):
        if not os.path.exists(self.filename):
            wb = Workbook()
            ws = wb.active
            ws.title = "账单记录"
            headers = ["记录时间", "账单日期", "截图文件名", "商户/商品", "分类", "金额", "备注(原始数据)"]
            ws.append(headers)
            wb.save(self.filename)
            print(f"📘 [Enhanced Excel] 已创建新账本: {self.filename}")
    
    def save(self, bill: EnhancedBill):
        """Save enhanced bill to Excel"""
        try:
            wb = load_workbook(self.filename)
            ws = wb.active
            
            merchant_clean = bill.merchant.split("￥")[0].replace(">", "").strip()
            row = [
                bill.created_at,
                bill.bill_date,
                bill.filename,
                merchant_clean,
                bill.category,
                bill.amount,
                str(bill.raw_text)[:50] + "..." if bill.raw_text else ""
            ]
            ws.append(row)
            wb.save(self.filename)
            print(f"✅ [Enhanced Excel] 写入成功")
        except PermissionError:
            print(f"❌ [Enhanced Excel] 写入失败: 请先关闭打开的文件！")


# Legacy compatibility wrapper
class DatabaseSaver:
    """Legacy compatibility wrapper for existing code"""
    
    def __init__(self, db_name=config.DB_PATH):
        self.enhanced_db = EnhancedDatabaseManager(db_name)
    
    def save(self, data, image_name, bill_date=None):
        """Save bill data (legacy format)"""
        bill = EnhancedBill(
            filename=image_name,
            merchant=data.get("merchant", ""),
            amount=data.get("amount", 0.0),
            category=data.get("category", ""),
            raw_text=data.get("raw_text", []),
            bill_date=bill_date or datetime.date.today().strftime("%Y-%m-%d"),
            is_manual=False
        )
        return self.enhanced_db.save_bill(bill)
