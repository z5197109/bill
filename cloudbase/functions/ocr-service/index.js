// OCR 识别云函数 - 使用 OCR.space API
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
 * 调用 OCR.space API
 */
const callOcrSpaceAPI = async (imageBase64) => {
    // 获取 API 密钥
    const apiKey = process.env.OCR_SPACE_API_KEY;

    if (!apiKey) {
        throw new Error('请配置 OCR_SPACE_API_KEY 环境变量');
    }

    // 使用 https 模块发起请求
    const https = require('https');
    const querystring = require('querystring');

    // 准备请求数据
    const postData = querystring.stringify({
        apikey: apiKey,
        base64Image: `data:image/png;base64,${imageBase64}`,
        language: 'chs',  // 简体中文
        isOverlayRequired: 'false',
        OCREngine: '2'  // Engine 2 支持中文效果更好
    });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.ocr.space',
            port: 443,
            path: '/parse/image',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.OCRExitCode === 1 || result.OCRExitCode === 2) {
                        // 成功
                        const parsedResults = result.ParsedResults || [];
                        const textLines = [];

                        for (const pr of parsedResults) {
                            if (pr.ParsedText) {
                                // 按行分割文本
                                const lines = pr.ParsedText.split(/\r?\n/).filter(line => line.trim());
                                textLines.push(...lines);
                            }
                        }

                        resolve({
                            words_result: textLines.map(text => ({ DetectedText: text })),
                            words_result_num: textLines.length
                        });
                    } else {
                        // 失败
                        console.error('OCR.space error:', result);
                        resolve({
                            words_result: [],
                            words_result_num: 0,
                            error: result.ErrorMessage || 'OCR 识别失败'
                        });
                    }
                } catch (e) {
                    console.error('Parse OCR response error:', e);
                    resolve({ words_result: [], words_result_num: 0 });
                }
            });
        });

        req.on('error', (e) => {
            console.error('OCR request error:', e);
            resolve({ words_result: [], words_result_num: 0 });
        });

        req.write(postData);
        req.end();
    });
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

    // 调用 OCR.space API
    const ocrResult = await callOcrSpaceAPI(imageData);

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

    // 提取文本行
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
    const categoryMapping = {
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
    const hasCredentials = !!process.env.OCR_SPACE_API_KEY;

    return successResponse({
        available: hasCredentials,
        provider: 'ocr.space',
        message: hasCredentials ? 'OCR 服务可用' : '请配置 OCR_SPACE_API_KEY 环境变量'
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
