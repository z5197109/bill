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
        console.log('App launch')
        // Init CloudBase
        this.initCloudBase()
        // Ensure cloud user exists before data load
        this.ensureCloudLogin().then(() => {
            this.loadLedgers()
        })
        // Check login status (user profile authorization)
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

    // Ensure cloud user exists (no user profile required)
    ensureCloudLogin() {
        const that = this
        return new Promise((resolve) => {
            wx.login({
                success(loginRes) {
                    const payload = {
                        action: 'login',
                        code: loginRes.code
                    }
                    wx.cloud.callFunction({
                        name: 'user-service',
                        data: { ...payload, data: { ...payload } }
                    }).then(res => {
                        if (res.result.success) {
                            that.globalData.isLoggedIn = true
                            resolve(res.result.data)
                        } else {
                            resolve(null)
                        }
                    }).catch(() => resolve(null))
                },
                fail() {
                    resolve(null)
                }
            })
        })
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
        return new Promise((resolve, reject) => {
            wx.login({
                success(loginRes) {
                    const payload = {
                        action: 'login',
                        code: loginRes.code,
                        userInfo: that.globalData.userInfo
                    }
                    wx.cloud.callFunction({
                        name: 'user-service',
                        data: { ...payload, data: { ...payload } }
                    }).then(res => {
                        if (res.result.success) {
                            console.log('Cloud login ok')
                            resolve(res.result.data)
                        } else {
                            reject(new Error(res.result.error || 'Login failed'))
                        }
                    }).catch(reject)
                },
                fail: reject
            })
        })
    },

    // 加载账本列表
    loadLedgers() {
        const that = this
        if (!this.globalData.isLoggedIn) {
            console.log('User not logged in, skip ledger load')
            return
        }

        wx.cloud.callFunction({
            name: 'ledger-service',
            data: {
                action: 'list'
            }
        }).then(res => {
            if (!res.result.success) return
            const data = res.result.data
            const ledgers = Array.isArray(data) ? data : (data && data.ledgers ? data.ledgers : [])
            that.globalData.ledgers = ledgers
            if (ledgers.length > 0 && !that.globalData.currentLedgerId) {
                // Prefer default ledger if present
                const defaultLedger = ledgers.find(l => l.is_default)
                const targetLedger = defaultLedger || ledgers[0]
                that.globalData.currentLedgerId = targetLedger._id || targetLedger.id
                // Prefer default ledger if present?
                that.loadCategories()
            }
        }).catch(err => {
            console.error('Load ledgers failed:', err)
            wx.showToast({
                title: 'Load ledgers failed',
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
            if (!res.result.success) return
            const data = res.result.data
            const categories = data && (data.categories || data.groups)
                ? (data.categories || data.groups)
                : (Array.isArray(data) ? data : [])
            that.globalData.categories = categories
        }).catch(err => {
            console.error('Load categories failed:', err)
        })
    },

    // 切换账本
    switchLedger(ledgerId) {
        this.globalData.currentLedgerId = ledgerId
        this.loadCategories()
    },

    // 调用云函数的通用方法
    callCloudFunction(functionName, data) {
        const payload = data && data.data === undefined ? { ...data, data: { ...data } } : data
        return wx.cloud.callFunction({
            name: functionName,
            data: payload
        }).then(res => {
            if (res.result.success) {
                return res.result.data
            } else {
                throw new Error(res.result.error || 'Request failed')
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
