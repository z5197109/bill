# analytics.py
import sqlite3
from tabulate import tabulate  # 建议 pip install tabulate 以获得漂亮的表格输出，没有安装的话下面会用简单print
import config  # 导入配置


class LedgerAnalytics:
    def __init__(self, db_name=config.DB_PATH):  # 使用配置路径
        self.db_name = db_name

    def _query(self, sql):
        """执行 SQL 并返回结果"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        cursor.execute(sql)
        results = cursor.fetchall()
        conn.close()
        return results

    def show_dashboard(self):
        print("\n" + "=" * 40)
        print("📊 消费数据看板 (Data Dashboard)")
        print("=" * 40)

        self.total_expense()
        self.expense_by_category()
        self.expense_by_day()
        self.expense_by_year()

    def total_expense(self):
        """总支出"""
        res = self._query("SELECT SUM(amount) FROM bills")
        total = res[0][0] if res[0][0] else 0.0
        print(f"\n💰 历史总支出: ¥ {total:.2f}")

    def expense_by_category(self):
        """按类别统计"""
        sql = "SELECT category, SUM(amount) FROM bills GROUP BY category ORDER BY SUM(amount) DESC"
        results = self._query(sql)
        print("\n📂 各分类支出排行:")
        self._print_table(["分类", "金额"], results)

    def expense_by_day(self):
        """按日统计 (最近 7 条有记录的天数)"""
        # SQLite 使用 substr 截取 YYYY-MM-DD
        sql = """
            SELECT substr(record_time, 1, 10) as day, SUM(amount) 
            FROM bills 
            GROUP BY day 
            ORDER BY day DESC 
            LIMIT 7
        """
        results = self._query(sql)
        print("\n📅 每日支出 (最近7天):")
        self._print_table(["日期", "金额"], results)

    def expense_by_year(self):
        """按年统计"""
        sql = """
            SELECT substr(record_time, 1, 4) as year, SUM(amount) 
            FROM bills 
            GROUP BY year 
            ORDER BY year DESC
        """
        results = self._query(sql)
        print("\n📅 年度支出:")
        self._print_table(["年份", "金额"], results)

    def _print_table(self, headers, data):
        """简单的表格打印助手"""
        # 简单对齐打印
        print(f"{headers[0]:<15} | {headers[1]:>10}")
        print("-" * 30)
        for row in data:
            name = row[0]
            amount = row[1] if row[1] else 0.0
            print(f"{name:<15} | ¥ {amount:>8.2f}")