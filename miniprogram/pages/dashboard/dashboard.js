// pages/dashboard/dashboard.js
const api = require('../../utils/api')
const util = require('../../utils/util')

const app = getApp()

Page({
    data: {
        loading: true,
        error: null,
        dashboardData: null,
        currentMonth: '',
        lastRefresh: ''
    },

    onLoad() {
        this.setCurrentMonth()
    },

    onShow() {
        this.loadDashboard()
    },

    onPullDownRefresh() {
        this.loadDashboard().then(() => {
            wx.stopPullDownRefresh()
        })
    },

    setCurrentMonth() {
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth() + 1
        this.setData({
            currentMonth: `${year}年${month}月`
        })
    },

    async loadDashboard() {
        if (!app.globalData.currentLedgerId) {
            // 等待账本加载
            setTimeout(() => this.loadDashboard(), 500)
            return
        }

        this.setData({ loading: true, error: null })

        try {
            const res = await api.getDashboardSummary()
            if (res.success && res.data) {
                this.setData({
                    dashboardData: res.data,
                    loading: false,
                    lastRefresh: this.formatTime(new Date())
                })
            } else {
                throw new Error(res.error || '加载失败')
            }
        } catch (err) {
            this.setData({
                loading: false,
                error: err.message || '网络请求失败'
            })
        }
    },

    formatTime(date) {
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${hours}:${minutes}`
    },

    handleRefresh() {
        this.loadDashboard()
    },

    handleAddBill() {
        wx.switchTab({
            url: '/pages/upload/upload'
        })
    },

    // 计算预算进度颜色
    getBudgetColor(percent) {
        if (percent >= 100) return '#ff4d4f'
        if (percent >= 80) return '#faad14'
        return '#52c41a'
    },

    // 计算预算进度宽度
    getBudgetWidth(percent) {
        return Math.min(percent, 100) + '%'
    }
})
