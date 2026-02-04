// 用户管理云函数
const cloud = require('@cloudbase/node-sdk');
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
 * 用户登录
 */
const login = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID, UNIONID } = getWXContext(cloud);

    if (!OPENID) {
        throw new Error('未获取到用户标识');
    }

    // 查找用户
    const userResult = await db.collection('users')
        .where({ openid: OPENID })
        .limit(1)
        .get();

    let user;
    if (userResult.data && userResult.data.length > 0) {
        user = userResult.data[0];
        // 更新登录时间
        await db.collection('users').doc(user._id).update({
            last_login_at: new Date(),
            updated_at: new Date()
        });
    } else {
        // 创建新用户
        const newUser = {
            openid: OPENID,
            unionid: UNIONID || null,
            created_at: new Date(),
            updated_at: new Date(),
            last_login_at: new Date()
        };

        const result = await db.collection('users').add(newUser);
        newUser._id = result.id;
        user = newUser;

        // 为新用户创建默认账本
        const defaultLedger = {
            user_id: user._id,
            name: '默认账本',
            monthly_budget: 0,
            is_default: true,
            is_deleted: false,
            created_at: new Date(),
            updated_at: new Date()
        };

        await db.collection('ledgers').add(defaultLedger);
    }

    return successResponse({
        user_id: user._id,
        openid: OPENID,
        message: '登录成功'
    });
};

/**
 * 获取用户信息
 */
const getUserInfo = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);

    // 获取用户账本数量
    const ledgerCount = await db.collection('ledgers')
        .where({
            user_id: user._id,
            is_deleted: db.command.neq(true)
        })
        .count();

    return successResponse({
        user_id: user._id,
        openid: user.openid,
        nickname: user.nickname || '',
        avatar_url: user.avatar_url || '',
        ledger_count: ledgerCount.total,
        created_at: user.created_at,
        last_login_at: user.last_login_at
    });
};

/**
 * 更新用户信息
 */
const updateUserInfo = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { nickname, avatar_url } = event.data || event;

    const updateData = {
        updated_at: new Date()
    };

    if (nickname !== undefined) {
        updateData.nickname = nickname;
    }

    if (avatar_url !== undefined) {
        updateData.avatar_url = avatar_url;
    }

    await db.collection('users').doc(user._id).update(updateData);

    return successResponse({ message: '用户信息更新成功' });
};

/**
 * 获取用户统计
 */
const getUserStats = async (event) => {
    const app = initApp();
    const db = app.database();
    const _ = db.command;
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);

    // 获取统计数据
    const [ledgerCount, billCount, totalAmount] = await Promise.all([
        db.collection('ledgers').where({ user_id: user._id, is_deleted: _.neq(true) }).count(),
        db.collection('bills').where({ user_id: user._id, is_deleted: _.neq(true) }).count(),
        db.collection('bills').where({ user_id: user._id, is_deleted: _.neq(true) }).get()
    ]);

    const total = totalAmount.data.reduce((sum, bill) => sum + (bill.amount || 0), 0);

    return successResponse({
        ledger_count: ledgerCount.total,
        bill_count: billCount.total,
        total_amount: total
    });
};

/**
 * 数据迁移（从本地导入数据）
 */
const migrateUserData = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const migrationData = event.data || event;

    if (!migrationData) {
        throw new Error('未提供迁移数据');
    }

    const summary = {
        ledgers: 0,
        bills: 0,
        categories: 0,
        rules: 0
    };

    try {
        // 迁移账本
        if (migrationData.ledgers && migrationData.ledgers.length > 0) {
            for (const ledger of migrationData.ledgers) {
                const newLedger = {
                    user_id: user._id,
                    name: ledger.name,
                    monthly_budget: ledger.monthly_budget || 0,
                    is_default: ledger.is_default || false,
                    is_deleted: false,
                    created_at: new Date(),
                    updated_at: new Date()
                };
                await db.collection('ledgers').add(newLedger);
                summary.ledgers++;
            }
        }

        // 迁移账单
        if (migrationData.bills && migrationData.bills.length > 0) {
            for (const bill of migrationData.bills) {
                const newBill = {
                    user_id: user._id,
                    ledger_id: bill.ledger_id,
                    merchant: bill.merchant,
                    amount: bill.amount,
                    category: bill.category,
                    bill_date: bill.bill_date,
                    is_manual: bill.is_manual || false,
                    include_in_budget: bill.include_in_budget !== false,
                    is_deleted: false,
                    created_at: new Date(),
                    updated_at: new Date()
                };
                await db.collection('bills').add(newBill);
                summary.bills++;
            }
        }

        return successResponse({
            message: '数据迁移成功',
            summary
        });
    } catch (error) {
        console.error('数据迁移失败:', error);
        throw new Error('数据迁移失败: ' + error.message);
    }
};

/**
 * 主函数入口
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
