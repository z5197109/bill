// 账本管理云函数
const cloud = require('@cloudbase/node-sdk');
const { successResponse, errorResponse, asyncHandler, verifyUser, verifyResourceAccess, validate, getWXContext } = require('./shared/utils');

/**
 * 初始化云开发
 */
const initApp = (context) => {
  return cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });
};

/**
 * 获取账本列表
 */
const listLedgers = async (event) => {
  const app = initApp();
  const db = app.database();
  const _ = db.command;
  const { OPENID } = getWXContext(cloud);

  const user = await verifyUser(app, OPENID);

  const result = await db.collection('ledgers')
    .where({
      user_id: user._id,
      is_deleted: _.neq(true)
    })
    .orderBy('created_at', 'desc')
    .get();

  return successResponse(result.data || []);
};

/**
 * 创建账本
 */
const createLedger = async (event) => {
  const app = initApp();
  const db = app.database();
  const { OPENID } = getWXContext(cloud);

  const user = await verifyUser(app, OPENID);
  const { name, monthly_budget } = event.data || event;

  validate.required(name, '账本名称');
  validate.number(monthly_budget || 0, '月预算');

  // 检查是否存在同名账本
  const existing = await db.collection('ledgers')
    .where({
      user_id: user._id,
      name: name.trim(),
      is_deleted: db.command.neq(true)
    })
    .count();

  if (existing.total > 0) {
    throw new Error('账本名称已存在');
  }

  // 检查是否是第一个账本（设为默认）
  const ledgerCount = await db.collection('ledgers')
    .where({
      user_id: user._id,
      is_deleted: db.command.neq(true)
    })
    .count();

  const newLedger = {
    user_id: user._id,
    name: name.trim(),
    monthly_budget: parseFloat(monthly_budget || 0),
    is_default: ledgerCount.total === 0,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date()
  };

  const result = await db.collection('ledgers').add(newLedger);
  const ledgerId = result.id || result._id || (Array.isArray(result.ids) ? result.ids[0] : null);

  return successResponse({
    ledger_id: ledgerId,
    message: '账本创建成功'
  });
};

/**
 * 更新账本
 */
const updateLedger = async (event) => {
  const app = initApp();
  const db = app.database();
  const { OPENID } = getWXContext(cloud);

  const user = await verifyUser(app, OPENID);
  const { ledger_id, name, monthly_budget, is_default } = event.data || event;

  validate.required(ledger_id, '账本ID');

  // 验证账本权限
  const ledgerResult = await db.collection('ledgers')
    .where({
      _id: ledger_id,
      user_id: user._id,
      is_deleted: db.command.neq(true)
    })
    .get();

  if (!ledgerResult.data || ledgerResult.data.length === 0) {
    throw new Error('账本不存在或无权访问');
  }

  const updateData = {
    updated_at: new Date()
  };

  if (name !== undefined) {
    validate.required(name, '账本名称');
    updateData.name = name.trim();
  }

  if (monthly_budget !== undefined) {
    updateData.monthly_budget = parseFloat(monthly_budget || 0);
  }

  if (is_default === true) {
    // 取消其他账本的默认状态
    await db.collection('ledgers')
      .where({
        user_id: user._id,
        is_default: true
      })
      .update({
        is_default: false,
        updated_at: new Date()
      });
    updateData.is_default = true;
  }

  await db.collection('ledgers').doc(ledger_id).update(updateData);

  return successResponse({ message: '账本更新成功' });
};

/**
 * 删除账本
 */
const deleteLedger = async (event) => {
  const app = initApp();
  const db = app.database();
  const _ = db.command;
  const { OPENID } = getWXContext(cloud);

  const user = await verifyUser(app, OPENID);
  const { ledger_id } = event.data || event;

  validate.required(ledger_id, '账本ID');

  // 验证账本权限
  const ledgerResult = await db.collection('ledgers')
    .where({
      _id: ledger_id,
      user_id: user._id,
      is_deleted: _.neq(true)
    })
    .get();

  if (!ledgerResult.data || ledgerResult.data.length === 0) {
    throw new Error('账本不存在或无权访问');
  }

  // 检查是否是最后一个账本
  const ledgerCount = await db.collection('ledgers')
    .where({
      user_id: user._id,
      is_deleted: _.neq(true)
    })
    .count();

  if (ledgerCount.total <= 1) {
    throw new Error('至少保留一个账本');
  }

  // 软删除账本
  await db.collection('ledgers').doc(ledger_id).update({
    is_deleted: true,
    deleted_at: new Date(),
    updated_at: new Date()
  });

  // 如果删除的是默认账本，设置另一个账本为默认
  if (ledgerResult.data[0].is_default) {
    const otherLedger = await db.collection('ledgers')
      .where({
        user_id: user._id,
        is_deleted: _.neq(true)
      })
      .limit(1)
      .get();

    if (otherLedger.data && otherLedger.data.length > 0) {
      await db.collection('ledgers').doc(otherLedger.data[0]._id).update({
        is_default: true,
        updated_at: new Date()
      });
    }
  }

  return successResponse({ message: '账本删除成功' });
};

/**
 * 获取账本统计
 */
const getLedgerStats = async (event) => {
  const app = initApp();
  const db = app.database();
  const _ = db.command;
  const { OPENID } = getWXContext(cloud);

  const user = await verifyUser(app, OPENID);
  const { ledger_id } = event.data || event;

  validate.required(ledger_id, '账本ID');

  // 验证账本权限
  const ledgerResult = await db.collection('ledgers')
    .where({
      _id: ledger_id,
      user_id: user._id,
      is_deleted: _.neq(true)
    })
    .get();

  if (!ledgerResult.data || ledgerResult.data.length === 0) {
    throw new Error('账本不存在或无权访问');
  }

  // 并行获取统计数据
  const [billCount, totalAmount, categoryCount, ruleCount] = await Promise.all([
    db.collection('bills').where({ ledger_id, is_deleted: _.neq(true) }).count(),
    db.collection('bills').where({ ledger_id, is_deleted: _.neq(true) }).get(),
    db.collection('categories').where({ ledger_id }).count(),
    db.collection('category_rules').where({ ledger_id }).count()
  ]);

  const total = totalAmount.data.reduce((sum, bill) => sum + (bill.amount || 0), 0);

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
  cloud.__context = context;
  cloud.__event = event;
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