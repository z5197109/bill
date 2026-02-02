// pages/bill-edit/bill-edit.js
const api = require('../../utils/api')
const util = require('../../utils/util')

const app = getApp()

Page({
    data: {
        billId: null,
        bill: null,
        loading: true,
        saving: false,
        categories: [],
        categoryIndex: 0,
        // 表单字段
        merchant: '',
        amount: '',
        date: '',
        note: '',
        includeInBudget: true
    },

    onLoad(options) {
        if (options.id) {
            this.setData({ billId: options.id })
            this.loadCategories()
            this.loadBill(options.id)
        } else {
            // 新增模式
            this.setData({
                loading: false,
                date: util.today(),
                includeInBudget: true
            })
            this.loadCategories()
        }
    },

    async loadCategories() {
        try {
            const res = await api.getCategoryGroups()
            if (res.success && res.categories) {
                this.setData({ categories: res.categories })
            }
        } catch (err) {
            console.error('加载分类失败:', err)
        }
    },

    async loadBill(id) {
        try {
            const res = await api.getBills({ bill_id: id })
            if (res.success && res.bills && res.bills.length > 0) {
                const bill = res.bills[0]
                const catIndex = this.data.categories.findIndex(c => c.id === bill.category_id)
                this.setData({
                    bill,
                    loading: false,
                    merchant: bill.merchant || '',
                    amount: bill.amount || '',
                    date: bill.date || '',
                    note: bill.note || '',
                    includeInBudget: bill.include_in_budget !== false,
                    categoryIndex: catIndex >= 0 ? catIndex : 0
                })
            } else {
                util.showToast('账单不存在')
                setTimeout(() => wx.navigateBack(), 1000)
            }
        } catch (err) {
            this.setData({ loading: false })
            util.showToast(err.message || '加载失败')
        }
    },

    handleMerchantInput(e) { this.setData({ merchant: e.detail.value }) },
    handleAmountInput(e) { this.setData({ amount: e.detail.value }) },
    handleDateChange(e) { this.setData({ date: e.detail.value }) },
    handleNoteInput(e) { this.setData({ note: e.detail.value }) },
    handleCategoryChange(e) { this.setData({ categoryIndex: e.detail.value }) },
    handleBudgetSwitch(e) { this.setData({ includeInBudget: e.detail.value }) },

    async handleSave() {
        const { billId, merchant, amount, date, note, includeInBudget, categories, categoryIndex } = this.data

        if (!merchant.trim()) { util.showToast('请输入商户名称'); return }
        if (!amount) { util.showToast('请输入金额'); return }
        if (!date) { util.showToast('请选择日期'); return }

        const category = categories[categoryIndex]

        this.setData({ saving: true })

        try {
            const data = {
                merchant,
                amount: parseFloat(amount),
                date,
                note,
                include_in_budget: includeInBudget,
                category_id: category?.id,
                category: category?.full_name || ''
            }

            let res
            if (billId) {
                res = await api.updateBill(billId, data)
            } else {
                res = await api.createBill(data)
            }

            if (res.success) {
                util.showToast(billId ? '修改成功' : '创建成功', 'success')
                setTimeout(() => wx.navigateBack(), 1000)
            } else {
                throw new Error(res.error || '保存失败')
            }
        } catch (err) {
            util.showToast(err.message || '保存失败')
        } finally {
            this.setData({ saving: false })
        }
    },

    async handleDelete() {
        const confirm = await util.showConfirm({
            title: '删除账单',
            content: '确定删除这条账单吗？'
        })

        if (confirm) {
            try {
                const res = await api.deleteBill(this.data.billId)
                if (res.success) {
                    util.showToast('删除成功', 'success')
                    setTimeout(() => wx.navigateBack(), 1000)
                }
            } catch (err) {
                util.showToast(err.message || '删除失败')
            }
        }
    },

    handleCancel() {
        wx.navigateBack()
    }
})
