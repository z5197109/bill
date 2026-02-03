// 数据迁移工具 - 从 SQLite 迁移到 CloudBase
const sqlite3 = require('sqlite3');
const path = require('path');
const { parseCategory, formatCategory } = require('./utils');

class DataMigrator {
  constructor(sqliteDbPath) {
    this.sqliteDbPath = sqliteDbPath;
    this.db = null;
  }
  
  /**
   * 连接 SQLite 数据库
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.sqliteDbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * 关闭数据库连接
   */
  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(resolve);
      } else {
        resolve();
      }
    });
  }
  
  /**
   * 执行 SQL 查询
   */
  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
  
  /**
   * 迁移账本数据
   */
  async migrateLedgers(userId) {
    const ledgers = await this.query('SELECT * FROM ledgers ORDER BY id');
    
    return ledgers.map(ledger => ({
      user_id: userId,
      name: ledger.name,
      monthly_budget: ledger.monthly_budget || 0,
      created_at: new Date(ledger.created_at || Date.now()),
      updated_at: new Date(ledger.updated_at || Date.now()),
      is_deleted: false,
      original_id: ledger.id // 保留原始 ID 用于关联
    }));
  }
  
  /**
   * 迁移分类数据
   */
  async migrateCategories(userId, ledgerIdMap) {
    const categories = await this.query('SELECT * FROM categories ORDER BY id');
    
    return categories.map(category => ({
      user_id: category.ledger_id ? userId : null, // null 表示全局分类
      ledger_id: category.ledger_id ? ledgerIdMap[category.ledger_id] : null,
      major: category.major || '',
      minor: category.minor || '',
      created_at: new Date(category.created_at || Date.now()),
      updated_at: new Date(category.updated_at || Date.now()),
      is_system: !category.ledger_id, // 全局分类视为系统分类
      original_id: category.id
    }));
  }
  
  /**
   * 迁移分类规则数据
   */
  async migrateCategoryRules(userId, ledgerIdMap, categoryIdMap) {
    const rules = await this.query('SELECT * FROM category_rules ORDER BY id');
    
    return rules.map(rule => ({
      user_id: userId,
      ledger_id: rule.ledger_id ? ledgerIdMap[rule.ledger_id] : null,
      keyword: rule.keyword,
      category_id: rule.category_id ? categoryIdMap[rule.category_id] : null,
      category: rule.category,
      priority: rule.priority || 1,
      is_weak: rule.is_weak || false,
      created_at: new Date(rule.created_at || Date.now()),
      updated_at: new Date(rule.updated_at || Date.now()),
      original_id: rule.id
    }));
  }
  
  /**
   * 迁移账单数据
   */
  async migrateBills(userId, ledgerIdMap, categoryIdMap) {
    const bills = await this.query('SELECT * FROM bills ORDER BY id');
    
    return bills.map(bill => {
      let rawText = [];
      try {
        rawText = JSON.parse(bill.raw_text || '[]');
      } catch (e) {
        rawText = [];
      }
      
      return {
        user_id: userId,
        ledger_id: ledgerIdMap[bill.ledger_id],
        filename: bill.image_name || '',
        image_url: '', // 需要后续上传文件后填充
        merchant: bill.merchant || '',
        amount: parseFloat(bill.amount || 0),
        category_id: bill.category_id ? categoryIdMap[bill.category_id] : null,
        category: bill.category || '',
        bill_date: new Date(bill.bill_date || bill.record_time || Date.now()),
        created_at: new Date(bill.created_at || bill.record_time || Date.now()),
        updated_at: new Date(bill.updated_at || bill.record_time || Date.now()),
        raw_text: rawText,
        is_manual: bill.is_manual || false,
        include_in_budget: bill.include_in_budget !== 0,
        ocr_result: null,
        original_id: bill.id,
        original_image_path: bill.image_name // 用于后续文件迁移
      };
    });
  }
  
  /**
   * 迁移周期性规则数据
   */
  async migrateRecurringRules(userId, ledgerIdMap, categoryIdMap) {
    const rules = await this.query('SELECT * FROM recurring_rules ORDER BY id');
    
    return rules.map(rule => {
      let scheduleValue = [];
      try {
        if (typeof rule.schedule_value === 'string') {
          scheduleValue = rule.schedule_value.split(',').map(v => parseInt(v.trim()));
        } else {
          scheduleValue = [rule.schedule_value || 1];
        }
      } catch (e) {
        scheduleValue = [1];
      }
      
      return {
        user_id: userId,
        ledger_id: ledgerIdMap[rule.ledger_id],
        amount: parseFloat(rule.amount || 0),
        keyword: rule.keyword || '',
        category_id: rule.category_id ? categoryIdMap[rule.category_id] : null,
        category: rule.category || '',
        note: rule.note || '',
        schedule_type: rule.schedule_type || 'monthly',
        schedule_value: scheduleValue,
        start_date: new Date(rule.start_date || Date.now()),
        end_date: rule.end_date ? new Date(rule.end_date) : null,
        enabled: rule.enabled !== 0,
        include_in_budget: rule.include_in_budget !== 0,
        created_at: new Date(rule.created_at || Date.now()),
        updated_at: new Date(rule.updated_at || Date.now()),
        original_id: rule.id
      };
    });
  }
  
  /**
   * 完整数据迁移
   */
  async migrateAllData(userId) {
    await this.connect();
    
    try {
      console.log('开始迁移数据...');
      
      // 1. 迁移账本
      console.log('迁移账本数据...');
      const ledgers = await this.migrateLedgers(userId);
      
      // 2. 迁移分类
      console.log('迁移分类数据...');
      const ledgerIdMap = {}; // 原始ID -> 新ID 的映射，需要在插入后建立
      const categories = await this.migrateCategories(userId, ledgerIdMap);
      
      // 3. 迁移分类规则
      console.log('迁移分类规则数据...');
      const categoryIdMap = {}; // 原始ID -> 新ID 的映射，需要在插入后建立
      const categoryRules = await this.migrateCategoryRules(userId, ledgerIdMap, categoryIdMap);
      
      // 4. 迁移账单
      console.log('迁移账单数据...');
      const bills = await this.migrateBills(userId, ledgerIdMap, categoryIdMap);
      
      // 5. 迁移周期性规则
      console.log('迁移周期性规则数据...');
      const recurringRules = await this.migrateRecurringRules(userId, ledgerIdMap, categoryIdMap);
      
      console.log('数据迁移准备完成');
      
      return {
        ledgers,
        categories,
        categoryRules,
        bills,
        recurringRules,
        summary: {
          ledgers: ledgers.length,
          categories: categories.length,
          categoryRules: categoryRules.length,
          bills: bills.length,
          recurringRules: recurringRules.length
        }
      };
      
    } finally {
      await this.close();
    }
  }
}

module.exports = DataMigrator;