// 配置管理云函数
const cloud = require('@cloudbase/node-sdk');
const { successResponse, errorResponse, asyncHandler, verifyUser, validate, parseCategory, formatCategory, getWXContext } = require('./shared/utils');
const config = require('./shared/config');

// 初始化云开发
const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();
const _ = db.command;

/**
 * 获取分类列表
 */
const getCategories = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  
  const categoriesResult = await db.collection('categories')
    .where({ user_id: user._id })
    .orderBy('sort_order', 'asc')
    .get();
  
  return successResponse({
    categories: categoriesResult.data
  });
};

/**
 * 创建分类
 */
const createCategory = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { name, major_category, minor_category, color, icon, sort_order = 0 } = event.data;
  
  // 验证必填字段
  if (!name && !major_category) {
    throw new Error('分类名称或主分类不能为空');
  }
  
  const categoryName = name || formatCategory(major_category, minor_category);
  
  // 检查分类是否已存在
  const existingResult = await db.collection('categories')
    .where({
      user_id: user._id,
      name: categoryName
    })
    .get();
    
  if (existingResult.data.length > 0) {
    throw new Error('分类已存在');
  }
  
  const categoryData = {
    user_id: user._id,
    name: categoryName,
    major_category: major_category || parseCategory(categoryName).major,
    minor_category: minor_category || parseCategory(categoryName).minor,
    color: color || '#1890ff',
    icon: icon || 'default',
    sort_order: parseInt(sort_order) || 0,
    created_at: new Date(),
    updated_at: new Date()
  };
  
  const result = await db.collection('categories').add({
    data: categoryData
  });
  
  return successResponse({
    id: result._id,
    ...categoryData
  });
};

/**
 * 更新分类
 */
const updateCategory = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { category_id, ...updateFields } = event.data;
  
  validate.required(category_id, '分类ID');
  
  // 获取分类信息并验证权限
  const categoryResult = await db.collection('categories').doc(category_id).get();
  if (!categoryResult.data.length) {
    throw new Error('分类不存在');
  }
  
  const category = categoryResult.data[0];
  if (category.user_id !== user._id) {
    throw new Error('无权修改该分类');
  }
  
  // 构建更新数据
  const updateData = {
    updated_at: new Date()
  };
  
  if (updateFields.name !== undefined) {
    validate.required(updateFields.name, '分类名称');
    updateData.name = updateFields.name.trim();
    
    // 更新主分类和子分类
    const parsed = parseCategory(updateData.name);
    updateData.major_category = parsed.major;
    updateData.minor_category = parsed.minor;
  }
  
  if (updateFields.major_category !== undefined) {
    updateData.major_category = updateFields.major_category;
    updateData.name = formatCategory(updateFields.major_category, updateFields.minor_category || category.minor_category);
  }
  
  if (updateFields.minor_category !== undefined) {
    updateData.minor_category = updateFields.minor_category;
    updateData.name = formatCategory(updateFields.major_category || category.major_category, updateFields.minor_category);
  }
  
  if (updateFields.color !== undefined) {
    updateData.color = updateFields.color;
  }
  
  if (updateFields.icon !== undefined) {
    updateData.icon = updateFields.icon;
  }
  
  if (updateFields.sort_order !== undefined) {
    updateData.sort_order = parseInt(updateFields.sort_order) || 0;
  }
  
  await db.collection('categories').doc(category_id).update({
    data: updateData
  });
  
  return successResponse({ message: '分类更新成功' });
};

/**
 * 删除分类
 */
const deleteCategory = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { category_id } = event.data;
  
  validate.required(category_id, '分类ID');
  
  // 获取分类信息并验证权限
  const categoryResult = await db.collection('categories').doc(category_id).get();
  if (!categoryResult.data.length) {
    throw new Error('分类不存在');
  }
  
  const category = categoryResult.data[0];
  if (category.user_id !== user._id) {
    throw new Error('无权删除该分类');
  }
  
  // 检查是否有账单使用该分类
  const billsResult = await db.collection('bills')
    .where({
      user_id: user._id,
      category: category.name
    })
    .count();
    
  if (billsResult.total > 0) {
    throw new Error(`该分类下还有 ${billsResult.total} 条账单，无法删除`);
  }
  
  await db.collection('categories').doc(category_id).remove();
  
  return successResponse({ message: '分类删除成功' });
};

/**
 * 获取分类规则列表
 */
const getCategoryRules = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  
  const rulesResult = await db.collection('category_rules')
    .where({ user_id: user._id })
    .orderBy('priority', 'desc')
    .get();
  
  return successResponse({
    rules: rulesResult.data
  });
};

/**
 * 创建分类规则
 */
const createCategoryRule = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { keyword, category, priority = 1, is_regex = false, enabled = true } = event.data;
  
  validate.required(keyword, '关键词');
  validate.required(category, '分类');
  
  // 检查规则是否已存在
  const existingResult = await db.collection('category_rules')
    .where({
      user_id: user._id,
      keyword: keyword.trim()
    })
    .get();
    
  if (existingResult.data.length > 0) {
    throw new Error('该关键词规则已存在');
  }
  
  const ruleData = {
    user_id: user._id,
    keyword: keyword.trim(),
    category: category.trim(),
    priority: parseInt(priority) || 1,
    is_regex: Boolean(is_regex),
    enabled: Boolean(enabled),
    created_at: new Date(),
    updated_at: new Date()
  };
  
  const result = await db.collection('category_rules').add({
    data: ruleData
  });
  
  return successResponse({
    id: result._id,
    ...ruleData
  });
};

