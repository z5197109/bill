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
        lastRefresh: '',
        pieGradient: ''
    },

    onLoad() {
        this.setCurrentMonth()
    },

    async onShow() {
        if (!await util.ensureLedger(app)) {
            return
        }
        this._dashboardRetry = 0
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
                // 构建动态环形图渐变
                const pieGradient = this.buildPieGradient(res.data.top_categories)

                this.setData({
                    dashboardData: res.data,
                    pieGradient: pieGradient,
                    loading: false,
                    lastRefresh: this.formatTime(new Date())
                })

                const retryCount = this._dashboardRetry || 0
                if (res.data && res.data.monthly_spending === 0 && retryCount < 1) {
                    this._dashboardRetry = retryCount + 1
                    setTimeout(() => this.loadDashboard(), 600)
                } else {
                    this._dashboardRetry = 0
                }
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

    // 构建环形图的 conic-gradient
    buildPieGradient(categories) {
        if (!categories || categories.length === 0) {
            return 'conic-gradient(#e8e8e8 0% 100%)'
        }

        // 默认颜色列表
        const defaultColors = [
            '#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
            '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'
        ]

        // 计算总金额
        const totalAmount = categories.reduce((sum, cat) => sum + (cat.amount || 0), 0)
        if (totalAmount <= 0) {
            return 'conic-gradient(#e8e8e8 0% 100%)'
        }

        // 构建渐变段
        let currentPercent = 0
        const segments = []

        categories.forEach((cat, index) => {
            const percent = (cat.amount || 0) / totalAmount * 100
            const color = cat.color || defaultColors[index % defaultColors.length]
            const start = currentPercent
            const end = currentPercent + percent
            segments.push(`${color} ${start.toFixed(1)}% ${end.toFixed(1)}%`)
            currentPercent = end
        })

        // 如果还有剩余（不在top分类中的），用灰色填充
        if (currentPercent < 99.9) {
            segments.push(`#e8e8e8 ${currentPercent.toFixed(1)}% 100%`)
        }

        return `conic-gradient(${segments.join(', ')})`
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
