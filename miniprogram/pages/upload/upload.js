// pages/upload/upload.js
const api = require('../../utils/api')
const util = require('../../utils/util')

const app = getApp()

Page({
    data: {
        selectedImages: [],
        billDate: '',
        uploading: false,
        saving: false,
        results: [],
        categories: [],
        majorOptions: [],
        allSelected: false,
        hasSelectedItems: false
    },

    onLoad() {
        this.setData({
            billDate: util.today()
        })
    },

    async onShow() {
        if (!await util.ensureLedger(app)) {
            return
        }
        this.loadCategories()
    },

    async loadCategories() {
        try {
            const res = await api.getCategoryGroups()
            if (res.success && res.groups) {
                const categories = res.groups
                const majors = [...new Set(categories.map(c => c.major))].filter(Boolean)
                this.setData({
                    categories,
                    majorOptions: majors
                })
            }
        } catch (err) {
            console.error('加载分类失败:', err)
        }
    },

    // 选择图片
    handleChooseImage() {
        const that = this
        wx.chooseMedia({
            count: 9,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success(res) {
                const newImages = res.tempFiles.map(file => ({
                    path: file.tempFilePath,
                    size: file.size
                }))
                that.setData({
                    selectedImages: [...that.data.selectedImages, ...newImages]
                })
            }
        })
    },

    // 删除选中的图片
    handleRemoveImage(e) {
        const index = e.currentTarget.dataset.index
        const images = [...this.data.selectedImages]
        images.splice(index, 1)
        this.setData({ selectedImages: images })
    },

    // 日期选择
    handleDateChange(e) {
        this.setData({
            billDate: e.detail.value
        })
    },

    // 设置今天日期
    handleSetToday() {
        this.setData({
            billDate: util.today()
        })
    },

    // 开始识别
    async handleUpload() {
        if (this.data.selectedImages.length === 0) {
            util.showToast('请先选择图片')
            return
        }

        this.setData({ uploading: true })
        util.showLoading('正在识别...')

        try {
            const results = []
            for (const image of this.data.selectedImages) {
                const res = await this.uploadSingleImage(image.path)
                if (res.success && res.results) {
                    results.push(...res.results.map(r => ({
                        ...r,
                        id: Date.now() + Math.random(),
                        bill_date: this.data.billDate,
                        selected: true,
                        editing: false
                    })))
                }
            }

            this.setData({
                results: [...this.data.results, ...results],
                selectedImages: []
            })

            util.hideLoading()
            util.showToast(`识别完成：${results.length} 条记录`, 'success')
        } catch (err) {
            util.hideLoading()
            util.showToast(err.message || '识别失败')
        } finally {
            this.setData({ uploading: false })
        }
    },

    // 上传单张图片并识别
    async uploadSingleImage(filePath) {
        try {
            // 读取图片为 Base64
            const fs = wx.getFileSystemManager()
            const fileData = fs.readFileSync(filePath)
            const base64 = wx.arrayBufferToBase64(fileData)

            console.log('开始OCR识别, Base64长度:', base64.length)

            // 调用云函数进行 OCR 识别
            const res = await api.processImageOCR(base64, app.globalData.currentLedgerId)

            console.log('OCR云函数返回:', JSON.stringify(res))

            // 处理不同的响应格式
            let ocrData = null

            // 格式1: { success: true, data: { merchant, amount, ... } }
            if (res.success && res.data) {
                ocrData = res.data
            }
            // 格式2: 直接返回 { merchant, amount, ... }
            else if (res.merchant !== undefined || res.amount !== undefined) {
                ocrData = res
            }
            // 格式3: { success: true, merchant, amount, ... }
            else if (res.success) {
                ocrData = res
            }

            if (ocrData) {
                return {
                    success: true,
                    results: [{
                        merchant: ocrData.merchant || '',
                        amount: ocrData.amount || 0,
                        category: ocrData.category || '',
                        raw_text: ocrData.raw_text || [],
                        filename: filePath.split('/').pop() || 'image.jpg'
                    }]
                }
            } else {
                console.error('OCR返回格式异常:', res)
                throw new Error(res.error || res.message || 'OCR识别失败')
            }
        } catch (err) {
            console.error('OCR识别出错:', err)
            throw err
        }
    },

    // 切换选中状态
    handleToggleSelect(e) {
        const index = e.currentTarget.dataset.index
        const results = [...this.data.results]
        results[index].selected = !results[index].selected
        this.setData({ results })
        this.updateSelectionState()
    },

    // 全选/取消全选
    handleSelectAll() {
        const newState = !this.data.allSelected
        const results = this.data.results.map(r => ({ ...r, selected: newState }))
        this.setData({ results })
        this.updateSelectionState()
    },

    // 更新选中状态
    updateSelectionState() {
        const { results } = this.data
        const allSelected = results.length > 0 && results.every(r => r.selected)
        const hasSelectedItems = results.some(r => r.selected)
        this.setData({ allSelected, hasSelectedItems })
    },

    // 编辑商户名称
    handleMerchantInput(e) {
        const index = e.currentTarget.dataset.index
        const results = [...this.data.results]
        results[index].merchant = e.detail.value
        this.setData({ results })
    },

    // 编辑金额
    handleAmountInput(e) {
        const index = e.currentTarget.dataset.index
        const results = [...this.data.results]
        results[index].amount = parseFloat(e.detail.value) || 0
        this.setData({ results })
    },

    // 选择分类
    handleCategoryChange(e) {
        const index = e.currentTarget.dataset.index
        const catIndex = e.detail.value
        const category = this.data.categories[catIndex]

        if (category) {
            const results = [...this.data.results]
            results[index].category = category.full_name || `${category.major}/${category.minor}`
            results[index].category_id = category.id
            this.setData({ results })
        }
    },

    // 删除单条结果
    handleDeleteResult(e) {
        const index = e.currentTarget.dataset.index
        const results = [...this.data.results]
        results.splice(index, 1)
        this.setData({ results })
    },

    // 手动新增一行
    handleAddManual() {
        const newItem = {
            id: Date.now(),
            merchant: '',
            amount: 0,
            category: '',
            category_id: null,
            bill_date: this.data.billDate,
            filename: '手动录入',
            selected: true,
            is_manual: true
        }
        this.setData({
            results: [...this.data.results, newItem]
        })
    },

    // 保存全部
    async handleSaveAll() {
        const selectedResults = this.data.results.filter(r => r.selected)

        if (selectedResults.length === 0) {
            util.showToast('没有可保存的记录')
            return
        }

        // 验证
        for (const r of selectedResults) {
            if (!r.merchant.trim()) {
                util.showToast('请填写商户名称')
                return
            }
            if (!r.category) {
                util.showToast('请选择分类')
                return
            }
        }

        this.setData({ saving: true })
        util.showLoading('正在保存...')

        try {
            const bills = selectedResults.map(r => ({
                merchant: r.merchant,
                amount: r.amount,
                category: r.category,
                category_id: r.category_id,
                bill_date: r.bill_date,
                filename: r.filename,
                is_manual: r.is_manual || false,
                include_in_budget: true
            }))

            const res = await api.saveBills(bills)

            util.hideLoading()

            if (res.success) {
                util.showToast(`已保存 ${res.saved_count || bills.length} 条`, 'success')
                // 清空已保存的记录
                const remaining = this.data.results.filter(r => !r.selected)
                this.setData({ results: remaining })
            } else {
                throw new Error(res.error || '保存失败')
            }
        } catch (err) {
            util.hideLoading()
            util.showToast(err.message || '保存失败')
        } finally {
            this.setData({ saving: false })
        }
    },

    // 删除选中
    handleDeleteSelected() {
        const remaining = this.data.results.filter(r => !r.selected)
        this.setData({ results: remaining })
        util.showToast('已删除选中项')
    }
})
