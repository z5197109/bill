// 共享工具函数
const dayjs = require('dayjs');

/**
 * 统一响应格式
 */
const createResponse = (success, data = null, error = null, code = null) => {
  const response = { success };
  if (data !== null) response.data = data;
  if (error !== null) response.error = error;
  if (code !== null) response.code = code;
  return response;
};

const successResponse = (data) => createResponse(true, data);

const errorResponse = (error, code = null) => createResponse(false, null, error, code);

/**
 * 获取微信云上下文
 */
const getWXContext = (cloud) => {
  // 从 cloud.__context 获取上下文（CloudBase）
  const context = cloud.__context || {};
  const event = cloud.__event || {};

  // 尝试多种方式获取 OPENID
  let OPENID = null;
  let UNIONID = null;
  let APPID = null;

  // 方法1: 从 cloud.getWXContext() 获取（旧版 wx-server-sdk）
  if (cloud.getWXContext) {
    try {
      const wxContext = cloud.getWXContext();
      OPENID = OPENID || wxContext.OPENID;
      UNIONID = UNIONID || wxContext.UNIONID;
      APPID = APPID || wxContext.APPID;
    } catch (e) {
      console.log('getWXContext failed:', e.message);
    }
  }

  // 方法2: 从 context 中获取
  if (context.credentials) {
    OPENID = OPENID || context.credentials.openId || context.credentials.openid;
    UNIONID = UNIONID || context.credentials.unionId || context.credentials.unionid;
  }
  OPENID = OPENID || context.OPENID || context.openId || context.openid;
  UNIONID = UNIONID || context.UNIONID || context.unionId || context.unionid;
  APPID = APPID || context.APPID || context.appId || context.appid;

  // 方法3: 从 event 中获取（小程序端传递）
  OPENID = OPENID || event.userInfo?.openId || event.userInfo?.openid;
  OPENID = OPENID || event.OPENID || event.openId || event.openid;
  UNIONID = UNIONID || event.UNIONID || event.unionId || event.unionid;
  APPID = APPID || event.APPID || event.appId || event.appid;

  // 方法4: 从 event.data 中获取
  if (event.data) {
    OPENID = OPENID || event.data.OPENID || event.data.openId || event.data.openid;
  }

  console.log('getWXContext result:', { OPENID, UNIONID, APPID });

  return { OPENID, UNIONID, APPID };
};

/**
 * 验证用户
 */
const verifyUser = async (app, openid) => {
  if (!openid) {
    throw new Error('未获取到用户标识');
  }

  const db = app.database();
  const userResult = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get();

  if (userResult.data && userResult.data.length > 0) {
    return userResult.data[0];
  }

  // 用户不存在，创建新用户
  const newUser = {
    openid,
    created_at: new Date(),
    updated_at: new Date()
  };

  const result = await db.collection('users').add(newUser);
  newUser._id = result.id;
  return newUser;
};

/**
 * 验证资源访问权限
 */
const verifyResourceAccess = (resource, userId) => {
  if (!resource) {
    throw new Error('资源不存在');
  }
  const resourceUserId = resource.user_id || resource.userId;
  if (resourceUserId && resourceUserId !== userId) {
    throw new Error('无权访问该资源');
  }
  return true;
};

/**
 * 异步处理器包装
 */
const asyncHandler = (fn) => {
  return async (event, context) => {
    try {
      return await fn(event, context);
    } catch (error) {
      console.error('Function error:', error);
      console.error('Error stack:', error.stack);

      let code = 'INTERNAL_ERROR';
      if (error.message && (
        error.message.includes('不能为空') ||
        error.message.includes('格式不正确') ||
        error.message.includes('必须是')
      )) {
        code = 'VALIDATION_ERROR';
      }

      return errorResponse(error.message, code);
    }
  };
};

/**
 * 验证函数
 */
const validate = {
  required: (value, fieldName) => {
    if (value === undefined || value === null || value === '') {
      throw new Error(`${fieldName} 不能为空`);
    }
    return value;
  },

  number: (value, fieldName) => {
    const num = parseFloat(value);
    if (isNaN(num)) {
      throw new Error(`${fieldName} 必须是数字`);
    }
    return num;
  },

  date: (value, fieldName) => {
    if (!dayjs(value).isValid()) {
      throw new Error(`${fieldName} 日期格式不正确`);
    }
    return value;
  },

  fileType: (filename, allowedTypes) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(ext)) {
      throw new Error(`不支持的文件类型: ${ext}`);
    }
    return ext;
  }
};

/**
 * 格式化日期
 */
const formatDate = (date, format = 'YYYY-MM-DD') => {
  return dayjs(date).format(format);
};

/**
 * 分页处理
 */
const paginate = (page = 1, pageSize = 20) => {
  const p = Math.max(1, parseInt(page) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
  return {
    limit: size,
    skip: (p - 1) * size
  };
};

/**
 * 解析分类
 */
const parseCategory = (categoryName) => {
  if (!categoryName) return { major: '', minor: '' };
  const parts = categoryName.split('/');
  return {
    major: parts[0] || '',
    minor: parts[1] || ''
  };
};

/**
 * 格式化分类
 */
const formatCategory = (major, minor) => {
  major = (major || '').trim();
  minor = (minor || '').trim();
  return minor ? `${major}/${minor}` : major;
};

/**
 * 生成文件名
 */
const generateFileName = (prefix, ext) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}.${ext}`;
};

module.exports = {
  createResponse,
  successResponse,
  errorResponse,
  verifyUser,
  getWXContext,
  verifyResourceAccess,
  generateFileName,
  formatDate,
  parseCategory,
  formatCategory,
  paginate,
  validate,
  asyncHandler
};