/**
 * 更新分类规则
 */
const updateCategoryRule = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { rule_id, ...updateFields } = event.data;
  
  validate.required(rule_id, '规则ID');
  
  // 获取规则信息并验证权限
  const ruleResult = await db.collection('category_rules').doc(rule_id).get();
  if (!ruleResult.data.length) {
    throw new Error('规则不存在');
  }
  
  const rule = ruleResult.data[0];
  if (rule.user_id !== user._id) {
    throw new Error('无权修改该规则');
  }
  
  // 构建更新数据
  const updateData = {
    updated_at: new Date()
  };
  
  if (updateFields.keyword !== undefined) {
    validate.required(updateFields.keyword, '关键词');
    updateData.keyword = updateFields.keyword.trim();
  }
  
  if (updateFields.category !== undefined) {
    validate.required(updateFields.category, '分类');
    updateData.category = updateFields.category.trim();
  }
  
  if (updateFields.priority !== undefined) {
    updateData.priority = parseInt(updateFields.priority) || 1;
  }
  
  if (updateFields.is_regex !== undefined) {
    updateData.is_regex = Boolean(updateFields.is_regex);
  }
  
  if (updateFields.enabled !== undefined) {
    updateData.enabled = Boolean(updateFields.enabled);
  }
  
  await db.collection('category_rules').doc(rule_id).update({
    data: updateData
  });
  
  return successResponse({ message: '规则更新成功' });
};

/**
 * 删除分类规则
 */
const deleteCategoryRule = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { rule_id } = event.data;
  
  validate.required(rule_id, '规则ID');
  
  // 获取规则信息并验证权限
  const ruleResult = await db.collection('category_rules').doc(rule_id).get();
  if (!ruleResult.data.length) {
    throw new Error('规则不存在');
  }
  
  const rule = ruleResult.data[0];
  if (rule.user_id !== user._id) {
    throw new Error('无权删除该规则');
  }
  
  await db.collection('category_rules').doc(rule_id).remove();
  
  return successResponse({ message: '规则删除成功' });
};

/**
 * 初始化默认配置
 */
const initDefaultConfig = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  
  // 检查是否已经初始化过
  const existingRulesResult = await db.collection('category_rules')
    .where({ user_id: user._id })
    .count();
    
  if (existingRulesResult.total > 0) {
    return successResponse({ message: '配置已存在，无需重复初始化' });
  }
  
  // 创建默认分类规则
  const defaultRules = Object.entries(config.business.defaultCategoryRules)
    .map(([keyword, category], index) => ({
      user_id: user._id,
      keyword,
      category,
      priority: 10 - index, // 按顺序设置优先级
      is_regex: false,
      enabled: true,
      created_at: new Date(),
      updated_at: new Date()
    }));
  
  // 批量插入规则
  if (defaultRules.length > 0) {
    await Promise.all(
      defaultRules.map(rule => 
        db.collection('category_rules').add({ data: rule })
      )
    );
  }
  
  return successResponse({
    message: '默认配置初始化成功',
    rules_count: defaultRules.length
  });
};

/**
 * 应用分类规则到商户名称
 */
const applyCategoryRules = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { merchant_name } = event.data;
  
  validate.required(merchant_name, '商户名称');
  
  // 获取用户的分类规则
  const rulesResult = await db.collection('category_rules')
    .where({
      user_id: user._id,
      enabled: true
    })
    .orderBy('priority', 'desc')
    .get();
  
  const rules = rulesResult.data;
  
  // 应用规则匹配
  for (const rule of rules) {
    let matched = false;
    
    if (rule.is_regex) {
      try {
        const regex = new RegExp(rule.keyword, 'i');
        matched = regex.test(merchant_name);
      } catch (error) {
        console.warn('Invalid regex pattern:', rule.keyword);
        continue;
      }
    } else {
      matched = merchant_name.toLowerCase().includes(rule.keyword.toLowerCase());
    }
    
    if (matched) {
      return successResponse({
        matched: true,
        category: rule.category,
        rule_id: rule._id,
        keyword: rule.keyword
      });
    }
  }
  
  return successResponse({
    matched: false,
    category: null
  });
};

/**
 * 主函数入口
 */
exports.main = asyncHandler(async (event, context) => {
  const { action } = event;
  
  switch (action) {
    case 'getCategories':
      return await getCategories(event);
    case 'createCategory':
      return await createCategory(event);
    case 'updateCategory':
      return await updateCategory(event);
    case 'deleteCategory':
      return await deleteCategory(event);
    case 'getCategoryRules':
      return await getCategoryRules(event);
    case 'createCategoryRule':
      return await createCategoryRule(event);
    case 'updateCategoryRule':
      return await updateCategoryRule(event);
    case 'deleteCategoryRule':
      return await deleteCategoryRule(event);
    case 'initDefaultConfig':
      return await initDefaultConfig(event);
    case 'applyCategoryRules':
      return await applyCategoryRules(event);
    default:
      throw new Error('不支持的操作类型');
  }
});