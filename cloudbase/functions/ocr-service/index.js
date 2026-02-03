// OCR 识别云函数
const cloud = require('@cloudbase/node-sdk');
const { successResponse, errorResponse, asyncHandler, verifyUser, validate, getWXContext } = require('./shared/utils');
const config = require('./shared/config');

// 初始化云开发
const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();

/**
 * 处理图片 OCR 识别
 */
const processImageOCR = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { image_base64, ledger_id } = event.data;
  
  validate.required(image_base64, '图片数据');
  validate.required(ledger_id, '账本ID');
  
  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存在');
  }
  
  if (ledgerResult.data[0].user_id !== user._id) {
    throw new Error('无权访问该账本');
  }
  
  try {
    // 调用 OCR API 进行识别
    const ocrResult = await performOCR(image_base64);
    
    // 解析识别结果
    const parsedResult = parseOCRResult(ocrResult);
    
    // 应用分类规则
    const categoryResult = await applyCategoryRules(parsedResult.merchant);
    
    return successResponse({
      ocr_result: ocrResult,
      parsed_data: {
        ...parsedResult,
        category: categoryResult.category || '',
        suggested_category: categoryResult.category || '未分类'
      },
      confidence: ocrResult.confidence || 0.8
    });
    
  } catch (error) {
    console.error('OCR 识别失败:', error);
    throw new Error('图片识别失败: ' + error.message);
  }
};

/**
 * 执行 OCR 识别
 */
async function performOCR(imageBase64) {
  // 这里可以集成腾讯云 OCR API 或其他 OCR 服务
  // 为了演示，我们返回一个模拟结果
  
  if (config.ocr.provider === 'tencent') {
    return await callTencentOCR(imageBase64);
  } else {
    // 使用自定义 OCR 逻辑或第三方服务
    return await callCustomOCR(imageBase64);
  }
}

/**
 * 调用腾讯云 OCR API
 */
async function callTencentOCR(imageBase64) {
  // 这里需要集成腾讯云 OCR SDK
  // 由于需要配置密钥等，这里提供一个基础框架
  
  try {
    // 腾讯云 OCR API 调用示例
    // const tencentcloud = require("tencentcloud-sdk-nodejs");
    // const OcrClient = tencentcloud.ocr.v20181119.Client;
    
    // 模拟返回结果
    return {
      text_detections: [
        { detected_text: "麦当劳", confidence: 0.95 },
        { detected_text: "¥25.50", confidence: 0.90 },
        { detected_text: "2024-02-03", confidence: 0.85 }
      ],
      confidence: 0.90,
      raw_response: "模拟腾讯云OCR响应"
    };
  } catch (error) {
    throw new Error('腾讯云 OCR 调用失败: ' + error.message);
  }
}

/**
 * 调用自定义 OCR 服务
 */
async function callCustomOCR(imageBase64) {
  // 这里可以调用其他 OCR 服务或自建的 OCR API
  
  // 模拟返回结果
  return {
    text_detections: [
      { detected_text: "示例商户", confidence: 0.85 },
      { detected_text: "¥15.80", confidence: 0.88 },
      { detected_text: "2024-02-03", confidence: 0.82 }
    ],
    confidence: 0.85,
    raw_response: "模拟自定义OCR响应"
  };
}

/**
 * 解析 OCR 识别结果
 */
