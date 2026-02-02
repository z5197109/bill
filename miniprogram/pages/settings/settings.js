// pages/settings/settings.js
const api = require('../../utils/api')
const util = require('../../utils/util')

const app = getApp()

Page({
    data: {
        // 账本
        ledgers: [],
        currentLedgerId: null,
        currentLedgerIndex: 0,
        ledgerForm: { name: '', monthly_budget: '' },
        newLedgerName: '',
        newLedgerBudget: '',
        showNewLedger: false,

        // 分类
        categories: [],
        filteredCategories: [],
        categorySearch: '',
        showAddCategory: false,
        showEditCategory: false,
        editCategoryId: null,
        categoryMajor: '',
        categoryMinor: '',

        // 规则
        rules: [],
        filteredRules: [],
        ruleSearch: '',
        showAddRule: false,
        showEditRule: false,
        editRuleId: null,
        ruleKeyword: '',
        ruleCategoryIndex: 0,
        rulePriority: 2,

        // 周期性账单
        recurringRules: [],
        showAddRecurring: false,
        showEditRecurring: false,
        editRecurringId: null,
        recurringForm: {
            keyword: '',
            amount: '',
            categoryIndex: 0,
            scheduleType: 'monthly',
            dayOfMonth: 1,
            dayOfWeek: 1,
            enabled: true,
            includeInBudget: true,
            note: ''
        },

        // 模板
        templates: [],

        // 备份
        backups: [],
        showBackups: false,

        // UI状态
        activeSection: 'ledger',
        scheduleTypes: [{ value: 'monthly', label: '每月' }, { value: 'weekly', label: '每周' }],
        weekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
        monthDays: Array.from({ length: 28 }, (_, i) => i + 1)
    },

    onShow() {
        this.loadLedgers()
        this.loadCategories()
        this.loadRules()
        this.loadRecurringRules()
    },

    // === 账本管理 ===
    async loadLedgers() {
        try {
            const res = await api.getLedgers()
            if (res.success && res.ledgers) {
                const currentId = app.globalData.currentLedgerId
                const index = res.ledgers.findIndex(l => l.id === currentId)
                this.setData({
                    ledgers: res.ledgers,
                    currentLedgerId: currentId,
                    currentLedgerIndex: index >= 0 ? index : 0
                })
                this.updateCurrentLedgerForm()
            }
        } catch (err) {
            console.error('加载账本失败:', err)
        }
    },

    updateCurrentLedgerForm() {
        const current = this.data.ledgers.find(l => l.id === this.data.currentLedgerId)
        if (current) {
            this.setData({
                'ledgerForm.name': current.name,
                'ledgerForm.monthly_budget': current.monthly_budget || ''
            })
        }
    },

    handleLedgerChange(e) {
        const index = e.detail.value
        const ledger = this.data.ledgers[index]
        if (ledger) {
            app.switchLedger(ledger.id)
            this.setData({ currentLedgerId: ledger.id, currentLedgerIndex: parseInt(index) })
            this.updateCurrentLedgerForm()
            this.loadCategories()
            this.loadRules()
            this.loadRecurringRules()
        }
    },

    handleLedgerNameInput(e) { this.setData({ 'ledgerForm.name': e.detail.value }) },
    handleLedgerBudgetInput(e) { this.setData({ 'ledgerForm.monthly_budget': e.detail.value }) },

    async handleSaveLedger() {
        const { ledgerForm, currentLedgerId } = this.data
        if (!ledgerForm.name.trim()) { util.showToast('账本名称不能为空'); return }
        try {
            const res = await api.updateLedger(currentLedgerId, {
                name: ledgerForm.name,
                monthly_budget: parseFloat(ledgerForm.monthly_budget) || 0
            })
            if (res.success) { util.showToast('保存成功', 'success'); this.loadLedgers() }
        } catch (err) { util.showToast(err.message || '保存失败') }
    },

    handleShowNewLedger() { this.setData({ showNewLedger: true, newLedgerName: '', newLedgerBudget: '' }) },
    handleNewLedgerNameInput(e) { this.setData({ newLedgerName: e.detail.value }) },
    handleNewLedgerBudgetInput(e) { this.setData({ newLedgerBudget: e.detail.value }) },

    async handleCreateLedger() {
        const { newLedgerName, newLedgerBudget } = this.data
        if (!newLedgerName.trim()) { util.showToast('请输入账本名称'); return }
        try {
            const res = await api.createLedger({ name: newLedgerName, monthly_budget: parseFloat(newLedgerBudget) || 0 })
            if (res.success) {
                util.showToast('创建成功', 'success')
                app.switchLedger(res.ledger_id)
                this.setData({ showNewLedger: false, currentLedgerId: res.ledger_id })
                this.loadLedgers()
            }
        } catch (err) { util.showToast(err.message || '创建失败') }
    },

    handleCancelNewLedger() { this.setData({ showNewLedger: false }) },

    async handleDeleteLedger() {
        if (this.data.ledgers.length <= 1) { util.showToast('至少保留一个账本'); return }
        const confirm = await util.showConfirm({ title: '删除账本', content: '删除当前账本？账单将被移除，并自动生成备份。' })
        if (confirm) {
            try {
                const res = await api.deleteLedger(this.data.currentLedgerId)
                if (res.success) { util.showToast('删除成功', 'success'); this.loadLedgers() }
            } catch (err) { util.showToast(err.message || '删除失败') }
        }
    },

    // === 分类管理 ===
    async loadCategories() {
        try {
            const res = await api.getCategoryGroups()
            if (res.success && res.categories) {
                this.setData({
                    categories: res.categories,
                    filteredCategories: res.categories,
                    categorySearch: ''
                })
            }
        } catch (err) { console.error('加载分类失败:', err) }
    },

    handleCategorySearchInput(e) {
        const keyword = e.detail.value.toLowerCase()
        const filtered = this.data.categories.filter(c =>
            c.major.toLowerCase().includes(keyword) ||
            (c.minor && c.minor.toLowerCase().includes(keyword))
        )
        this.setData({ categorySearch: e.detail.value, filteredCategories: filtered })
    },

    handleShowAddCategory() {
        this.setData({ showAddCategory: true, showEditCategory: false, categoryMajor: '', categoryMinor: '' })
    },

    handleEditCategory(e) {
        const item = e.currentTarget.dataset.item
        this.setData({
            showEditCategory: true,
            showAddCategory: false,
            editCategoryId: item.id,
            categoryMajor: item.major,
            categoryMinor: item.minor || ''
        })
    },

    handleCategoryMajorInput(e) { this.setData({ categoryMajor: e.detail.value }) },
    handleCategoryMinorInput(e) { this.setData({ categoryMinor: e.detail.value }) },

    async handleSaveCategory() {
        const { categoryMajor, categoryMinor, showEditCategory, editCategoryId } = this.data
        if (!categoryMajor.trim()) { util.showToast('请输入大类'); return }
        try {
            let res
            if (showEditCategory) {
                res = await api.updateCategoryGroup(editCategoryId, { major: categoryMajor, minor: categoryMinor || '' })
            } else {
                res = await api.addCategoryGroup({ major: categoryMajor, minor: categoryMinor || '' })
            }
            if (res.success) {
                util.showToast(showEditCategory ? '修改成功' : '添加成功', 'success')
                this.setData({ showAddCategory: false, showEditCategory: false })
                this.loadCategories()
            }
        } catch (err) { util.showToast(err.message || '操作失败') }
    },

    handleCancelCategory() { this.setData({ showAddCategory: false, showEditCategory: false }) },

    async handleDeleteCategory(e) {
        const id = e.currentTarget.dataset.id
        const confirm = await util.showConfirm({ title: '删除分类', content: '确定删除该分类？' })
        if (confirm) {
            try {
                const res = await api.deleteCategoryGroup(id)
                if (res.success) { util.showToast('删除成功', 'success'); this.loadCategories() }
            } catch (err) { util.showToast(err.message || '删除失败') }
        }
    },

    // === 规则管理 ===
    async loadRules() {
        try {
            const res = await api.getCategoryRules()
            if (res.success && res.rules) {
                this.setData({
                    rules: res.rules,
                    filteredRules: res.rules,
                    ruleSearch: ''
                })
            }
        } catch (err) { console.error('加载规则失败:', err) }
    },

    handleRuleSearchInput(e) {
        const keyword = e.detail.value.toLowerCase()
        const filtered = this.data.rules.filter(r =>
            r.keyword.toLowerCase().includes(keyword) ||
            (r.category && r.category.toLowerCase().includes(keyword))
        )
        this.setData({ ruleSearch: e.detail.value, filteredRules: filtered })
    },

    handleShowAddRule() {
        this.setData({ showAddRule: true, showEditRule: false, ruleKeyword: '', ruleCategoryIndex: 0, rulePriority: 2 })
    },

    handleEditRule(e) {
        const item = e.currentTarget.dataset.item
        const catIndex = this.data.categories.findIndex(c => c.id === item.category_id)
        this.setData({
            showEditRule: true,
            showAddRule: false,
            editRuleId: item.id,
            ruleKeyword: item.keyword,
            ruleCategoryIndex: catIndex >= 0 ? catIndex : 0,
            rulePriority: item.priority || 2
        })
    },

    handleRuleKeywordInput(e) { this.setData({ ruleKeyword: e.detail.value }) },
    handleRuleCategoryChange(e) { this.setData({ ruleCategoryIndex: e.detail.value }) },
    handleRulePriorityInput(e) { this.setData({ rulePriority: parseInt(e.detail.value) || 2 }) },

    async handleSaveRule() {
        const { ruleKeyword, ruleCategoryIndex, rulePriority, categories, showEditRule, editRuleId } = this.data
        if (!ruleKeyword.trim()) { util.showToast('请输入关键词'); return }
        if (categories.length === 0) { util.showToast('请先添加分类'); return }
        const category = categories[ruleCategoryIndex]
        try {
            let res
            const data = {
                keyword: ruleKeyword,
                category_id: category.id,
                category: category.full_name || `${category.major}/${category.minor}`,
                priority: rulePriority
            }
            if (showEditRule) {
                res = await api.updateCategoryRule(editRuleId, data)
            } else {
                res = await api.addCategoryRule(data)
            }
            if (res.success) {
                util.showToast(showEditRule ? '修改成功' : '添加成功', 'success')
                this.setData({ showAddRule: false, showEditRule: false })
                this.loadRules()
            }
        } catch (err) { util.showToast(err.message || '操作失败') }
    },

    handleCancelRule() { this.setData({ showAddRule: false, showEditRule: false }) },

    async handleDeleteRule(e) {
        const id = e.currentTarget.dataset.id
        const confirm = await util.showConfirm({ title: '删除规则', content: '确定删除该规则？' })
        if (confirm) {
            try {
                const res = await api.deleteCategoryRule(id)
                if (res.success) { util.showToast('删除成功', 'success'); this.loadRules() }
            } catch (err) { util.showToast(err.message || '删除失败') }
        }
    },

    // === 周期性账单 ===
    async loadRecurringRules() {
        try {
            const res = await api.getRecurringRules()
            if (res.success && res.rules) { this.setData({ recurringRules: res.rules }) }
        } catch (err) { console.error('加载周期性规则失败:', err) }
    },

    handleShowAddRecurring() {
        this.setData({
            showAddRecurring: true,
            showEditRecurring: false,
            recurringForm: { keyword: '', amount: '', categoryIndex: 0, scheduleType: 'monthly', dayOfMonth: 1, dayOfWeek: 1, enabled: true, includeInBudget: true, note: '' }
        })
    },

    handleEditRecurring(e) {
        const item = e.currentTarget.dataset.item
        const catIndex = this.data.categories.findIndex(c => c.id === item.category_id)
        this.setData({
            showEditRecurring: true,
            showAddRecurring: false,
            editRecurringId: item.id,
            recurringForm: {
                keyword: item.keyword,
                amount: item.amount,
                categoryIndex: catIndex >= 0 ? catIndex : 0,
                scheduleType: item.schedule_type || 'monthly',
                dayOfMonth: item.day_of_month || 1,
                dayOfWeek: item.day_of_week || 1,
                enabled: item.enabled !== false,
                includeInBudget: item.include_in_budget !== false,
                note: item.note || ''
            }
        })
    },

    handleRecurringInput(e) {
        const field = e.currentTarget.dataset.field
        this.setData({ [`recurringForm.${field}`]: e.detail.value })
    },

    handleRecurringSwitch(e) {
        const field = e.currentTarget.dataset.field
        this.setData({ [`recurringForm.${field}`]: e.detail.value })
    },

    handleRecurringCategoryChange(e) { this.setData({ 'recurringForm.categoryIndex': e.detail.value }) },
    handleScheduleTypeChange(e) { this.setData({ 'recurringForm.scheduleType': this.data.scheduleTypes[e.detail.value].value }) },
    handleDayOfMonthChange(e) { this.setData({ 'recurringForm.dayOfMonth': this.data.monthDays[e.detail.value] }) },
    handleDayOfWeekChange(e) { this.setData({ 'recurringForm.dayOfWeek': parseInt(e.detail.value) + 1 }) },

    async handleSaveRecurring() {
        const { recurringForm, categories, showEditRecurring, editRecurringId } = this.data
        if (!recurringForm.keyword.trim()) { util.showToast('请输入关键词'); return }
        if (!recurringForm.amount) { util.showToast('请输入金额'); return }
        const category = categories[recurringForm.categoryIndex]
        try {
            const data = {
                keyword: recurringForm.keyword,
                amount: parseFloat(recurringForm.amount),
                category_id: category?.id,
                category: category?.full_name || '',
                schedule_type: recurringForm.scheduleType,
                day_of_month: recurringForm.dayOfMonth,
                day_of_week: recurringForm.dayOfWeek,
                enabled: recurringForm.enabled,
                include_in_budget: recurringForm.includeInBudget,
                note: recurringForm.note
            }
            let res
            if (showEditRecurring) {
                res = await api.updateRecurringRule(editRecurringId, data)
            } else {
                res = await api.addRecurringRule(data)
            }
            if (res.success) {
                util.showToast(showEditRecurring ? '修改成功' : '添加成功', 'success')
                this.setData({ showAddRecurring: false, showEditRecurring: false })
                this.loadRecurringRules()
            }
        } catch (err) { util.showToast(err.message || '操作失败') }
    },

    handleCancelRecurring() { this.setData({ showAddRecurring: false, showEditRecurring: false }) },

    async handleDeleteRecurring(e) {
        const id = e.currentTarget.dataset.id
        const confirm = await util.showConfirm({ title: '删除周期性账单', content: '确定删除该周期性账单？' })
        if (confirm) {
            try {
                const res = await api.deleteRecurringRule(id)
                if (res.success) { util.showToast('删除成功', 'success'); this.loadRecurringRules() }
            } catch (err) { util.showToast(err.message || '删除失败') }
        }
    },

    // === 备份管理 ===
    async loadBackups() {
        try {
            const res = await api.getLedgerBackups()
            if (res.success && res.backups) { this.setData({ backups: res.backups, showBackups: true }) }
        } catch (err) { util.showToast('加载备份失败') }
    },

    async handleRestoreBackup(e) {
        const backupId = e.currentTarget.dataset.id
        const confirm = await util.showConfirm({ title: '恢复备份', content: '将覆盖当前账本数据，确定恢复？' })
        if (confirm) {
            try {
                const res = await api.restoreLedgerBackup(backupId)
                if (res.success) {
                    util.showToast('恢复成功', 'success')
                    this.setData({ showBackups: false })
                    this.loadLedgers()
                }
            } catch (err) { util.showToast(err.message || '恢复失败') }
        }
    },

    async handleDeleteBackup(e) {
        const backupId = e.currentTarget.dataset.id
        const confirm = await util.showConfirm({ title: '删除备份', content: '确定删除该备份？' })
        if (confirm) {
            try {
                const res = await api.deleteLedgerBackup(backupId)
                if (res.success) { util.showToast('删除成功', 'success'); this.loadBackups() }
            } catch (err) { util.showToast(err.message || '删除失败') }
        }
    },

    handleCloseBackups() { this.setData({ showBackups: false }) },

    // === 模板管理 ===
    async loadTemplates() {
        try {
            const res = await api.getTemplates()
            if (res.success && res.data) {
                this.setData({ templates: res.data })
            }
        } catch (err) { console.error('加载模板失败:', err) }
    },

    async handleDeleteTemplate(e) {
        const name = e.currentTarget.dataset.name
        const confirm = await util.showConfirm({ title: '删除模板', content: `确定删除模板"${name}"？` })
        if (confirm) {
            try {
                const res = await api.deleteTemplate(name)
                if (res.success) {
                    util.showToast('删除成功', 'success')
                    this.loadTemplates()
                }
            } catch (err) { util.showToast(err.message || '删除失败') }
        }
    },

    // === 切换区块 ===
    handleSectionChange(e) {
        const section = e.currentTarget.dataset.section
        this.setData({ activeSection: section })
        // 切换到模板标签时加载模板
        if (section === 'template') {
            this.loadTemplates()
        }
    }
})
