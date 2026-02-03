// utils/api.js - CloudBase API 请求封装

const app = getApp()

/**
 * 调用云函数的通用方法
 * @param {string} functionName 云函数名称
 * @param {Object} data 请求数据
 * @returns {Promise}
 */
function callCloudFunction(functionName, data = {}) {
    return new Promise((resolve, reject) => {
        // 如果需要 ledger_id，自动添加
        let requestData = { ...data }
        if (data.needLedgerId !== false && app.globalData.currentLedgerId) {
            requestData.ledger_id = requestData.ledger_id || app.globalData.currentLedgerId
        }

        wx.cloud.callFunction({
            name: functionName,
            data: requestData
        }).then(res => {
            if (res.result.success) {
                resolve(res.result.data)
            } else {
                reject(new Error(res.result.error || '请求失败'))
            }
        }).catch(err => {
            console.error(`云函数 ${functionName} 调用失败:`, err)
            reject(new Error(err.errMsg || '网络请求失败'))
        })
    })
}

/**
 * 上传文件到云存储
 * @param {Object} options 上传配置
 * @returns {Promise}
 */
function uploadFile(options) {
    const { filePath, filename, ledgerId } = options

    return new Promise((resolve, reject) => {
        // 先获取上传签名
        callCloudFunction('file-service', {
            action: 'getUploadSignature',
            filename: filename || 'image.jpg',
            ledger_id: ledgerId || app.globalData.currentLedgerId
        }).then(signatureData => {
            // 使用签名上传文件
            return wx.cloud.uploadFile({
                cloudPath: signatureData.file_path,
                filePath: filePath
            })
        }).then(uploadResult => {
            // 确认上传完成
            return callCloudFunction('file-service', {
                action: 'confirmUpload',
                file_path: uploadResult.fileID,
                ledger_id: ledgerId || app.globalData.currentLedgerId
            })
        }).then(confirmResult => {
            resolve({
                fileID: confirmResult.file_path,
                downloadURL: confirmResult.download_url,
                ...confirmResult
            })
        }).catch(reject)
    })
}

// === 用户相关 API ===

function login(userInfo) {
    return callCloudFunction('user-service', {
        action: 'login',
        userInfo,
        needLedgerId: false
    })
}

function getUserInfo() {
    return callCloudFunction('user-service', {
        action: 'getUserInfo',
        needLedgerId: false
    })
}

function updateUserInfo(data) {
    return callCloudFunction('user-service', {
        action: 'updateUserInfo',
        ...data,
        needLedgerId: false
    })
}

// === 账本相关 API ===

function getLedgers() {
    return callCloudFunction('ledger-service', {
        action: 'list',
        needLedgerId: false
    })
}

function createLedger(data) {
    return callCloudFunction('ledger-service', {
        action: 'create',
        ...data,
        needLedgerId: false
    })
}

function updateLedger(id, data) {
    return callCloudFunction('ledger-service', {
        action: 'update',
        ledger_id: id,
        ...data,
        needLedgerId: false
    })
}

function deleteLedger(id) {
    return callCloudFunction('ledger-service', {
        action: 'delete',
        ledger_id: id,
        needLedgerId: false
    })
}

function setDefaultLedger(id) {
    return callCloudFunction('ledger-service', {
        action: 'setDefault',
        ledger_id: id,
        needLedgerId: false
    })
}

// === 账单相关 API ===

function getBills(params = {}) {
    return callCloudFunction('bill-service', {
        action: 'list',
        ...params
    })
}

function createBill(data) {
    return callCloudFunction('bill-service', {
        action: 'create',
        ...data
    })
}

function updateBill(id, data) {
    return callCloudFunction('bill-service', {
        action: 'update',
        bill_id: id,
        ...data
    })
}

function deleteBill(id) {
    return callCloudFunction('bill-service', {
        action: 'delete',
        bill_id: id
    })
}

function batchDeleteBills(billIds) {
    return callCloudFunction('bill-service', {
        action: 'batchDelete',
        bill_ids: billIds
    })
}

function batchUpdateBudget(billIds, includeInBudget) {
    return callCloudFunction('bill-service', {
        action: 'batchUpdateBudget',
        bill_ids: billIds,
        include_in_budget: includeInBudget
    })
}

function getBillStats(params = {}) {
    return callCloudFunction('bill-service', {
        action: 'stats',
        ...params
    })
}

// === OCR 相关 API ===

function processImageOCR(imageBase64, ledgerId) {
    return callCloudFunction('ocr-service', {
        action: 'processImage',
        image_base64: imageBase64,
        ledger_id: ledgerId
    })
}

function batchProcessImages(images, ledgerId) {
    return callCloudFunction('ocr-service', {
        action: 'batchProcess',
        images: images,
        ledger_id: ledgerId
    })
}

function getOCRStatus() {
    return callCloudFunction('ocr-service', {
        action: 'getStatus',
        needLedgerId: false
    })
}

