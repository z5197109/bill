// pages/analytics/analytics.js
const api = require('../../utils/api')
const util = require('../../utils/util')

const app = getApp()

Page({
    data: {
        loading: false,
        // 筛选条件
        filters: {
            keyword: '',
            major: '',
            minor: '',
            start_date: '',
            end_date: ''
        },
        // 分类选项
        majorOptions: [],
        minorOptions: [],
        categories: [],
        // 统计数据
        summary: {
            total_amount: 0,
            bill_count: 0,
            day_count: 0,
            daily_avg: 0
        },
        // 账单列表
        bills: [],
        page: 1,
        pageSize: 20,
        totalCount: 0,
        hasMore: true
    },

    onLoad() {
        // 默认显示当天数据
        const today = util.today()
        this.setData({
            'filters.start_date': today,
            'filters.end_date': today
        })
    },

    onShow() {
        this.loadCategories()
        this.refresh()
    },

    onPullDownRefresh() {
        this.refresh().then(() => {
            wx.stopPullDownRefresh()
        })
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loading) {
            this.loadMore()
        }
    },

    async loadCategories() {
        try {
            const res = await api.getCategoryGroups()
            if (res.success && res.categories) {
                const categories = res.categories
                const majors = [...new Set(categories.map(c => c.major))].filter(Boolean)
                this.setData({
                    categories,
                    majorOptions: ['全部大类', ...majors]
                })
            }
        } catch (err) {
            console.error('加载分类失败:', err)
        }
    },

    // 刷新数据
    async refresh() {
        this.setData({ page: 1, bills: [], hasMore: true })
        await this.loadBills()
        await this.loadSummary()
    },

    // 加载账单列表
    async loadBills() {
        const { filters, page, pageSize } = this.data
        this.setData({ loading: true })

        try {
            const params = {
                offset: (page - 1) * pageSize,
                limit: pageSize,
                start_date: filters.start_date,
                end_date: filters.end_date
            }

            if (filters.keyword) params.keyword = filters.keyword
            if (filters.major && filters.major !== '全部大类') params.major = filters.major
            if (filters.minor && filters.minor !== '全部小类') params.minor = filters.minor

            const res = await api.getBills(params)

            if (res.success) {
                const newBills = res.bills || []
                this.setData({
                    bills: page === 1 ? newBills : [...this.data.bills, ...newBills],
                    totalCount: res.total_count || 0,
                    hasMore: newBills.length === pageSize
                })
            }
        } catch (err) {
            util.showToast(err.message || '加载失败')
        } finally {
            this.setData({ loading: false })
        }
    },

    // 加载统计数据
    async loadSummary() {
        const { filters } = this.data

        try {
            const params = {
                start_date: filters.start_date,
                end_date: filters.end_date
            }

            if (filters.keyword) params.keyword = filters.keyword
            if (filters.major && filters.major !== '全部大类') params.major = filters.major
            if (filters.minor && filters.minor !== '全部小类') params.minor = filters.minor

            const res = await api.getAnalyticsSummary(params)

            if (res.success && res.summary) {
                this.setData({
                    summary: {
                        total_amount: res.summary.total_amount || 0,
                        bill_count: res.summary.bill_count || 0,
                        day_count: res.summary.day_count || 0,
                        daily_avg: res.summary.daily_avg || 0
                    }
                })
            }
        } catch (err) {
            console.error('加载统计失败:', err)
        }
    },

    // 加载更多
    async loadMore() {
        this.setData({ page: this.data.page + 1 })
        await this.loadBills()
    },

    // 关键词输入
    handleKeywordInput(e) {
        this.setData({
            'filters.keyword': e.detail.value
        })
    },

    // 大类选择
    handleMajorChange(e) {
        const index = e.detail.value
        const major = this.data.majorOptions[index]

        // 更新小类选项
        let minorOptions = ['全部小类']
        if (major && major !== '全部大类') {
            const minors = this.data.categories
                .filter(c => c.major === major)
                .map(c => c.minor)
                .filter(Boolean)
            minorOptions = ['全部小类', ...minors]
        }

        this.setData({
            'filters.major': major === '全部大类' ? '' : major,
            'filters.minor': '',
            minorOptions
        })
    },

    // 小类选择
    handleMinorChange(e) {
        const index = e.detail.value
        const minor = this.data.minorOptions[index]
        this.setData({
            'filters.minor': minor === '全部小类' ? '' : minor
        })
    },

    // 开始日期选择
    handleStartDateChange(e) {
        this.setData({
            'filters.start_date': e.detail.value
        })
    },

    // 结束日期选择
    handleEndDateChange(e) {
        this.setData({
            'filters.end_date': e.detail.value
        })
    },

    // 快捷日期选择
    handleQuickDate(e) {
        const type = e.currentTarget.dataset.type
        const today = new Date()
        let start, end

        switch (type) {
            case 'today':
                start = end = util.formatDate(today)
                break
            case 'week':
                const dayOfWeek = today.getDay() || 7
                const startOfWeek = new Date(today)
                startOfWeek.setDate(today.getDate() - dayOfWeek + 1)
                start = util.formatDate(startOfWeek)
                end = util.formatDate(today)
                break
            case 'month':
                start = util.firstDayOfMonth()
                end = util.lastDayOfMonth()
                break
            case 'year':
                start = `${today.getFullYear()}-01-01`
                end = util.formatDate(today)
                break
        }

        this.setData({
            'filters.start_date': start,
            'filters.end_date': end
        })
    },

    // 搜索
    handleSearch() {
        this.refresh()
    },

    // 重置
    handleReset() {
        const today = util.today()
        this.setData({
            filters: {
                keyword: '',
                major: '',
                minor: '',
                start_date: today,
                end_date: today
            },
            minorOptions: ['全部小类']
        })
        this.refresh()
    },

    // 点击账单项查看详情
    handleBillTap(e) {
        const bill = e.currentTarget.dataset.bill
        // 可以跳转到详情页或弹出编辑
        wx.showActionSheet({
            itemList: ['编辑', '删除'],
            success: (res) => {
                if (res.tapIndex === 0) {
                    this.editBill(bill)
                } else if (res.tapIndex === 1) {
                    this.deleteBill(bill)
                }
            }
        })
    },

    // 编辑账单
    editBill(bill) {
        // 跳转到编辑页或使用弹窗
        wx.navigateTo({
            url: `/pages/bill-edit/bill-edit?id=${bill.id}`
        })
    },

    // 删除账单
    async deleteBill(bill) {
        const confirm = await util.showConfirm({
            title: '确认删除',
            content: `确定删除"${bill.merchant}"的账单吗？`
        })

        if (confirm) {
            try {
                const res = await api.deleteBill(bill.id)
                if (res.success) {
                    util.showToast('删除成功', 'success')
                    this.refresh()
                } else {
                    throw new Error(res.error || '删除失败')
                }
            } catch (err) {
                util.showToast(err.message || '删除失败')
            }
        }
    },

    // 导出账单
    async handleExport() {
        const { filters } = this.data
        try {
            util.showToast('正在导出...', 'loading')
            const params = {
                start_date: filters.start_date,
                end_date: filters.end_date
            }
            if (filters.keyword) params.keyword = filters.keyword
            if (filters.major && filters.major !== '全部大类') params.major = filters.major

            const res = await api.exportBills(params)
            if (res.success && res.download_url) {
                // 小程序可以使用下载功能或复制链接
                wx.setClipboardData({
                    data: res.download_url,
                    success: () => {
                        util.showToast('导出链接已复制到剪贴板', 'success')
                    }
                })
            } else {
                util.showToast('导出成功，请在网页端下载', 'success')
            }
        } catch (err) {
            util.showToast(err.message || '导出失败')
        }
    },

    // 新增账单
    handleNewBill() {
        wx.navigateTo({
            url: '/pages/bill-edit/bill-edit'
        })
    }
})
