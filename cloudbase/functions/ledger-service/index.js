// 账本管理云函数
const cloud = require('@cloudbase/node-sdk');
const { successResponse, errorResponse, asyncHandler, verifyUser, verifyResourceAccess, validate, getWXContext } = require('./shared/utils');

// 初始化云开发
const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();

/**
 * 获取账本列表
 */
const listLedgers = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  
  const result = await db.collection('ledgers')
    .where({
      user_id: user._id,
      is_deleted: false
    })
    .orderBy('created_at', 'asc')
    .get();
  
  return successResponse(result.data);
};

/**
 * 创建账本
 */
const createLedger = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { name, monthly_budget } = event.data;
  
  // 验证输入
  validate.required(name, '账本名称');
  validate.positiveNumber(monthly_budget || 0, '月预算');
  
  // 检查账本名称是否重复
  const existingLedger = await db.collection('ledgers')
    .where({
      user_id: user._id,
      name: name.trim(),
      is_deleted: false
    })
    .get();
    
  if (existingLedger.data.length > 0) {
    throw new Error('账本名称已存在');
  }
  
  const ledgerData = {
    user_id: user._id,
    name: name.trim(),
    monthly_budget: parseFloat(monthly_budget || 0),
    created_at: new Date(),
    updated_at: new Date(),
    is_deleted: false
  };
  
  const result = await db.collection('ledgers').add({
    data: ledgerData
  });
  
  // 如果这是用户的第一个账本，设为默认账本
  const ledgerCount = await db.collection('ledgers')
    .where({ user_id: user._id, is_deleted: false })
    .count();
    
  if (ledgerCount.total === 1) {
    await db.collection('users').doc(user._id).update({
      data: {
        'settings.default_ledger_id': result._id,
        updated_at: new Date()
      }
    });
  }
  
  return successResponse({
    id: result._id,
    ...ledgerData
  });
};

/**
 * 更新账本
 */
const updateLedger = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id, name, monthly_budget } = event.data;
  
  validate.required(ledger_id, '账本ID');
  
  // 获取账本信息并验证权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存在');
  }
  
  const ledger = ledgerResult.data[0];
  verifyResourceAccess(ledger, user._id);
  
  const updateData = {
    updated_at: new Date()
  };
  
  if (name !== undefined) {
    validate.required(name, '账本名称');
    
    // 检查名称是否重复
    const existingLedger = await db.collection('ledgers')
      .where({
        user_id: user._id,
        name: name.trim(),
        is_deleted: false
      })
      .get();
      
    if (existingLedger.data.length > 0 && existingLedger.data[0]._id !== ledger_id) {
      throw new Error('账本名称已存在');
    }
    
    updateData.name = name.trim();
  }
  
  if (monthly_budget !== undefined) {
    validate.positiveNumber(monthly_budget, '月预算');
    updateData.monthly_budget = parseFloat(monthly_budget);
  }
  
  await db.collection('ledgers').doc(ledger_id).update({
    data: updateData
  });
  
  return successResponse({ message: '账本更新成功' });
};

/**
 * 删除账本
 */
const deleteLedger = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id } = event.data;
  
  validate.required(ledger_id, '账本ID');
  
  // 检查是否是最后一个账本
  const ledgerCount = await db.collection('ledgers')
    .where({ user_id: user._id, is_deleted: false })
    .count();
    
  if (ledgerCount.total <= 1) {
    throw new Error('至少保留一个账本');
  }
  
  // 获取账本信息并验证权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存在');
  }
  
  const ledger = ledgerResult.data[0];
  verifyResourceAccess(ledger, user._id);
  
  // 创建备份数据
  const [bills, categories, categoryRules, recurringRules] = await Promise.all([
    db.collection('bills').where({ ledger_id }).get(),
    db.collection('categories').where({ ledger_id }).get(),
    db.collection('category_rules').where({ ledger_id }).get(),
    db.collection('recurring_rules').where({ ledger_id }).get()
  ]);
  
  const backupData = {
    ledger: ledger,
    bills: bills.data,
    categories: categories.data,
    category_rules: categoryRules.data,
    recurring_rules: recurringRules.data,
    backup_time: new Date()
  };
  
  // 软删除账本并保存备份数据
  await db.collection('ledgers').doc(ledger_id).update({
    data: {
      is_deleted: true,
      deleted_at: new Date(),
      backup_data: backupData
    }
  });
  
  // 如果删除的是默认账本，设置新的默认账本
  if (user.settings.default_ledger_id === ledger_id) {
    const remainingLedgers = await db.collection('ledgers')
      .where({ user_id: user._id, is_deleted: false })
      .orderBy('created_at', 'asc')
      .limit(1)
      .get();
      
    if (remainingLedgers.data.length > 0) {
      await db.collection('users').doc(user._id).update({
        data: {
          'settings.default_ledger_id': remainingLedgers.data[0]._id,
          updated_at: new Date()
        }
      });
    }
  }
  
  return successResponse({ message: '账本删除成功' });
};

/**
 * 获取账本统计信息
 */
const getLedgerStats = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id } = event.data;
  
  validate.required(ledger_id, '账本ID');
  
  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存在');
  }
  
  verifyResourceAccess(ledgerResult.data[0], user._id);
  
  // 统计数据
  const [billCount, totalAmount, categoryCount, ruleCount] = await Promise.all([
    db.collection('bills').where({ ledger_id }).count(),
    db.collection('bills').where({ ledger_id }).get(),
    db.collection('categories').where({ ledger_id }).count(),
    db.collection('category_rules').where({ ledger_id }).count()
  ]);
  
  // 计算总金额
  const total = billCount.data.reduce((sum, bill) => sum + (bill.amount || 0), 0);
  
  return successResponse({
    bill_count: billCount.total,
    total_amount: total,
    category_count: categoryCount.total,
    rule_count: ruleCount.total,
    ledger: ledgerResult.data[0]
  });
};

/**
 * 主函数入口
 */
exports.main = asyncHandler(async (event, context) => {
  const { action } = event;
  
  switch (action) {
    case 'list':
      return await listLedgers(event);
    case 'create':
      return await createLedger(event);
    case 'update':
      return await updateLedger(event);
    case 'delete':
      return await deleteLedger(event);
    case 'stats':
      return await getLedgerStats(event);
    default:
      throw new Error('不支持的操作类型');
  }
});