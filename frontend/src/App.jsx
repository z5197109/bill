import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  DeleteOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import moment from 'moment'
import Dashboard from './Dashboard'
import { TemplateWizardModal } from './components'
import './App.css'
import './Dashboard.css'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const I18N = {
    appTitle: '账单助手 - React',
    appSubtitle: '上传识别、消费分析、分类配置',
    tabs: ['财务看板', '上传识别', '消费分析', '设置'],
    settings: {
      categories: '分类与规则',
      ledger: '账本',
    },
    ledger: {
      label: '账本',
      section: '账本',
      reload: '刷新账本',
      name: '名称',
      budget: '月预算',
      save: '保存',
      delete: '删除',
      newLedger: '新建账本',
      create: '创建',
      deleteConfirm: '删除当前账本？账单将被移除。',
    },
    upload: {
      title: '上传识别',
      drop: '将图片拖到此处或',
      choose: '选择文件',
      billDate: '账单日期',
      today: '今天',
      run: '开始识别',
      addManual: '手动新增一行',
      results: '识别结果',
      saveAll: '保存全部',
      deleteSelected: '删除选中',
      headers: ['文件', '商户 / 关键词', '金额', '分类', '日期'],
    },
    analytics: {
      title: '消费分析',
      keywordPH: '关键词',
      allMajors: '全部大类',
      allMinors: '全部小类',
      rangeToday: '今天',
      rangeWeek: '7天',
      rangeMonth: '1个月',
      rangeYear: '1年',
      refresh: '刷新',
      reset: '重置',
      totalAmount: '总金额',
      count: '笔数',
      daysCovered: '覆盖天数',
      dailyAvg: '日均',
      includeInBudget: '计入预算',
      headers: ['日期', '商户', '分类', '金额'],
      prev: '上一页',
      next: '下一页',
    },
    config: {
      categoriesTitle: '分类列表',
      major: '大类',
      minor: '小类',
      scope: '作用域',
      scopeCurrent: '当前账本',
      scopeGlobal: '跨账本',
      addCategory: '添加分类',
      noCategories: '暂无分类，请在上方添加。',
      rulesTitle: '分类规则',
      keyword: '关键词',
      category: '分类',
      priority: '优先级',
      addRule: '添加规则',
      action: '操作',
      delete: '删除',
      tableHeaders: ['关键词', '分类', '优先级', '操作'],
      createButton: '新增',
      manageButton: '查看修改',
      createCategoryTitle: '新增分类',
      manageCategoryTitle: '查看修改分类',
      createRuleTitle: '新增规则',
      manageRuleTitle: '查看修改规则',
      filterKeyword: '关键词',
      filterMajor: '大类',
      filterMinor: '小类',
    },
    recurring: {
      title: '周期性账单',
      amount: '金额',
      keyword: '关键词',
      category: '分类',
      note: '备注',
      scheduleType: '循环方式',
      scheduleWeekly: '每周',
      scheduleMonthly: '每月',
      weekday: '星期',
      monthDay: '日期',
      scheduleValue: '日期/星期',
      startDate: '开始日期',
      endDate: '结束日期',
      enabled: '启用',
      includeInBudget: '计入预算',
      add: '新增规则',
      createTitle: '新增周期性账单',
      manageTitle: '查看修改周期性账单',
      createButton: '新增',
      manageButton: '查看修改',
    },
    toasts: {
      loadLedgersFail: '加载账本失败',
      ledgerSaved: '账本已保存',
      ledgerSaveFail: '保存失败',
      ledgerNameRequired: '账本名称不能为空',
      ledgerCreated: '新账本已创建',
      ledgerCreateFail: '创建失败',
      ledgerDeleted: '账本已删除',
      ledgerDeleteFail: '删除失败',
      enterLedgerName: '请输入账本名称',
      loadCategoriesFail: '加载分类失败',
      loadRulesFail: '加载规则失败',
      categoryAdded: '分类已添加',
      categoryUpdated: '分类已更新',
      categoryAddFail: '添加分类失败',
      categoryDeleted: '分类已删除',
      categoryDeleteFail: '删除分类失败',
      ruleAdded: '规则已添加',
      ruleUpdated: '规则已更新',
      ruleAddFail: '添加规则失败',
      ruleDeleted: '规则已删除',
      ruleDeleteFail: '删除规则失败',
      chooseImage: '请先选择图片文件',
      skipDup: '已跳过重复文件',
      uploadFail: '上传失败',
      ocrDone: '识别完成：{count} 条记录',
      saveNone: '没有可保存的记录',
      saveFail: '保存失败',
      saveDone: '已保存',
      refreshFail: '刷新失败',
      loadRecurringFail: '加载周期性规则失败',
      recurringAdded: '周期性规则已添加',
      recurringAddFail: '添加周期性规则失败',
      recurringUpdated: '周期性规则已更新',
      recurringUpdateFail: '更新周期性规则失败',
      recurringDeleted: '周期性规则已删除',
      recurringDeleteFail: '删除周期性规则失败',
    },
    confirm: {
      deleteCategory: '删除该分类？',
      deleteRule: '删除该规则？',
      deleteRecurring: '删除该周期性规则？',
    },
  }

const today = () => moment().format('YYYY-MM-DD')
const buildQuery = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()

const numberOrZero = (val) => {
  const n = Number(val)
  return Number.isNaN(n) ? 0 : n
}

const normalizeSortOrder = (order) => {
  if (order === 'ascend') return 'asc'
  if (order === 'descend') return 'desc'
  return ''
}

const fileKey = (file) => `${file.name}|${file.size}|${file.lastModified}`

