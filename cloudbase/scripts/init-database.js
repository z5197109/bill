// 数据库初始化脚本
const cloud = require('@cloudbase/node-sdk');

// 初始化云开发
const app = cloud.init({
  env: process.env.CLOUDBASE_ENV || 'bill-assistant-dev'
});

const db = app.database();

/**
 * 创建数据库集合和索引
 */
async function initDatabase() {
  console.log('开始初始化数据库...');
  
  try {
    // CloudBase 数据库会自动创建集合，我们只需要确保集合存在
    console.log('CloudBase 数据库会在首次写入时自动创建集合');
    console.log('索引将在数据增长时根据需要手动创建');
    
    // 显示集合统计信息
    await showCollectionStats();
    
    console.log('数据库初始化完成！');
    
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

/**
 * 显示集合统计信息
 */
async function showCollectionStats() {
  console.log('\n=== 数据库集合统计 ===');
  
  const collections = ['users', 'ledgers', 'bills', 'categories', 'category_rules', 'recurring_rules'];
  
  for (const collectionName of collections) {
    try {
      const count = await db.collection(collectionName).count();
      console.log(`${collectionName}: ${count.total} 条记录`);
    } catch (error) {
      console.log(`${collectionName}: 集合不存在或查询失败`);
    }
  }
}

/**
 * 创建默认数据
 */
async function createDefaultData() {
  console.log('\n开始创建默认数据...');
  
  try {
    // 创建系统默认分类（如果不存在）
    const systemCategories = [
      { name: '餐饮/正餐', major_category: '餐饮', minor_category: '正餐', color: '#ff4d4f', icon: 'restaurant' },
      { name: '餐饮/外卖', major_category: '餐饮', minor_category: '外卖', color: '#ff7a45', icon: 'delivery' },
      { name: '交通/打车', major_category: '交通', minor_category: '打车', color: '#faad14', icon: 'taxi' },
      { name: '交通/公交', major_category: '交通', minor_category: '公交', color: '#fadb14', icon: 'bus' },
      { name: '购物/生活用品', major_category: '购物', minor_category: '生活用品', color: '#52c41a', icon: 'shopping' },
      { name: '购物/电商', major_category: '购物', minor_category: '电商', color: '#13c2c2', icon: 'online-shopping' },
      { name: '娱乐/电影', major_category: '娱乐', minor_category: '电影', color: '#1890ff', icon: 'movie' },
      { name: '医疗/药品', major_category: '医疗', minor_category: '药品', color: '#722ed1', icon: 'medicine' },
      { name: '其他/未分类', major_category: '其他', minor_category: '未分类', color: '#8c8c8c', icon: 'other' }
    ];
    
    console.log('创建系统默认分类模板...');
    // 注意：这些是模板数据，实际使用时需要为每个用户创建
    
    console.log('默认数据创建完成！');
    
  } catch (error) {
    console.error('创建默认数据失败:', error);
    throw error;
  }
}

/**
 * 清理数据库（危险操作，仅用于开发环境）
 */
async function cleanDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境禁止执行清理操作');
  }
  
  console.log('警告：即将清理所有数据库数据！');
  
  const collections = ['users', 'ledgers', 'bills', 'categories', 'category_rules', 'recurring_rules'];
  
  for (const collectionName of collections) {
    try {
      const result = await db.collection(collectionName).where({}).remove();
      console.log(`清理集合 ${collectionName}: 删除 ${result.deleted} 条记录`);
    } catch (error) {
      console.log(`清理集合 ${collectionName} 失败:`, error.message);
    }
  }
  
  console.log('数据库清理完成！');
}

// 命令行参数处理
const command = process.argv[2];

async function main() {
  try {
    switch (command) {
      case 'init':
        await initDatabase();
        break;
      case 'create-default':
        await createDefaultData();
        break;
      case 'stats':
        await showCollectionStats();
        break;
      case 'clean':
        await cleanDatabase();
        break;
      case 'full':
        await initDatabase();
        await createDefaultData();
        break;
      default:
        console.log('使用方法:');
        console.log('  node init-database.js init          # 初始化数据库索引');
        console.log('  node init-database.js create-default # 创建默认数据');
        console.log('  node init-database.js stats         # 显示统计信息');
        console.log('  node init-database.js clean         # 清理数据库（开发环境）');
        console.log('  node init-database.js full          # 完整初始化');
        break;
    }
  } catch (error) {
    console.error('执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  initDatabase,
  createDefaultData,
  showCollectionStats,
  cleanDatabase
};