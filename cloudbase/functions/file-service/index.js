// 文件处理云函数
const cloud = require('@cloudbase/node-sdk');
const { successResponse, errorResponse, asyncHandler, verifyUser, generateFileName, validate } = require('./shared/utils');
const config = require('./shared/config');

// 初始化云开发
const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();
const storage = app.storage();

/**
 * 获取文件上传签名
 */
const getUploadSignature = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const user = await verifyUser(app, OPENID);
  const { filename, ledger_id } = event.data;
  
  validate.required(filename, '文件名');
  validate.required(ledger_id, '账本ID');
  
  // 验证文件类型
  validate.fileType(filename, config.business.fileLimit.allowedTypes);
  
  // 生成唯一文件名
  const uniqueFilename = generateFileName(filename);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  // 生成文件路径
  const filePath = config.storage.paths.billImage(
    user._id, 
    ledger_id, 
    year, 
    month, 
    uniqueFilename
  );
  
  // 生成上传签名
  const uploadUrl = await storage.getUploadMetadata({
    cloudPath: filePath,
    expires: 3600 // 1小时有效期
  });
  
  return successResponse({
    upload_url: uploadUrl.url,
    file_path: filePath,
    filename: uniqueFilename,
    expires_at: Date.now() + 3600 * 1000
  });
};

/**
 * 确认文件上传完成
 */
const confirmUpload = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const user = await verifyUser(app, OPENID);
  const { file_path, ledger_id } = event.data;
  
  validate.required(file_path, '文件路径');
  validate.required(ledger_id, '账本ID');
  
  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存在');
  }
  
  if (ledgerResult.data[0].user_id !== user._id) {
    throw new Error('无权访问该账本');
  }
  
  // 获取文件信息
  try {
    const fileInfo = await storage.getFileInfo({
      fileList: [file_path]
    });
    
    if (!fileInfo.fileList || fileInfo.fileList.length === 0) {
      throw new Error('文件不存在');
    }
    
    const file = fileInfo.fileList[0];
    
    // 生成访问URL
    const downloadUrl = await storage.getFileDownloadURL({
      fileList: [file_path]
    });
    
    return successResponse({
      file_path,
      file_size: file.size,
      download_url: downloadUrl.fileList[0].download_url,
      upload_time: file.date
    });
    
  } catch (error) {
    throw new Error('文件验证失败: ' + error.message);
  }
};

/**
 * 删除文件
 */
const deleteFile = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const user = await verifyUser(app, OPENID);
  const { file_path } = event.data;
  
  validate.required(file_path, '文件路径');
  
  // 验证文件路径是否属于当前用户
  if (!file_path.includes(`bills/${user._id}/`)) {
    throw new Error('无权删除该文件');
  }
  
  try {
    await storage.deleteFile({
      fileList: [file_path]
    });
    
    return successResponse({ message: '文件删除成功' });
  } catch (error) {
    throw new Error('文件删除失败: ' + error.message);
  }
};

/**
 * 获取文件下载链接
 */
const getDownloadUrl = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const user = await verifyUser(app, OPENID);
  const { file_path } = event.data;
  
  validate.required(file_path, '文件路径');
  
  // 验证文件路径是否属于当前用户
  if (!file_path.includes(`bills/${user._id}/`)) {
    throw new Error('无权访问该文件');
  }
  
  try {
    const result = await storage.getFileDownloadURL({
      fileList: [file_path]
    });
    
    if (!result.fileList || result.fileList.length === 0) {
      throw new Error('文件不存在');
    }
    
    return successResponse({
      download_url: result.fileList[0].download_url,
      expires_at: Date.now() + 3600 * 1000 // 1小时有效期
    });
    
  } catch (error) {
    throw new Error('获取下载链接失败: ' + error.message);
  }
};

/**
 * 批量删除文件
 */
const batchDeleteFiles = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const user = await verifyUser(app, OPENID);
  const { file_paths } = event.data;
  
  if (!Array.isArray(file_paths) || file_paths.length === 0) {
    throw new Error('文件路径列表不能为空');
  }
  
  // 验证所有文件路径是否属于当前用户
  const invalidPaths = file_paths.filter(path => !path.includes(`bills/${user._id}/`));
  if (invalidPaths.length > 0) {
    throw new Error('部分文件无权删除');
  }
  
  try {
    await storage.deleteFile({
      fileList: file_paths
    });
    
    return successResponse({ 
      message: `成功删除 ${file_paths.length} 个文件`,
      deleted_count: file_paths.length
    });
  } catch (error) {
    throw new Error('批量删除文件失败: ' + error.message);
  }
};

/**
 * 获取用户存储使用情况
 */
const getStorageUsage = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const user = await verifyUser(app, OPENID);
  
  // 获取用户所有账单的文件信息
  const billsResult = await db.collection('bills')
    .where({ user_id: user._id })
    .field({ image_url: true, filename: true, created_at: true })
    .get();
  
  const bills = billsResult.data;
  const fileCount = bills.filter(bill => bill.image_url).length;
  
  // 计算存储使用量（这里简化处理，实际可以通过存储API获取）
  const estimatedSize = fileCount * 500 * 1024; // 假设平均每个文件500KB
  
  return successResponse({
    file_count: fileCount,
    estimated_size: estimatedSize,
    formatted_size: formatFileSize(estimatedSize),
    last_upload: bills.length > 0 ? Math.max(...bills.map(b => new Date(b.created_at).getTime())) : null
  });
};

/**
 * 格式化文件大小
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 主函数入口
 */
exports.main = asyncHandler(async (event, context) => {
  const { action } = event;
  
  switch (action) {
    case 'getUploadSignature':
      return await getUploadSignature(event);
    case 'confirmUpload':
      return await confirmUpload(event);
    case 'delete':
      return await deleteFile(event);
    case 'getDownloadUrl':
      return await getDownloadUrl(event);
    case 'batchDelete':
      return await batchDeleteFiles(event);
    case 'getStorageUsage':
      return await getStorageUsage(event);
    default:
      throw new Error('不支持的操作类型');
  }
});