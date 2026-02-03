// 分析统计云函�?
const cloud = require('@cloudbase/node-sdk');
const dayjs = require('dayjs');
const { successResponse, errorResponse, asyncHandler, verifyUser, verifyResourceAccess, validate, formatDate, getWXContext } = require('./shared/utils');

// 初始化云开�?
const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();
const _ = db.command;

/**
 * 获取统计概览（支持按日期范围和筛选条件）
 */
const getSummary = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id, start_date, end_date, keyword, major, minor } = event;

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

  // 日期范围
  if (start_date && end_date) {
    where.bill_date = _.gte(new Date(start_date)).and(_.lte(new Date(end_date + 'T23:59:59')));
  } else if (start_date) {
    where.bill_date = _.gte(new Date(start_date));
  } else if (end_date) {
    where.bill_date = _.lte(new Date(end_date + 'T23:59:59'));
  }

  // 关键词搜�?
  if (keyword) {
    where.merchant = db.RegExp({
      regexp: keyword,
      options: 'i'
    });
  }

  // 分类筛�?
  if (major) {
    where.major = major;
  }
  if (minor) {
    where.minor = minor;
  }

  // 查询账单
  const billsResult = await db.collection('bills').where(where).get();
  const bills = billsResult.data;

  // 统计计算
  const totalAmount = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
  const billCount = bills.length;

  // 计算日期天数
  let dayCount = 1;
  if (start_date && end_date) {
    const start = dayjs(start_date);
    const end = dayjs(end_date);
    dayCount = end.diff(start, 'day') + 1;
  }

  // 计算日均消费
  const dailyAvg = dayCount > 0 ? Math.round(totalAmount / dayCount * 100) / 100 : 0;

  return successResponse({
    success: true,
    summary: {
      total_amount: totalAmount,
      bill_count: billCount,
      day_count: dayCount,
      daily_avg: dailyAvg
    }
  });
};

/**
 * 获取月度消费统计
 */
const getMonthlyStats = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id, year, month } = event.data;

  validate.required(ledger_id, '账本ID');

  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存�?);
  }
  verifyResourceAccess(ledgerResult.data[0], user._id);

  // 计算日期范围
  const targetYear = year || new Date().getFullYear();
  const targetMonth = month || new Date().getMonth() + 1;
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

  // 查询当月账单
  const billsResult = await db.collection('bills')
    .where({
      user_id: user._id,
      ledger_id,
      bill_date: _.gte(startDate).and(_.lte(endDate))
    })
    .get();

  const bills = billsResult.data;

  // 统计计算
  const totalAmount = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
  const budgetAmount = bills
    .filter(bill => bill.include_in_budget)
    .reduce((sum, bill) => sum + (bill.amount || 0), 0);

  // 日消费统�?
  const dailyStats = {};
  bills.forEach(bill => {
    const day = dayjs(bill.bill_date).format('YYYY-MM-DD');
    if (!dailyStats[day]) {
      dailyStats[day] = { amount: 0, count: 0 };
    }
    dailyStats[day].amount += bill.amount || 0;
    dailyStats[day].count += 1;
  });

  // 分类统计
  const categoryStats = {};
  bills.forEach(bill => {
    const category = bill.category || '未分�?;
    if (!categoryStats[category]) {
      categoryStats[category] = { amount: 0, count: 0, percentage: 0 };
    }
    categoryStats[category].amount += bill.amount || 0;
    categoryStats[category].count += 1;
  });

  // 计算分类百分�?
  Object.keys(categoryStats).forEach(category => {
    categoryStats[category].percentage = totalAmount > 0
      ? Math.round((categoryStats[category].amount / totalAmount) * 100 * 100) / 100
      : 0;
  });

  return successResponse({
    period: {
      year: targetYear,
      month: targetMonth,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate)
    },
    summary: {
      total_amount: totalAmount,
      budget_amount: budgetAmount,
      bill_count: bills.length,
      avg_daily: bills.length > 0 ? Math.round(totalAmount / new Date(targetYear, targetMonth, 0).getDate() * 100) / 100 : 0
    },
    daily_stats: dailyStats,
    category_stats: categoryStats
  });
};

/**
 * 获取年度消费统计
 */
const getYearlyStats = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id, year } = event.data;

  validate.required(ledger_id, '账本ID');

  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存�?);
  }
  verifyResourceAccess(ledgerResult.data[0], user._id);

  // 计算日期范围
  const targetYear = year || new Date().getFullYear();
  const startDate = new Date(targetYear, 0, 1);
  const endDate = new Date(targetYear, 11, 31, 23, 59, 59);

  // 查询全年账单
  const billsResult = await db.collection('bills')
    .where({
      user_id: user._id,
      ledger_id,
      bill_date: _.gte(startDate).and(_.lte(endDate))
    })
    .get();

  const bills = billsResult.data;

  // 月度统计
  const monthlyStats = {};
  for (let month = 1; month <= 12; month++) {
    monthlyStats[month] = { amount: 0, count: 0 };
  }

  bills.forEach(bill => {
    const month = dayjs(bill.bill_date).month() + 1;
    monthlyStats[month].amount += bill.amount || 0;
    monthlyStats[month].count += 1;
  });

  // 季度统计
  const quarterlyStats = {
    Q1: { amount: 0, count: 0 },
    Q2: { amount: 0, count: 0 },
    Q3: { amount: 0, count: 0 },
    Q4: { amount: 0, count: 0 }
  };

  Object.keys(monthlyStats).forEach(month => {
    const monthNum = parseInt(month);
    const quarter = Math.ceil(monthNum / 3);
    const quarterKey = `Q${quarter}`;
    quarterlyStats[quarterKey].amount += monthlyStats[month].amount;
    quarterlyStats[quarterKey].count += monthlyStats[month].count;
  });

  // 总统�?
  const totalAmount = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
  const budgetAmount = bills
    .filter(bill => bill.include_in_budget)
    .reduce((sum, bill) => sum + (bill.amount || 0), 0);

  return successResponse({
    year: targetYear,
    summary: {
      total_amount: totalAmount,
      budget_amount: budgetAmount,
      bill_count: bills.length,
      avg_monthly: Math.round(totalAmount / 12 * 100) / 100
    },
    monthly_stats: monthlyStats,
    quarterly_stats: quarterlyStats
  });
};

