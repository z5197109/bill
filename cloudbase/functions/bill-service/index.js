// 账单管理云函数
const cloud = require('@cloudbase/node-sdk');
const dayjs = require('dayjs');
const { successResponse, errorResponse, asyncHandler, verifyUser, validate, getWXContext, paginate } = require('./shared/utils');

/**
 * 初始化云开发
 */
const initApp = () => {
    return cloud.init({
        env: cloud.DYNAMIC_CURRENT_ENV
    });
};

/**
 * 获取账单列表
 */
const listBills = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const {
        ledger_id,
        start_date,
        end_date,
        category,
        keyword,
        page = 1,
        page_size = 20,
        sort_by = 'bill_date',
        sort_order = 'desc'
    } = event.data || event;

    // 构建查询条件
    const query = {
        user_id: user._id,
        is_deleted: _.neq(true)
    };

    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    if (start_date && end_date) {
        query.bill_date = _.gte(start_date).and(_.lte(end_date));
    } else if (start_date) {
        query.bill_date = _.gte(start_date);
    } else if (end_date) {
        query.bill_date = _.lte(end_date);
    }

    if (category) {
        query.category = category;
    }

    if (keyword) {
        query.merchant = db.RegExp({
            regexp: keyword,
            options: 'i'
        });
    }

    const { limit, skip } = paginate(page, page_size);

    // 获取总数
    const countResult = await db.collection('bills').where(query).count();

    // 获取列表
    const result = await db.collection('bills')
        .where(query)
        .orderBy(sort_by, sort_order)
        .skip(skip)
        .limit(limit)
        .get();

    return successResponse({
        bills: result.data || [],
        total: countResult.total,
        page,
        page_size: limit
    });
};

/**
 * 获取单个账单
 */
const getBill = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { bill_id } = event.data || event;

    validate.required(bill_id, '账单ID');

    const result = await db.collection('bills').doc(bill_id).get();

    if (!result.data) {
        throw new Error('账单不存在');
    }

    if (result.data.user_id !== user._id) {
        throw new Error('无权访问该账单');
    }

    return successResponse(result.data);
};

/**
 * 创建账单
 */
const createBill = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const {
        ledger_id,
        merchant,
        amount,
        category,
        bill_date,
        filename,
        is_manual = true,
        include_in_budget = true
    } = event.data || event;

    validate.required(merchant, '商户名称');
    validate.required(amount, '金额');
    validate.required(category, '分类');

    const newBill = {
        user_id: user._id,
        ledger_id: ledger_id || null,
        merchant: merchant.trim(),
        amount: parseFloat(amount),
        category: category.trim(),
        bill_date: bill_date || dayjs().format('YYYY-MM-DD'),
        filename: filename || '手动录入',
        is_manual,
        include_in_budget,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date()
    };

    const result = await db.collection('bills').add(newBill);

    return successResponse({
        bill_id: result.id,
        message: '账单创建成功'
    });
};

/**
 * 更新账单
 */
const updateBill = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { bill_id, merchant, amount, category, bill_date, include_in_budget } = event.data || event;

    validate.required(bill_id, '账单ID');

    // 验证账单权限
    const billResult = await db.collection('bills').doc(bill_id).get();

    if (!billResult.data) {
        throw new Error('账单不存在');
    }

    if (billResult.data.user_id !== user._id) {
        throw new Error('无权修改该账单');
    }

    const updateData = {
        updated_at: new Date()
    };

    if (merchant !== undefined) {
        updateData.merchant = merchant.trim();
    }

    if (amount !== undefined) {
        updateData.amount = parseFloat(amount);
    }

    if (category !== undefined) {
        updateData.category = category.trim();
    }

    if (bill_date !== undefined) {
        updateData.bill_date = bill_date;
    }

    if (include_in_budget !== undefined) {
        updateData.include_in_budget = include_in_budget;
    }

    await db.collection('bills').doc(bill_id).update(updateData);

    return successResponse({ message: '账单更新成功' });
};

/**
 * 删除账单
 */
const deleteBill = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { bill_id } = event.data || event;

    validate.required(bill_id, '账单ID');

    // 验证账单权限
    const billResult = await db.collection('bills').doc(bill_id).get();

    if (!billResult.data) {
        throw new Error('账单不存在');
    }

    if (billResult.data.user_id !== user._id) {
        throw new Error('无权删除该账单');
    }

    // 软删除
    await db.collection('bills').doc(bill_id).update({
        is_deleted: true,
        deleted_at: new Date(),
        updated_at: new Date()
    });

    return successResponse({ message: '账单删除成功' });
};

/**
 * 批量删除账单
 */
const batchDeleteBills = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { bill_ids } = event.data || event;

    if (!bill_ids || !Array.isArray(bill_ids) || bill_ids.length === 0) {
        throw new Error('请选择要删除的账单');
    }

    // 批量软删除
    await db.collection('bills')
        .where({
            _id: _.in(bill_ids),
            user_id: user._id
        })
        .update({
            is_deleted: true,
            deleted_at: new Date(),
            updated_at: new Date()
        });

    return successResponse({
        message: `成功删除 ${bill_ids.length} 笔账单`,
        deleted_count: bill_ids.length
    });
};

/**
 * 批量更新预算状态
 */
const batchUpdateBudget = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { bill_ids, include_in_budget } = event.data || event;

    if (!bill_ids || !Array.isArray(bill_ids) || bill_ids.length === 0) {
        throw new Error('请选择要更新的账单');
    }

    await db.collection('bills')
        .where({
            _id: _.in(bill_ids),
            user_id: user._id
        })
        .update({
            include_in_budget: include_in_budget !== false,
            updated_at: new Date()
        });

    return successResponse({
        message: `成功更新 ${bill_ids.length} 笔账单`,
        updated_count: bill_ids.length
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
        default:
            throw new Error('不支持的操作类型');
    }
});
