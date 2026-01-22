# config.py
import os

# === 1. 路径配置 (自动获取) ===
# 获取当前文件 (config.py) 所在的目录，也就是项目根目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 定义图片存放目录: SnapLedger/data/bills/
IMG_DIR = os.path.join(BASE_DIR, "data", "bills")

# 定义输出目录: SnapLedger/output/
OUTPUT_DIR = os.path.join(BASE_DIR, "output")

# 确保输出目录存在，如果不存在自动创建
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# 定义输出文件的完整路径
DB_PATH = os.path.join(OUTPUT_DIR, "ledger.db")
EXCEL_PATH = os.path.join(OUTPUT_DIR, "我的记账本.xlsx")


# === 2. 业务规则配置 (保持不变) ===
# 定义商品关键词与分类的映射
# 建议：将高频、具体的品牌放在前面
CATEGORY_RULES = {
    # --- 高优先级 (具体品牌/商品) ---
    "星巴克": "餐饮/咖啡",
    "瑞幸": "餐饮/咖啡",
    "麦当劳": "餐饮/正餐",
    "肯德基": "餐饮/正餐",
    "汉堡王": "餐饮/正餐",
    "滴滴": "交通/打车",
    "中石化": "交通/加油",
    "全家": "购物/便利店",
    "罗森": "购物/便利店",
    "超市": "购物/生活用品",

    # --- 低优先级 (平台/通用词) ---
    "百亿补贴": "购物/电商",
    "拼多多": "购物/电商",
    "淘宝": "购物/电商",
    "京东": "购物/电商",
    "云闪付": "财务/支付"
}

# 定义弱关键词列表 (容易被具体品牌覆盖的词)
WEAK_KEYWORDS = [
    "百亿补贴", "拼多多", "淘宝", "京东",
    "云闪付", "待发货", "退款", "商品"
]

# OCR 识别置信度阈值
OCR_CONFIDENCE_THRESHOLD = 0.6