// OCR 识别云函数 - 使用腾讯云 OCR API
const cloud = require('@cloudbase/node-sdk');
const { successResponse, errorResponse, asyncHandler, verifyUser, validate, getWXContext } = require('./shared/utils');
const config = require('./shared/config');

// 腾讯云 OCR SDK
const tencentcloud = require('tencentcloud-sdk-nodejs');
const OcrClient = tencentcloud.ocr.v20181119.Client;

/**
 * 初始化云开发
 */
const initApp = () => {
    return cloud.init({
        env: cloud.DYNAMIC_CURRENT_ENV
    });
};

/**
 * 创建腾讯云 OCR 客户端
 */
const createOcrClient = () => {
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;

    if (!secretId || !secretKey) {
        throw new Error('请配置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY 环境变量');
    }

    const clientConfig = {
        credential: {
            secretId: secretId,
            secretKey: secretKey,
        },
        region: 'ap-beijing',
        profile: {
            httpProfile: {
                endpoint: 'ocr.tencentcloudapi.com',
            },
        },
    };

    return new OcrClient(clientConfig);
};

/**
 * 识别账单图片
 */
const recognizeBill = async (event) => {
    const app = initApp();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { file_id, image_base64, ledger_id } = event.data || event;

    if (!file_id && !image_base64) {
        throw new Error('请提供文件ID或图片Base64数据');
    }

    let imageData = image_base64;

    // 如果提供的是file_id，先下载文件
    if (file_id && !image_base64) {
        try {
            const downloadResult = await app.downloadFile({ fileID: file_id });
            if (downloadResult.fileContent) {
                imageData = downloadResult.fileContent.toString('base64');
            }
        } catch (e) {
            throw new Error('下载文件失败: ' + e.message);
        }
    }

    // 调用腾讯云 OCR 服务
    const ocrResult = await callTencentOCR(imageData);

    // 解析 OCR 结果
    const parsedResult = parseOCRResult(ocrResult, ledger_id);

    return successResponse({
        merchant: parsedResult.merchant,
        amount: parsedResult.amount,
        date: parsedResult.date,
        category: parsedResult.category,
        raw_text: parsedResult.rawText
    });
};

/**
 * 调用腾讯云 OCR 服务
 */
const callTencentOCR = async (imageBase64) => {
    try {
        const client = createOcrClient();

        // 使用通用印刷体识别（也可以使用财务票据识别等更专业的接口）
        const params = {
            ImageBase64: imageBase64
        };

        const result = await client.GeneralBasicOCR(params);

        return {
            words_result: result.TextDetections || [],
            words_result_num: result.TextDetections ? result.TextDetections.length : 0
        };
    } catch (error) {
        console.error('腾讯云 OCR 调用失败:', error);
        // 返回空结果，让后续逻辑处理
        return {
            words_result: [],
            words_result_num: 0
        };
    }
};

/**
 * 解析 OCR 结果
 */
const parseOCRResult = (ocrResult, ledgerId) => {
    const result = {
        merchant: '',
        amount: 0,
        date: '',
        category: '',
        rawText: []
    };

    if (!ocrResult || !ocrResult.words_result) {
        return result;
    }

    // 从腾讯云 OCR 结果中提取文本
    const textLines = ocrResult.words_result.map(item => {
        return item.DetectedText || item.words || item.text || '';
    });
    result.rawText = textLines;

    const fullText = textLines.join('\n');

    // 尝试提取商户名称
    result.merchant = extractMerchant(textLines);

    // 尝试提取金额
    result.amount = extractAmount(fullText);

    // 尝试提取日期
    result.date = extractDate(fullText);

    // 根据商户名匹配分类
    result.category = matchCategory(result.merchant);

    return result;
};

/**
 * 提取商户名称
 */
const extractMerchant = (textLines) => {
    // 常见的商户标识关键词
    const merchantKeywords = ['商户', '商家', '店铺', '收款方', '付款给', '交易对方'];

    for (const line of textLines) {
        for (const keyword of merchantKeywords) {
            if (line.includes(keyword)) {
                const match = line.match(new RegExp(`${keyword}[：:]*(.+)`));
                if (match && match[1]) {
                    return match[1].trim();
                }
            }
        }
    }

    // 常见的支付平台消费格式
    for (const line of textLines) {
        // 微信支付格式：向 XXX 付款
        if (line.includes('向') && line.includes('付款')) {
            const match = line.match(/向(.+)付款/);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        // 支付宝格式：付款给 XXX
        if (line.includes('付款给')) {
            const match = line.match(/付款给(.+)/);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
    }

    // 如果没找到，使用第一行非数字开头的行作为商户名
    for (const line of textLines) {
        const trimmed = line.trim();
        if (trimmed && !/^[\d¥￥]/.test(trimmed) && trimmed.length > 1 && trimmed.length < 30) {
            return trimmed;
        }
    }

    return textLines[0] || '';
};

/**
 * 提取金额
 */
const extractAmount = (text) => {
    // 常见金额格式
    const patterns = [
        /[¥￥]\s*([\d,]+\.?\d*)/,  // ¥100.00
        /金额[：:]\s*([\d,]+\.?\d*)/,  // 金额：100.00
        /支付[：:]\s*([\d,]+\.?\d*)/,  // 支付：100.00
        /实付[：:]\s*([\d,]+\.?\d*)/,  // 实付：100.00
        /合计[：:]\s*([\d,]+\.?\d*)/,  // 合计：100.00
        /付款[：:]\s*([\d,]+\.?\d*)/,  // 付款：100.00
        /(?:^|\s)([\d,]+\.\d{2})(?:\s|$)/  // 独立的金额数字
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0) {
                return amount;
            }
        }
    }

    return 0;
};

