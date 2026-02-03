// 数据迁移脚本 - 从 SQLite 迁移到 CloudBase MongoDB
const cloud = require('@cloudbase/node-sdk');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 初始化云开发
const app = cloud.init({
  env: process.env.CLOUDBASE_ENV || 'bill-assistant-dev'
});

const db = app.database();

/**
 * 数据迁移主类
 */
class DataMigrator {
  constructor(sqliteDbPath) {
    this.sqliteDbPath = sqliteDbPath;
    this.sqliteDb = null;
    this.migrationLog = [];
  }

  /**
   * 连接 SQLite 数据库
   */
  async connectSQLite() {
    return new Promise((resolve, reject) => {
      this.sqliteDb = new sqlite3.Database(this.sqliteDbPath, (err) => {
        if (err) {
          reject(new Error(`连接 SQLite 数据库失败: ${err.message}`));
        } else {
          console.log('SQLite 数据库连接成功');
          resolve();
        }
      });
    });
  }

  /**
   * 关闭 SQLite 数据库连接
   */
  async closeSQLite() {
    return new Promise((resolve) => {
      if (this.sqliteDb) {
        this.sqliteDb.close((err) => {
          if (err) {
            console.error('关闭 SQLite 数据库失败:', err.message);
          } else {
            console.log('SQLite 数据库连接已关闭');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 执行 SQLite 查询
   */
  async querySQLite(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * 记录迁移日志
   */
  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message };
    this.migrationLog.push(logEntry);
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
  }

  /**
   * 迁移用户数据
   */
  async migrateUsers() {
    this.log('开始迁移用户数据...');
    
    try {
      // 从 SQLite 查询用户数据
      const users = await this.querySQLite(`
        SELECT * FROM users ORDER BY created_at
      `);
      
      this.log(`找到 ${users.length} 个用户记录`);
      
      let migratedCount = 0;
      let skippedCount = 0;
      
      for (const user of users) {
        try {
          // 检查用户是否已存在
          const existingUser = await db.collection('users')
            .where({ openid: user.openid })
            .get();
          
          if (existingUser.data.length > 0) {
            this.log(`用户 ${user.openid} 已存在，跳过`, 'warn');
            skippedCount++;
            continue;
          }
          
          // 转换用户数据格式
          const userData = {
            openid: user.openid,
            nickname: user.nickname || '微信用户',
            avatar: user.avatar || '',
            created_at: new Date(user.created_at),
            updated_at: new Date(user.updated_at || user.created_at),
            settings: {
              default_ledger_id: user.default_ledger_id || null,
              theme: user.theme || 'light',
              language: user.language || 'zh-CN'
            }
          };
          
          // 插入到 CloudBase
          const result = await db.collection('users').add({
            data: userData
          });
          
          // 记录 ID 映射关系
          this.userIdMapping = this.userIdMapping || {};
          this.userIdMapping[user.id] = result._id;
          
          migratedCount++;
          this.log(`用户 ${user.openid} 迁移成功`);
          
        } catch (error) {
          this.log(`用户 ${user.openid} 迁移失败: ${error.message}`, 'error');
        }
      }
      
      this.log(`用户数据迁移完成: 成功 ${migratedCount}, 跳过 ${skippedCount}`);
      return { migrated: migratedCount, skipped: skippedCount };
      
    } catch (error) {
      this.log(`用户数据迁移失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 迁移账本数据
   */
  async migrateLedgers() {
    this.log('开始迁移账本数据...');
    
    try {
      const ledgers = await this.querySQLite(`
        SELECT * FROM ledgers ORDER BY created_at
      `);
      
      this.log(`找到 ${ledgers.length} 个账本记录`);
      
      let migratedCount = 0;
      let skippedCount = 0;
      
      for (const ledger of ledgers) {
        try {
          // 获取对应的 CloudBase 用户 ID
          const cloudbaseUserId = this.userIdMapping[ledger.user_id];
          if (!cloudbaseUserId) {
            this.log(`账本 ${ledger.name} 的用户不存在，跳过`, 'warn');
            skippedCount++;
            continue;
          }
          
          // 检查账本是否已存在
          const existingLedger = await db.collection('ledgers')
            .where({
              user_id: cloudbaseUserId,
              name: ledger.name
            })
            .get();
          
          if (existingLedger.data.length > 0) {
            this.log(`账本 ${ledger.name} 已存在，跳过`, 'warn');
            skippedCount++;
            continue;
          }
          
          // 转换账本数据格式
          const ledgerData = {
            user_id: cloudbaseUserId,
            name: ledger.name,
            description: ledger.description || '',
            is_default: Boolean(ledger.is_default),
            created_at: new Date(ledger.created_at),
            updated_at: new Date(ledger.updated_at || ledger.created_at),
            settings: {
              currency: ledger.currency || 'CNY',
              budget_limit: ledger.budget_limit || 0,
              budget_period: ledger.budget_period || 'monthly'
            }
          };
          
          // 插入到 CloudBase
          const result = await db.collection('ledgers').add({
            data: ledgerData
          });
          
          // 记录 ID 映射关系
          this.ledgerIdMapping = this.ledgerIdMapping || {};
          this.ledgerIdMapping[ledger.id] = result._id;
          
          migratedCount++;
          this.log(`账本 ${ledger.name} 迁移成功`);
          
        } catch (error) {
          this.log(`账本 ${ledger.name} 迁移失败: ${error.message}`, 'error');
        }
      }
      
      this.log(`账本数据迁移完成: 成功 ${migratedCount}, 跳过 ${skippedCount}`);
      return { migrated: migratedCount, skipped: skippedCount };
      
    } catch (error) {
      this.log(`账本数据迁移失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 迁移账单数据
   */
  async migrateBills() {
    this.log('开始迁移账单数据...');
    
    try {
      const bills = await this.querySQLite(`
        SELECT * FROM bills ORDER BY created_at
      `);
      
      this.log(`找到 ${bills.length} 个账单记录`);
      
      let migratedCount = 0;
      let skippedCount = 0;
      const batchSize = 100; // 批量处理大小
      
      for (let i = 0; i < bills.length; i += batchSize) {
        const batch = bills.slice(i, i + batchSize);
        
        for (const bill of batch) {
          try {
            // 获取对应的 CloudBase 用户 ID 和账本 ID
            const cloudbaseUserId = this.userIdMapping[bill.user_id];
            const cloudbaseLedgerId = this.ledgerIdMapping[bill.ledger_id];
            
            if (!cloudbaseUserId || !cloudbaseLedgerId) {
              this.log(`账单 ${bill.id} 的用户或账本不存在，跳过`, 'warn');
              skippedCount++;
              continue;
            }
            
            // 转换账单数据格式
            const billData = {
              user_id: cloudbaseUserId,
              ledger_id: cloudbaseLedgerId,
              filename: bill.filename || '',
              image_url: bill.image_url || '',
              merchant: bill.merchant || '',
              amount: parseFloat(bill.amount) || 0,
              category_id: bill.category_id || null,
              category: bill.category || '',
              bill_date: new Date(bill.bill_date),
              created_at: new Date(bill.created_at),
              updated_at: new Date(bill.updated_at || bill.created_at),
              raw_text: bill.raw_text ? JSON.parse(bill.raw_text) : [],
              is_manual: Boolean(bill.is_manual),
              include_in_budget: Boolean(bill.include_in_budget),
              ocr_result: bill.ocr_result ? JSON.parse(bill.ocr_result) : null
            };
            
            // 插入到 CloudBase
            await db.collection('bills').add({
              data: billData
            });
            
            migratedCount++;
            
            if (migratedCount % 50 === 0) {
              this.log(`已迁移 ${migratedCount} 条账单记录...`);
            }
            
          } catch (error) {
            this.log(`账单 ${bill.id} 迁移失败: ${error.message}`, 'error');
            skippedCount++;
          }
        }
      }
      
      this.log(`账单数据迁移完成: 成功 ${migratedCount}, 跳过 ${skippedCount}`);
      return { migrated: migratedCount, skipped: skippedCount };
      
    } catch (error) {
      this.log(`账单数据迁移失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 迁移分类数据
   */
  async migrateCategories() {
    this.log('开始迁移分类数据...');
    
    try {
      // 检查 SQLite 中是否有分类表
      const tableExists = await this.querySQLite(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='categories'
      `);
      
      if (tableExists.length === 0) {
        this.log('SQLite 中没有分类表，跳过分类迁移');
        return { migrated: 0, skipped: 0 };
      }
      
      const categories = await this.querySQLite(`
        SELECT * FROM categories ORDER BY created_at
      `);
      
      this.log(`找到 ${categories.length} 个分类记录`);
      
      let migratedCount = 0;
      let skippedCount = 0;
      
      for (const category of categories) {
        try {
          const cloudbaseUserId = this.userIdMapping[category.user_id];
          if (!cloudbaseUserId) {
            this.log(`分类 ${category.name} 的用户不存在，跳过`, 'warn');
            skippedCount++;
            continue;
          }
          
          // 检查分类是否已存在
          const existingCategory = await db.collection('categories')
            .where({
              user_id: cloudbaseUserId,
              name: category.name
            })
            .get();
          
          if (existingCategory.data.length > 0) {
            this.log(`分类 ${category.name} 已存在，跳过`, 'warn');
            skippedCount++;
            continue;
          }
          
          // 解析分类名称
          const parts = category.name.split('/');
          const categoryData = {
            user_id: cloudbaseUserId,
            name: category.name,
            major_category: parts[0] || '',
            minor_category: parts[1] || '',
            color: category.color || '#1890ff',
            icon: category.icon || 'default',
            sort_order: category.sort_order || 0,
            created_at: new Date(category.created_at),
            updated_at: new Date(category.updated_at || category.created_at)
          };
          
          await db.collection('categories').add({
            data: categoryData
          });
          
          migratedCount++;
          this.log(`分类 ${category.name} 迁移成功`);
          
        } catch (error) {
          this.log(`分类 ${category.name} 迁移失败: ${error.message}`, 'error');
          skippedCount++;
        }
      }
      
      this.log(`分类数据迁移完成: 成功 ${migratedCount}, 跳过 ${skippedCount}`);
      return { migrated: migratedCount, skipped: skippedCount };
      
    } catch (error) {
      this.log(`分类数据迁移失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 验证迁移结果
   */
  async validateMigration() {
    this.log('开始验证迁移结果...');
    
    try {
      // 统计 CloudBase 中的数据
      const [usersCount, ledgersCount, billsCount, categoriesCount] = await Promise.all([
        db.collection('users').count(),
        db.collection('ledgers').count(),
        db.collection('bills').count(),
        db.collection('categories').count()
      ]);
      
      // 统计 SQLite 中的数据
      const [sqliteUsers, sqliteLedgers, sqliteBills] = await Promise.all([
        this.querySQLite('SELECT COUNT(*) as count FROM users'),
        this.querySQLite('SELECT COUNT(*) as count FROM ledgers'),
        this.querySQLite('SELECT COUNT(*) as count FROM bills')
      ]);
      
      let sqliteCategories = [{ count: 0 }];
      try {
        sqliteCategories = await this.querySQLite('SELECT COUNT(*) as count FROM categories');
      } catch (error) {
        // 分类表可能不存在
      }
      
      const validation = {
        users: {
          sqlite: sqliteUsers[0].count,
          cloudbase: usersCount.total,
          match: sqliteUsers[0].count === usersCount.total
        },
        ledgers: {
          sqlite: sqliteLedgers[0].count,
          cloudbase: ledgersCount.total,
          match: sqliteLedgers[0].count === ledgersCount.total
        },
        bills: {
          sqlite: sqliteBills[0].count,
          cloudbase: billsCount.total,
          match: sqliteBills[0].count === billsCount.total
        },
        categories: {
          sqlite: sqliteCategories[0].count,
          cloudbase: categoriesCount.total,
          match: sqliteCategories[0].count === categoriesCount.total
        }
      };
      
      this.log('=== 迁移结果验证 ===');
      Object.keys(validation).forEach(table => {
        const v = validation[table];
        const status = v.match ? '✓' : '✗';
        this.log(`${table}: SQLite(${v.sqlite}) -> CloudBase(${v.cloudbase}) ${status}`);
      });
      
      return validation;
      
    } catch (error) {
      this.log(`验证迁移结果失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 保存迁移日志
   */
  async saveMigrationLog() {
    const logFileName = `migration_log_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const logPath = path.join(__dirname, '..', 'logs', logFileName);
    
    // 确保日志目录存在
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logData = {
      migration_time: new Date().toISOString(),
      sqlite_db_path: this.sqliteDbPath,
      cloudbase_env: process.env.CLOUDBASE_ENV || 'bill-assistant-dev',
      logs: this.migrationLog,
      id_mappings: {
        users: this.userIdMapping || {},
        ledgers: this.ledgerIdMapping || {}
      }
    };
    
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
    this.log(`迁移日志已保存到: ${logPath}`);
    
    return logPath;
  }

  /**
   * 执行完整迁移
   */
  async migrate() {
    const startTime = Date.now();
    this.log('开始数据迁移...');
    
    try {
      // 连接 SQLite 数据库
      await this.connectSQLite();
      
      // 执行迁移
      const results = {};
      results.users = await this.migrateUsers();
      results.ledgers = await this.migrateLedgers();
      results.bills = await this.migrateBills();
      results.categories = await this.migrateCategories();
      
      // 验证迁移结果
      const validation = await this.validateMigration();
      
      // 保存迁移日志
      const logPath = await this.saveMigrationLog();
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      this.log(`数据迁移完成，耗时 ${duration} 秒`);
      
      return {
        success: true,
        duration,
        results,
        validation,
        log_path: logPath
      };
      
    } catch (error) {
      this.log(`数据迁移失败: ${error.message}`, 'error');
      throw error;
    } finally {
      await this.closeSQLite();
    }
  }
}

// 命令行执行
async function main() {
  const sqliteDbPath = process.argv[2];
  
  if (!sqliteDbPath) {
    console.log('使用方法: node migrate-data.js <sqlite-db-path>');
    console.log('示例: node migrate-data.js ../bill_assistant.db');
    process.exit(1);
  }
  
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`SQLite 数据库文件不存在: ${sqliteDbPath}`);
    process.exit(1);
  }
  
  const migrator = new DataMigrator(sqliteDbPath);
  
  try {
    const result = await migrator.migrate();
    console.log('\n=== 迁移完成 ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = DataMigrator;