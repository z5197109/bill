// 统计分析云函数
const cloud = require('@cloudbase/node-sdk');
const dayjs = require('dayjs');
const { successResponse, errorResponse, asyncHandler, verifyUser, getWXContext } = require('./shared/utils');

/**
 * 初始化云开发
 */
const initApp = () => {
    return cloud.init({
        env: cloud.DYNAMIC_CURRENT_ENV
    });
};

/**
 * 获取仪表盘摘要
 */
const getDashboardSummary = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { ledger_id } = event.data || event;

    // 获取当月日期范围
    const now = dayjs();
    const monthStart = now.startOf('month').format('YYYY-MM-DD');
    const monthEnd = now.endOf('month').format('YYYY-MM-DD');

    // 构建查询条件（不限制预算字段，后续在内存中过滤）
    const query = {
        user_id: user._id,
        is_deleted: _.neq(true),
        bill_date: _.gte(monthStart).and(_.lte(monthEnd))
    };

    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    // 获取本月账单
    const billsResult = await db.collection('bills').where(query).get();
    const bills = billsResult.data || [];

    const budgetBills = bills.filter(bill => bill.include_in_budget !== false);

    // 计算本月总支出（全部）与预算内支出
    const monthlySpending = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    const budgetSpending = budgetBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);

    // 获取账本预算
    let monthlyBudget = 0;
    if (ledger_id) {
        const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
        if (ledgerResult.data) {
            monthlyBudget = ledgerResult.data.monthly_budget || 0;
        }
    }

    // 按分类统计
    const categoryStats = {};
    for (const bill of bills) {
        const cat = bill.category || '其他';
        if (!categoryStats[cat]) {
            categoryStats[cat] = { name: cat, amount: 0, count: 0 };
        }
        categoryStats[cat].amount += bill.amount || 0;
        categoryStats[cat].count += 1;
    }

    // 排序并取前5
    const topCategories = Object.values(categoryStats)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

    // 计算预算使用率（仅预算内支出）
    const budgetUsage = monthlyBudget > 0 ? (budgetSpending / monthlyBudget * 100).toFixed(1) : 0;

    return successResponse({
        monthly_spending: monthlySpending,
        budget_amount: budgetSpending,
        non_budget_spending: Math.max(0, monthlySpending - budgetSpending),
        monthly_budget: monthlyBudget,
        budget_usage: parseFloat(budgetUsage),
        budget_remaining: Math.max(0, monthlyBudget - budgetSpending),
        bill_count: bills.length,
        top_categories: topCategories,
        month: now.format('YYYY-MM')
    });
};

/**
 * 获取月度趋势
 */
const getMonthlyTrend = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { ledger_id, months = 6 } = event.data || event;

    const now = dayjs();
    const startDate = now.subtract(months - 1, 'month').startOf('month').format('YYYY-MM-DD');
    const endDate = now.endOf('month').format('YYYY-MM-DD');

    const query = {
        user_id: user._id,
        is_deleted: _.neq(true),
        include_in_budget: _.neq(false),
        bill_date: _.gte(startDate).and(_.lte(endDate))
    };

    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    const billsResult = await db.collection('bills').where(query).get();
    const bills = billsResult.data || [];

    // 按月分组
    const monthlyData = {};
    for (let i = 0; i < months; i++) {
        const month = now.subtract(i, 'month').format('YYYY-MM');
        monthlyData[month] = { month, amount: 0, count: 0 };
    }

    for (const bill of bills) {
        const month = dayjs(bill.bill_date).format('YYYY-MM');
        if (monthlyData[month]) {
            monthlyData[month].amount += bill.amount || 0;
            monthlyData[month].count += 1;
        }
    }

    // 按月份排序
    const trend = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

    return successResponse(trend);
};

/**
 * 获取分类统计
 */
