// utils/util.js - 通用工具函数

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date 
 * @returns {string}
 */
function formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * 格式化金额显示
 * @param {number} amount 
 * @param {string} currency 
 * @returns {string}
 */
function formatAmount(amount, currency = '¥') {
    const num = Number(amount) || 0
    return `${currency}${num.toFixed(2)}`
}

/**
 * 获取今天日期
 * @returns {string}
 */
function today() {
    return formatDate(new Date())
}

/**
 * 获取本月第一天
 * @returns {string}
 */
function firstDayOfMonth() {
    const date = new Date()
    date.setDate(1)
    return formatDate(date)
}

/**
 * 获取本月最后一天
 * @returns {string}
 */
function lastDayOfMonth() {
    const date = new Date()
    date.setMonth(date.getMonth() + 1)
    date.setDate(0)
    return formatDate(date)
}

/**
 * 格式化百分比
 * @param {number} value 
 * @param {number} total 
 * @returns {string}
 */
function formatPercent(value, total) {
    if (!total || total === 0) return '0%'
    return `${((value / total) * 100).toFixed(1)}%`
}

/**
 * 显示 Toast 提示
 * @param {string} title 
 * @param {string} icon 
 */
function showToast(title, icon = 'none') {
    wx.showToast({
        title,
        icon,
        duration: 2000
    })
}

/**
 * 显示加载提示
 * @param {string} title 
 */
function showLoading(title = '加载中...') {
    wx.showLoading({
        title,
        mask: true
    })
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
    wx.hideLoading()
}

/**
 * 显示确认对话框
 * @param {Object} options 
 * @returns {Promise<boolean>}
 */
function showConfirm(options) {
    return new Promise((resolve) => {
        wx.showModal({
            title: options.title || '提示',
            content: options.content || '',
            confirmText: options.confirmText || '确定',
            cancelText: options.cancelText || '取消',
            success(res) {
                resolve(res.confirm)
            }
        })
    })
}

module.exports = {
    formatDate,
    formatAmount,
    today,
    firstDayOfMonth,
    lastDayOfMonth,
    formatPercent,
    showToast,
    showLoading,
    hideLoading,
    showConfirm
}
