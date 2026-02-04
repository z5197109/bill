// 配置管理云函数
const cloud = require('@cloudbase/node-sdk');
const { successResponse, errorResponse, asyncHandler, verifyUser, validate, getWXContext } = require('./shared/utils');

/**
 * 初始化云开发
 */
const initApp = () => {
    return cloud.init({
        env: cloud.DYNAMIC_CURRENT_ENV
    });
};

/**
 * 获取分类列表
 */
const getCategories = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { ledger_id } = event.data || event;

    // 获取用户自定义分类
    let query = { user_id: user._id };
    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    const result = await db.collection('categories')
        .where(query)
        .orderBy('sort_order', 'asc')
        .get();

    // 按大类分组
    const groups = {};
    for (const cat of result.data || []) {
        const major = cat.major || '其他';
        if (!groups[major]) {
            groups[major] = {
                name: major,
                icon: cat.icon || '📁',
                items: []
            };
        }
        if (cat.minor) {
            groups[major].items.push({
                id: cat._id,
                name: cat.minor,
                full_name: `${major}/${cat.minor}`
            });
        }
    }

    return successResponse({
        groups: Object.values(groups),
        categories: result.data || []
    });
};

/**
 * 保存分类
 */
const saveCategory = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const data = event.data || event;

    // 支持多种字段命名方式
    const id = data.id || data.category_id;
    let major = data.major || data.major_category || '';
    let minor = data.minor || data.minor_category || '';
    const icon = data.icon;
    const ledger_id = data.ledger_id;
    const sort_order = data.sort_order;

    // 如果提供了 name 字段，尝试解析
    if (!major && data.name) {
        const parts = data.name.split('/');
        major = parts[0] || '';
        minor = parts[1] || '';
    }

    if (!major || !major.trim()) {
        throw new Error('大类名称 不能为空');
    }

    if (id) {
        // 更新分类
        await db.collection('categories').doc(id).update({
            major: major.trim(),
            minor: (minor || '').trim(),
            icon: icon || '📁',
            sort_order: sort_order || 0,
            updated_at: new Date()
        });

        return successResponse({ message: '分类更新成功' });
    } else {
        // 创建分类
        const newCategory = {
            user_id: user._id,
            ledger_id: ledger_id || null,
            major: major.trim(),
            minor: (minor || '').trim(),
            icon: icon || '📁',
            sort_order: sort_order || 0,
            created_at: new Date(),
            updated_at: new Date()
        };

        const result = await db.collection('categories').add(newCategory);

        return successResponse({
            category_id: result.id,
            message: '分类创建成功'
        });
    }
};

/**
 * 删除分类
 */
const deleteCategory = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { id } = event.data || event;

    validate.required(id, '分类ID');

    await db.collection('categories').doc(id).remove();

    return successResponse({ message: '分类删除成功' });
};

/**
 * 获取分类规则
 */
const getCategoryRules = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { ledger_id } = event.data || event;

    let query = { user_id: user._id };
    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    const result = await db.collection('category_rules')
        .where(query)
        .orderBy('priority', 'desc')
        .get();

    return successResponse(result.data || []);
};

/**
 * 保存分类规则
 */
const saveCategoryRule = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { id, keyword, category, ledger_id, priority, is_regex } = event.data || event;

    validate.required(keyword, '关键词');
    validate.required(category, '分类');

    if (id) {
        // 更新规则
        await db.collection('category_rules').doc(id).update({
            keyword: keyword.trim(),
            category: category.trim(),
            priority: priority || 0,
            is_regex: is_regex || false,
            updated_at: new Date()
        });

        return successResponse({ message: '规则更新成功' });
    } else {
        // 检查是否存在相同关键词
        const existing = await db.collection('category_rules')
            .where({
                user_id: user._id,
                keyword: keyword.trim(),
                category: category.trim()
            })
            .count();

        if (existing.total > 0) {
            throw new Error('同一分类下关键词已存在');
        }

        // 创建规则
        const newRule = {
            user_id: user._id,
            ledger_id: ledger_id || null,
            keyword: keyword.trim(),
            category: category.trim(),
            priority: priority || 0,
            is_regex: is_regex || false,
            created_at: new Date(),
            updated_at: new Date()
        };

        const result = await db.collection('category_rules').add(newRule);

        return successResponse({
            rule_id: result.id,
            message: '规则创建成功'
        });
    }
};

