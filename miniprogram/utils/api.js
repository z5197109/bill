// utils/api.js - CloudBase API 请求封装

const app = getApp()

// Helper: keep payload compatible with cloud functions that read event.data
function buildCloudFunctionPayload(data = {}) {
    const payload = { ...data }
    if (payload.data === undefined) {
        payload.data = { ...data }
    }
    return payload
}

function normalizeLedger(ledger) {
    if (!ledger) return ledger
    const normalized = { ...ledger }
    normalized.id = ledger.id || ledger._id
    normalized._id = normalized.id
    if (normalized.monthly_budget === undefined && ledger.monthly_budget !== undefined) {
        normalized.monthly_budget = ledger.monthly_budget
    }
    return normalized
}

function normalizeCategory(category) {
    if (!category) return category
    const normalized = { ...category }
    normalized.id = category.id || category._id
    normalized._id = normalized.id
    normalized.major = category.major || category.major_category || ''
    normalized.minor = category.minor || category.minor_category || ''
    normalized.full_name = category.full_name || category.name || (
        normalized.minor ? `${normalized.major}/${normalized.minor}` : normalized.major
    )
    return normalized
}

function normalizeRule(rule) {
    if (!rule) return rule
    const normalized = { ...rule }
    normalized.id = rule.id || rule._id
    normalized._id = normalized.id
    return normalized
}

function formatDate(value) {
    if (!value) return ''
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

function normalizeBill(bill) {
    if (!bill) return bill
    const normalized = { ...bill }
    normalized.id = bill.id || bill._id
    normalized._id = normalized.id
    if (!normalized.date) {
        normalized.date = formatDate(bill.bill_date || bill.date)
    }
    return normalized
}

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
            data: buildCloudFunctionPayload(requestData)
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
    return new Promise((resolve, reject) => {
        wx.login({
            success(res) {
                callCloudFunction('user-service', {
                    action: 'login',
                    code: res.code,
                    userInfo,
                    needLedgerId: false
                }).then(data => resolve({ success: true, ...data })).catch(reject)
            },
            fail: reject
        })
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
    }).then(res => {
        const raw = Array.isArray(res) ? res : (res?.ledgers || [])
        const ledgers = raw.map(normalizeLedger)
        return { success: true, ledgers }
    })
}

function createLedger(data) {
    return callCloudFunction('ledger-service', {
        action: 'create',
        ...data,
        needLedgerId: false
    }).then(res => {
        const ledger = normalizeLedger(res)
        return { success: true, ledger_id: ledger?.id, ledger }
    })
}

function updateLedger(id, data) {
    return callCloudFunction('ledger-service', {
        action: 'update',
        ledger_id: id,
        ...data,
        needLedgerId: false
    }).then(res => ({ success: true, ...res }))
}

function deleteLedger(id) {
    return callCloudFunction('ledger-service', {
        action: 'delete',
        ledger_id: id,
        needLedgerId: false
    }).then(res => ({ success: true, ...res }))
}

function setDefaultLedger(id) {
    return callCloudFunction('ledger-service', {
        action: 'setDefault',
        ledger_id: id,
        needLedgerId: false
    }).then(res => ({ success: true, ...res }))
}

// === 账单相关 API ===

function getBills(params = {}) {
    if (params.bill_id) {
        return callCloudFunction('bill-service', {
            action: 'get',
            bill_id: params.bill_id
        }).then(res => {
            const bill = normalizeBill(res.bill || res)
            return { success: true, bills: bill ? [bill] : [] }
        })
    }

    const pageLimit = params.limit || params.pageSize || 20
    const pageNumber = params.page || (typeof params.offset === 'number'
        ? Math.floor(params.offset / pageLimit) + 1
        : 1)

    const payload = {
        action: 'list',
        page: pageNumber,
        limit: pageLimit
    }

    if (params.start_date) payload.start_date = params.start_date
    if (params.end_date) payload.end_date = params.end_date
    if (params.keyword) payload.keyword = params.keyword
    if (params.category) payload.category = params.category

    if (params.major) {
        if (params.minor) {
            payload.category = `${params.major}/${params.minor}`
        } else if (!payload.keyword) {
            payload.keyword = params.major
        }
    } else if (params.minor && !payload.keyword) {
        payload.keyword = params.minor
    }

    return callCloudFunction('bill-service', payload).then(res => {
        const bills = (res && res.bills ? res.bills : []).map(normalizeBill)
        const total = res && res.pagination && typeof res.pagination.total === 'number'
            ? res.pagination.total
            : (res && typeof res.total_count === 'number' ? res.total_count : bills.length)
        return { success: true, bills, total_count: total }
    })
}

function createBill(data) {
    return callCloudFunction('bill-service', {
        action: 'create',
        ...data
    }).then(res => ({ success: true, bill: normalizeBill(res) }))
}