function App() {
  const [tab, setTab] = useState('dashboard')
  const [ledgers, setLedgers] = useState([])
  const [currentLedgerId, setCurrentLedgerId] = useState(null)
  const [ledgerForm, setLedgerForm] = useState({ name: '', monthly_budget: '' })
  const [newLedger, setNewLedger] = useState({ name: '', monthly_budget: '' })

  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [recurringRules, setRecurringRules] = useState([])

  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadDate, setUploadDate] = useState(today())
  const [results, setResults] = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [analyticsFilters, setAnalyticsFilters] = useState({
    keyword: '',
    major: '',
    minor: '',
    start_date: today(),
    end_date: today(),
  })
  const [analyticsSummary, setAnalyticsSummary] = useState(null)
  const [analyticsItems, setAnalyticsItems] = useState([])
  const [analyticsTotal, setAnalyticsTotal] = useState(0)
  const [analyticsPage, setAnalyticsPage] = useState(1)
  const [analyticsSort, setAnalyticsSort] = useState({ field: '', order: '' })
  const pageSize = 20
  const [billEditOpen, setBillEditOpen] = useState(false)
  const [billEditForm, setBillEditForm] = useState({
    id: null,
    merchant: '',
    amount: 0,
    major: '',
    minor: '',
    category_id: null,
    category: '',
    bill_date: '',
    include_in_budget: true,
  })

  // Dashboard refresh trigger
  const [dashboardRefreshTrigger, setDashboardRefreshTrigger] = useState(null)

  const [catForm, setCatForm] = useState({ major: '', minor: '', scope: 'current' })
  const [ruleForm, setRuleForm] = useState({
    keyword: '',
    major: '',
    minor: '',
    category: '',
    category_id: null,
    priority: 2,
    scope: 'current',
  })

  const [recurringForm, setRecurringForm] = useState({
    amount: '',
    keyword: '',
    category_id: null,
    category: '',
    note: '',
    schedule_type: 'weekly',
    schedule_value: [1],
    start_date: today(),
    end_date: '',
    enabled: true,
    include_in_budget: true,
  })

  const [recurringCreateOpen, setRecurringCreateOpen] = useState(false)
  const [recurringManageOpen, setRecurringManageOpen] = useState(false)
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false)
  const [categoryManageOpen, setCategoryManageOpen] = useState(false)
  const [ruleCreateOpen, setRuleCreateOpen] = useState(false)
  const [ruleManageOpen, setRuleManageOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState({ keyword: '', major: '', minor: '' })
  const [ruleFilter, setRuleFilter] = useState({ keyword: '', major: '', minor: '' })
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const [messageApi, contextHolder] = message.useMessage()

  // Helper function to trigger dashboard refresh
  const triggerDashboardRefresh = () => {
    setDashboardRefreshTrigger(Date.now())
  }

  const t = (keyPath) => keyPath.split('.').reduce((acc, cur) => (acc ? acc[cur] : undefined), I18N) || keyPath
  const currency = '¥'

  useEffect(() => {
    loadLedgers()
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = today()
      setUploadDate((prev) => (prev === now ? prev : now))
      setAnalyticsFilters((prev) => {
        if (prev.start_date === prev.end_date && prev.start_date !== now) {
          return { ...prev, start_date: now, end_date: now }
        }
        return prev
      })
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const current = ledgers.find((l) => l.id === currentLedgerId)
    if (current) {
      setLedgerForm({
        name: current.name,
        monthly_budget: current.monthly_budget ?? '',
      })
    }
  }, [currentLedgerId, ledgers])

  useEffect(() => {
    if (currentLedgerId !== null) {
      loadCategories()
      loadRules()
      loadRecurringRules()
      refreshAnalytics(1)
    }
  }, [currentLedgerId])

  const withLedgerParams = (params = {}) => ({
    ...params,
    ledger_id: currentLedgerId ?? '',
  })

  const pushToast = (messageText, tone = 'info') => {
    const type = tone === 'warn' ? 'warning' : tone
    messageApi.open({ type, content: messageText })
  }

  const autoDetectCategory = (text) => {
    if (!text) return ''
    const needle = text.toLowerCase()
    const sorted = [...rules].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    const hit = sorted.find((r) => needle.includes((r.keyword || '').toLowerCase()))
    return hit ? hit.category : ''
  }

  const majorOptions = useMemo(
    () => Array.from(new Set(categories.map((c) => c.major))).filter(Boolean),
    [categories],
  )

  const minorOptions = useMemo(() => {
    if (!analyticsFilters.major) return categories
    return categories.filter((c) => c.major === analyticsFilters.major)
  }, [categories, analyticsFilters.major])

  const ruleMajorOptions = useMemo(
    () => Array.from(new Set(categories.map((c) => c.major))).filter(Boolean),
    [categories],
  )

  const ruleMinorOptions = useMemo(() => {
    if (!ruleForm.major) return []
    return categories.filter((c) => c.major === ruleForm.major)
  }, [categories, ruleForm.major])

  const weekdayOptions = [
    { label: '周一', value: 1 },
    { label: '周二', value: 2 },
    { label: '周三', value: 3 },
    { label: '周四', value: 4 },
    { label: '周五', value: 5 },
    { label: '周六', value: 6 },
    { label: '周日', value: 7 },
  ]

  const monthDayOptions = useMemo(
    () => Array.from({ length: 31 }, (_, idx) => ({ label: `${idx + 1}日`, value: idx + 1 })),
    [],
  )

  const categoryFilterMinorOptions = useMemo(() => {
    if (!categoryFilter.major) return categories
    return categories.filter((c) => c.major === categoryFilter.major)
  }, [categories, categoryFilter.major])

  const categoryFiltered = useMemo(() => {
    const keyword = categoryFilter.keyword.trim().toLowerCase()
    return categories.filter((c) => {
      if (categoryFilter.major && c.major !== categoryFilter.major) return false
      if (categoryFilter.minor && c.minor !== categoryFilter.minor) return false
      if (!keyword) return true
      const text = `${c.major || ''}/${c.minor || ''}`.toLowerCase()
      return text.includes(keyword)
    })
  }, [categories, categoryFilter])

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const ruleFilterMinorOptions = useMemo(() => {
    if (!ruleFilter.major) return categories
    return categories.filter((c) => c.major === ruleFilter.major)
  }, [categories, ruleFilter.major])

  const rulesFiltered = useMemo(() => {
    const keyword = ruleFilter.keyword.trim().toLowerCase()
    return rules.filter((r) => {
      const cat = categoryById.get(r.category_id)
      const major = cat?.major || (r.category || '').split('/')[0] || ''
      const minor = cat?.minor || (r.category || '').split('/')[1] || ''
      if (ruleFilter.major && major !== ruleFilter.major) return false
      if (ruleFilter.minor && minor !== ruleFilter.minor) return false
      if (!keyword) return true
      const text = `${r.keyword || ''} ${r.category || ''}`.toLowerCase()
      return text.includes(keyword)
    })
  }, [rules, ruleFilter, categoryById])

  const billEditMinorOptions = useMemo(() => {
    if (!billEditForm.major) return categories
    return categories.filter((c) => c.major === billEditForm.major)
  }, [categories, billEditForm.major])

  const loadLedgers = async () => {
    try {
      const res = await fetch('/api/ledgers')
      const data = await res.json()
      if (data.success) {
        setLedgers(data.ledgers || [])
        if ((data.ledgers || []).length && currentLedgerId === null) {
          setCurrentLedgerId(data.ledgers[0].id)
        }
      } else {
        pushToast(data.error || t('toasts.loadLedgersFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.loadLedgersFail'), 'error')
    }
  }

  const saveLedger = async () => {
    if (!ledgerForm.name.trim()) {
      pushToast(t('toasts.ledgerNameRequired'), 'warn')
      return
    }
    try {
      const payload = {
        name: ledgerForm.name,
        monthly_budget: numberOrZero(ledgerForm.monthly_budget),
      }
      const res = await fetch(`/api/ledgers/${currentLedgerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.ledgerSaved'), 'success')
        loadLedgers()
        // Trigger dashboard refresh after budget update
        triggerDashboardRefresh()
      } else {
        pushToast(data.error || t('toasts.ledgerSaveFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.ledgerSaveFail'), 'error')
    }
  }

  const createLedger = async () => {
    if (!newLedger.name.trim()) {
      pushToast(t('toasts.enterLedgerName'), 'warn')
      return
    }
    try {
      const res = await fetch('/api/ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLedger.name,
          monthly_budget: numberOrZero(newLedger.monthly_budget),
        }),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.ledgerCreated'), 'success')
        setNewLedger({ name: '', monthly_budget: '' })
        setCurrentLedgerId(data.ledger_id)
        loadLedgers()
      } else {
        pushToast(data.error || t('toasts.ledgerCreateFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.ledgerCreateFail'), 'error')
    }
  }

  const deleteLedger = () => {
    if (!currentLedgerId) {
      message.warning('请先选择一个账本')
      return
    }
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    try {
      const res = await fetch(`/api/ledgers/${currentLedgerId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.ledgerDeleted'), 'success')
        setCurrentLedgerId(null)
        loadLedgers()
        // Refresh page after successful deletion
        setTimeout(() => {
          window.location.reload()
        }, 500)
      } else {
        pushToast(data.error || t('toasts.ledgerDeleteFail'), 'error')
      }
    } catch (err) {
      console.error('Delete error:', err)
      pushToast(t('toasts.ledgerDeleteFail'), 'error')
    } finally {
      setDeleteConfirmOpen(false)
    }
  }

  const loadCategories = async () => {
    if (currentLedgerId === null) {
      return
    }
    try {
      const res = await fetch(`/api/config/category-groups?${buildQuery(withLedgerParams({}))}`)
      const data = await res.json()
      if (data.success) {
        setCategories(data.categories || [])
      }
    } catch {
      pushToast(t('toasts.loadCategoriesFail'), 'error')
    }
  }

  const loadRules = async () => {
    if (currentLedgerId === null) {
      return
    }
    try {
      const res = await fetch(`/api/config/categories?${buildQuery(withLedgerParams({}))}`)
      const data = await res.json()
      if (data.success) {
        setRules(data.rules || [])
      }
    } catch {
      pushToast(t('toasts.loadRulesFail'), 'error')
    }
  }

  const loadRecurringRules = async () => {
    if (currentLedgerId === null) {
      return
    }
    try {
      const res = await fetch(`/api/recurring-rules?${buildQuery(withLedgerParams({}))}`)
      const data = await res.json()
      if (data.success) {
        const normalized = (data.rules || []).map((rule) => ({
          ...rule,
          schedule_value: normalizeScheduleValues(rule.schedule_type, rule.schedule_value),
          include_in_budget: rule.include_in_budget !== false,
        }))
        setRecurringRules(normalized)
      } else {
        pushToast(data.error || t('toasts.loadRecurringFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.loadRecurringFail'), 'error')
    }
  }

  const addCategoryGroup = async () => {
    if (!catForm.major.trim()) {
      pushToast(t('toasts.categoryAddFail'), 'warn')
      return false
    }
    try {
      const payload = {
        major: catForm.major.trim(),
        minor: catForm.minor.trim(),
        ledger_id: catForm.scope === 'global' ? null : currentLedgerId,
      }
      const res = await fetch('/api/config/category-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.categoryAdded'), 'success')
        setCatForm({ major: '', minor: '', scope: catForm.scope })
        loadCategories()
        return true
      } else {
        pushToast(data.error || t('toasts.categoryAddFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.categoryAddFail'), 'error')
    }
    return false
  }

  const deleteCategory = (id) => {
    Modal.confirm({
      title: t('confirm.deleteCategory'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch(`/api/config/category-groups/${id}`, { method: 'DELETE' })
          const data = await res.json()
          if (data.success) {
            pushToast(t('toasts.categoryDeleted'), 'success')
            loadCategories()
          } else {
            pushToast(data.error || t('toasts.categoryDeleteFail'), 'error')
          }
        } catch {
          pushToast(t('toasts.categoryDeleteFail'), 'error')
        }
      },
    })
  }

  const addRule = async () => {
    const categoryRecord =
      (ruleForm.category_id && categories.find((c) => c.id === ruleForm.category_id)) ||
      categories.find((c) => c.full_name === ruleForm.category)
    const categoryName = categoryRecord?.full_name || ruleForm.category
    const categoryId = ruleForm.category_id ?? categoryRecord?.id ?? null
    if (!ruleForm.keyword.trim() || !categoryName) {
      pushToast(t('toasts.ruleAddFail'), 'warn')
      return false
    }
    try {
      const payload = {
        keyword: ruleForm.keyword.trim(),
        category: categoryName,
        category_id: categoryId,
        priority: Number(ruleForm.priority) || 2,
        ledger_id: ruleForm.scope === 'global' ? null : currentLedgerId,
      }
      const res = await fetch('/api/config/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.ruleAdded'), 'success')
        setRuleForm({
          keyword: '',
          major: '',
          minor: '',
          category: '',
          category_id: null,
          priority: 2,
          scope: ruleForm.scope,
        })
        loadRules()
        return true
      } else {
        pushToast(data.error || t('toasts.ruleAddFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.ruleAddFail'), 'error')
    }
    return false
  }

  const deleteRule = (id) => {
    Modal.confirm({
      title: t('confirm.deleteRule'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch(`/api/config/categories/${id}`, { method: 'DELETE' })
          const data = await res.json()
          if (data.success) {
            pushToast(t('toasts.ruleDeleted'), 'success')
            loadRules()
          } else {
            pushToast(data.error || t('toasts.ruleDeleteFail'), 'error')
          }
        } catch {
          pushToast(t('toasts.ruleDeleteFail'), 'error')
        }
      },
    })
  }


  const updateCategoryField = (id, field, value) => {
    setCategories((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const saveCategoryGroup = async (record) => {
    const major = String(record.major || '').trim()
    const minor = String(record.minor || '').trim()
    if (!major) {
      pushToast(t('toasts.categoryAddFail'), 'warn')
      return
    }
    try {
      const res = await fetch(
        `/api/config/category-groups/${record.id}?${buildQuery(withLedgerParams({}))}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ major, minor }),
        },
      )
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.categoryUpdated'), 'success')
        loadCategories()
        loadRules()
      } else {
        pushToast(data.error || t('toasts.categoryAddFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.categoryAddFail'), 'error')
    }
  }

  const updateRuleField = (id, field, value) => {
    setRules((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const handleRuleMajorChange = (value) => {
    setRuleForm((prev) => ({
      ...prev,
      major: value || '',
      minor: '',
      category: '',
      category_id: null,
    }))
  }

  const handleRuleMinorChange = (value) => {
    const match = categories.find((c) => c.id === value)
    setRuleForm((prev) => ({
      ...prev,
      minor: match?.minor || '',
      category: match?.full_name || '',
      category_id: match ? match.id : null,
    }))
  }

  const handleRuleCategoryChange = (id, value) => {
    const match = categories.find((c) => c.full_name === value)
    updateRuleField(id, 'category', value || '')
    updateRuleField(id, 'category_id', match ? match.id : null)
  }

  const saveRule = async (record) => {
    const keyword = String(record.keyword || '').trim()
    const category = String(record.category || '').trim()
    const priority = Number(record.priority) || 2
    if (!keyword || !category) {
      pushToast(t('toasts.ruleAddFail'), 'warn')
      return
    }
    try {
      const res = await fetch(`/api/config/categories/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          category,
          category_id: record.category_id,
          priority,
        }),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.ruleUpdated'), 'success')
        loadRules()
      } else {
        pushToast(data.error || t('toasts.ruleAddFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.ruleAddFail'), 'error')
    }
  }

  const normalizeScheduleValues = (type, value) => {
    const values = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : []
    const limit = type === 'weekly' ? 7 : 31
    const normalized = values
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= limit)
    return Array.from(new Set(normalized)).sort((a, b) => a - b)
  }

  const handleRecurringCategoryChange = (value) => {
    const match = categories.find((c) => c.id === value)
    setRecurringForm((prev) => ({
      ...prev,
      category_id: value || null,
      category: match ? match.full_name : '',
    }))
  }

  const handleRecurringScheduleTypeChange = (value) => {
    setRecurringForm((prev) => ({
      ...prev,
      schedule_type: value,
      schedule_value: normalizeScheduleValues(value, prev.schedule_value).length
        ? normalizeScheduleValues(value, prev.schedule_value)
        : [1],
    }))
  }

  const handleRecurringStartDateChange = (date) => {
    const start = date ? date.format('YYYY-MM-DD') : ''
    setRecurringForm((prev) => ({
      ...prev,
      start_date: start,
      end_date: prev.end_date && start && prev.end_date < start ? start : prev.end_date,
    }))
  }

  const updateRecurringRuleField = (id, field, value) => {
    setRecurringRules((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const handleRecurringRuleCategoryChange = (id, value) => {
    const match = categories.find((c) => c.id === value)
    setRecurringRules((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, category_id: value || null, category: match ? match.full_name : '' }
          : item,
      ),
    )
  }

  const handleRecurringRuleScheduleTypeChange = (id, value) => {
    setRecurringRules((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const normalized = normalizeScheduleValues(value, item.schedule_value)
        return {
          ...item,
          schedule_type: value,
          schedule_value: normalized.length ? normalized : [1],
        }
      }),
    )
  }

  const handleRecurringRuleStartDateChange = (id, date) => {
    const start = date ? date.format('YYYY-MM-DD') : ''
    setRecurringRules((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              start_date: start,
              end_date: item.end_date && start && item.end_date < start ? start : item.end_date,
            }
          : item,
      ),
    )
  }

  const addRecurringRule = async () => {
    if (!recurringForm.category_id && !recurringForm.category) {
      pushToast(t('toasts.recurringAddFail'), 'warn')
      return false
    }
    if (!recurringForm.start_date) {
      pushToast(t('toasts.recurringAddFail'), 'warn')
      return false
    }
    const scheduleValues = normalizeScheduleValues(recurringForm.schedule_type, recurringForm.schedule_value)
    if (!scheduleValues.length) {
      pushToast(t('toasts.recurringAddFail'), 'warn')
      return false
    }
    const payload = {
      amount: numberOrZero(recurringForm.amount),
      keyword: recurringForm.keyword,
      category_id: recurringForm.category_id,
      category: recurringForm.category,
      note: recurringForm.note,
      schedule_type: recurringForm.schedule_type,
      schedule_value: scheduleValues,
      start_date: recurringForm.start_date,
      end_date: recurringForm.end_date || null,
      enabled: recurringForm.enabled,
      include_in_budget: recurringForm.include_in_budget,
      ledger_id: currentLedgerId,
    }
    try {
      const res = await fetch('/api/recurring-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.recurringAdded'), 'success')
        setRecurringForm({
          amount: '',
          keyword: '',
          category_id: null,
          category: '',
          note: '',
          schedule_type: 'weekly',
          schedule_value: [1],
          start_date: today(),
          end_date: '',
          enabled: true,
          include_in_budget: true,
        })
        loadRecurringRules()
        return true
      } else {
        pushToast(data.error || t('toasts.recurringAddFail'), 'error')
        return false
      }
    } catch {
      pushToast(t('toasts.recurringAddFail'), 'error')
    }
    return false
  }

  const saveRecurringRule = async (record) => {
    const scheduleValues = normalizeScheduleValues(record.schedule_type, record.schedule_value)
    if (!scheduleValues.length) {
      pushToast(t('toasts.recurringUpdateFail'), 'warn')
      return
    }
    const payload = {
      amount: numberOrZero(record.amount),
      keyword: record.keyword,
      category_id: record.category_id,
      category: record.category,
      note: record.note,
      schedule_type: record.schedule_type,
      schedule_value: scheduleValues,
      start_date: record.start_date,
      end_date: record.end_date || null,
      enabled: record.enabled,
      include_in_budget: record.include_in_budget,
    }
    try {
      const res = await fetch(`/api/recurring-rules/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.recurringUpdated'), 'success')
        loadRecurringRules()
      } else {
        pushToast(data.error || t('toasts.recurringUpdateFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.recurringUpdateFail'), 'error')
    }
  }

  const deleteRecurringRule = (id) => {
    Modal.confirm({
      title: t('confirm.deleteRecurring'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch(`/api/recurring-rules/${id}`, { method: 'DELETE' })
          const data = await res.json()
          if (data.success) {
            pushToast(t('toasts.recurringDeleted'), 'success')
            loadRecurringRules()
          } else {
            pushToast(data.error || t('toasts.recurringDeleteFail'), 'error')
          }
        } catch {
          pushToast(t('toasts.recurringDeleteFail'), 'error')
        }
      },
    })
  }

  const handleFileInput = (fileList) => {
    const incoming = Array.from(fileList || [])
    if (!incoming.length) return
    setSelectedFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => fileKey(f)))
      const toAdd = incoming.filter((f) => !existingKeys.has(fileKey(f)))
      if (toAdd.length < incoming.length) {
        pushToast(t('toasts.skipDup'), 'warn')
      }
      return [...prev, ...toAdd]
    })
  }

  const mapResult = (r, isManual = false) => {
    const auto = !r.category ? autoDetectCategory(r.merchant || r.filename) : ''
    return {
      clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename: r.filename || `manual-${Date.now()}`,
      merchant: r.merchant || '',
      amount: Number(r.amount || 0),
      category: r.category || auto || '',
      bill_date: r.bill_date || uploadDate,
      ledger_id: currentLedgerId,
      raw_text: r.raw_text || [],
      is_manual: isManual,
      selected: false,
      error: r.error,
    }
  }

  const processFiles = async () => {
    if (!selectedFiles.length) {
      pushToast(t('toasts.chooseImage'), 'warn')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      selectedFiles.forEach((f) => form.append('files', f))
      form.append('bill_date', uploadDate)
      if (currentLedgerId !== null) {
        form.append('ledger_id', currentLedgerId)
      }
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (data.success) {
        const newItems = (data.results || []).map((r) => mapResult(r, false))
        setResults((prev) => [...prev, ...newItems])
        setSelectedFiles([])
        if (data.errors && data.errors.length) {
          data.errors.forEach((err) => pushToast(err, 'warn'))
        }
        pushToast(t('toasts.ocrDone').replace('{count}', newItems.length), 'success')
        scrollToBottom()
      } else {
        pushToast(data.error || t('toasts.uploadFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.uploadFail'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const addManualRow = () => {
    setResults((prev) => [...prev, mapResult({ filename: 'manual' }, true)])
    scrollToBottom()
  }

  const updateResult = (id, field, value) => {
    setResults((prev) =>
      prev.map((item) => {
        if (item.clientId !== id) return item
        const next = { ...item, [field]: value }
        if (field === 'merchant') {
          const auto = autoDetectCategory(value)
          if (auto) next.category = auto
        }
        return next
      }),
    )
  }

  const toggleResult = (id, checked) => {
    setResults((prev) => prev.map((item) => (item.clientId === id ? { ...item, selected: checked } : item)))
  }

  const bulkDelete = () => {
    setResults((prev) => prev.filter((r) => !r.selected))
  }

  const saveResults = async () => {
    if (!results.length) {
      pushToast(t('toasts.saveNone'), 'warn')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ledger_id: currentLedgerId,
        bills: results.map((r) => ({
          filename: r.filename || 'manual',
          merchant: r.merchant || '',
          amount: Number(r.amount || 0),
          category: r.category || '',
          bill_date: r.bill_date || uploadDate,
          is_manual: r.is_manual,
          ledger_id: currentLedgerId,
        })),
      }
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(data.message || t('toasts.saveDone'), 'success')
        setResults([])
        // Trigger dashboard refresh after successful save
        setDashboardRefreshTrigger(Date.now())
        // Refresh analytics as well
        refreshAnalytics(1)
      } else {
        pushToast(data.error || t('toasts.saveFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.saveFail'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const refreshAnalytics = async (page = analyticsPage, filtersOverride = null, sortOverride = null) => {
    if (currentLedgerId === null) {
      return
    }
    setAnalyticsPage(page)
    const sortState = sortOverride || analyticsSort
    const sortParams =
      sortState && sortState.field && sortState.order
        ? { sort_by: sortState.field, sort_order: normalizeSortOrder(sortState.order) }
        : {}
    const params = withLedgerParams({ ...(filtersOverride || analyticsFilters), ...sortParams })
    try {
      const [summaryRes, billsRes] = await Promise.all([
        fetch(`/api/analytics/summary?${buildQuery(params)}`),
        fetch(
          `/api/bills?${buildQuery({
            ...params,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          })}`,
        ),
      ])
      const summaryData = await summaryRes.json()
      if (summaryData.success) {
        setAnalyticsSummary(summaryData.summary)
      }
      const billsData = await billsRes.json()
      if (billsData.success) {
        setAnalyticsItems(billsData.bills || [])
        setAnalyticsTotal(billsData.total_count || 0)
      }
    } catch {
      pushToast(t('toasts.refreshFail'), 'error')
    }
  }

  const quickRange = (range) => {
    const now = moment()
    let start = now.clone()
    let end = now.clone()

    if (range === 'today') {
      start = now.clone().startOf('day')
      end = now.clone().endOf('day')
    } else if (range === 'week') {
      start = now.clone().startOf('isoWeek')
      end = now.clone().endOf('isoWeek')
    } else if (range === 'month') {
      start = now.clone().startOf('month')
      end = now.clone().endOf('month')
    } else if (range === 'year') {
      start = now.clone().startOf('year')
      end = now.clone().endOf('year')
    }

    const nextFilters = {
      ...analyticsFilters,
      start_date: start.format('YYYY-MM-DD'),
      end_date: end.format('YYYY-MM-DD'),
    }
    setAnalyticsFilters(nextFilters)
    setAnalyticsPage(1)
    refreshAnalytics(1, nextFilters)
  }

  const resetAnalyticsFilters = () => {
    const nextFilters = {
      keyword: '',
      major: '',
      minor: '',
      start_date: today(),
      end_date: today(),
    }
    setAnalyticsFilters(nextFilters)
    setAnalyticsPage(1)
    refreshAnalytics(1, nextFilters)
  }

  const openBillEdit = (record) => {
    const match = categories.find((c) => c.id === record.category_id)
    let major = match?.major || ''
    let minor = match?.minor || ''
    if (!match && record.category) {
      const parts = record.category.split('/')
      major = parts[0] || ''
      minor = parts[1] || ''
    }
    setBillEditForm({
      id: record.id,
      merchant: record.merchant || '',
      amount: Number(record.amount || 0),
      major,
      minor,
      category_id: record.category_id ?? null,
      category: record.category || '',
      bill_date: record.bill_date || '',
      include_in_budget: record.include_in_budget !== false,
    })
    setBillEditOpen(true)
  }

  const handleBillEditMajorChange = (value) => {
    setBillEditForm((prev) => ({
      ...prev,
      major: value || '',
      minor: '',
      category_id: null,
      category: '',
    }))
  }

  const handleBillEditMinorChange = (value) => {
    const match = categories.find((c) => c.id === value)
    setBillEditForm((prev) => ({
      ...prev,
      category_id: value || null,
      category: match ? match.full_name : '',
      major: match ? match.major : prev.major,
      minor: match ? match.minor : '',
    }))
  }

  const saveBillEdit = async () => {
    if (!billEditForm.id) return
    const payload = {
      merchant: billEditForm.merchant,
      amount: Number(billEditForm.amount || 0),
      category_id: billEditForm.category_id,
      category: billEditForm.category,
      bill_date: billEditForm.bill_date,
      include_in_budget: billEditForm.include_in_budget,
    }
    try {
      const res = await fetch(`/api/bills/${billEditForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.saveDone'), 'success')
        setBillEditOpen(false)
        refreshAnalytics(analyticsPage)
      } else {
        pushToast(data.error || t('toasts.saveFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.saveFail'), 'error')
    }
  }

  const scrollToBottom = () => {
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }, 200)
  }

  const selectedRowKeys = results.filter((r) => r.selected).map((r) => r.clientId)

  const resultColumns = [
    {
      title: t('upload.headers')[0],
      dataIndex: 'filename',
      key: 'filename',
      width: 180,
    },
    {
      title: t('upload.headers')[1],
      dataIndex: 'merchant',
      key: 'merchant',
      render: (_, record) => (
        <Input value={record.merchant} onChange={(e) => updateResult(record.clientId, 'merchant', e.target.value)} />
      ),
    },
    {
      title: t('upload.headers')[2],
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (_, record) => (
        <InputNumber
          min={0}
          value={record.amount}
          onChange={(value) => updateResult(record.clientId, 'amount', value)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: t('upload.headers')[3],
      dataIndex: 'category',
      key: 'category',
      width: 180,
      render: (_, record) => (
        <Select value={record.category} onChange={(value) => updateResult(record.clientId, 'category', value)} allowClear>
          {categories.map((c) => (
            <Select.Option key={c.id} value={c.full_name}>
              {c.full_name}
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: t('upload.headers')[4],
      dataIndex: 'bill_date',
      key: 'bill_date',
      width: 150,
      render: (_, record) => (
        <DatePicker
          value={record.bill_date ? moment(record.bill_date, 'YYYY-MM-DD') : null}
          onChange={(date) => updateResult(record.clientId, 'bill_date', date ? date.format('YYYY-MM-DD') : '')}
          style={{ width: '100%' }}
        />
      ),
    },
  ]

  const analyticsColumns = [
    {
      title: t('analytics.headers')[0],
      dataIndex: 'bill_date',
      key: 'bill_date',
      width: 140,
      sorter: true,
      sortOrder:
        analyticsSort.field === 'bill_date' && analyticsSort.order ? analyticsSort.order : null,
    },
    {
      title: t('analytics.headers')[1],
      dataIndex: 'merchant',
      key: 'merchant',
      sorter: true,
      sortOrder:
        analyticsSort.field === 'merchant' && analyticsSort.order ? analyticsSort.order : null,
      render: (value, record) =>
        `${value || ''}${record.include_in_budget === false ? '*' : ''}`,
    },
    {
      title: t('analytics.headers')[2],
      dataIndex: 'category',
      key: 'category',
      width: 160,
      sorter: true,
      sortOrder:
        analyticsSort.field === 'category' && analyticsSort.order ? analyticsSort.order : null,
    },
    {
      title: t('analytics.headers')[3],
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      sorter: true,
      sortOrder:
        analyticsSort.field === 'amount' && analyticsSort.order ? analyticsSort.order : null,
      render: (value) => `${currency} ${Number(value).toFixed(2)}`,
    },
  ]

  const categoryColumns = [
    {
      title: t('config.major'),
      dataIndex: 'major',
      key: 'major',
      render: (_, record) => (
        <Input value={record.major} onChange={(e) => updateCategoryField(record.id, 'major', e.target.value)} />
      ),
    },
    {
      title: t('config.minor'),
      dataIndex: 'minor',
      key: 'minor',
      render: (_, record) => (
        <Input value={record.minor} onChange={(e) => updateCategoryField(record.id, 'minor', e.target.value)} />
      ),
    },
    {
      title: t('config.action'),
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<SaveOutlined />} onClick={() => saveCategoryGroup(record)}>
            {t('ledger.save')}
          </Button>
          <Button danger type="link" icon={<DeleteOutlined />} onClick={() => deleteCategory(record.id)}>
            {t('config.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  const rulesColumns = [
    {
      title: t('config.tableHeaders')[0],
      dataIndex: 'keyword',
      key: 'keyword',
      render: (_, record) => (
        <Input
          value={record.keyword}
          onChange={(e) => updateRuleField(record.id, 'keyword', e.target.value)}
        />
      ),
    },
    {
      title: t('config.tableHeaders')[1],
      dataIndex: 'category',
      key: 'category',
      render: (_, record) => (
        <Select
          value={record.category || undefined}
          placeholder={t('config.category')}
          onChange={(value) => handleRuleCategoryChange(record.id, value)}
          allowClear
        >
          {categories.map((c) => (
            <Select.Option key={c.id} value={c.full_name}>
              {c.full_name}
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: t('config.tableHeaders')[2],
      dataIndex: 'priority',
      key: 'priority',
      width: 120,
      render: (_, record) => (
        <InputNumber
          min={1}
          value={record.priority}
          onChange={(value) => updateRuleField(record.id, 'priority', value)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: t('config.action'),
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<SaveOutlined />} onClick={() => saveRule(record)}>
            {t('ledger.save')}
          </Button>
          <Button danger type="link" icon={<DeleteOutlined />} onClick={() => deleteRule(record.id)}>
            {t('config.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  const recurringColumns = [
    {
      title: t('recurring.amount'),
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (_, record) => (
        <InputNumber
          min={0}
          value={record.amount}
          onChange={(value) => updateRecurringRuleField(record.id, 'amount', value)}
          onBlur={() => saveRecurringRule(record)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: t('recurring.keyword'),
      dataIndex: 'keyword',
      key: 'keyword',
      width: 160,
      render: (_, record) => (
        <Input
          value={record.keyword}
          onChange={(e) => updateRecurringRuleField(record.id, 'keyword', e.target.value)}
          onBlur={() => saveRecurringRule(record)}
        />
      ),
    },
    {
      title: t('recurring.category'),
      dataIndex: 'category_id',
      key: 'category',
      width: 180,
      render: (_, record) => (
        <Select
          value={record.category_id ?? undefined}
          placeholder={record.category || t('recurring.category')}
          onChange={(value) => handleRecurringRuleCategoryChange(record.id, value)}
          onBlur={() => saveRecurringRule(record)}
          allowClear
        >
          {categories.map((c) => (
            <Select.Option key={c.id} value={c.id}>
              {c.full_name}
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: t('recurring.scheduleType'),
      dataIndex: 'schedule_type',
      key: 'schedule_type',
      width: 140,
      render: (_, record) => (
        <Select
          value={record.schedule_type}
          onChange={(value) => handleRecurringRuleScheduleTypeChange(record.id, value)}
          onBlur={() => saveRecurringRule(record)}
        >
          <Select.Option value="weekly">{t('recurring.scheduleWeekly')}</Select.Option>
          <Select.Option value="monthly">{t('recurring.scheduleMonthly')}</Select.Option>
        </Select>
      ),
    },
    {
      title: t('recurring.scheduleValue'),
      dataIndex: 'schedule_value',
      key: 'schedule_value',
      width: 285,
      render: (_, record) => (
        <Select
          mode="multiple"
          value={Array.isArray(record.schedule_value) ? record.schedule_value : []}
          onChange={(value) => updateRecurringRuleField(record.id, 'schedule_value', value)}
          onBlur={() => saveRecurringRule(record)}
          options={record.schedule_type === 'weekly' ? weekdayOptions : monthDayOptions}
        />
      ),
    },
    {
      title: t('recurring.startDate'),
      dataIndex: 'start_date',
      key: 'start_date',
      width: 295,
      render: (_, record) => (
        <DatePicker
          value={record.start_date ? moment(record.start_date, 'YYYY-MM-DD') : null}
          onChange={(date) => handleRecurringRuleStartDateChange(record.id, date)}
          onBlur={() => saveRecurringRule(record)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: t('recurring.endDate'),
      dataIndex: 'end_date',
      key: 'end_date',
      width: 295,
      render: (_, record) => (
        <DatePicker
          allowClear
          value={record.end_date ? moment(record.end_date, 'YYYY-MM-DD') : null}
          onChange={(date) =>
            updateRecurringRuleField(record.id, 'end_date', date ? date.format('YYYY-MM-DD') : '')
          }
          onBlur={() => saveRecurringRule(record)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: t('recurring.note'),
      dataIndex: 'note',
      key: 'note',
      width: 240,
      render: (_, record) => (
        <Input
          value={record.note}
          onChange={(e) => updateRecurringRuleField(record.id, 'note', e.target.value)}
          onBlur={() => saveRecurringRule(record)}
        />
      ),
    },
    {
      title: t('recurring.includeInBudget'),
      dataIndex: 'include_in_budget',
      key: 'include_in_budget',
      width: 120,
      render: (_, record) => (
        <Switch
          checked={record.include_in_budget !== false}
          onChange={(checked) => {
            updateRecurringRuleField(record.id, 'include_in_budget', checked)
            saveRecurringRule({ ...record, include_in_budget: checked })
          }}
        />
      ),
    },
    {
      title: t('recurring.enabled'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (_, record) => (
        <Switch
          checked={Boolean(record.enabled)}
          onChange={(checked) => {
            updateRecurringRuleField(record.id, 'enabled', checked)
            saveRecurringRule({ ...record, enabled: checked })
          }}
        />
      ),
    },
    {
      title: t('config.action'),
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button danger type="link" icon={<DeleteOutlined />} onClick={() => deleteRecurringRule(record.id)}>
          {t('config.delete')}
        </Button>
      ),
    },
  ]

  const uploadFileList = useMemo(

    () => selectedFiles.map((file) => ({ uid: fileKey(file), name: file.name, status: 'done' })),
    [selectedFiles],
  )

  return (
    <Layout
      className="app"
      style={{
        background: `
          radial-gradient(circle at 10% 20%, rgba(79, 70, 229, 0.08), transparent 25%),
          radial-gradient(circle at 80% 0%, rgba(14, 165, 233, 0.08), transparent 25%),
          #f3f4f6
        `,
        padding: '5%',
      }}
    >
      {contextHolder}
      <Layout.Content>
        <div className="app-header">
          <Space direction="vertical" size={2}>
            <Title level={3}>{t('appTitle')}</Title>
            <Text className="muted">{t('appSubtitle')}</Text>
          </Space>
          <Space size="middle" align="center">
            <Text strong>{t('ledger.label')}</Text>
            <Select value={currentLedgerId ?? undefined} style={{ minWidth: 200 }} onChange={setCurrentLedgerId}>
              {ledgers.map((l) => (
                <Select.Option key={l.id} value={l.id}>
                  {l.name} ({t('ledger.budget')}: {l.monthly_budget ?? 0})
                </Select.Option>
              ))}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={loadLedgers}>
              {t('ledger.reload')}
            </Button>
          </Space>
        </div>

        <Tabs activeKey={tab} onChange={setTab}>
          <Tabs.TabPane tab={t('tabs.0')} key="dashboard">
            <Dashboard 
              currentLedgerId={currentLedgerId}
              onAddBill={() => setTab('upload')}
              refreshTrigger={dashboardRefreshTrigger}
            />
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('tabs.1')} key="upload">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              

              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card title={t('upload.title')}>
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Upload.Dragger
                      multiple
                      beforeUpload={() => false}
                      fileList={uploadFileList}
                      onChange={({ fileList }) =>
                        handleFileInput(fileList.map((file) => file.originFileObj).filter(Boolean))
                      }
                      onRemove={(file) => {
                        setSelectedFiles((prev) => prev.filter((f) => fileKey(f) !== file.uid))
                      }}
                    >
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                      </p>
                      <p className="ant-upload-text">{t('upload.drop')}</p>
                      <p className="ant-upload-hint">{t('upload.choose')}</p>
                    </Upload.Dragger>

                    <Space size="middle" align="center" wrap>
                      <Button type="primary" icon={<UploadOutlined />} onClick={processFiles} loading={uploading}>
                        {t('upload.run')}
                      </Button>
                      <Button onClick={addManualRow}>{t('upload.addManual')}</Button>
                      <Text>{t('upload.billDate')}</Text>
                      <DatePicker
                        value={uploadDate ? moment(uploadDate, 'YYYY-MM-DD') : null}
                        onChange={(date) => setUploadDate(date ? date.format('YYYY-MM-DD') : today())}
                      />
                    </Space>
                  </Space>
                </Card>

                <Card
                  title={t('upload.results')}
                  extra={
                    <Space>
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={saveResults}
                        loading={saving}
                        disabled={!results.length}
                      >
                        {t('upload.saveAll')}
                      </Button>
                      <Button danger icon={<DeleteOutlined />} onClick={bulkDelete}>
                        {t('upload.deleteSelected')}
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    rowKey="clientId"
                    columns={resultColumns}
                    dataSource={results}
                    pagination={false}
                    size="small"
                    rowSelection={{
                      selectedRowKeys,
                      onChange: (keys) =>
                        setResults((prev) => prev.map((r) => ({ ...r, selected: keys.includes(r.clientId) }))),
                    }}
                    onRow={(record) => ({
                      onClick: () => toggleResult(record.clientId, !record.selected),
                    })}
                    rowClassName={(record) => (record.selected ? 'row-selected' : '')}
                    scroll={{ x: 900 }}
                  />
                </Card>
              </Space>
            </Space>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('tabs.2')} key="analytics">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Card title={t('analytics.title')}>
                <Row gutter={12} align="middle">
                  <Col xs={24} md={6}>
                    <Input
                      placeholder={t('analytics.keywordPH')}
                      value={analyticsFilters.keyword}
                      onChange={(e) => setAnalyticsFilters({ ...analyticsFilters, keyword: e.target.value })}
                    />
                  </Col>
                  <Col xs={24} md={4}>
                    <Select
                      placeholder={t('analytics.allMajors')}
                      value={analyticsFilters.major || undefined}
                      allowClear
                      onChange={(value) => setAnalyticsFilters({ ...analyticsFilters, major: value || '', minor: '' })}
                      style={{ width: '100%' }}
                    >
                      {majorOptions.map((m) => (
                        <Select.Option key={m} value={m}>
                          {m}
                        </Select.Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} md={4}>
                    <Select
                      placeholder={t('analytics.allMinors')}
                      value={analyticsFilters.minor || undefined}
                      allowClear
                      onChange={(value) => setAnalyticsFilters({ ...analyticsFilters, minor: value || '' })}
                      style={{ width: '100%' }}
                    >
                      {minorOptions.map((c) => (
                        <Select.Option key={c.id} value={c.minor}>
                          {c.minor || c.full_name}
                        </Select.Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={24} md={8}>
                    <RangePicker
                      value={
                        analyticsFilters.start_date && analyticsFilters.end_date
                          ? [moment(analyticsFilters.start_date, 'YYYY-MM-DD'), moment(analyticsFilters.end_date, 'YYYY-MM-DD')]
                          : []
                      }
                      onChange={(dates) => {
                        if (!dates || !dates[0] || !dates[1]) return
                        const [start, end] = dates
                        const nextFilters = {
                          ...analyticsFilters,
                          start_date: start.format('YYYY-MM-DD'),
                          end_date: end.format('YYYY-MM-DD'),
                        }
                        setAnalyticsFilters(nextFilters)
                      }}
                      style={{ width: '100%' }}
                    />
                  </Col>
                </Row>

                <Row gutter={12} align="middle" style={{ marginTop: 10 }}>
                  <Col flex="auto">
                    <Space wrap>
                      <Button type="primary" onClick={() => refreshAnalytics(1)}>
                        {t('analytics.refresh')}
                      </Button>
                      <Button onClick={() => quickRange('today')}>{t('analytics.rangeToday')}</Button>
                      <Button onClick={() => quickRange('week')}>{t('analytics.rangeWeek')}</Button>
                      <Button onClick={() => quickRange('month')}>{t('analytics.rangeMonth')}</Button>
                      <Button onClick={() => quickRange('year')}>{t('analytics.rangeYear')}</Button>
                      <Button onClick={resetAnalyticsFilters}>{t('analytics.reset')}</Button>
                    </Space>
                  </Col>
                </Row>

                {analyticsSummary && (
                  <>
                    <Divider />
                    <Row gutter={12}>
                      <Col xs={12} md={6}>
                        <Card size="small">
                          <Statistic
                            title={t('analytics.totalAmount')}
                            value={numberOrZero(analyticsSummary.total_amount)}
                            prefix={currency}
                            precision={2}
                          />
                        </Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small">
                          <Statistic title={t('analytics.count')} value={analyticsSummary.bill_count} />
                        </Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small">
                          <Statistic title={t('analytics.daysCovered')} value={analyticsSummary.day_count} />
                        </Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small">
                          <Statistic
                            title={t('analytics.dailyAvg')}
                            value={numberOrZero(analyticsSummary.daily_avg)}
                            prefix={currency}
                            precision={2}
                          />
                        </Card>
                      </Col>
                    </Row>
                  </>
                )}
              </Card>

              <Card>
                <Table
                  rowKey="id"
                  columns={analyticsColumns}
                  dataSource={analyticsItems}
                  onRow={(record) => ({
                    onClick: () => openBillEdit(record),
                  })}
                  onChange={(pagination, filters, sorter, extra) => {
                    const nextPage = pagination?.current || 1
                    if (extra?.action === 'sort') {
                      const sortInfo = Array.isArray(sorter) ? sorter[0] : sorter
                      const nextSort = sortInfo?.order
                        ? {
                            field: sortInfo?.field || '',
                            order: sortInfo?.order || '',
                          }
                        : { field: '', order: '' }
                      setAnalyticsSort(nextSort)
                      refreshAnalytics(nextPage, null, nextSort)
                      return
                    }
                    refreshAnalytics(nextPage)
                  }}
                  pagination={{
                    current: analyticsPage,
                    pageSize,
                    total: analyticsTotal,
                    showSizeChanger: false,
                  }}
                  size="middle"
                  scroll={{ x: 800 }}
                />
              </Card>

              <Modal
                title="编辑账单"
                open={billEditOpen}
                onCancel={() => setBillEditOpen(false)}
                onOk={saveBillEdit}
                okText={t('ledger.save')}
                cancelText="取消"
                style={{ top: '20%' }}
                width={700}
              >
                <Form layout="vertical">
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item label={t('upload.headers')[1]}>
                        <Input
                          value={billEditForm.merchant}
                          onChange={(e) => setBillEditForm({ ...billEditForm, merchant: e.target.value })}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label={t('upload.headers')[2]}>
                        <InputNumber
                          min={0}
                          value={billEditForm.amount}
                          onChange={(value) => setBillEditForm({ ...billEditForm, amount: value })}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={12}>
                    <Col xs={24} md={8}>
                      <Form.Item label={t('config.major')}>
                        <Select
                          value={billEditForm.major || undefined}
                          placeholder={t('config.major')}
                          onChange={handleBillEditMajorChange}
                          allowClear
                        >
                          {majorOptions.map((m) => (
                            <Select.Option key={`bill-edit-major-${m}`} value={m}>
                              {m}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label={t('config.minor')}>
                        <Select
                          value={billEditForm.category_id ?? undefined}
                          placeholder={t('config.minor')}
                          onChange={handleBillEditMinorChange}
                          disabled={!billEditForm.major}
                          allowClear
                        >
                          {billEditMinorOptions.map((c) => (
                            <Select.Option key={`bill-edit-minor-${c.id}`} value={c.id}>
                              {c.minor || c.full_name}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item label={t('upload.headers')[4]}>
                        <DatePicker
                          value={billEditForm.bill_date ? moment(billEditForm.bill_date, 'YYYY-MM-DD') : null}
                          onChange={(date) =>
                            setBillEditForm({
                              ...billEditForm,
                              bill_date: date ? date.format('YYYY-MM-DD') : '',
                            })
                          }
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label={t('analytics.includeInBudget')}>
                    <Switch
                      checked={billEditForm.include_in_budget}
                      onChange={(checked) => setBillEditForm({ ...billEditForm, include_in_budget: checked })}
                    />
                  </Form.Item>
                </Form>
              </Modal>
            </Space>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('tabs.3')} key="config">
            <Tabs defaultActiveKey="ledger">
              <Tabs.TabPane tab={t('settings.ledger')} key="ledger">
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Card title="当前账本">
                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                          <Form layout="vertical">
                            <Row gutter={12}>
                              <Col xs={24} md={12}>
                                <Form.Item label={t('ledger.name')}>
                                  <Input
                                    value={ledgerForm.name}
                                    onChange={(e) => setLedgerForm({ ...ledgerForm, name: e.target.value })}
                                  />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item label={t('ledger.budget')}>
                                  <InputNumber
                                    min={0}
                                    value={ledgerForm.monthly_budget}
                                    onChange={(value) => setLedgerForm({ ...ledgerForm, monthly_budget: value })}
                                    style={{ width: '100%' }}
                                  />
                                </Form.Item>
                              </Col>
                            </Row>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Space>
                                <Button type="primary" icon={<SaveOutlined />} onClick={saveLedger}>
                                  {t('ledger.save')}
                                </Button>
                                <Button 
                                  icon={<FileTextOutlined />} 
                                  onClick={() => setTemplateWizardOpen(true)}
                                >
                                  账单模板
                                </Button>
                              </Space>
                              <Button danger onClick={deleteLedger}>
                                {t('ledger.delete')}
                              </Button>
                            </div>
                          </Form>

                          <Divider style={{ borderTop: '2px solid #bfbfbf', margin: '20px 0' }} />

                          <Row justify="space-between" align="middle">
                            <Col>
                              <Text strong>{t('recurring.title')}</Text>
                            </Col>
                            <Col>
                              <Space>
                                <Button type="primary" onClick={() => setRecurringCreateOpen(true)}>
                                  {t('recurring.createButton')}
                                </Button>
                                <Button
                                  onClick={() => {
                                    setRecurringManageOpen(true)
                                    loadRecurringRules()
                                  }}
                                >
                                  {t('recurring.manageButton')}
                                </Button>
                              </Space>
                            </Col>
                          </Row>

                          <Modal
                            title={t('recurring.createTitle')}
                            open={recurringCreateOpen}
                            onCancel={() => setRecurringCreateOpen(false)}
                            onOk={async () => {
                              const ok = await addRecurringRule()
                              if (ok) setRecurringCreateOpen(false)
                            }}
                            okText={t('ledger.save')}
                            cancelText="取消"
                            style={{ top: '20%' }}
                            width={900}
                          >
                            <Form layout="vertical">
                              <Row gutter={12}>
                                <Col xs={24} md={6}>
                                  <Form.Item label={t('recurring.amount')}>
                                    <InputNumber
                                      min={0}
                                      value={recurringForm.amount}
                                      onChange={(value) => setRecurringForm({ ...recurringForm, amount: value })}
                                      style={{ width: '100%' }}
                                    />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                  <Form.Item label={t('recurring.keyword')}>
                                    <Input
                                      value={recurringForm.keyword}
                                      onChange={(e) => setRecurringForm({ ...recurringForm, keyword: e.target.value })}
                                    />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                  <Form.Item label={t('recurring.category')}>
                                    <Select
                                      value={recurringForm.category_id ?? undefined}
                                      placeholder={t('recurring.category')}
                                      onChange={handleRecurringCategoryChange}
                                      allowClear
                                    >
                                      {categories.map((c) => (
                                        <Select.Option key={c.id} value={c.id}>
                                          {c.full_name}
                                        </Select.Option>
                                      ))}
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                  <Form.Item label={t('recurring.note')}>
                                    <Input
                                      value={recurringForm.note}
                                      onChange={(e) => setRecurringForm({ ...recurringForm, note: e.target.value })}
                                    />
                                  </Form.Item>
                                </Col>
                              </Row>
                          <Row gutter={12} align="middle">
                            <Col xs={24} md={6}>
                              <Form.Item label={t('recurring.scheduleType')}>
                                <Select
                                  value={recurringForm.schedule_type}
                                  onChange={handleRecurringScheduleTypeChange}
                                >
                                  <Select.Option value="weekly">{t('recurring.scheduleWeekly')}</Select.Option>
                                  <Select.Option value="monthly">{t('recurring.scheduleMonthly')}</Select.Option>
                                </Select>
                              </Form.Item>
                            </Col>
                                <Col xs={24} md={6}>
                                  <Form.Item
                                    label={
                                      recurringForm.schedule_type === 'weekly'
                                        ? t('recurring.weekday')
                                        : t('recurring.monthDay')
                                    }
                                  >
                                    <Select
                                      mode="multiple"
                                      value={recurringForm.schedule_value}
                                      onChange={(value) =>
                                        setRecurringForm({ ...recurringForm, schedule_value: value })
                                      }
                                      options={
                                        recurringForm.schedule_type === 'weekly' ? weekdayOptions : monthDayOptions
                                      }
                                    />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                  <Form.Item label={t('recurring.startDate')}>
                                    <DatePicker
                                      value={
                                        recurringForm.start_date
                                          ? moment(recurringForm.start_date, 'YYYY-MM-DD')
                                          : null
                                      }
                                      onChange={handleRecurringStartDateChange}
                                      style={{ width: '100%' }}
                                    />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={6}>
                                  <Form.Item label={t('recurring.endDate')}>
                                    <DatePicker
                                      allowClear
                                      value={
                                        recurringForm.end_date ? moment(recurringForm.end_date, 'YYYY-MM-DD') : null
                                      }
                                      onChange={(date) =>
                                        setRecurringForm({
                                          ...recurringForm,
                                          end_date: date ? date.format('YYYY-MM-DD') : '',
                                        })
                                      }
                                      style={{ width: '100%' }}
                                    />
                                  </Form.Item>
                                </Col>
                              </Row>
                              <Row gutter={12}>
                                <Col xs={24} md={6}>
                                  <Form.Item label={t('recurring.includeInBudget')}>
                                    <Switch
                                      checked={recurringForm.include_in_budget}
                                      onChange={(checked) =>
                                        setRecurringForm({ ...recurringForm, include_in_budget: checked })
                                      }
                                    />
                                  </Form.Item>
                                </Col>
                              </Row>
                            </Form>
                          </Modal>

                          <Modal
                            title={t('recurring.manageTitle')}
                            open={recurringManageOpen}
                            onCancel={() => setRecurringManageOpen(false)}
                            footer={null}
                            style={{ top: '20%' }}
                            width={1200}
                          >
                            <Table
                              rowKey="id"
                              columns={recurringColumns}
                              dataSource={recurringRules}
                              pagination={{ pageSize: 8 }}
                              scroll={{ x: 1320 }}
                            />
                          </Modal>
                        </Space>
                      </Card>
                    </Col>
                    <Col span={24}>
                      <Card title={t('ledger.newLedger')}>
                        <Form layout="vertical">
                          <Row gutter={12}>
                            <Col xs={24} md={12}>
                              <Form.Item label={t('ledger.name')}>
                                <Input
                                  value={newLedger.name}
                                  onChange={(e) => setNewLedger({ ...newLedger, name: e.target.value })}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item label={t('ledger.budget')}>
                                <InputNumber
                                  min={0}
                                  value={newLedger.monthly_budget}
                                  onChange={(value) => setNewLedger({ ...newLedger, monthly_budget: value })}
                                  style={{ width: '100%' }}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Button type="dashed" icon={<PlusOutlined />} onClick={createLedger}>
                            {t('ledger.create')}
                          </Button>
                        </Form>
                      </Card>
                    </Col>
                  </Row>
                </Space>
              </Tabs.TabPane>
              <Tabs.TabPane tab={t('settings.categories')} key="categories">
                <Row gutter={[16, 16]}>
                  <Col span={24}>
                    <Card title={t('config.categoriesTitle')}>
                      <Row justify="space-between" align="middle">
                        <Col>
                          <Text strong>{t('config.categoriesTitle')}</Text>
                        </Col>
                        <Col>
                          <Space>
                            <Button type="primary" onClick={() => setCategoryCreateOpen(true)}>
                              {t('config.createButton')}
                            </Button>
                            <Button
                              onClick={() => {
                                setCategoryManageOpen(true)
                                loadCategories()
                              }}
                            >
                              {t('config.manageButton')}
                            </Button>
                          </Space>
                        </Col>
                      </Row>

                      <Modal
                        title={t('config.createCategoryTitle')}
                        open={categoryCreateOpen}
                        onCancel={() => setCategoryCreateOpen(false)}
                        onOk={async () => {
                          const ok = await addCategoryGroup()
                          if (ok) setCategoryCreateOpen(false)
                        }}
                        okText={t('ledger.save')}
                        cancelText="取消"
                        style={{ top: '20%' }}
                        width={700}
                      >
                        <Form layout="vertical">
                          <Row gutter={12}>
                            <Col xs={24} md={12}>
                              <Form.Item label={t('config.major')}>
                                <Input
                                  value={catForm.major}
                                  placeholder=""
                                  onChange={(e) => setCatForm({ ...catForm, major: e.target.value })}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item label={t('config.minor')}>
                                <Input
                                  value={catForm.minor}
                                  placeholder=""
                                  onChange={(e) => setCatForm({ ...catForm, minor: e.target.value })}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Row gutter={12} align="middle">
                            <Col xs={24} md={12}>
                              <Form.Item label={t('config.scope')}>
                                <Select value={catForm.scope} onChange={(value) => setCatForm({ ...catForm, scope: value })}>
                                  <Select.Option value="current">{t('config.scopeCurrent')}</Select.Option>
                                  <Select.Option value="global">{t('config.scopeGlobal')}</Select.Option>
                                </Select>
                              </Form.Item>
                            </Col>
                          </Row>
                        </Form>
                      </Modal>

                      <Modal
                        title={t('config.manageCategoryTitle')}
                        open={categoryManageOpen}
                        onCancel={() => setCategoryManageOpen(false)}
                        footer={null}
                        style={{ top: '20%' }}
                        width={900}
                      >
                        <Space wrap style={{ marginBottom: 12 }}>
                          <Select
                            placeholder={t('config.filterMajor')}
                            value={categoryFilter.major || undefined}
                            allowClear
                            style={{ width: 200 }}
                            onChange={(value) =>
                              setCategoryFilter({ ...categoryFilter, major: value || '', minor: '' })
                            }
                          >
                            {majorOptions.map((m) => (
                              <Select.Option key={m} value={m}>
                                {m}
                              </Select.Option>
                            ))}
                          </Select>
                          <Select
                            placeholder={t('config.filterMinor')}
                            value={categoryFilter.minor || undefined}
                            allowClear
                            style={{ width: 200 }}
                            onChange={(value) => setCategoryFilter({ ...categoryFilter, minor: value || '' })}
                          >
                            {categoryFilterMinorOptions.map((c) => (
                              <Select.Option key={`${c.id}-minor`} value={c.minor}>
                                {c.minor || c.full_name}
                              </Select.Option>
                            ))}
                          </Select>
                        </Space>
                        <Table
                          rowKey="id"
                          columns={categoryColumns}
                          dataSource={categoryFiltered}
                          pagination={{ pageSize: 8 }}
                        />
                      </Modal>
                    </Card>
                  </Col>
                  <Col span={24}>
                    <Card title={t('config.rulesTitle')}>
                      <Row justify="space-between" align="middle">
                        <Col>
                          <Text strong>{t('config.rulesTitle')}</Text>
                        </Col>
                        <Col>
                          <Space>
                            <Button type="primary" onClick={() => setRuleCreateOpen(true)}>
                              {t('config.createButton')}
                            </Button>
                            <Button
                              onClick={() => {
                                setRuleManageOpen(true)
                                loadRules()
                              }}
                            >
                              {t('config.manageButton')}
                            </Button>
                          </Space>
                        </Col>
                      </Row>

                      <Modal
                        title={t('config.createRuleTitle')}
                        open={ruleCreateOpen}
                        onCancel={() => setRuleCreateOpen(false)}
                        onOk={async () => {
                          const ok = await addRule()
                          if (ok) setRuleCreateOpen(false)
                        }}
                        okText={t('ledger.save')}
                        cancelText="取消"
                        style={{ top: '20%' }}
                        width={900}
                      >
                        <Form layout="vertical">
                          <Row gutter={12}>
                            <Col xs={24} md={8}>
                              <Form.Item label={t('config.keyword')}>
                                <Input
                                  value={ruleForm.keyword}
                                  placeholder=""
                                  onChange={(e) => setRuleForm({ ...ruleForm, keyword: e.target.value })}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item label={t('config.major')}>
                                <Select
                                  value={ruleForm.major || undefined}
                                  placeholder={t('config.major')}
                                  onChange={handleRuleMajorChange}
                                  allowClear
                                >
                                  {ruleMajorOptions.map((m) => (
                                    <Select.Option key={m} value={m}>
                                      {m}
                                    </Select.Option>
                                  ))}
                                </Select>
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item label={t('config.minor')}>
                                <Select
                                  value={ruleForm.category_id ?? undefined}
                                  placeholder={t('config.minor')}
                                  onChange={handleRuleMinorChange}
                                  disabled={!ruleForm.major}
                                  allowClear
                                >
                                  {ruleMinorOptions.map((c) => (
                                    <Select.Option key={c.id} value={c.id}>
                                      {c.minor || c.full_name}
                                    </Select.Option>
                                  ))}
                                </Select>
                              </Form.Item>
                            </Col>
                          </Row>
                          <Row gutter={12} align="middle">
                            <Col xs={24} md={8}>
                              <Form.Item label={t('config.priority')}>
                                <InputNumber
                                  min={1}
                                  value={ruleForm.priority}
                                  onChange={(value) => setRuleForm({ ...ruleForm, priority: value })}
                                  style={{ width: '100%' }}
                                />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item label={t('config.scope')}>
                                <Select value={ruleForm.scope} onChange={(value) => setRuleForm({ ...ruleForm, scope: value })}>
                                  <Select.Option value="current">{t('config.scopeCurrent')}</Select.Option>
                                  <Select.Option value="global">{t('config.scopeGlobal')}</Select.Option>
                                </Select>
                              </Form.Item>
                            </Col>
                          </Row>
                        </Form>
                      </Modal>

                      <Modal
                        title={t('config.manageRuleTitle')}
                        open={ruleManageOpen}
                        onCancel={() => setRuleManageOpen(false)}
                        footer={null}
                        style={{ top: '20%' }}
                        width={1100}
                      >
                        <Space wrap style={{ marginBottom: 12 }}>
                          <Input
                            placeholder={t('config.filterKeyword')}
                            value={ruleFilter.keyword}
                            onChange={(e) => setRuleFilter({ ...ruleFilter, keyword: e.target.value })}
                            style={{ width: 200 }}
                          />
                          <Select
                            placeholder={t('config.filterMajor')}
                            value={ruleFilter.major || undefined}
                            allowClear
                            style={{ width: 200 }}
                            onChange={(value) => setRuleFilter({ ...ruleFilter, major: value || '', minor: '' })}
                          >
                            {ruleMajorOptions.map((m) => (
                              <Select.Option key={`rule-major-${m}`} value={m}>
                                {m}
                              </Select.Option>
                            ))}
                          </Select>
                          <Select
                            placeholder={t('config.filterMinor')}
                            value={ruleFilter.minor || undefined}
                            allowClear
                            style={{ width: 200 }}
                            onChange={(value) => setRuleFilter({ ...ruleFilter, minor: value || '' })}
                          >
                            {ruleFilterMinorOptions.map((c) => (
                              <Select.Option key={`rule-minor-${c.id}`} value={c.minor}>
                                {c.minor || c.full_name}
                              </Select.Option>
                            ))}
                          </Select>
                        </Space>
                        <Table rowKey="id" columns={rulesColumns} dataSource={rulesFiltered} pagination={{ pageSize: 8 }} />
                      </Modal>
                    </Card>
                  </Col>
                </Row>
              </Tabs.TabPane>
            </Tabs>
          </Tabs.TabPane>
        </Tabs>
      </Layout.Content>

      {/* Template Wizard Modal */}
      <TemplateWizardModal
        visible={templateWizardOpen}
        onClose={() => setTemplateWizardOpen(false)}
        onSuccess={() => {
          message.success('模板创建成功')
          setTemplateWizardOpen(false)
        }}
      />

      {/* Delete Ledger Confirmation Modal */}
      <Modal
        title="确认删除"
        visible={deleteConfirmOpen}
        onOk={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmOpen(false)}
        okText={t('ledger.delete')}
        cancelText="取消"
        okButtonProps={{ danger: true }}
        style={{ top: '20%' }}
      >
        <p>{t('ledger.deleteConfirm')}</p>
        <p style={{ color: '#ff4d4f', marginTop: 8 }}>
          此操作将删除账本及其所有账单数据，是否继续？
        </p>
      </Modal>
    </Layout>
  )
}

export default App
