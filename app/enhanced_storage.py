# enhanced_storage.py - Enhanced storage system with new features
import os
import datetime
import sqlite3
import json
from typing import List, Dict, Optional, Any
from dataclasses import dataclass

from openpyxl import Workbook, load_workbook
import config


@dataclass
class EnhancedBill:
    """Enhanced bill data model"""
    id: Optional[int] = None
    ledger_id: Optional[int] = None
    filename: str = ""
    merchant: str = ""
    amount: float = 0.0
    category_id: Optional[int] = None
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
    category_id: Optional[int] = None
    category: str = ""
    ledger_id: Optional[int] = None
    priority: int = 1
    is_weak: bool = False
    created_at: str = ""
    updated_at: str = ""
    
    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not self.updated_at:
            self.updated_at = self.created_at
        if self.ledger_id is None:
            try:
                self.ledger_id = EnhancedDatabaseManager().get_default_ledger_id()
            except Exception:
                self.ledger_id = None


@dataclass
class CategoryGroup:
    """Category group data model"""
    id: Optional[int] = None
    ledger_id: Optional[int] = None
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
        
        # Ledgers table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ledgers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                monthly_budget REAL DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            )
        ''')

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
                is_manual INTEGER DEFAULT 0,
                ledger_id INTEGER
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
                updated_at TEXT,
                ledger_id INTEGER
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

        # Add ledger_id columns if missing
        for table in ['bills', 'category_rules', 'categories']:
            cursor.execute(f"PRAGMA table_info({table})")
            cols = [c[1] for c in cursor.fetchall()]
            if 'ledger_id' not in cols:
                try:
                    cursor.execute(f'ALTER TABLE {table} ADD COLUMN ledger_id INTEGER')
                except Exception:
                    pass

        # Ensure default ledger exists before running migrations that need it
        cursor.execute('SELECT COUNT(*) FROM ledgers')
        if cursor.fetchone()[0] == 0:
            now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute('INSERT INTO ledgers (name, monthly_budget, created_at, updated_at) VALUES (?, ?, ?, ?)',
                           ('默认账本', 0, now, now))
            conn.commit()

        # Rebuild tables to add unique constraints with ledger_id (if not yet migrated)
        cursor.execute('PRAGMA user_version')
        user_version = cursor.fetchone()[0] or 0
        if user_version < 1:
            self._migrate_categories_with_ledger(cursor)
            self._migrate_category_rules_with_ledger(cursor)
            self._migrate_bills_with_ledger(cursor)
            cursor.execute('PRAGMA user_version = 1')
            user_version = 1
        if user_version < 2:
            self._migrate_categories_with_ids(cursor)
            cursor.execute('PRAGMA user_version = 2')
        
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

        # Cleanup legacy NULL-ledger duplicates once on startup
        self._cleanup_categories(cursor)
        
        conn.commit()
        conn.close()

    def _migrate_categories_with_ledger(self, cursor):
        cursor.execute("PRAGMA table_info(categories)")
        cols = cursor.fetchall()
        has_ledger = any(c[1] == 'ledger_id' for c in cols)
        cursor.execute("PRAGMA index_list(categories)")
        idxs = cursor.fetchall()
        has_ledger_unique = any('ledger' in (idx[1] or '') for idx in idxs)
        if has_ledger and has_ledger_unique:
            return

        cursor.execute("SELECT id, major, minor, created_at, updated_at, ledger_id FROM categories")
        rows = cursor.fetchall()
        cursor.execute("ALTER TABLE categories RENAME TO categories_old")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                major TEXT NOT NULL,
                minor TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                ledger_id INTEGER,
                UNIQUE(major, minor, ledger_id)
            )
        ''')
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for row in rows:
            cursor.execute('''
                INSERT OR IGNORE INTO categories (id, major, minor, created_at, updated_at, ledger_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (row[0], row[1], row[2], row[3] or now, row[4] or now, row[5] if len(row) > 5 else None))
        cursor.execute("DROP TABLE IF EXISTS categories_old")

    def _migrate_category_rules_with_ledger(self, cursor):
        cursor.execute("PRAGMA table_info(category_rules)")
        rows = cursor.fetchall()
        has_ledger = any(r[1] == 'ledger_id' for r in rows)
        cursor.execute("PRAGMA index_list(category_rules)")
        idxs = cursor.fetchall()
        has_ledger_unique = any('ledger' in (idx[1] or '') for idx in idxs)
        if has_ledger and has_ledger_unique:
            return
        cursor.execute("SELECT id, keyword, category, priority, is_weak, created_at, updated_at, ledger_id FROM category_rules")
        old_rows = cursor.fetchall()
        cursor.execute("ALTER TABLE category_rules RENAME TO category_rules_old")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS category_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL,
                category TEXT NOT NULL,
                priority INTEGER DEFAULT 1,
                is_weak INTEGER DEFAULT 0,
                created_at TEXT,
                updated_at TEXT,
                ledger_id INTEGER,
                UNIQUE(keyword, ledger_id)
            )
        ''')
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for r in old_rows:
            cursor.execute('''
                INSERT OR IGNORE INTO category_rules (id, keyword, category, priority, is_weak, created_at, updated_at, ledger_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (r[0], r[1], r[2], r[3], r[4], r[5] or now, r[6] or now, r[7] if len(r) > 7 else None))
        cursor.execute("DROP TABLE IF EXISTS category_rules_old")

    def _migrate_bills_with_ledger(self, cursor):
        cursor.execute("PRAGMA table_info(bills)")
        cols = cursor.fetchall()
        has_ledger = any(c[1] == 'ledger_id' for c in cols)
        if not has_ledger:
            return
        # assign default ledger_id to NULL entries
        default_ledger = self.get_default_ledger_id()
        cursor.execute('UPDATE bills SET ledger_id = ? WHERE ledger_id IS NULL', (default_ledger,))

    def _migrate_categories_with_ids(self, cursor):
        # 0) 确认 bills/category_rules 不是 VIEW（否则 ALTER TABLE 会失败）
        for table in ("bills", "category_rules"):
            cursor.execute(
                "SELECT type, sql FROM sqlite_master WHERE name=? COLLATE NOCASE",
                (table,),
            )
            row = cursor.fetchone()
            if not row:
                raise RuntimeError(f"Table not found: {table}")
            if row[0] != "table":
                raise RuntimeError(f"{table} is not a table (type={row[0]}), cannot ALTER. sql={row[1]}")

        # 1) add category_id columns（不要吞异常）
        for table in ("bills", "category_rules"):
            cursor.execute(f"PRAGMA table_info({table})")
            cols = [c[1] for c in cursor.fetchall()]
            if "category_id" not in cols:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN category_id INTEGER")
                # 立刻验证
                cursor.execute(f"PRAGMA table_info({table})")
                cols2 = [c[1] for c in cursor.fetchall()]
                if "category_id" not in cols2:
                    raise RuntimeError(f"Failed to add category_id to {table}")

        # 2) build mapping: (major, minor, ledger_id)->category_id
        cursor.execute("SELECT id, major, minor, ledger_id FROM categories")
        categories = cursor.fetchall()

        cat_map = {}
        for cid, maj, mino, lid in categories:
            cat_map[(maj or "", mino or "", lid)] = cid
            # 如果你希望“ledger 维度匹配不到时可以回退到全局分类(ledger_id NULL)”
            # 可以额外放一个 fallback key
            if lid is None:
                cat_map[(maj or "", mino or "", None)] = cid

        def cat_id_by_name(name, ledger_id):
            name = (name or "").strip()
            major, minor = (name.split("/", 1) + [""])[:2]
            major = major.strip()
            minor = minor.strip()
            # 先找同 ledger 的分类
            cid = cat_map.get((major, minor, ledger_id))
            if cid:
                return cid
            # 再找全局分类（ledger_id NULL）
            return cat_map.get((major, minor, None))

        # 3) bills backfill（用 0 而不是 ''）
        cursor.execute(
            "SELECT id, category, ledger_id FROM bills WHERE category_id IS NULL OR category_id = 0"
        )
        for bid, cat, lid in cursor.fetchall():
            cid = cat_id_by_name(cat, lid)
            if cid:
                cursor.execute("UPDATE bills SET category_id=? WHERE id=?", (cid, bid))

        # 4) rules backfill
        cursor.execute(
            "SELECT id, category, ledger_id FROM category_rules WHERE category_id IS NULL OR category_id = 0"
        )
        for rid, cat, lid in cursor.fetchall():
            cid = cat_id_by_name(cat, lid)
            if cid:
                cursor.execute("UPDATE category_rules SET category_id=? WHERE id=?", (cid, rid))


    def get_default_ledger_id(self) -> int:
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM ledgers ORDER BY id LIMIT 1')
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else 0

    def list_ledgers(self) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, monthly_budget, created_at, updated_at FROM ledgers ORDER BY id')
        rows = cursor.fetchall()
        conn.close()
        return [
            {
                "id": row[0],
                "name": row[1],
                "monthly_budget": row[2] or 0,
                "created_at": row[3],
                "updated_at": row[4]
            }
            for row in rows
        ]

    def save_ledger(self, ledger: Dict[str, Any]) -> int:
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ledger_id = ledger.get("id")
        name = ledger.get("name")
        budget = ledger.get("monthly_budget") or 0
        if ledger_id:
            cursor.execute('UPDATE ledgers SET name=?, monthly_budget=?, updated_at=? WHERE id=?',
                           (name, budget, now, ledger_id))
        else:
            cursor.execute('INSERT INTO ledgers (name, monthly_budget, created_at, updated_at) VALUES (?, ?, ?, ?)',
                           (name, budget, now, now))
            ledger_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return ledger_id

    def delete_ledger(self, ledger_id: int) -> bool:
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM ledgers WHERE id=?', (ledger_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return deleted
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

    def _resolve_category(self, cursor, category_name: str, category_id: Optional[int], ledger_id: Optional[int]):
        """Return (category_id, category_full_name) using ID when provided; otherwise try to find by name."""
        if category_id:
            cursor.execute("SELECT major, minor FROM categories WHERE id=?", (category_id,))
            row = cursor.fetchone()
            if row:
                return category_id, self._format_category_name(row[0], row[1])
        if not category_name:
            return None, ""
        group = self._split_category_name(category_name)
        # prefer ledger-specific match, fallback to global
        params = [group.major, group.minor]
        query = "SELECT id, major, minor FROM categories WHERE major=? AND minor=?"
        if ledger_id is not None:
            query += " AND (ledger_id IS NULL OR ledger_id = ?)"
            params.append(ledger_id)
        cursor.execute(query, params)
        row = cursor.fetchone()
        if row:
            return row[0], self._format_category_name(row[1], row[2])
        return None, category_name

    def _init_categories_from_rules_and_config(self, cursor):
        """Initialize categories from existing rules and config"""
        print("🔄 [DB Init] 正在初始化分类目录...")
        categories = set()
        default_ledger = self.get_default_ledger_id()

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
                INSERT OR IGNORE INTO categories (major, minor, created_at, updated_at, ledger_id)
                VALUES (?, ?, ?, ?, ?)
            ''', (group.major, group.minor, now, now, default_ledger))

        print("✅ [DB Init] 分类目录初始化完成")

    def _sync_categories_from_rules(self, cursor):
        """Ensure categories table covers categories referenced by rules"""
        cursor.execute('SELECT DISTINCT category, ledger_id FROM category_rules')
        rows = cursor.fetchall()
        if not rows:
            return
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        default_ledger = self.get_default_ledger_id()
        for category_name, lid in rows:
            if not category_name:
                continue
            group = self._split_category_name(category_name)
            if not group.major:
                continue
            ledger_val = lid if lid is not None else default_ledger
            cursor.execute('''
                INSERT OR IGNORE INTO categories (major, minor, created_at, updated_at, ledger_id)
                VALUES (?, ?, ?, ?, ?)
            ''', (group.major, group.minor, now, now, ledger_val))

    def _cleanup_categories(self, cursor):
        """Normalize ledger_id on categories and remove duplicates created before migration."""
        default_ledger = self.get_default_ledger_id()
        if not default_ledger:
            return
        cursor.execute('SELECT id, major, minor, ledger_id FROM categories')
        rows = cursor.fetchall()
        if not rows:
            return

        # Prefer keeping records that already have a ledger_id to avoid unique conflicts
        rows_sorted = sorted(rows, key=lambda r: (r[3] in (None, 0), r[0]))
        keepers = {}
        ledger_updates = []
        duplicates = []
        for cid, major, minor, lid in rows_sorted:
            normalized_ledger = lid if lid not in (None, 0) else default_ledger
            key = ((major or "").strip(), (minor or "").strip(), normalized_ledger)
            if key in keepers:
                duplicates.append((cid, keepers[key]))
            else:
                keepers[key] = cid
                if lid in (None, 0):
                    ledger_updates.append((normalized_ledger, cid))

        for ledger_val, cid in ledger_updates:
            cursor.execute('UPDATE categories SET ledger_id=? WHERE id=?', (ledger_val, cid))

        for dup_id, keep_id in duplicates:
            cursor.execute('UPDATE bills SET category_id=? WHERE category_id=?', (keep_id, dup_id))
            cursor.execute('UPDATE category_rules SET category_id=? WHERE category_id=?', (keep_id, dup_id))

        if duplicates:
            dup_ids = [d[0] for d in duplicates]
            placeholders = ','.join(['?'] * len(dup_ids))
            cursor.execute(f'DELETE FROM categories WHERE id IN ({placeholders})', dup_ids)
    
    # Bills CRUD operations
    def save_bill(self, bill: EnhancedBill) -> int:
        """Save a bill to database"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        if bill.ledger_id is None:
            bill.ledger_id = self.get_default_ledger_id()
        # resolve category by id or name
        bill.category_id, bill.category = self._resolve_category(cursor, bill.category, bill.category_id, bill.ledger_id)
        bill.updated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        raw_text_json = json.dumps(bill.raw_text, ensure_ascii=False)
        
        if bill.id:
            # Update existing bill
            cursor.execute('''
                UPDATE bills 
                SET image_name=?, merchant=?, category=?, category_id=?, amount=?, raw_text=?,
                    bill_date=?, updated_at=?, is_manual=?, ledger_id=?
                WHERE id=?
            ''', (bill.filename, bill.merchant, bill.category, bill.category_id, bill.amount, 
                  raw_text_json, bill.bill_date, bill.updated_at, 
                  int(bill.is_manual), bill.ledger_id, bill.id))
            bill_id = bill.id
        else:
            # Insert new bill
            cursor.execute('''
                INSERT INTO bills (record_time, image_name, merchant, category, category_id, amount, 
                                 raw_text, bill_date, created_at, updated_at, is_manual, ledger_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (bill.created_at, bill.filename, bill.merchant, bill.category, bill.category_id,
                  bill.amount, raw_text_json, bill.bill_date, bill.created_at, 
                  bill.updated_at, int(bill.is_manual), bill.ledger_id))
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
    
    def _append_category_filter(self, query: str, params: List[Any], categories: Optional[List[str]], col_expr: str = "category") -> str:
        if categories is None:
            return query
        if not categories:
            return f"{query} AND 0"
        placeholders = ','.join(['?'] * len(categories))
        query += f' AND {col_expr} IN ({placeholders})'
        params.extend(categories)
        return query

    def _fetch_category_names_by_major_minor(self, cursor, major: str = None, minor: str = None, ledger_id: Optional[int] = None) -> Optional[List[str]]:
        if not major and not minor:
            return None
        query = 'SELECT major, minor FROM categories WHERE 1=1'
        params: List[Any] = []
        if major:
            query += ' AND major = ?'
            params.append(major)
        if minor:
            query += ' AND minor = ?'
            params.append(minor)
        if ledger_id is not None:
            query += ' AND (ledger_id IS NULL OR ledger_id = ?)'
            params.append(ledger_id)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [self._format_category_name(row[0], row[1]) for row in rows]

    def get_bills(self, limit: int = 100, offset: int = 0, 
                  start_date: str = None, end_date: str = None,
                  category: str = None, keyword: str = None,
                  major: str = None, minor: str = None,
                  ledger_id: Optional[int] = None) -> List[EnhancedBill]:
        """Get bills with filtering and pagination"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        query = '''
            SELECT b.*, c.major, c.minor
            FROM bills b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE 1=1
        '''
        params = []
        
        if start_date:
            query += ' AND b.bill_date >= ?'
            params.append(start_date)
        
        if end_date:
            query += ' AND b.bill_date <= ?'
            params.append(end_date)
        
        categories_filter = None
        if category:
            categories_filter = [category]
        elif major or minor:
            categories_filter = self._fetch_category_names_by_major_minor(cursor, major, minor, ledger_id)
        query = self._append_category_filter(query, params, categories_filter, "COALESCE(c.major || '/' || c.minor, b.category)")

        if keyword:
            keyword_like = f'%{keyword}%'
            query += ' AND (b.merchant LIKE ? OR b.raw_text LIKE ?)'
            params.extend([keyword_like, keyword_like])

        if ledger_id is not None:
            query += ' AND b.ledger_id = ?'
            params.append(ledger_id)
        
        query += ' ORDER BY b.bill_date DESC, b.created_at DESC LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_bill(row) for row in rows]

    def get_bills_count(self, start_date: str = None, end_date: str = None,
                        category: str = None, keyword: str = None,
                        major: str = None, minor: str = None,
                        ledger_id: Optional[int] = None) -> int:
        """Get total bill count with filtering"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        query = '''
            SELECT COUNT(*)
            FROM bills b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE 1=1
        '''
        params = []

        if start_date:
            query += ' AND b.bill_date >= ?'
            params.append(start_date)

        if end_date:
            query += ' AND b.bill_date <= ?'
            params.append(end_date)

        categories_filter = None
        if category:
            categories_filter = [category]
        elif major or minor:
            categories_filter = self._fetch_category_names_by_major_minor(cursor, major, minor, ledger_id)
        query = self._append_category_filter(query, params, categories_filter, "COALESCE(c.major || '/' || c.minor, b.category)")

        if keyword:
            keyword_like = f'%{keyword}%'
            query += ' AND (b.merchant LIKE ? OR b.raw_text LIKE ?)'
            params.extend([keyword_like, keyword_like])

        if ledger_id is not None:
            query += ' AND b.ledger_id = ?'
            params.append(ledger_id)

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
        cat_id = row[12] if len(row) > 12 else None
        cat_major = row[13] if len(row) > 13 else None
        cat_minor = row[14] if len(row) > 14 else None
        category_name = self._format_category_name(cat_major, cat_minor) if cat_major is not None else (row[4] or "")
        
        return EnhancedBill(
            id=row[0],
            ledger_id=row[11] if len(row) > 11 else None,
            filename=row[2] or "",
            merchant=row[3] or "",
            amount=row[5] or 0.0,
            category_id=cat_id,
            category=category_name,
            bill_date=row[7] or datetime.date.today().strftime("%Y-%m-%d"),
            created_at=row[8] or row[1],  # Fallback to record_time
            updated_at=row[9] or row[1],  # Fallback to record_time
            raw_text=raw_text,
            is_manual=bool(row[10]) if len(row) > 10 else False
        )
    
    # Category Rules CRUD operations
    def get_category_rules(self, ledger_id: Optional[int] = None) -> List[CategoryRule]:
        """Get all category rules (global + specific ledger when provided)"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        query = '''
            SELECT r.id, r.keyword, r.category, r.category_id, r.priority, r.is_weak,
                   r.created_at, r.updated_at, r.ledger_id, c.major, c.minor
            FROM category_rules r
            LEFT JOIN categories c ON r.category_id = c.id
            WHERE 1=1
        '''
        params: List[Any] = []
        if ledger_id is not None:
            query += ' AND (r.ledger_id IS NULL OR r.ledger_id = ?)'
            params.append(ledger_id)

        query += ' ORDER BY r.category, r.priority DESC, r.keyword'
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_category_rule(row) for row in rows]
    
    def save_category_rule(self, rule: CategoryRule) -> int:
        """Save a category rule"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        if rule.ledger_id is None:
            rule.ledger_id = self.get_default_ledger_id()
        rule.category_id, rule.category = self._resolve_category(cursor, rule.category, rule.category_id, rule.ledger_id)
        rule.updated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if rule.id:
            # Update existing rule
            cursor.execute('''
                UPDATE category_rules 
                SET keyword=?, category=?, category_id=?, priority=?, is_weak=?, updated_at=?, ledger_id=?
                WHERE id=?
            ''', (rule.keyword, rule.category, rule.category_id, rule.priority, 
                  int(rule.is_weak), rule.updated_at, rule.ledger_id, rule.id))
            rule_id = rule.id
        else:
            # Insert new rule
            cursor.execute('''
                INSERT INTO category_rules (keyword, category, category_id, priority, is_weak, created_at, updated_at, ledger_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (rule.keyword, rule.category, rule.category_id, rule.priority, 
                  int(rule.is_weak), rule.created_at, rule.updated_at, rule.ledger_id))
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
        cat_name = self._format_category_name(row[9], row[10]) if len(row) > 10 and row[9] is not None else row[2]
        return CategoryRule(
            id=row[0],
            keyword=row[1],
            category=cat_name,
            category_id=row[3] if len(row) > 3 else None,
            priority=row[4],
            is_weak=bool(row[5]),
            created_at=row[6],
            updated_at=row[7],
            ledger_id=row[8] if len(row) > 8 else None
        )

    # Category Groups CRUD operations
    def get_category_groups(self, ledger_id: Optional[int] = None) -> List[CategoryGroup]:
        """Get all category groups (global + specific ledger)"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        params: List[Any] = []
        query = 'SELECT * FROM categories WHERE 1=1'
        if ledger_id is not None:
            query += ' AND (ledger_id IS NULL OR ledger_id = ?)'
            params.append(ledger_id)
        query += ' ORDER BY major, minor'
        cursor.execute(query, params)
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

    def get_category_group_by_name(self, category_name: str, ledger_id: Optional[int] = None) -> Optional[CategoryGroup]:
        """Get a category group by full name"""
        group = self._split_category_name(category_name)
        if not group.major:
            return None
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        params: List[Any] = [group.major, group.minor]
        query = 'SELECT * FROM categories WHERE major = ? AND minor = ?'
        if ledger_id is not None:
            query += ' AND (ledger_id IS NULL OR ledger_id = ?)'
            params.append(ledger_id)
        cursor.execute(query, params)
        row = cursor.fetchone()
        conn.close()
        if row:
            return self._row_to_category_group(row)
        return None

    def category_exists(self, category_name: str, ledger_id: Optional[int] = None) -> bool:
        """Check if a category exists"""
        return self.get_category_group_by_name(category_name, ledger_id) is not None

    def save_category_group(self, group: CategoryGroup) -> int:
        """Save a category group and propagate renames to rules"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if group.id:
            cursor.execute('SELECT major, minor, ledger_id FROM categories WHERE id = ?', (group.id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                raise ValueError("Category not found")

            old_name = self._format_category_name(row[0], row[1])
            new_name = self._format_category_name(group.major, group.minor)
            group.updated_at = now
            group.ledger_id = group.ledger_id if group.ledger_id is not None else row[2]

            try:
                cursor.execute('''
                    UPDATE categories
                    SET major = ?, minor = ?, updated_at = ?, ledger_id = ?
                    WHERE id = ?
                ''', (group.major, group.minor, group.updated_at, group.ledger_id, group.id))
            except sqlite3.IntegrityError:
                conn.close()
                raise ValueError("Category already exists")

            if old_name != new_name:
                cursor.execute('''
                    UPDATE category_rules
                    SET category = ?
                    WHERE category = ? AND (ledger_id IS NULL OR ledger_id = ?)
                ''', (new_name, old_name, group.ledger_id))
                cursor.execute('''
                    UPDATE bills
                    SET category = ?
                    WHERE category = ? AND ledger_id = ?
                ''', (new_name, old_name, group.ledger_id))
            group_id = group.id
        else:
            group.created_at = now
            group.updated_at = now
            try:
                cursor.execute('''
                    INSERT INTO categories (major, minor, created_at, updated_at, ledger_id)
                    VALUES (?, ?, ?, ?, ?)
                ''', (group.major, group.minor, group.created_at, group.updated_at, group.ledger_id))
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

    def list_category_names(self, ledger_id: Optional[int] = None) -> List[str]:
        """Get full category names for dropdowns"""
        groups = self.get_category_groups(ledger_id)
        names = [self._format_category_name(group.major, group.minor) for group in groups]
        return [name for name in names if name]

    def _row_to_category_group(self, row) -> CategoryGroup:
        """Convert database row to CategoryGroup object"""
        return CategoryGroup(
            id=row[0],
            major=row[1],
            minor=row[2],
            created_at=row[3],
            updated_at=row[4],
            ledger_id=row[5] if len(row) > 5 else None
        )
    
    # Analytics methods
    def get_spending_summary(self, start_date: str = None, end_date: str = None,
                             keyword: str = None, major: str = None,
                             minor: str = None, ledger_id: Optional[int] = None) -> Dict[str, Any]:
        """Get spending summary for a date range"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        base_query = '''
            FROM bills b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE 1=1
        '''
        params = []

        if start_date:
            base_query += ' AND b.bill_date >= ?'
            params.append(start_date)

        if end_date:
            base_query += ' AND b.bill_date <= ?'
            params.append(end_date)

        categories_filter = self._fetch_category_names_by_major_minor(cursor, major, minor, ledger_id)
        base_query = self._append_category_filter(base_query, params, categories_filter, "COALESCE(c.major || '/' || c.minor, b.category)")

        if ledger_id is not None:
            base_query += ' AND b.ledger_id = ?'
            params.append(ledger_id)

        if keyword:
            keyword_like = f'%{keyword}%'
            base_query += ' AND (b.merchant LIKE ? OR b.raw_text LIKE ?)'
            params.extend([keyword_like, keyword_like])

        cursor.execute(f'SELECT SUM(b.amount), COUNT(*) {base_query}', params)
        total_amount, bill_count = cursor.fetchone()

        cursor.execute(f'SELECT COUNT(DISTINCT b.bill_date) {base_query}', params)
        day_count = cursor.fetchone()[0] or 0

        # Get category breakdown
        category_query = f'''
            SELECT COALESCE(c.major || '/' || c.minor, b.category) AS cat_name,
                   SUM(b.amount), COUNT(*)
            {base_query}
            GROUP BY cat_name
            ORDER BY SUM(b.amount) DESC
        '''

        cursor.execute(category_query, params)
        categories = {}
        for row in cursor.fetchall():
            categories[row[0]] = {'amount': row[1], 'count': row[2]}

        conn.close()

        total_amount = total_amount or 0.0
        daily_avg = (total_amount / day_count) if day_count else 0.0

        return {
            'total_amount': total_amount,
            'bill_count': bill_count or 0,
            'categories': categories,
            'period_start': start_date,
            'period_end': end_date,
            'day_count': day_count,
            'daily_avg': daily_avg
        }
    
    def get_daily_spending(self, start_date: str = None, end_date: str = None,
                           keyword: str = None, major: str = None,
                           minor: str = None, ledger_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get daily spending data"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        query = '''
            SELECT b.bill_date, SUM(b.amount), COUNT(*)
            FROM bills b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE 1=1
        '''
        params = []
        
        if start_date:
            query += ' AND b.bill_date >= ?'
            params.append(start_date)
        
        if end_date:
            query += ' AND b.bill_date <= ?'
            params.append(end_date)

        categories_filter = self._fetch_category_names_by_major_minor(cursor, major, minor, ledger_id)
        query = self._append_category_filter(query, params, categories_filter, "COALESCE(c.major || '/' || c.minor, b.category)")

        if ledger_id is not None:
            query += ' AND b.ledger_id = ?'
            params.append(ledger_id)

        if keyword:
            keyword_like = f'%{keyword}%'
            query += ' AND (b.merchant LIKE ? OR b.raw_text LIKE ?)'
            params.extend([keyword_like, keyword_like])
        
        query += ' GROUP BY b.bill_date ORDER BY b.bill_date DESC'
        
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