function parseOCRResult(ocrResult) {
  const textDetections = ocrResult.text_detections || [];
  const allText = textDetections.map(item => item.detected_text).join(' ');
  
  // 提取商户名称
  let merchant = '';
  const merchantPatterns = [
    /^[^¥\d]*[^\s¥\d]+/,  // 第一个非金额文本
    /[\u4e00-\u9fa5]{2,}/  // 中文字符
  ];
  
  for (const detection of textDetections) {
    const text = detection.detected_text.trim();
    if (text && !text.match(/^[¥\d\.\-\s]+$/) && text.length > 1) {
      merchant = text;
      break;
    }
  }
  
  // 提取金额
  let amount = 0;
  const amountPatterns = [
    /¥?(\d+\.?\d*)/,
    /(\d+\.?\d*)\s*元/,
    /(\d+\.?\d*)/
  ];
  
  for (const detection of textDetections) {
    const text = detection.detected_text;
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsedAmount = parseFloat(match[1]);
        if (parsedAmount > 0 && parsedAmount < 10000) { // 合理的金额范围
          amount = parsedAmount;
          break;
        }
      }
    }
    if (amount > 0) break;
  }
  
  // 提取日期
  let billDate = new Date();
  const datePatterns = [
    /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/,
    /(\d{2,4}年\d{1,2}月\d{1,2}日)/
  ];
  
  for (const detection of textDetections) {
    const text = detection.detected_text;
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsedDate = new Date(match[1]);
        if (!isNaN(parsedDate.getTime())) {
          billDate = parsedDate;
          break;
        }
      }
    }
  }
  
  return {
    merchant: merchant || '未知商户',
    amount: amount,
    bill_date: billDate.toISOString().split('T')[0],
    raw_text: textDetections.map(item => item.detected_text),
    confidence: ocrResult.confidence || 0.8
  };
}

/**
 * 应用分类规则
 */
async function applyCategoryRules(merchantName) {
  if (!merchantName) {
    return { matched: false, category: null };
  }
  
  // 获取默认分类规则
  const defaultRules = config.business.defaultCategoryRules;
  
  // 检查默认规则
  for (const [keyword, category] of Object.entries(defaultRules)) {
    if (merchantName.toLowerCase().includes(keyword.toLowerCase())) {
      return {
        matched: true,
        category: category,
        keyword: keyword
      };
    }
  }
  
  return { matched: false, category: null };
}

/**
 * 批量处理多张图片
 */
const batchProcessImages = async (event) => {
  const { OPENID } = getWXContext(cloud);
  const user = await verifyUser(app, OPENID);
  const { images, ledger_id } = event.data;
  
  validate.required(images, '图片列表');
  validate.required(ledger_id, '账本ID');
  
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('图片列表不能为空');
  }
  
  if (images.length > 10) {
    throw new Error('单次最多处理10张图片');
  }
  
  // 验证账本权限
  const ledgerResult = await db.collection('ledgers').doc(ledger_id).get();
  if (!ledgerResult.data.length) {
    throw new Error('账本不存在');
  }
  
  if (ledgerResult.data[0].user_id !== user._id) {
    throw new Error('无权访问该账本');
  }
  
  const results = [];
  
  for (let i = 0; i < images.length; i++) {
    try {
      const image = images[i];
      const ocrResult = await performOCR(image.image_base64);
      const parsedResult = parseOCRResult(ocrResult);
      const categoryResult = await applyCategoryRules(parsedResult.merchant);
      
      results.push({
        index: i,
        success: true,
        ocr_result: ocrResult,
        parsed_data: {
          ...parsedResult,
          category: categoryResult.category || '',
          suggested_category: categoryResult.category || '未分类'
        },
        confidence: ocrResult.confidence || 0.8
      });
    } catch (error) {
      results.push({
        index: i,
        success: false,
        error: error.message
      });
    }
  }
  
  return successResponse({
    results: results,
    total: images.length,
    success_count: results.filter(r => r.success).length,
    failed_count: results.filter(r => !r.success).length
  });
};

/**
 * 获取 OCR 服务状态
 */
const getOCRStatus = async (event) => {
  const { OPENID } = getWXContext(cloud);
  await verifyUser(app, OPENID);
  
  return successResponse({
    provider: config.ocr.provider,
    confidence_threshold: config.ocr.confidenceThreshold,
    supported_formats: ['jpg', 'jpeg', 'png'],
    max_file_size: '16MB',
    max_batch_size: 10,
    status: 'active'
  });
};

/**
 * 主函数入口
 */
exports.main = asyncHandler(async (event, context) => {
  const { action } = event;
  
  switch (action) {
    case 'processImage':
      return await processImageOCR(event);
    case 'batchProcess':
      return await batchProcessImages(event);
    case 'getStatus':
      return await getOCRStatus(event);
    default:
      throw new Error('不支持的操作类型');
  }
});