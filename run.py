# run.py
import os
import config  # 导入配置
from app.bill_parser import BillParser
from app.storage import ExcelSaver, DatabaseSaver
from app.analytics import LedgerAnalytics

def main():
    print(f"🚀 启动智图记账 (数据目录: {config.IMG_DIR})")

    # 1. 初始化模块
    parser = BillParser()
    excel = ExcelSaver()
    db = DatabaseSaver()
    analytics = LedgerAnalytics()

    # 2. 遍历 data/bills 目录下的所有图片
    # 这样你只需要把新截图丢进文件夹，运行脚本就会自动处理所有图
    if not os.path.exists(config.IMG_DIR):
        print(f"❌ 错误：找不到图片目录 {config.IMG_DIR}")
        return

    # 获取所有 .jpg, .png 文件
    image_files = [f for f in os.listdir(config.IMG_DIR) if f.lower().endswith(('.jpg', '.png', '.jpeg'))]

    if not image_files:
        print("⚠️ 目录中没有找到图片文件。")
        return

    print(f"📸 发现 {len(image_files)} 张待处理账单...")

    for img_name in image_files:
        # 拼接图片的完整路径
        img_full_path = os.path.join(config.IMG_DIR, img_name)
        
        print(f"\n--- 处理: {img_name} ---")
        
        try:
            # A. 识别
            bill_data = parser.parse(img_full_path)
            
            # B. 打印
            print(f"   ✅ 识别: {bill_data['merchant']} | ¥{bill_data['amount']}")
            
            # C. 存储
            excel.save(bill_data, img_name)
            db.save(bill_data, img_name)
            
        except Exception as e:
            print(f"   ❌ 处理失败: {e}")

    # 3. 处理完毕，展示统计看板
    print("\n" + "="*30)
    print("🏁 所有账单处理完成，最新统计如下：")
    analytics.show_dashboard()

if __name__ == "__main__":
    main()