/**
 * 删除分类规则
 */
const deleteCategoryRule = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { id } = event.data || event;

    validate.required(id, '规则ID');

    await db.collection('category_rules').doc(id).remove();

    return successResponse({ message: '规则删除成功' });
};

/**
 * 获取循环账单规则
 */
const getRecurringRules = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { ledger_id } = event.data || event;

    let query = { user_id: user._id, is_active: true };
    if (ledger_id) {
        query.ledger_id = ledger_id;
    }

    const result = await db.collection('recurring_rules')
        .where(query)
        .get();

    return successResponse(result.data || []);
};

/**
 * 保存循环账单规则
 */
const saveRecurringRule = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { id, merchant, amount, category, frequency, day_of_month, ledger_id, is_active } = event.data || event;

    validate.required(merchant, '商户名称');
    validate.required(amount, '金额');
    validate.required(category, '分类');
    validate.required(frequency, '频率');

    if (id) {
        // 更新规则
        const updateData = {
            merchant: merchant.trim(),
            amount: parseFloat(amount),
            category: category.trim(),
            frequency,
            day_of_month: day_of_month || 1,
            is_active: is_active !== false,
            updated_at: new Date()
        };

        await db.collection('recurring_rules').doc(id).update(updateData);

        return successResponse({ message: '规则更新成功' });
    } else {
        // 创建规则
        const newRule = {
            user_id: user._id,
            ledger_id: ledger_id || null,
            merchant: merchant.trim(),
            amount: parseFloat(amount),
            category: category.trim(),
            frequency,
            day_of_month: day_of_month || 1,
            is_active: true,
            last_generated_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };

        const result = await db.collection('recurring_rules').add(newRule);

        return successResponse({
            rule_id: result.id,
            message: '规则创建成功'
        });
    }
};

/**
 * 删除循环账单规则
 */
const deleteRecurringRule = async (event) => {
    const app = initApp();
    const db = app.database();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { id } = event.data || event;

    validate.required(id, '规则ID');

    await db.collection('recurring_rules').doc(id).remove();

    return successResponse({ message: '规则删除成功' });
};

/**
 * 主函数入口
 */
exports.main = asyncHandler(async (event, context) => {
    cloud.__context = context;
    cloud.__event = event;
    const { action } = event;

    switch (action) {
        // 分类相关
        case 'getCategories':
            return await getCategories(event);
        case 'saveCategory':
        case 'createCategory':
        case 'updateCategory':
            return await saveCategory(event);
        case 'deleteCategory':
            return await deleteCategory(event);

        // 分类规则相关
        case 'getCategoryRules':
            return await getCategoryRules(event);
        case 'saveCategoryRule':
        case 'createCategoryRule':
        case 'updateCategoryRule':
            return await saveCategoryRule(event);
        case 'deleteCategoryRule':
            return await deleteCategoryRule(event);

        // 应用分类规则
        case 'applyCategoryRules':
            // 根据商户名匹配分类
            const { merchant_name } = event.data || event;
            if (!merchant_name) {
                return successResponse({ category: null });
            }
            // 从规则中匹配
            const app = initApp();
            const db = app.database();
            const { OPENID } = getWXContext(cloud);
            const user = await verifyUser(app, OPENID);
            const rules = await db.collection('category_rules')
                .where({ user_id: user._id })
                .orderBy('priority', 'desc')
                .get();
            for (const rule of rules.data || []) {
                if (merchant_name.includes(rule.keyword)) {
                    return successResponse({ category: rule.category });
                }
            }
            return successResponse({ category: null });

        // 初始化默认配置
        case 'initDefaultConfig':
            return successResponse({ message: '默认配置初始化成功' });

        // 循环账单规则相关
        case 'getRecurringRules':
            return await getRecurringRules(event);
        case 'saveRecurringRule':
        case 'createRecurringRule':
        case 'updateRecurringRule':
            return await saveRecurringRule(event);
        case 'deleteRecurringRule':
            return await deleteRecurringRule(event);

        default:
            throw new Error('不支持的操作类型: ' + action);
    }
});
