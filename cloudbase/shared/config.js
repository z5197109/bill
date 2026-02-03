// CloudBase 配置文件
const config = {
  // 环境配置
  env: {
    development: 'bill-assistant-dev',
    production: 'bill-assistant-prod'
  },
  
  // 数据库配置
  database: {
    collections: {
      users: 'users',
      ledgers: 'ledgers', 
      bills: 'bills',
      categories: 'categories',
      categoryRules: 'category_rules',
      recurringRules: 'recurring_rules'
    }
  },
  
  // 存储配置
  storage: {
    buckets: {
      bills: 'bill-images',
      avatars: 'user-avatars',
      exports: 'data-exports',
      temp: 'temp-files'
    },
    // 文件路径模板
    paths: {
      billImage: (userId, ledgerId, year, month, filename) => 
        `bills/${userId}/${ledgerId}/${year}/${month}/${filename}`,
      userAvatar: (userId) => `avatars/${userId}/avatar.jpg`,
      dataExport: (userId, exportId) => `exports/${userId}/${exportId}.xlsx`,
      tempFile: (sessionId, filename) => `temp/${sessionId}/${filename}`
    }
  },
  
  // 业务配置
  business: {
    // 默认分类规则 (与原 config.py 保持一致)
    defaultCategoryRules: {
      "麦当劳": "餐饮/正餐",
      "肯德基": "餐饮/正餐", 
      "汉堡王": "餐饮/正餐",
      "滴滴": "交通/打车",
      "全家": "购物/便利店",
      "罗森": "购物/便利店",
      "超市": "购物/生活用品",
      "百亿补贴": "购物/电商",
      "拼多多": "购物/电商",
      "淘宝": "购物/电商",
      "京东": "购物/电商"
    },
    
    // 弱关键词列表
    weakKeywords: [
      "百亿补贴", "拼多多", "淘宝", "京东",
      "云闪付", "待发货", "退款", "商品"
    ],
    
    // 文件限制
    fileLimit: {
      maxSize: 16 * 1024 * 1024, // 16MB
      allowedTypes: ['png', 'jpg', 'jpeg'],
      imageQuality: 80,
      maxImageSide: 1280
    }
  },
  
  // OCR 配置
  ocr: {
    confidenceThreshold: 0.6,
    // 可以选择使用腾讯云 OCR 或保持现有方案
    provider: 'tencent', // 'tencent' | 'custom'
    tencentOcr: {
      region: 'ap-beijing',
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY
    }
  }
};

module.exports = config;