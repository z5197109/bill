// 账单管理云函�?
const cloud = require('@cloudbase/node-sdk');
const dayjs = require('dayjs');
const { successResponse, errorResponse, asyncHandler, verifyUser, verifyResourceAccess, validate, paginate, getWXContext } = require('./shared/utils');

// 初始化云开�?
const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();
const _ = db.command;

/**
 * 获取账单列表
 */
const listBills = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { 
    ledger_id, 
    page = 1, 
    limit = 20,
    start_date,
    end_date,
    category,
    keyword,
    sort_by = 'bill_date',
    sort_order = 'desc'
  } = event.data;
  
  validate.required(ledger_id, '账本ID');
  
  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存�?);
  }
  verifyResourceAccess(ledgerResult.data[0], user._id);
  
  // 构建查询条件
  const where = {
    user_id: user._id,
    ledger_id
  };
  
  // 日期范围筛�?
  if (start_date || end_date) {
    where.bill_date = {};
    if (start_date) where.bill_date[_.gte] = new Date(start_date);
    if (end_date) where.bill_date[_.lte] = new Date(end_date);
  }
  
  // 分类筛�?
  if (category) {
    where.category = category;
  }
  
  // 关键词搜�?
  if (keyword) {
    where[_.or] = [
      { merchant: db.RegExp({ regexp: keyword, options: 'i' }) },
      { category: db.RegExp({ regexp: keyword, options: 'i' }) }
    ];
  }
  
  // 分页参数
  const { skip, limit: pageLimit } = paginate(page, limit);
  
  // 排序
  const orderBy = sort_order === 'asc' ? 'asc' : 'desc';
  const sortField = ['bill_date', 'amount', 'created_at'].includes(sort_by) ? sort_by : 'bill_date';
  
  // 查询数据
  const [billsResult, countResult] = await Promise.all([
    db.collection('bills')
      .where(where)
      .orderBy(sortField, orderBy)
      .skip(skip)
      .limit(pageLimit)
      .get(),
    db.collection('bills').where(where).count()
  ]);
  
  return successResponse({
    bills: billsResult.data,
    pagination: {
      page,
      limit: pageLimit,
      total: countResult.total,
      pages: Math.ceil(countResult.total / pageLimit)
    }
  });
};

/**
 * ??????
 */
const getBill = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const data = event.data || event;
  const { bill_id } = data;

  validate.required(bill_id, '??ID');

  const billResult = await db.collection('bills').doc(bill_id).get();
  if (!billResult.data.length) {
    throw new Error('?????');
  }

  const bill = billResult.data[0];
  verifyResourceAccess(bill, user._id);

  return successResponse({ bill });
};


/**
 * 创建账单
 */
const createBill = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { 
    ledger_id,
    filename,
    image_url,
    merchant,
    amount,
    category,
    category_id,
    bill_date,
    raw_text = [],
    is_manual = false,
    include_in_budget = true
  } = event.data;
  
  // 验证必填字段
  validate.required(ledger_id, '账本ID');
  validate.required(merchant, '商户名称');
  validate.required(amount, '金额');
  validate.positiveNumber(amount, '金额');
  
  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存�?);
  }
  verifyResourceAccess(ledgerResult.data[0], user._id);
  
  // 验证日期
  const billDate = bill_date ? new Date(bill_date) : new Date();
  if (isNaN(billDate.getTime())) {
    throw new Error('账单日期格式不正�?);
  }
  
  const billData = {
    user_id: user._id,
    ledger_id,
    filename: filename || '',
    image_url: image_url || '',
    merchant: merchant.trim(),
    amount: parseFloat(amount),
    category_id: category_id || null,
    category: category || '',
    bill_date: billDate,
    created_at: new Date(),
    updated_at: new Date(),
    raw_text: Array.isArray(raw_text) ? raw_text : [],
    is_manual: Boolean(is_manual),
    include_in_budget: Boolean(include_in_budget),
    ocr_result: null
  };
  
  const result = await db.collection('bills').add({
    data: billData
  });
  
  return successResponse({
    id: (result.id || result._id),
    ...billData
  });
};

/**
 * 更新账单
 */