// === 上传识别 API ===

function uploadBillImages(filePaths, billDate) {
    const promises = filePaths.map((filePath, index) => {
        return new Promise((resolve, reject) => {
            // 将图片转换为 base64
            wx.getFileSystemManager().readFile({
                filePath: filePath,
                encoding: 'base64',
                success: (res) => {
                    // 调用 OCR 识别
                    processImageOCR(res.data, app.globalData.currentLedgerId)
                        .then(ocrResult => {
                            resolve({
                                index: index,
                                filePath: filePath,
                                ocrResult: ocrResult,
                                parsedData: ocrResult.parsed_data
                            })
                        })
                        .catch(reject)
                },
                fail: reject
            })
        })
    })
    return Promise.all(promises)
}

function saveBills(bills) {
    const promises = bills.map(bill => createBill(bill))
    return Promise.all(promises)
}

// === 分类相关 API ===

function getCategories() {
    return callCloudFunction('config-service', {
        action: 'getCategories',
        needLedgerId: false
    })
}

// 兼容旧版本的方法名
function getCategoryGroups() {
    return getCategories()
}

function createCategory(data) {
    return callCloudFunction('config-service', {
        action: 'createCategory',
        ...data,
        needLedgerId: false
    })
}

function updateCategory(id, data) {
    return callCloudFunction('config-service', {
        action: 'updateCategory',
        category_id: id,
        ...data,
        needLedgerId: false
    })
}

function deleteCategory(id) {
    return callCloudFunction('config-service', {
        action: 'deleteCategory',
        category_id: id,
        needLedgerId: false
    })
}

// === 规则相关 API ===

function getCategoryRules() {
    return callCloudFunction('config-service', {
        action: 'getCategoryRules',
        needLedgerId: false
    })
}

function createCategoryRule(data) {
    return callCloudFunction('config-service', {
        action: 'createCategoryRule',
        ...data,
        needLedgerId: false
    })
}

function updateCategoryRule(id, data) {
    return callCloudFunction('config-service', {
        action: 'updateCategoryRule',
        rule_id: id,
        ...data,
        needLedgerId: false
    })
}

function deleteCategoryRule(id) {
    return callCloudFunction('config-service', {
        action: 'deleteCategoryRule',
        rule_id: id,
        needLedgerId: false
    })
}

function applyCategoryRules(merchantName) {
    return callCloudFunction('config-service', {
        action: 'applyCategoryRules',
        merchant_name: merchantName,
        needLedgerId: false
    })
}

function initDefaultConfig() {
    return callCloudFunction('config-service', {
        action: 'initDefaultConfig',
        needLedgerId: false
    })
}

// === 统计分析 API ===

function getAnalyticsSummary(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'summary',
        ...params
    })
}

function getMonthlyStats(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'monthlyStats',
        ...params
    })
}

function getYearlyStats(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'yearlyStats',
        ...params
    })
}

function getCategoryTrends(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'categoryTrends',
        ...params
    })
}

function getSpendingRanking(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'spendingRanking',
        ...params
    })
}

function exportData(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'export',
        ...params
    })
}

// === 文件相关 API ===

function getStorageUsage() {
    return callCloudFunction('file-service', {
        action: 'getStorageUsage',
        needLedgerId: false
    })
}

function deleteFile(filePath) {
    return callCloudFunction('file-service', {
        action: 'delete',
        file_path: filePath,
        needLedgerId: false
    })
}

function batchDeleteFiles(filePaths) {
    return callCloudFunction('file-service', {
        action: 'batchDelete',
        file_paths: filePaths,
        needLedgerId: false
    })
}

function getFileDownloadUrl(filePath) {
    return callCloudFunction('file-service', {
        action: 'getDownloadUrl',
        file_path: filePath,
        needLedgerId: false
    })
}

module.exports = {
    callCloudFunction,
    uploadFile,
    // 用户
    login,
    getUserInfo,
    updateUserInfo,
    // 账本
    getLedgers,
    createLedger,
    updateLedger,
    deleteLedger,
    setDefaultLedger,
    // 账单
    getBills,
    createBill,
    updateBill,
    deleteBill,
    batchDeleteBills,
    batchUpdateBudget,
    getBillStats,
    uploadBillImages,
    saveBills,
    // OCR
    processImageOCR,
    batchProcessImages,
    getOCRStatus,
    // 分类
    getCategories,
    getCategoryGroups, // 兼容旧版本
    createCategory,
    updateCategory,
    deleteCategory,
    // 规则
    getCategoryRules,
    createCategoryRule,
    updateCategoryRule,
    deleteCategoryRule,
    applyCategoryRules,
    initDefaultConfig,
    // 统计
    getAnalyticsSummary,
    getMonthlyStats,
    getYearlyStats,
    getCategoryTrends,
    getSpendingRanking,
    exportData,
    // 文件
    getStorageUsage,
    deleteFile,
    batchDeleteFiles,
    getFileDownloadUrl
}