/**
 * 提取日期
 */
const extractDate = (text) => {
    // 常见日期格式
    const patterns = [
        /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/,  // 2024-01-15 或 2024年01月15日
        /(\d{4}\/\d{1,2}\/\d{1,2})/,  // 2024/01/15
        /(\d{2}-\d{2}\s+\d{2}:\d{2})/  // 01-15 12:30
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            let dateStr = match[1];
            // 标准化日期格式
            dateStr = dateStr.replace(/[年月]/g, '-').replace(/日/g, '').replace(/\//g, '-');
            // 处理 01-15 12:30 格式，补充年份
            if (dateStr.length <= 14) {
                const year = new Date().getFullYear();
                dateStr = `${year}-${dateStr.split(' ')[0]}`;
            }
            return dateStr;
        }
    }

    // 默认返回今天日期
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

/**
 * 根据商户名匹配分类
 */
const matchCategory = (merchant) => {
    if (!merchant) return '其他/未分类';

    const merchantLower = merchant.toLowerCase();
    const categoryMapping = config.defaultCategories || {
        '美团': '餐饮/外卖',
        '饿了么': '餐饮/外卖',
        '肯德基': '餐饮/快餐',
        '麦当劳': '餐饮/快餐',
        '星巴克': '餐饮/饮品',
        '瑞幸': '餐饮/饮品',
        '滴滴': '交通/打车',
        '高德': '交通/打车',
        '淘宝': '购物/电商',
        '京东': '购物/电商',
        '拼多多': '购物/电商',
        '超市': '购物/超市',
        '便利店': '购物/便利店',
        '加油': '交通/加油',
        '停车': '交通/停车',
        '电影': '娱乐/电影',
        '游戏': '娱乐/游戏',
        '会员': '订阅/会员',
        '充值': '生活/充值',
        '水电': '生活/水电',
        '话费': '生活/话费'
    };

    for (const [keyword, category] of Object.entries(categoryMapping)) {
        if (merchantLower.includes(keyword.toLowerCase())) {
            return category;
        }
    }

    return '其他/未分类';
};

/**
 * 处理图片 OCR（兼容旧版 API）
 */
const processImage = async (event) => {
    return await recognizeBill(event);
};

/**
 * 批量识别
 */
const batchRecognize = async (event) => {
    const app = initApp();
    const { OPENID } = getWXContext(cloud);

    const user = await verifyUser(app, OPENID);
    const { file_ids, images, ledger_id } = event.data || event;

    const items = file_ids || images || [];

    if (!items || items.length === 0) {
        throw new Error('请提供文件ID列表或图片数据');
    }

    const results = [];

    for (const item of items) {
        try {
            const isFileId = typeof item === 'string' && item.startsWith('cloud://');
            const eventData = isFileId
                ? { file_id: item, ledger_id }
                : { image_base64: item.base64 || item, ledger_id };

            const result = await recognizeBill({
                data: eventData,
                OPENID
            });
            results.push({
                id: item.id || item,
                success: true,
                data: result.data
            });
        } catch (error) {
            results.push({
                id: item.id || item,
                success: false,
                error: error.message
            });
        }
    }

    return successResponse({
        results,
        total: items.length,
        success_count: results.filter(r => r.success).length
    });
};

/**
 * 获取 OCR 状态
 */
const getStatus = async (event) => {
    // 检查 OCR 服务是否可用
    const hasCredentials = process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY;

    return successResponse({
        available: hasCredentials,
        provider: 'tencent_cloud',
        message: hasCredentials ? 'OCR 服务可用' : '请配置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY'
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
        case 'recognize':
            return await recognizeBill(event);
        case 'processImage':
            return await processImage(event);
        case 'batchRecognize':
        case 'batchProcess':
            return await batchRecognize(event);
        case 'getStatus':
            return await getStatus(event);
        default:
            throw new Error('不支持的操作类型');
    }
});