const updateBill = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { bill_id, ...updateFields } = event.data;
  
  validate.required(bill_id, '账单ID');
  
  // 获取账单信息并验证权�?
  const billResult = await db.collection('bills').doc(bill_id).get();
  if (!billResult.data.length) {
    throw new Error('账单不存�?);
  }
  
  const bill = billResult.data[0];
  verifyResourceAccess(bill, user._id);
  
  // 构建更新数据
  const updateData = {
    updated_at: new Date()
  };
  
  // 验证并设置更新字�?
  if (updateFields.merchant !== undefined) {
    validate.required(updateFields.merchant, '商户名称');
    updateData.merchant = updateFields.merchant.trim();
  }
  
  if (updateFields.amount !== undefined) {
    validate.positiveNumber(updateFields.amount, '金额');
    updateData.amount = parseFloat(updateFields.amount);
  }
  
  if (updateFields.category !== undefined) {
    updateData.category = updateFields.category;
  }
  
  if (updateFields.category_id !== undefined) {
    updateData.category_id = updateFields.category_id;
  }
  
  if (updateFields.bill_date !== undefined) {
    const billDate = new Date(updateFields.bill_date);
    if (isNaN(billDate.getTime())) {
      throw new Error('账单日期格式不正�?);
    }
    updateData.bill_date = billDate;
  }
  
  if (updateFields.include_in_budget !== undefined) {
    updateData.include_in_budget = Boolean(updateFields.include_in_budget);
  }
  
  await db.collection('bills').doc(bill_id).update({
    data: updateData
  });
  
  return successResponse({ message: '账单更新成功' });
};

/**
 * 删除账单
 */
const deleteBill = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { bill_id } = event.data;
  
  validate.required(bill_id, '账单ID');
  
  // 获取账单信息并验证权�?
  const billResult = await db.collection('bills').doc(bill_id).get();
  if (!billResult.data.length) {
    throw new Error('账单不存�?);
  }
  
  verifyResourceAccess(billResult.data[0], user._id);
  
  await db.collection('bills').doc(bill_id).remove();
  
  return successResponse({ message: '账单删除成功' });
};

/**
 * 批量删除账单
 */
const batchDeleteBills = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { bill_ids } = event.data;
  
  if (!Array.isArray(bill_ids) || bill_ids.length === 0) {
    throw new Error('账单ID列表不能为空');
  }
  
  // 验证所有账单的权限
  const billsResult = await db.collection('bills')
    .where({
      _id: _.in(bill_ids),
      user_id: user._id
    })
    .get();
    
  if (billsResult.data.length !== bill_ids.length) {
    throw new Error('部分账单不存在或无权限访�?);
  }
  
  // 批量删除
  await Promise.all(
    bill_ids.map(id => db.collection('bills').doc(id).remove())
  );
  
  return successResponse({ 
    message: `成功删除 ${bill_ids.length} 条账单`,
    deleted_count: bill_ids.length
  });
};

/**
 * 批量更新账单预算状�?
 */
const batchUpdateBudget = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { bill_ids, include_in_budget } = event.data;
  
  if (!Array.isArray(bill_ids) || bill_ids.length === 0) {
    throw new Error('账单ID列表不能为空');
  }
  
  // 验证所有账单的权限
  const billsResult = await db.collection('bills')
    .where({
      _id: _.in(bill_ids),
      user_id: user._id
    })
    .get();
    
  if (billsResult.data.length !== bill_ids.length) {
    throw new Error('部分账单不存在或无权限访�?);
  }
  
  // 批量更新
  await Promise.all(
    bill_ids.map(id => 
      db.collection('bills').doc(id).update({
        data: {
          include_in_budget: Boolean(include_in_budget),
          updated_at: new Date()
        }
      })
    )
  );
  
  return successResponse({ 
    message: `成功更新 ${bill_ids.length} 条账单`,
    updated_count: bill_ids.length
  });
};

/**
 * 获取账单统计
 */
const getBillStats = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id, start_date, end_date } = event.data;
  
  validate.required(ledger_id, '账本ID');
  
  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存�?);
  }
  verifyResourceAccess(ledgerResult.data[0], user._id);
  
  // 构建查询条件
  const where = {
    user_id: user._id,
    ledger_id
  };
  
  if (start_date || end_date) {
    where.bill_date = {};
    if (start_date) where.bill_date[_.gte] = new Date(start_date);
    if (end_date) where.bill_date[_.lte] = new Date(end_date);
  }
  
  // 获取账单数据
  const billsResult = await db.collection('bills').where(where).get();
  const bills = billsResult.data;
  
  // 统计计算
  const totalAmount = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
  const budgetAmount = bills
    .filter(bill => bill.include_in_budget)
    .reduce((sum, bill) => sum + (bill.amount || 0), 0);
  
  // 分类统计
  const categoryStats = {};
  bills.forEach(bill => {
    const category = bill.category || '未分�?;
    if (!categoryStats[category]) {
      categoryStats[category] = { amount: 0, count: 0 };
    }
    categoryStats[category].amount += bill.amount || 0;
    categoryStats[category].count += 1;
  });
  
  return successResponse({
    total_amount: totalAmount,
    budget_amount: budgetAmount,
    bill_count: bills.length,
    category_stats: categoryStats,
    period: {
      start_date,
      end_date
    }
  });
};

/**
 * 主函数入�?
 */
exports.main = asyncHandler(async (event, context) => {
  cloud.__context = context;
  cloud.__event = event;
  const { action } = event;
  
  switch (action) {
    case 'list':
      return await listBills(event);
    case 'get':
      return await getBill(event);
    case 'create':
      return await createBill(event);
    case 'update':
      return await updateBill(event);
    case 'delete':
      return await deleteBill(event);
    case 'batchDelete':
      return await batchDeleteBills(event);
    case 'batchUpdateBudget':
      return await batchUpdateBudget(event);
    case 'stats':
      return await getBillStats(event);
    default:
      throw new Error('不支持的操作类型');
  }
});