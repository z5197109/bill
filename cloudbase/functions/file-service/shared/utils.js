// 共享工具函数
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');

/**
 * 统一响应格式
 */
const createResponse = (success, data = null, error = null, code = null) => {
  return {
    success,
    data,
    error,
    code,
    timestamp: Date.now()
  };
};

/**
 * 成功响应
 */
const successResponse = (data = null) => {
  return createResponse(true, data);
};

/**
 * 错误响应
 */
const errorResponse = (error, code = 'UNKNOWN_ERROR') => {
  return createResponse(false, null, error, code);
};

/**
 * 验证用户权限中间件
 */
const verifyUser = async (cloud, openid) => {
  if (!openid) {
    throw new Error('用户未登录');
  }

  const db = cloud.database();
  const userResult = await db.collection('users')
    .where({ openid })
    .get();

  if (!userResult.data.length) {
    // 如果用户不存在，创建新用户
    const newUser = {
      openid,
      nickname: '微信用户',
      avatar: '',
      created_at: new Date(),
      updated_at: new Date(),
      settings: {
        default_ledger_id: null,
        theme: 'light',
        language: 'zh-CN'
      }
    };

    const createResult = await db.collection('users').add({
      data: newUser
    });

    return {
      ...newUser,
      _id: createResult._id
    };
  }

  return userResult.data[0];
};

/**
 * 获取微信上下文，处理测试环境
 */
const getWXContext = (cloud) => {
  try {
    return cloud.getWXContext();
  } catch (error) {
    // 测试环境返回模拟数据
    return {
      OPENID: 'test-openid-123',
      APPID: 'test-appid',
      UNIONID: 'test-unionid'
    };
  }
};

/**
 * 验证用户对资源的访问权限
 */
const verifyResourceAccess = (resource, userId) => {
  if (!resource.user_id || resource.user_id !== userId) {
    throw new Error('无权访问该资源');
  }
  return true;
};

/**
 * 生成唯一文件名
 */
const generateFileName = (originalName) => {
  const timestamp = Date.now();
  const uuid = uuidv4().substring(0, 8);
  const ext = originalName.split('.').pop();
  return `${timestamp}_${uuid}.${ext}`;
};

/**
 * 格式化日期
 */
const formatDate = (date, format = 'YYYY-MM-DD') => {
  return dayjs(date).format(format);
};

/**
 * 解析分类名称
 */
const parseCategory = (categoryName) => {
  if (!categoryName) {
    return { major: '', minor: '' };
  }

  const parts = categoryName.split('/');
  return {
    major: parts[0] || '',
    minor: parts[1] || ''
  };
};

/**
 * 格式化分类名称
 */
const formatCategory = (major, minor) => {
  major = (major || '').trim();
  minor = (minor || '').trim();
  return minor ? `${major}/${minor}` : major;
};

/**
 * 分页查询辅助函数
 */
const paginate = (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  return { skip, limit: Math.min(limit, 100) }; // 最大限制100条
};

/**
 * 数据验证函数
 */
const validate = {
  required: (value, fieldName) => {
    if (value === null || value === undefined || value === '') {
      throw new Error(`${fieldName} 不能为空`);
    }
  },

  number: (value, fieldName) => {
    if (isNaN(value)) {
      throw new Error(`${fieldName} 必须是数字`);
    }
  },

  positiveNumber: (value, fieldName) => {
    validate.number(value, fieldName);
    if (value < 0) {
      throw new Error(`${fieldName} 必须是正数`);
    }
  },

  date: (value, fieldName) => {
    if (!dayjs(value).isValid()) {
      throw new Error(`${fieldName} 日期格式不正确`);
    }
  },

  fileType: (filename, allowedTypes) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(ext)) {
      throw new Error(`不支持的文件类型: ${ext}`);
    }
  }
};

/**
 * 错误处理包装器
 */
const asyncHandler = (fn) => {
  return async (event, context) => {
    try {
      return await fn(event, context);
    } catch (error) {
      console.error('Function error:', error);
      console.error('Error stack:', error.stack);

      // 根据错误类型返回不同的错误码
      let code = 'INTERNAL_ERROR';
      // 在开发环境返回详细错误信息便于调试
      let message = error.message || '服务暂时不可用，请稍后重试';

      if (error.message && error.message.includes('用户未登录')) {
        code = 'UNAUTHORIZED';
      } else if (error.message && error.message.includes('无权访问')) {
        code = 'FORBIDDEN';
      } else if (error.message && (error.message.includes('不能为空') ||
        error.message.includes('格式不正确') ||
        error.message.includes('必须是'))) {
        code = 'VALIDATION_ERROR';
      }

      return errorResponse(message, code);
    }
  };
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