/**
 * 获取分类趋势分析
 */
const getCategoryTrends = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id, start_date, end_date, category } = event.data;

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

  if (category) {
    where.category = category;
  }

  // 查询账单数据
  const billsResult = await db.collection('bills').where(where).get();
  const bills = billsResult.data;

  // 按月统计趋势
  const monthlyTrends = {};
  bills.forEach(bill => {
    const monthKey = dayjs(bill.bill_date).format('YYYY-MM');
    const categoryName = bill.category || '未分�?;

    if (!monthlyTrends[monthKey]) {
      monthlyTrends[monthKey] = {};
    }

    if (!monthlyTrends[monthKey][categoryName]) {
      monthlyTrends[monthKey][categoryName] = { amount: 0, count: 0 };
    }

    monthlyTrends[monthKey][categoryName].amount += bill.amount || 0;
    monthlyTrends[monthKey][categoryName].count += 1;
  });

  // 计算增长�?
  const trendAnalysis = {};
  const sortedMonths = Object.keys(monthlyTrends).sort();

  sortedMonths.forEach((month, index) => {
    if (index === 0) return;

    const currentMonth = monthlyTrends[month];
    const previousMonth = monthlyTrends[sortedMonths[index - 1]];

    Object.keys(currentMonth).forEach(cat => {
      if (!trendAnalysis[cat]) {
        trendAnalysis[cat] = { growth_rates: [], avg_growth: 0 };
      }

      const currentAmount = currentMonth[cat].amount;
      const previousAmount = previousMonth[cat] ? previousMonth[cat].amount : 0;

      const growthRate = previousAmount > 0
        ? Math.round(((currentAmount - previousAmount) / previousAmount) * 100 * 100) / 100
        : 0;

      trendAnalysis[cat].growth_rates.push({
        month,
        growth_rate: growthRate,
        amount: currentAmount
      });
    });
  });

  // 计算平均增长�?
  Object.keys(trendAnalysis).forEach(cat => {
    const rates = trendAnalysis[cat].growth_rates.map(r => r.growth_rate);
    trendAnalysis[cat].avg_growth = rates.length > 0
      ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length * 100) / 100
      : 0;
  });

  return successResponse({
    period: { start_date, end_date },
    monthly_trends: monthlyTrends,
    trend_analysis: trendAnalysis
  });
};

/**
 * 获取消费排行�?
 */
const getSpendingRanking = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id, start_date, end_date, group_by = 'category', limit = 10 } = event.data;

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

  // 查询账单数据
  const billsResult = await db.collection('bills').where(where).get();
  const bills = billsResult.data;

  // 统计数据
  const stats = {};
  const totalAmount = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);

  bills.forEach(bill => {
    let key;
    switch (group_by) {
      case 'merchant':
        key = bill.merchant || '未知商户';
        break;
      case 'category':
      default:
        key = bill.category || '未分�?;
        break;
    }

    if (!stats[key]) {
      stats[key] = { amount: 0, count: 0, percentage: 0 };
    }

    stats[key].amount += bill.amount || 0;
    stats[key].count += 1;
  });

  // 计算百分比并排序
  const ranking = Object.keys(stats)
    .map(key => ({
      name: key,
      amount: stats[key].amount,
      count: stats[key].count,
      percentage: totalAmount > 0
        ? Math.round((stats[key].amount / totalAmount) * 100 * 100) / 100
        : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, Math.min(limit, 50)); // 最多返�?0�?

  return successResponse({
    period: { start_date, end_date },
    group_by,
    total_amount: totalAmount,
    ranking
  });
};

/**
 * 导出数据
 */
const exportData = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { ledger_id, start_date, end_date, format = 'json' } = event.data;

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

  // 查询所有数�?
  const billsResult = await db.collection('bills').where(where).get();
  const bills = billsResult.data;

  // 格式化导出数�?
  const exportData = bills.map(bill => ({
    id: (bill._id || bill.id),
    merchant: bill.merchant,
    amount: bill.amount,
    category: bill.category,
    bill_date: formatDate(bill.bill_date),
    created_at: formatDate(bill.created_at),
    include_in_budget: bill.include_in_budget,
    is_manual: bill.is_manual
  }));

  // 生成导出文件ID
  const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return successResponse({
    export_id: exportId,
    format,
    record_count: exportData.length,
    data: format === 'json' ? exportData : null,
    download_url: format === 'csv' ? `/api/download/${exportId}` : null
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
    case 'summary':
      return await getSummary(event);
    case 'monthlyStats':
      return await getMonthlyStats(event);
    case 'yearlyStats':
      return await getYearlyStats(event);
    case 'categoryTrends':
      return await getCategoryTrends(event);
    case 'spendingRanking':
      return await getSpendingRanking(event);
    case 'export':
      return await exportData(event);
    default:
      throw new Error('不支持的操作类型');
  }
});