function updateBill(id, data) {
    return callCloudFunction('bill-service', {
        action: 'update',
        bill_id: id,
        ...data
    }).then(res => ({ success: true, ...res }))
}

function deleteBill(id) {
    return callCloudFunction('bill-service', {
        action: 'delete',
        bill_id: id
    }).then(res => ({ success: true, ...res }))
}

function batchDeleteBills(billIds) {
    return callCloudFunction('bill-service', {
        action: 'batchDelete',
        bill_ids: billIds
    }).then(res => ({ success: true, ...res }))
}

function batchUpdateBudget(billIds, includeInBudget) {
    return callCloudFunction('bill-service', {
        action: 'batchUpdateBudget',
        bill_ids: billIds,
        include_in_budget: includeInBudget
    }).then(res => ({ success: true, ...res }))
}

function getBillStats(params = {}) {
    return callCloudFunction('bill-service', {
        action: 'stats',
        ...params
    }).then(res => ({ success: true, ...res }))
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
    return Promise.all(promises).then(results => ({
        success: true,
        saved_count: results.length,
        results
    }))
}

// === 分类相关 API ===

function getCategories() {
    return callCloudFunction('config-service', {
        action: 'getCategories',
        needLedgerId: false
    }).then(res => {
        const raw = res && (res.categories || res.groups) ? (res.categories || res.groups) : (Array.isArray(res) ? res : [])
        const categories = raw.map(normalizeCategory)
        return { success: true, categories, groups: categories }
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
    }).then(res => ({ success: true, category: normalizeCategory(res) }))
}

function updateCategory(id, data) {
    return callCloudFunction('config-service', {
        action: 'updateCategory',
        category_id: id,
        ...data,
        needLedgerId: false
    }).then(res => ({ success: true, ...res }))
}

function deleteCategory(id) {
    return callCloudFunction('config-service', {
        action: 'deleteCategory',
        category_id: id,
        needLedgerId: false
    }).then(res => ({ success: true, ...res }))
}

// === 规则相关 API ===

function getCategoryRules() {
    return callCloudFunction('config-service', {
        action: 'getCategoryRules',
        needLedgerId: false
    }).then(res => {
        const raw = res && res.rules ? res.rules : (Array.isArray(res) ? res : [])
        const rules = raw.map(normalizeRule)
        return { success: true, rules }
    })
}

function createCategoryRule(data) {
    return callCloudFunction('config-service', {
        action: 'createCategoryRule',
        ...data,
        needLedgerId: false
    }).then(res => ({ success: true, rule: normalizeRule(res) }))
}

function updateCategoryRule(id, data) {
    return callCloudFunction('config-service', {
        action: 'updateCategoryRule',
        rule_id: id,
        ...data,
        needLedgerId: false
    }).then(res => ({ success: true, ...res }))
}

function deleteCategoryRule(id) {
    return callCloudFunction('config-service', {
        action: 'deleteCategoryRule',
        rule_id: id,
        needLedgerId: false
    }).then(res => ({ success: true, ...res }))
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
    }).then(res => {
        const summary = res && res.summary ? res.summary : res
        return { success: true, summary }
    })
}

function getMonthlyStats(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'monthlyStats',
        ...params
    }).then(res => ({ success: true, ...res }))
}

function getYearlyStats(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'yearlyStats',
        ...params
    }).then(res => ({ success: true, ...res }))
}

function getCategoryTrends(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'categoryTrends',
        ...params
    }).then(res => ({ success: true, ...res }))
}

function getSpendingRanking(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'spendingRanking',
        ...params
    }).then(res => ({ success: true, ...res }))
}

