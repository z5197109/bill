// 用户管理云函�?
const cloud = require('@cloudbase/node-sdk');
const { successResponse, errorResponse, asyncHandler, verifyUser, getWXContext } = require('./shared/utils');

// 初始化云开�?
const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();

/**
 * 微信登录
 */
const login = async (event) => {
  const { code } = event.data;
  
  if (!code) {
    throw new Error('登录凭证不能为空');
  }
  
  // 获取微信用户信息
  const { OPENID, UNIONID } = getWXContext(cloud);
  
  if (!OPENID) {
    throw new Error('获取用户信息失败');
  }
  
  // 查找或创建用�?
  let user = await verifyUser(app, OPENID);
  
  // 更新最后登录时�?
  await db.collection('users').doc(user._id).update({
    data: {
      updated_at: new Date(),
      last_login: new Date()
    }
  });
  
  return successResponse({
    user: {
      id: (user._id || user.id),
      openid: user.openid,
      nickname: user.nickname,
      avatar: user.avatar,
      settings: user.settings
    },
    token: OPENID // 简化处理，直接使用 OPENID 作为 token
  });
};

/**
 * 获取用户信息
 */
const getUserInfo = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  
  return successResponse({
    id: (user._id || user.id),
    openid: user.openid,
    nickname: user.nickname,
    avatar: user.avatar,
    settings: user.settings,
    created_at: user.created_at,
    updated_at: user.updated_at
  });
};

/**
 * 更新用户信息
 */
const updateUserInfo = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { nickname, avatar, settings } = event.data;
  
  const updateData = {
    updated_at: new Date()
  };
  
  if (nickname !== undefined) updateData.nickname = nickname;
  if (avatar !== undefined) updateData.avatar = avatar;
  if (settings !== undefined) updateData.settings = { ...user.settings, ...settings };
  
  await db.collection('users').doc(user._id).update({
    data: updateData
  });
  
  return successResponse({ message: '用户信息更新成功' });
};

/**
 * 获取用户统计信息
 */
const getUserStats = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  
  // 统计用户数据
  const [ledgerCount, billCount, categoryCount] = await Promise.all([
    db.collection('ledgers').where({ user_id: (user._id || user.id), is_deleted: false }).count(),
    db.collection('bills').where({ user_id: (user._id || user.id) }).count(),
    db.collection('categories').where({ user_id: (user._id || user.id) }).count()
  ]);
  
  return successResponse({
    ledger_count: ledgerCount.total,
    bill_count: billCount.total,
    category_count: categoryCount.total,
    member_since: user.created_at
  });
};

/**
 * 数据迁移接口 (仅用于初始化)
 */
const migrateUserData = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { migrationData } = event.data;
  
  if (!migrationData) {
    throw new Error('迁移数据不能为空');
  }
  
  // 检查是否已经迁移过
  const existingLedgers = await db.collection('ledgers')
    .where({ user_id: (user._id || user.id) })
    .count();
    
  if (existingLedgers.total > 0) {
    throw new Error('用户数据已存在，无法重复迁移');
  }
  
  try {
    // 开始批量插入数�?
    const results = {};
    
    // 1. 插入账本数据
    if (migrationData.ledgers && migrationData.ledgers.length > 0) {
      const ledgerResults = await Promise.all(
        migrationData.ledgers.map(ledger => 
          db.collection('ledgers').add({ data: ledger })
        )
      );
      results.ledgers = ledgerResults.map(r => r._id);
    }
    
    // 2. 插入分类数据
    if (migrationData.categories && migrationData.categories.length > 0) {
      const categoryResults = await Promise.all(
        migrationData.categories.map(category => 
          db.collection('categories').add({ data: category })
        )
      );
      results.categories = categoryResults.map(r => r._id);
    }
    
    // 3. 插入分类规则数据
    if (migrationData.categoryRules && migrationData.categoryRules.length > 0) {
      const ruleResults = await Promise.all(
        migrationData.categoryRules.map(rule => 
          db.collection('category_rules').add({ data: rule })
        )
      );
      results.categoryRules = ruleResults.map(r => r._id);
    }
    
    // 4. 插入账单数据
    if (migrationData.bills && migrationData.bills.length > 0) {
      const billResults = await Promise.all(
        migrationData.bills.map(bill => 
          db.collection('bills').add({ data: bill })
        )
      );
      results.bills = billResults.map(r => r._id);
    }
    
    // 5. 插入周期性规则数�?
    if (migrationData.recurringRules && migrationData.recurringRules.length > 0) {
      const recurringResults = await Promise.all(
        migrationData.recurringRules.map(rule => 
          db.collection('recurring_rules').add({ data: rule })
        )
      );
      results.recurringRules = recurringResults.map(r => r._id);
    }
    
    return successResponse({
      message: '数据迁移成功',
      results,
      summary: migrationData.summary
    });
    
  } catch (error) {
    console.error('数据迁移失败:', error);
    throw new Error('数据迁移失败: ' + error.message);
  }
};

/**
 * 主函数入�?
 */
exports.main = asyncHandler(async (event, context) => {
  cloud.__context = context;
  cloud.__event = event;
  const { action } = event;
  
  switch (action) {
    case 'login':
      return await login(event);
    case 'getUserInfo':
      return await getUserInfo(event);
    case 'updateUserInfo':
      return await updateUserInfo(event);
    case 'getUserStats':
      return await getUserStats(event);
    case 'migrateUserData':
      return await migrateUserData(event);
    default:
      throw new Error('不支持的操作类型');
  }
});