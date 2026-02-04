// CloudBase 配置文件
const config = {
  // 环境配置
  env: {
    development: 'dev-4g40wh23d397fbae',
    production: 'dev-4g40wh23d397fbae'
  },

  // 数据库集合名称
  collections: {
    users: 'users',
    ledgers: 'ledgers',
    bills: 'bills',
    categories: 'categories',
    categoryRules: 'category_rules',
    recurringRules: 'recurring_rules',
    ledgerBackups: 'ledger_backups'
  },

  // 文件存储配置
  storage: {
    maxSize: 16 * 1024 * 1024, // 16MB
    allowedTypes: ['png', 'jpg', 'jpeg'],
    imageQuality: 80,
    maxImageSide: 1280
  },

  // 默认分类映射
  defaultCategories: {
    "美团": "餐饮/外卖",
    "饿了么": "餐饮/外卖",
    "肯德基": "餐饮/快餐",
    "麦当劳": "餐饮/快餐",
    "星巴克": "餐饮/饮品",
    "瑞幸": "餐饮/饮品",
    "滴滴": "交通/打车",
    "高德": "交通/打车",
    "淘宝": "购物/电商",
    "京东": "购物/电商",
    "拼多多": "购物/电商"
  },

  // OCR 配置
  ocr: {
    provider: 'tencent',
    tencentOcr: {
      region: 'ap-beijing',
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY
    }
  }
};

module.exports = config;