// app.js - 小程序入口文件
App({
    globalData: {
        // CloudBase 环境 ID
        cloudbaseEnv: 'dev-4g40wh23d397fbae', // 请修改为您的环境 ID
        // 当前账本 ID
        currentLedgerId: null,
        // 账本列表
        ledgers: [],
        // 分类列表
        categories: [],
        // 规则列表
        rules: [],
        // 用户信息
        userInfo: null,
        // 登录状态
        isLoggedIn: false
    },

    onLaunch() {
        console.log('小程序启动')
        // 初始化云开发
        this.initCloudBase()
        // 检查登录状态
        this.checkLoginStatus()
    },

    // 初始化云开发
    initCloudBase() {
        if (!wx.cloud) {
            console.error('请使用 2.2.3 或以上的基础库以使用云能力')
            return
        }
        
        wx.cloud.init({
            env: this.globalData.cloudbaseEnv,
            traceUser: true
        })
        
        console.log('CloudBase 初始化完成')
    },

    // 检查登录状态
    checkLoginStatus() {
        const that = this
        wx.getSetting({
            success(res) {
                if (res.authSetting['scope.userInfo']) {
                    // 已经授权，可以直接调用 getUserInfo 获取头像昵称
                    wx.getUserInfo({
                        success(res) {
                            that.globalData.userInfo = res.userInfo
                            that.globalData.isLoggedIn = true
                            // 登录成功后加载数据
                            that.loadLedgers()
                        }
                    })
                } else {
                    console.log('用户未授权')
                }
            }
        })
    },

    // 用户登录
    login() {
        const that = this
        return new Promise((resolve, reject) => {
            wx.getUserProfile({
                desc: '用于完善用户资料',
                success(res) {
                    that.globalData.userInfo = res.userInfo
                    that.globalData.isLoggedIn = true
                    // 调用云函数进行登录
                    that.cloudLogin().then(() => {
                        that.loadLedgers()
                        resolve(res.userInfo)
                    }).catch(reject)
                },
                fail: reject
            })
        })
    },

    // 云函数登录
    cloudLogin() {
        const that = this
        return wx.cloud.callFunction({
            name: 'user-service',
            data: {
                action: 'login',
                userInfo: that.globalData.userInfo
            }
        }).then(res => {
            if (res.result.success) {
                console.log('云函数登录成功')
                return res.result.data
            } else {
                throw new Error(res.result.error || '登录失败')
            }
        })
    },

    // 加载账本列表
    loadLedgers() {
        const that = this
        if (!this.globalData.isLoggedIn) {
            console.log('用户未登录，跳过加载账本')
            return
        }

        wx.cloud.callFunction({
            name: 'ledger-service',
            data: {
                action: 'list'
            }
        }).then(res => {
            if (res.result.success && res.result.data.ledgers) {
                that.globalData.ledgers = res.result.data.ledgers
                if (res.result.data.ledgers.length > 0 && !that.globalData.currentLedgerId) {
                    // 优先选择默认账本
                    const defaultLedger = res.result.data.ledgers.find(l => l.is_default)
                    that.globalData.currentLedgerId = defaultLedger ? defaultLedger._id : res.result.data.ledgers[0]._id
                    // 加载当前账本的分类
                    that.loadCategories()
                }
            }
        }).catch(err => {
            console.error('加载账本失败:', err)
            wx.showToast({
                title: '加载账本失败',
                icon: 'none'
            })
        })
    },

    // 加载分类列表
    loadCategories() {
        const that = this
        if (!this.globalData.isLoggedIn) {
            return
        }

        wx.cloud.callFunction({
            name: 'config-service',
            data: {
                action: 'getCategories'
            }
        }).then(res => {
            if (res.result.success && res.result.data.categories) {
                that.globalData.categories = res.result.data.categories
            }
        }).catch(err => {
            console.error('加载分类失败:', err)
        })
    },

    // 切换账本
    switchLedger(ledgerId) {
        this.globalData.currentLedgerId = ledgerId
        this.loadCategories()
    },

    // 调用云函数的通用方法
    callCloudFunction(functionName, data) {
        return wx.cloud.callFunction({
            name: functionName,
            data: data
        }).then(res => {
            if (res.result.success) {
                return res.result.data
            } else {
                throw new Error(res.result.error || '请求失败')
            }
        })
    },

    // 上传文件到云存储
    uploadFile(filePath, cloudPath) {
        return wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: filePath
        })
    },

    // 下载文件
    downloadFile(fileID) {
        return wx.cloud.downloadFile({
            fileID: fileID
        })
    }
})
