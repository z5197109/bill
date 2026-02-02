// app.js - 小程序入口文件
App({
    globalData: {
        // API 基础地址 - 开发时请修改为您的后端地址
        baseUrl: 'http://localhost:5000',
        // 当前账本 ID
        currentLedgerId: null,
        // 账本列表
        ledgers: [],
        // 分类列表
        categories: [],
        // 规则列表
        rules: []
    },

    onLaunch() {
        console.log('小程序启动')
        // 初始化加载账本列表
        this.loadLedgers()
    },

    // 加载账本列表
    loadLedgers() {
        const that = this
        wx.request({
            url: `${this.globalData.baseUrl}/api/ledgers`,
            method: 'GET',
            success(res) {
                if (res.data.success && res.data.ledgers) {
                    that.globalData.ledgers = res.data.ledgers
                    if (res.data.ledgers.length > 0 && !that.globalData.currentLedgerId) {
                        that.globalData.currentLedgerId = res.data.ledgers[0].id
                        // 加载当前账本的分类
                        that.loadCategories()
                    }
                }
            },
            fail(err) {
                console.error('加载账本失败:', err)
            }
        })
    },

    // 加载分类列表
    loadCategories() {
        const that = this
        const ledgerId = this.globalData.currentLedgerId
        if (!ledgerId) return

        wx.request({
            url: `${this.globalData.baseUrl}/api/category-groups?ledger_id=${ledgerId}`,
            method: 'GET',
            success(res) {
                if (res.data.success && res.data.groups) {
                    that.globalData.categories = res.data.groups
                }
            },
            fail(err) {
                console.error('加载分类失败:', err)
            }
        })
    },

    // 切换账本
    switchLedger(ledgerId) {
        this.globalData.currentLedgerId = ledgerId
        this.loadCategories()
    }
})