function exportData(params = {}) {
    return callCloudFunction('analytics-service', {
        action: 'export',
        ...params
    }).then(res => ({ success: true, ...res }))
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

// === 兼容旧版 API 别名与缺失能力 ===

function addCategoryGroup(data) {
    const major = data.major || ''
    const minor = data.minor || ''
    const name = minor ? `${major}/${minor}` : major
    return createCategory({
        name,
        major_category: major,
        minor_category: minor
    })
}

function updateCategoryGroup(id, data) {
    const major = data.major || ''
    const minor = data.minor || ''
    const name = minor ? `${major}/${minor}` : major
    return updateCategory(id, {
        name,
        major_category: major,
        minor_category: minor
    })
}

function deleteCategoryGroup(id) {
    return deleteCategory(id)
}

function addCategoryRule(data) {
    return createCategoryRule(data)
}

function exportBills(params = {}) {
    return exportData(params)
}

function getDashboardSummary() {
    const ledgerId = app.globalData.currentLedgerId
    if (!ledgerId) {
        return Promise.reject(new Error('璐︽湰ID 不能为空'))
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    return Promise.all([
        getMonthlyStats({ year, month }),
        getLedgers(),
        getCategories()
    ]).then(([monthlyRes, ledgerRes, categoryRes]) => {
        const summary = monthlyRes && monthlyRes.summary ? monthlyRes.summary : {}
        const totalAmount = summary.total_amount || 0
        const budgetAmount = summary.budget_amount || 0

        const ledgers = ledgerRes && ledgerRes.ledgers ? ledgerRes.ledgers : []
        const currentLedger = ledgers.find(l => l.id === ledgerId || l._id === ledgerId)
        const totalBudget = currentLedger && currentLedger.monthly_budget ? currentLedger.monthly_budget : 0

        const usedAmount = budgetAmount
        const remainingBudget = totalBudget - usedAmount
        const usedPercentage = totalBudget > 0
            ? Math.round(usedAmount / totalBudget * 10000) / 100
            : 0

        const categoryStats = monthlyRes && monthlyRes.category_stats ? monthlyRes.category_stats : {}
        const categories = categoryRes && categoryRes.categories ? categoryRes.categories : []

        const topCategories = Object.keys(categoryStats).map(categoryName => {
            const stat = categoryStats[categoryName] || { amount: 0, percentage: 0 }
            const match = categories.find(c => (c.full_name || c.name) === categoryName)
            const percent = stat.percentage || (totalAmount > 0
                ? Math.round(stat.amount / totalAmount * 10000) / 100
                : 0)
            return {
                category: categoryName,
                amount: stat.amount || 0,
                percent,
                color: match && match.color ? match.color : '#1890ff'
            }
        }).sort((a, b) => b.amount - a.amount).slice(0, 6)

        return {
            success: true,
            data: {
                monthly_spending: totalAmount,
                non_budget_spending: Math.max(totalAmount - budgetAmount, 0),
                budget_info: {
                    total_budget: totalBudget,
                    used_amount: usedAmount,
                    remaining_budget: remainingBudget,
                    used_percentage: usedPercentage
                },
                top_categories: topCategories
            }
        }
    })
}

function getRecurringRules() {
    return callCloudFunction('config-service', {
        action: 'getRecurringRules'
    }).then(res => {
        const raw = res && res.rules ? res.rules : (Array.isArray(res) ? res : [])
        const rules = raw.map(normalizeRule)
        return { success: true, rules }
    })
}

function addRecurringRule(data) {
    return callCloudFunction('config-service', {
        action: 'createRecurringRule',
        ...data
    }).then(res => ({ success: true, rule: normalizeRule(res) }))
}

function updateRecurringRule(id, data) {
    return callCloudFunction('config-service', {
        action: 'updateRecurringRule',
        rule_id: id,
        ...data
    }).then(res => ({ success: true, ...res }))
}

function deleteRecurringRule(id) {
    return callCloudFunction('config-service', {
        action: 'deleteRecurringRule',
        rule_id: id
    }).then(res => ({ success: true, ...res }))
}

function getLedgerBackups() {
    return Promise.resolve({ success: true, backups: [] })
}

function restoreLedgerBackup() {
    return Promise.reject(new Error('鏆傛湭瀹炵幇澶囦唤鎭㈠'))
}

function deleteLedgerBackup() {
    return Promise.reject(new Error('鏆傛湭瀹炵幇澶囦唤鍒犻櫎'))
}

function getTemplates() {
    return Promise.resolve({ success: true, data: [] })
}

function deleteTemplate() {
    return Promise.reject(new Error('鏆傛湭瀹炵幇妯℃澘鍒犻櫎'))
}

module.exports = {
    callCloudFunction,
    uploadFile,
    // ??
    login,
    getUserInfo,
    updateUserInfo,
    // ??
    getLedgers,
    createLedger,
    updateLedger,
    deleteLedger,
    setDefaultLedger,
    // ??
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
    // ??
    getCategories,
    getCategoryGroups, // ?????
    addCategoryGroup,
    createCategory,
    updateCategoryGroup,
    updateCategory,
    deleteCategoryGroup,
    deleteCategory,
    // ??
    getCategoryRules,
    addCategoryRule,
    createCategoryRule,
    updateCategoryRule,
    deleteCategoryRule,
    applyCategoryRules,
    initDefaultConfig,
    // ?????
    getRecurringRules,
    addRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    // ??
    getAnalyticsSummary,
    getMonthlyStats,
    getYearlyStats,
    getCategoryTrends,
    getSpendingRanking,
    exportData,
    exportBills,
    getDashboardSummary,
    // ??/?? (??)
    getLedgerBackups,
    restoreLedgerBackup,
    deleteLedgerBackup,
    getTemplates,
    deleteTemplate,
    // ??
    getStorageUsage,
    deleteFile,
    batchDeleteFiles,
    getFileDownloadUrl
}