const getCategoryStats = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { ledger_id, start_date, end_date } = event.data || event;

    const now = dayjs();
    const startDateStr = start_date || now.startOf('month').format('YYYY-MM-DD');
    const endDateStr = end_date || now.endOf('month').format('YYYY-MM-DD');

    const query = {
        user_id: user._id,
        is_deleted: _.neq(true),
        include_in_budget: _.neq(false),
        bill_date: _.gte(startDateStr).and(_.lte(endDateStr))
    };

    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    const billsResult = await db.collection('bills').where(query).get();
    const bills = billsResult.data || [];

    // 按分类统计
    const categoryStats = {};
    let totalAmount = 0;

    for (const bill of bills) {
        const cat = bill.category || '其他';
        if (!categoryStats[cat]) {
            categoryStats[cat] = {
                name: cat,
                amount: 0,
                count: 0,
                percentage: 0
            };
        }
        categoryStats[cat].amount += bill.amount || 0;
        categoryStats[cat].count += 1;
        totalAmount += bill.amount || 0;
    }

    // 计算百分比并排序
    const categories = Object.values(categoryStats)
        .map(cat => ({
            ...cat,
            percentage: totalAmount > 0 ? parseFloat((cat.amount / totalAmount * 100).toFixed(1)) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

    return successResponse({
        categories,
        total_amount: totalAmount,
        start_date: startDateStr,
        end_date: endDateStr
    });
};

/**
 * 获取每日统计
 */
const getDailyStats = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { ledger_id, start_date, end_date } = event.data || event;

    const now = dayjs();
    const startDateStr = start_date || now.startOf('month').format('YYYY-MM-DD');
    const endDateStr = end_date || now.endOf('month').format('YYYY-MM-DD');

    const query = {
        user_id: user._id,
        is_deleted: _.neq(true),
        include_in_budget: _.neq(false),
        bill_date: _.gte(startDateStr).and(_.lte(endDateStr))
    };

    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    const billsResult = await db.collection('bills').where(query).get();
    const bills = billsResult.data || [];

    // 按日期分组
    const dailyData = {};
    for (const bill of bills) {
        const date = bill.bill_date;
        if (!dailyData[date]) {
            dailyData[date] = { date, amount: 0, count: 0 };
        }
        dailyData[date].amount += bill.amount || 0;
        dailyData[date].count += 1;
    }

    // 按日期排序
    const dailyStats = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));

    return successResponse({
        daily_stats: dailyStats,
        start_date: startDateStr,
        end_date: endDateStr
    });
};

/**
 * 获取年度统计
 */
const getYearlyStats = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { ledger_id, year } = event.data || event;

    const targetYear = year || dayjs().year();
    const startDate = `${targetYear}-01-01`;
    const endDate = `${targetYear}-12-31`;

    const query = {
        user_id: user._id,
        is_deleted: _.neq(true),
        include_in_budget: _.neq(false),
        bill_date: _.gte(startDate).and(_.lte(endDate))
    };

    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    const billsResult = await db.collection('bills').where(query).get();
    const bills = billsResult.data || [];

    // 按月分组
    const monthlyData = {};
    for (let m = 1; m <= 12; m++) {
        const month = `${targetYear}-${String(m).padStart(2, '0')}`;
        monthlyData[month] = { month, amount: 0, count: 0 };
    }

    for (const bill of bills) {
        const month = dayjs(bill.bill_date).format('YYYY-MM');
        if (monthlyData[month]) {
            monthlyData[month].amount += bill.amount || 0;
            monthlyData[month].count += 1;
        }
    }

    const yearlyTotal = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);

    return successResponse({
        year: targetYear,
        yearly_total: yearlyTotal,
        monthly_stats: Object.values(monthlyData),
        bill_count: bills.length
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
        // 仪表盘/摘要
        case 'getDashboardSummary':
        case 'summary':
        case 'dashboard':
            return await getDashboardSummary(event);

        // 月度趋势/统计
        case 'getMonthlyTrend':
        case 'monthlyTrend':
        case 'monthlyStats':
            return await getMonthlyTrend(event);

        // 分类统计
        case 'getCategoryStats':
        case 'categoryStats':
        case 'categoryTrends':
            return await getCategoryStats(event);

        // 每日统计
        case 'getDailyStats':
        case 'dailyStats':
            return await getDailyStats(event);

        // 年度统计
        case 'getYearlyStats':
        case 'yearlyStats':
            return await getYearlyStats(event);

        // 消费排名 (使用分类统计)
        case 'spendingRanking':
            return await getCategoryStats(event);

        // 导出数据
        case 'export':
            // 暂时返回成功，后续实现导出功能
            return successResponse({ message: '导出功能开发中' });

        default:
            throw new Error('不支持的操作类型: ' + action);
    }
});
