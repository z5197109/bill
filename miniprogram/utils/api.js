// utils/api.js - API 请求封装

const app = getApp()

/**
 * 封装 wx.request 请求
 * @param {Object} options 请求配置
 * @returns {Promise}
 */
function request(options) {
    return new Promise((resolve, reject) => {
        const { url, method = 'GET', data = {}, header = {} } = options

        // 如果需要 ledger_id，自动添加
        let requestData = { ...data }
        if (options.needLedgerId !== false && app.globalData.currentLedgerId) {
            if (method === 'GET') {
                requestData.ledger_id = app.globalData.currentLedgerId
            } else {
                requestData.ledger_id = requestData.ledger_id || app.globalData.currentLedgerId
            }
        }

        wx.request({
            url: `${app.globalData.baseUrl}${url}`,
            method,
            data: requestData,
            header: {
                'Content-Type': 'application/json',
                ...header
            },
            success(res) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res.data)
                } else {
                    reject(new Error(res.data.error || `请求失败: ${res.statusCode}`))
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '网络请求失败'))
            }
        })
    })
}

/**
 * 上传文件
 * @param {Object} options 上传配置
 * @returns {Promise}
 */
function uploadFile(options) {
    return new Promise((resolve, reject) => {
        const { url, filePath, name = 'file', formData = {} } = options

        // 添加 ledger_id
        const data = { ...formData }
        if (app.globalData.currentLedgerId) {
            data.ledger_id = app.globalData.currentLedgerId
        }

        wx.uploadFile({
            url: `${app.globalData.baseUrl}${url}`,
            filePath,
            name,
            formData: data,
            success(res) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const data = JSON.parse(res.data)
                        resolve(data)
                    } catch (e) {
                        resolve(res.data)
                    }
                } else {
                    reject(new Error(`上传失败: ${res.statusCode}`))
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '上传失败'))
            }
        })
    })
}

// === 账本相关 API ===

function getLedgers() {
    return request({ url: '/api/ledgers', needLedgerId: false })
}

function createLedger(data) {
    return request({ url: '/api/ledgers', method: 'POST', data, needLedgerId: false })
}

function updateLedger(id, data) {
    return request({ url: `/api/ledgers/${id}`, method: 'PUT', data, needLedgerId: false })
}

function deleteLedger(id) {
    return request({ url: `/api/ledgers/${id}`, method: 'DELETE', needLedgerId: false })
}

// === 看板相关 API ===

function getDashboardSummary() {
    return request({ url: '/api/dashboard/summary' })
}

// === 账单相关 API ===

function getBills(params = {}) {
    return request({ url: '/api/bills', data: params })
}

function createBill(data) {
    return request({ url: '/api/bills', method: 'POST', data })
}

function updateBill(id, data) {
    return request({ url: `/api/bills/${id}`, method: 'PUT', data })
}

function deleteBill(id) {
    return request({ url: `/api/bills/${id}`, method: 'DELETE' })
}

function batchDeleteBills(billIds) {
    return request({ url: '/api/bills/batch-delete', method: 'POST', data: { bill_ids: billIds } })
}

// === 上传识别 API ===

function uploadBillImages(filePaths, billDate) {
    const promises = filePaths.map(filePath => {
        return uploadFile({
            url: '/api/upload',
            filePath,
            name: 'files',
            formData: { bill_date: billDate }
        })
    })
    return Promise.all(promises)
}

function saveBills(bills) {
    return request({ url: '/api/save', method: 'POST', data: { bills } })
}

// === 分类相关 API ===

function getCategoryGroups() {
    return request({ url: '/api/config/category-groups' })
}

function addCategoryGroup(data) {
    return request({ url: '/api/config/category-groups', method: 'POST', data })
}

function updateCategoryGroup(id, data) {
    return request({ url: `/api/config/category-groups/${id}`, method: 'PUT', data })
}

function deleteCategoryGroup(id) {
    return request({ url: `/api/config/category-groups/${id}`, method: 'DELETE' })
}

// === 规则相关 API ===

function getCategoryRules() {
    return request({ url: '/api/config/categories' })
}

function addCategoryRule(data) {
    return request({ url: '/api/config/categories', method: 'POST', data })
}

function updateCategoryRule(id, data) {
    return request({ url: `/api/config/categories/${id}`, method: 'PUT', data })
}

function deleteCategoryRule(id) {
    return request({ url: `/api/config/categories/${id}`, method: 'DELETE' })
}

// === 周期性账单 API ===

function getRecurringRules() {
    return request({ url: '/api/recurring-rules' })
}

function addRecurringRule(data) {
    return request({ url: '/api/recurring-rules', method: 'POST', data })
}

function updateRecurringRule(id, data) {
    return request({ url: `/api/recurring-rules/${id}`, method: 'PUT', data })
}

function deleteRecurringRule(id) {
    return request({ url: `/api/recurring-rules/${id}`, method: 'DELETE' })
}

// === 统计分析 API ===

function getAnalyticsSummary(params = {}) {
    return request({ url: '/api/analytics/summary', data: params })
}
// === 备份 API ===

function getLedgerBackups() {
    return request({ url: '/api/ledger-backups' })
}

function restoreLedgerBackup(backupId) {
    return request({ url: `/api/ledger-backups/${backupId}/restore`, method: 'POST' })
}

function deleteLedgerBackup(backupId) {
    return request({ url: `/api/ledger-backups/${backupId}`, method: 'DELETE' })
}

// === 导出账单 ===

function exportBills(params = {}) {
    return request({ url: '/api/bills/export', data: params })
}

module.exports = {
    request,
    uploadFile,
    // 账本
    getLedgers,
    createLedger,
    updateLedger,
    deleteLedger,
    // 备份
    getLedgerBackups,
    restoreLedgerBackup,
    deleteLedgerBackup,
    // 看板
    getDashboardSummary,
    // 账单
    getBills,
    createBill,
    updateBill,
    deleteBill,
    batchDeleteBills,
    uploadBillImages,
    saveBills,
    exportBills,
    // 分类
    getCategoryGroups,
    addCategoryGroup,
    updateCategoryGroup,
    deleteCategoryGroup,
    // 规则
    getCategoryRules,
    addCategoryRule,
    updateCategoryRule,
    deleteCategoryRule,
    // 周期性
    getRecurringRules,
    addRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    // 统计
    getAnalyticsSummary,
    // 模板
    getTemplates,
    deleteTemplate
}

// === 模板 API ===

function getTemplates() {
    return request({ url: '/api/templates' })
}

function deleteTemplate(name) {
    return request({ url: `/api/templates/${encodeURIComponent(name)}`, method: 'DELETE' })
}
