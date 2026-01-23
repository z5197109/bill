import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  ConfigProvider,
  DatePicker,
  Divider,
  Alert,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Popconfirm,
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
import dayjs from 'dayjs'
import Dashboard from './Dashboard'
import { TemplateWizardModal } from './components'
import './App.css'
import './Dashboard.css'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts'

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
    deleteBackup: '删除备份',
    newLedger: '新建账本',
    create: '创建',
    deleteConfirm: '删除当前账本？账单将被移除，并自动生成备份。',
    deleteLast: '至少保留一个账本',
    backupsTitle: '账本备份',
    backupLedger: '账本',
    backupAt: '备份时间',
    backupAction: '操作',
    restore: '恢复',
    restoreConfirm: '确认恢复该备份？',
    deleteBackupConfirm: '确认删除该备份？',
    backupEmpty: '暂无备份',
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
    rangeToday: '当天',
    rangeWeek: '当周',
    rangeMonth: '当月',
    rangeYear: '当年',
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
    ledgerDeleteLast: '至少保留一个账本',
    enterLedgerName: '请输入账本名称',
    loadLedgerBackupsFail: '加载备份失败',
    ledgerRestored: '账本已恢复',
    ledgerRestoreFail: '恢复失败',
    backupDeleted: '备份已删除',
    backupDeleteFail: '删除备份失败',
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

const today = () => dayjs().format('YYYY-MM-DD')
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

const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57']

function App() {
  const [tab, setTab] = useState('dashboard')
  const [pieChartOpen, setPieChartOpen] = useState(false)
  const [ledgers, setLedgers] = useState([])
  const [currentLedgerId, setCurrentLedgerId] = useState(null)
  const [ledgerForm, setLedgerForm] = useState({ name: '', monthly_budget: '' })
  const [newLedger, setNewLedger] = useState({ name: '', monthly_budget: '' })
  const [ledgerBackups, setLedgerBackups] = useState([])

  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [recurringRules, setRecurringRules] = useState([])

  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadDate, setUploadDate] = useState(today())
  const [results, setResults] = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoOpenMinorFor, setAutoOpenMinorFor] = useState(null)

  const [analyticsFilters, setAnalyticsFilters] = useState({
    keyword: '',
    major: '',
    minor: '',
    start_date: today(),
    end_date: today(),
  })
  const [analyticsSummary, setAnalyticsSummary] = useState(null)

  const getPieChartData = () => {
    if (!analyticsSummary || !analyticsSummary.categories) return []
    return Object.entries(analyticsSummary.categories)
      .map(([name, data]) => ({ name, value: data.amount }))
      .sort((a, b) => b.value - a.value)
  }
  const [analyticsItems, setAnalyticsItems] = useState([])
  const [analyticsTotal, setAnalyticsTotal] = useState(0)
  const [analyticsPage, setAnalyticsPage] = useState(1)
  const [analyticsSort, setAnalyticsSort] = useState({ field: '', order: '' })
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
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
    major: '',
    minor: '',
    category_id: null,
    category: '',
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
  const [categoryCreateError, setCategoryCreateError] = useState('')
  const [categoryManageOpen, setCategoryManageOpen] = useState(false)
  const [ruleCreateOpen, setRuleCreateOpen] = useState(false)
  const [ruleCreateError, setRuleCreateError] = useState('')
  const [ruleManageOpen, setRuleManageOpen] = useState(false)
  const [categoryEditOpen, setCategoryEditOpen] = useState(false)
  const [categoryEditForm, setCategoryEditForm] = useState({ id: null, major: '', minor: '', scope: 'current' })
  const [ruleEditOpen, setRuleEditOpen] = useState(false)
  const [ruleEditForm, setRuleEditForm] = useState({
    id: null,
    keyword: '',
    major: '',
    minor: '',
    category_id: null,
    category: '',
    priority: 2,
    scope: 'current',
  })
  const [categoryFilter, setCategoryFilter] = useState({ keyword: '', major: '', minor: '' })
  const [ruleFilter, setRuleFilter] = useState({ keyword: '', major: '', minor: '' })
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false)
  const [templateManageOpen, setTemplateManageOpen] = useState(false)
  const [templates, setTemplates] = useState([])
  const [templateEditOpen, setTemplateEditOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [recurringEditOpen, setRecurringEditOpen] = useState(false)
  const [editingRecurringRule, setEditingRecurringRule] = useState(null)
  const [recurringDeleteOpen, setRecurringDeleteOpen] = useState(false)
  const [recurringToDelete, setRecurringToDelete] = useState(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchBudgetOpen, setBatchBudgetOpen] = useState(false)
  const [batchBudgetAction, setBatchBudgetAction] = useState(true)

  const [messageApi, contextHolder] = message.useMessage()

  // Helper function to trigger dashboard refresh
  const triggerDashboardRefresh = () => {
    setDashboardRefreshTrigger(Date.now())
  }

  const t = (keyPath) => keyPath.split('.').reduce((acc, cur) => (acc ? acc[cur] : undefined), I18N) || keyPath
  const currency = '¥'

  useEffect(() => {
    loadLedgers()
    loadLedgerBackups()
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

  const resolveCategoryInfo = (categoryName) => {
    const trimmed = String(categoryName || '').trim()
    if (!trimmed) {
      return { category: '', category_id: null, major: '', minor: '' }
    }
    const direct = categories.find((c) => c.full_name === trimmed)
    if (direct) {
      return {
        category: direct.full_name,
        category_id: direct.id,
        major: direct.major,
        minor: direct.minor,
      }
    }
    const parts = trimmed.split('/')
    const major = (parts[0] || '').trim()
    const minor = (parts[1] || '').trim()
    const byParts = categories.find((c) => c.major === major && c.minor === minor)
    if (byParts) {
      return {
        category: byParts.full_name,
        category_id: byParts.id,
        major: byParts.major,
        minor: byParts.minor,
      }
    }
    return { category: trimmed, category_id: null, major, minor }
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

  const ruleEditMinorOptions = useMemo(() => {
    if (!ruleEditForm.major) return []
    return categories.filter((c) => c.major === ruleEditForm.major)
  }, [categories, ruleEditForm.major])

  const recurringMajorOptions = useMemo(
    () => Array.from(new Set(categories.map((c) => c.major))).filter(Boolean),
    [categories],
  )

  const recurringMinorOptions = useMemo(() => {
    if (!recurringForm.major) return []
    return categories.filter((c) => c.major === recurringForm.major)
  }, [categories, recurringForm.major])

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

  const loadLedgerBackups = async () => {
    try {
      const res = await fetch('/api/ledger-backups')
      const data = await res.json()
      if (data.success) {
        setLedgerBackups(data.backups || [])
      } else {
        pushToast(data.error || t('toasts.loadLedgerBackupsFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.loadLedgerBackupsFail'), 'error')
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
      pushToast('请先选择一个账本', 'warn')
      return
    }
    if (ledgers.length <= 1) {
      pushToast(t('toasts.ledgerDeleteLast'), 'warn')
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
        loadLedgerBackups()
        // Refresh page after successful deletion
        setTimeout(() => {
          window.location.reload()
        }, 500)
      } else {
        if (data.code === 'last_ledger') {
          pushToast(t('toasts.ledgerDeleteLast'), 'warn')
        } else {
          pushToast(data.error || t('toasts.ledgerDeleteFail'), 'error')
        }
      }
    } catch (err) {
      console.error('Delete error:', err)
      pushToast(t('toasts.ledgerDeleteFail'), 'error')
    } finally {
      setDeleteConfirmOpen(false)
    }
  }

  const restoreLedgerBackup = async (backup) => {
    try {
      const res = await fetch(`/api/ledger-backups/${backup.id}/restore`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.ledgerRestored'), 'success')
        setCurrentLedgerId(data.ledger_id)
        loadLedgers()
        loadLedgerBackups()
        triggerDashboardRefresh()
      } else {
        pushToast(data.error || t('toasts.ledgerRestoreFail'), 'error')
      }
    } catch (err) {
      console.error('Restore error:', err)
      pushToast(t('toasts.ledgerRestoreFail'), 'error')
    }
  }

  const deleteLedgerBackup = async (backup) => {
    try {
      const res = await fetch(`/api/ledger-backups/${backup.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.backupDeleted'), 'success')
        loadLedgerBackups()
      } else {
        pushToast(data.error || t('toasts.backupDeleteFail'), 'error')
      }
    } catch (err) {
      console.error('Backup delete error:', err)
      pushToast(t('toasts.backupDeleteFail'), 'error')
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

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      if (data.success) {
        setTemplates(data.data || [])
      } else {
        pushToast(data.error || '加载模板失败', 'error')
      }
    } catch {
      pushToast('加载模板失败', 'error')
    }
  }

  const deleteTemplate = (templateName) => {
    Modal.confirm({
      title: '删除模板',
      content: `确定要删除模板 "${templateName}" 吗？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch(`/api/templates/${encodeURIComponent(templateName)}`, {
            method: 'DELETE'
          })
          const data = await res.json()
          if (data.success) {
            pushToast('模板删除成功', 'success')
            loadTemplates()
          } else {
            pushToast(data.error || '删除模板失败', 'error')
          }
        } catch {
          pushToast('删除模板失败', 'error')
        }
      },
    })
  }

  const [templateDeleteOpen, setTemplateDeleteOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState(null)

  const handleTemplateDelete = (templateName) => {
    setTemplateToDelete(templateName)
    setTemplateDeleteOpen(true)
  }

  const confirmTemplateDelete = async () => {
    if (!templateToDelete) return

    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateToDelete)}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        pushToast('模板删除成功', 'success')
        loadTemplates()
      } else {
        pushToast(data.error || '删除模板失败', 'error')
      }
    } catch {
      pushToast('删除模板失败', 'error')
    } finally {
      setTemplateDeleteOpen(false)
      setTemplateToDelete(null)
    }
  }

  const saveTemplateEdit = async () => {
    if (!editingTemplate) return

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: editingTemplate })
      })
      const data = await res.json()
      if (data.success) {
        pushToast('模板保存成功', 'success')
        loadTemplates()
        setTemplateEditOpen(false)
        setEditingTemplate(null)
      } else {
        pushToast(data.error || '保存模板失败', 'error')
      }
    } catch {
      pushToast('保存模板失败', 'error')
    }
  }

  const handleRecurringDelete = (ruleId) => {
    setRecurringToDelete(ruleId)
    setRecurringDeleteOpen(true)
  }

  const confirmRecurringDelete = async () => {
    if (!recurringToDelete) return

    try {
      const res = await fetch(`/api/recurring-rules/${recurringToDelete}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        pushToast('周期性规则删除成功', 'success')
        loadRecurringRules()
      } else {
        pushToast(data.error || '删除周期性规则失败', 'error')
      }
    } catch {
      pushToast('删除周期性规则失败', 'error')
    } finally {
      setRecurringDeleteOpen(false)
      setRecurringToDelete(null)
    }
  }

  const saveRecurringEdit = async () => {
    if (!editingRecurringRule) return

    try {
      const payload = {
        amount: Number(editingRecurringRule.amount) || 0,
        keyword: editingRecurringRule.keyword?.trim() || '',
        category_id: editingRecurringRule.category_id,
        category: editingRecurringRule.category || '',
        schedule_type: editingRecurringRule.schedule_type,
        schedule_value: editingRecurringRule.schedule_value,
        start_date: editingRecurringRule.start_date,
        end_date: editingRecurringRule.end_date || '',
        enabled: Boolean(editingRecurringRule.enabled),
        include_in_budget: Boolean(editingRecurringRule.include_in_budget),
      }

      const res = await fetch(`/api/recurring-rules/${editingRecurringRule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        pushToast('周期性规则保存成功', 'success')
        loadRecurringRules()
        setRecurringEditOpen(false)
        setEditingRecurringRule(null)
      } else {
        pushToast(data.error || '保存周期性规则失败', 'error')
      }
    } catch {
      pushToast('保存周期性规则失败', 'error')
    }
  }

  const addCategoryGroup = async () => {
    setCategoryCreateError('')
    if (!catForm.major.trim()) {
      const err = t('toasts.categoryAddFail')
      setCategoryCreateError(err)
      pushToast(err, 'warn')
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
      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      if (!res.ok) {
        const err = data?.error || t('toasts.categoryAddFail')
        setCategoryCreateError(err)
        return false
      }
      if (data?.success) {
        pushToast(t('toasts.categoryAdded'), 'success')
        setCategoryCreateError('')
        setCatForm({ major: '', minor: '', scope: catForm.scope })
        loadCategories()
        return true
      } else {
        const err = data?.error || t('toasts.categoryAddFail')
        setCategoryCreateError(err)
      }
    } catch {
      const err = t('toasts.categoryAddFail')
      setCategoryCreateError(err)
      pushToast(err, 'error')
    }
    return false
  }

  const deleteCategory = async (id) => {
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
  }

  const addRule = async () => {
    setRuleCreateError('')
    const categoryRecord =
      (ruleForm.category_id && categories.find((c) => c.id === ruleForm.category_id)) ||
      categories.find((c) => c.full_name === ruleForm.category)
    const categoryName = categoryRecord?.full_name || ruleForm.category
    const categoryId = ruleForm.category_id ?? categoryRecord?.id ?? null
    if (!ruleForm.keyword.trim() || !categoryName) {
      const err = t('toasts.ruleAddFail')
      setRuleCreateError(err)
      pushToast(err, 'warn')
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
      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      if (!res.ok) {
        const err = data?.error || t('toasts.ruleAddFail')
        setRuleCreateError(err)
        return false
      }
      if (data?.success) {
        pushToast(t('toasts.ruleAdded'), 'success')
        setRuleCreateError('')
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
        const err = data?.error || t('toasts.ruleAddFail')
        setRuleCreateError(err)
      }
    } catch {
      const err = t('toasts.ruleAddFail')
      setRuleCreateError(err)
      pushToast(err, 'error')
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
      return false
    }
    try {
      const res = await fetch(
        `/api/config/category-groups/${record.id}?${buildQuery(withLedgerParams({}))}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            major,
            minor,
            ledger_id: record.scope === 'global' ? null : currentLedgerId,
          }),
        },
      )
      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      if (!res.ok) {
        Modal.error({ title: '提示', content: data?.error || t('toasts.categoryAddFail') })
        return false
      }
      if (data?.success) {
        pushToast(t('toasts.categoryUpdated'), 'success')
        loadCategories()
        loadRules()
        return true
      } else {
        Modal.error({ title: '提示', content: data?.error || t('toasts.categoryAddFail') })
      }
    } catch {
      pushToast(t('toasts.categoryAddFail'), 'error')
    }
    return false
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
      return false
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
          ledger_id: record.scope === 'global' ? null : currentLedgerId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(t('toasts.ruleUpdated'), 'success')
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

  const openCategoryEdit = (record) => {
    setCategoryEditForm({
      id: record.id,
      major: record.major || '',
      minor: record.minor || '',
      scope: record.ledger_id === null || record.ledger_id === undefined ? 'global' : 'current',
    })
    setCategoryEditOpen(true)
  }

  const handleCategoryEditSave = async () => {
    if (!categoryEditForm.id) return
    const ok = await saveCategoryGroup(categoryEditForm)
    if (ok) setCategoryEditOpen(false)
  }

  const openRuleEdit = (record) => {
    const cat = categoryById.get(record.category_id)
    const parts = (record.category || '').split('/')
    const major = cat?.major || parts[0] || ''
    const minor = cat?.minor || parts[1] || ''
    setRuleEditForm({
      id: record.id,
      keyword: record.keyword || '',
      major,
      minor,
      category_id: record.category_id ?? cat?.id ?? null,
      category: record.category || cat?.full_name || '',
      priority: Number(record.priority) || 2,
      scope: record.ledger_id === null || record.ledger_id === undefined ? 'global' : 'current',
    })
    setRuleEditOpen(true)
  }

  const handleRuleEditMajorChange = (value) => {
    setRuleEditForm((prev) => ({
      ...prev,
      major: value || '',
      minor: '',
      category_id: null,
      category: '',
    }))
  }

  const handleRuleEditMinorChange = (value) => {
    const match = categories.find((c) => c.id === value)
    setRuleEditForm((prev) => ({
      ...prev,
      category_id: value || null,
      category: match ? match.full_name : '',
      major: match ? match.major : prev.major,
      minor: match ? match.minor : '',
    }))
  }

  const handleRuleEditSave = async () => {
    if (!ruleEditForm.id) return
    const ok = await saveRule(ruleEditForm)
    if (ok) setRuleEditOpen(false)
  }

  const normalizeScheduleValues = (type, value) => {
    const values = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : []
    const limit = type === 'weekly' ? 7 : 31
    const normalized = values
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= limit)
    return Array.from(new Set(normalized)).sort((a, b) => a - b)
  }

  const handleRecurringMajorChange = (value) => {
    setRecurringForm((prev) => ({
      ...prev,
      major: value || '',
      minor: '',
      category: '',
      category_id: null,
    }))
  }

  const handleRecurringMinorChange = (value) => {
    const match = categories.find((c) => c.id === value)
    setRecurringForm((prev) => ({
      ...prev,
      minor: match?.minor || '',
      category: match?.full_name || '',
      category_id: match ? match.id : null,
    }))
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

  const handleRecurringRuleMajorChange = (id, value) => {
    setRecurringRules((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, major: value || '', minor: '', category_id: null, category: '' }
          : item,
      ),
    )
  }

  const handleRecurringRuleMinorChange = (id, value) => {
    const match = categories.find((c) => c.id === value)
    setRecurringRules((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            minor: match?.minor || '',
            category_id: value || null,
            category: match ? match.full_name : ''
          }
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
          major: '',
          minor: '',
          category_id: null,
          category: '',
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
    const categoryName = r.category || auto || ''
    const resolved = resolveCategoryInfo(categoryName)
    return {
      clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename: r.filename || `manual-${Date.now()}`,
      merchant: r.merchant || '',
      amount: Number(r.amount || 0),
      category: resolved.category,
      category_id: resolved.category_id,
      major: resolved.major,
      minor: resolved.minor,
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
        if (field === 'major') {
          return {
            ...item,
            major: value || '',
            minor: '',
            category_id: null,
            category: '',
          }
        }
        if (field === 'category_id') {
          const match = categories.find((c) => c.id === value)
          return {
            ...item,
            category_id: value || null,
            category: match ? match.full_name : '',
            major: match ? match.major : item.major,
            minor: match ? match.minor : '',
          }
        }
        const next = { ...item, [field]: value }
        if (field === 'merchant') {
          const auto = autoDetectCategory(value)
          if (auto) {
            const resolved = resolveCategoryInfo(auto)
            return {
              ...next,
              category: resolved.category,
              category_id: resolved.category_id,
              major: resolved.major,
              minor: resolved.minor,
            }
          }
        }
        return next
      }),
    )
  }

  const handleResultMajorChange = (id, value) => {
    updateResult(id, 'major', value || '')
    if (value) {
      setAutoOpenMinorFor(id)
    } else if (autoOpenMinorFor === id) {
      setAutoOpenMinorFor(null)
    }
  }

  const handleResultMinorChange = (id, value) => {
    updateResult(id, 'category_id', value || null)
    if (autoOpenMinorFor === id) {
      setAutoOpenMinorFor(null)
    }
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
          category: r.category || (r.category_id ? categoryById.get(r.category_id)?.full_name || '' : ''),
          category_id: r.category_id,
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

  const batchDeleteBills = async () => {
    if (selectedRowKeys.length === 0) {
      pushToast('请先选择要删除的账单', 'warn')
      return
    }
    setBatchDeleteOpen(true)
  }

  const handleBatchDeleteConfirm = async () => {
    try {
      const res = await fetch('/api/bills/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_ids: selectedRowKeys,
          ledger_id: currentLedgerId
        }),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(`已删除 ${selectedRowKeys.length} 条账单`, 'success')
        setSelectedRowKeys([])
        refreshAnalytics()
        triggerDashboardRefresh()
      } else {
        pushToast(data.error || '删除失败', 'error')
      }
    } catch {
      pushToast('删除失败', 'error')
    } finally {
      setBatchDeleteOpen(false)
    }
  }

  const batchToggleBudget = async (includeInBudget) => {
    if (selectedRowKeys.length === 0) {
      pushToast('请先选择要操作的账单', 'warn')
      return
    }
    setBatchBudgetAction(includeInBudget)
    setBatchBudgetOpen(true)
  }

  const handleBatchBudgetConfirm = async () => {
    const action = batchBudgetAction ? '计入预算' : '不计入预算'
    try {
      const res = await fetch('/api/bills/batch-update-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_ids: selectedRowKeys,
          include_in_budget: batchBudgetAction,
          ledger_id: currentLedgerId
        }),
      })
      const data = await res.json()
      if (data.success) {
        pushToast(`已将 ${selectedRowKeys.length} 条账单设为${action}`, 'success')
        setSelectedRowKeys([])
        refreshAnalytics()
        triggerDashboardRefresh()
      } else {
        pushToast(data.error || '操作失败', 'error')
      }
    } catch {
      pushToast('操作失败', 'error')
    } finally {
      setBatchBudgetOpen(false)
    }
  }

  const quickRange = (range) => {
    const now = dayjs()
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

  const selectedResultKeys = results.filter((r) => r.selected).map((r) => r.clientId)

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
      width: 100,
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
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Select
            value={record.major || undefined}
            placeholder={t('config.major')}
            onChange={(value) => handleResultMajorChange(record.clientId, value)}
            allowClear
            style={{ minWidth: 100 }}
          >
            {majorOptions.map((m) => (
              <Select.Option key={`upload-major-${m}`} value={m}>
                {m}
              </Select.Option>
            ))}
          </Select>
          <Select
            value={record.category_id ?? undefined}
            placeholder={t('config.minor')}
            onChange={(value) => handleResultMinorChange(record.clientId, value)}
            open={
              autoOpenMinorFor === record.clientId && record.major
                ? true
                : undefined
            }
            onDropdownVisibleChange={(open) => {
              if (!open && autoOpenMinorFor === record.clientId) {
                setAutoOpenMinorFor(null)
              }
            }}
            allowClear
            disabled={!record.major}
            style={{ minWidth: 100 }}
          >
            {categories
              .filter((c) => c.major === record.major)
              .map((c) => (
                <Select.Option key={`upload-minor-${c.id}`} value={c.id}>
                  {c.minor || c.full_name}
                </Select.Option>
              ))}
          </Select>
        </Space>
      ),
    },
    {
      title: t('upload.headers')[4],
      dataIndex: 'bill_date',
      key: 'bill_date',
      width: 150,
      render: (_, record) => (
        <DatePicker
          value={record.bill_date ? dayjs(record.bill_date, 'YYYY-MM-DD') : null}
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
    },
    {
      title: t('config.minor'),
      dataIndex: 'minor',
      key: 'minor',
    },
    {
      title: t('config.scope'),
      dataIndex: 'ledger_id',
      key: 'scope',
      width: 140,
      render: (value) => (value === null || value === undefined ? t('config.scopeGlobal') : t('config.scopeCurrent')),
    },
    {
      title: t('config.action'),
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<SaveOutlined />} onClick={() => openCategoryEdit(record)}>
            修改
          </Button>
          <Popconfirm
            title={t('confirm.deleteCategory')}
            okText={t('config.delete')}
            cancelText="取消"
            okButtonProps={{ danger: true }}
            placement="topRight"
            getPopupContainer={(trigger) => trigger.parentElement || document.body}
            onConfirm={() => deleteCategory(record.id)}
          >
            <Button
              danger
              type="link"
              icon={<DeleteOutlined />}
              onClick={(event) => event.stopPropagation()}
            >
              {t('config.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const rulesColumns = [
    {
      title: t('config.tableHeaders')[0],
      dataIndex: 'keyword',
      key: 'keyword',
    },
    {
      title: t('config.tableHeaders')[1],
      dataIndex: 'category',
      key: 'category',
      render: (_, record) => categoryById.get(record.category_id)?.full_name || record.category || '',
    },
    {
      title: t('config.scope'),
      dataIndex: 'ledger_id',
      key: 'scope',
      width: 140,
      render: (value) => (value === null || value === undefined ? t('config.scopeGlobal') : t('config.scopeCurrent')),
    },
    {
      title: t('config.tableHeaders')[2],
      dataIndex: 'priority',
      key: 'priority',
      width: 120,
    },
    {
      title: t('config.action'),
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<SaveOutlined />} onClick={() => openRuleEdit(record)}>
            修改
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
      render: (amount) => `¥${amount}`,
    },
    {
      title: t('recurring.keyword'),
      dataIndex: 'keyword',
      key: 'keyword',
      width: 160,
    },
    {
      title: t('config.major'),
      dataIndex: 'major',
      key: 'major',
      width: 120,
      render: (_, record) => {
        const currentCategory = categories.find(c => c.id === record.category_id)
        return currentCategory?.major || ''
      },
    },
    {
      title: t('config.minor'),
      dataIndex: 'minor',
      key: 'minor',
      width: 140,
      render: (_, record) => {
        const currentCategory = categories.find(c => c.id === record.category_id)
        return currentCategory?.minor || currentCategory?.full_name || ''
      },
    },
    {
      title: t('recurring.scheduleType'),
      dataIndex: 'schedule_type',
      key: 'schedule_type',
      width: 140,
      render: (scheduleType) => scheduleType === 'weekly' ? t('recurring.scheduleWeekly') : t('recurring.scheduleMonthly'),
    },
    {
      title: t('recurring.scheduleValue'),
      dataIndex: 'schedule_value',
      key: 'schedule_value',
      width: 320,
      render: (scheduleValue, record) => {
        const values = Array.isArray(scheduleValue) ? scheduleValue : []
        const options = record.schedule_type === 'weekly' ? weekdayOptions : monthDayOptions
        return values.map(v => {
          const option = options.find(opt => opt.value === v)
          return option ? option.label : v
        }).join(', ')
      },
    },
    {
      title: t('recurring.startDate'),
      dataIndex: 'start_date',
      key: 'start_date',
      width: 140,
    },
    {
      title: t('recurring.endDate'),
      dataIndex: 'end_date',
      key: 'end_date',
      width: 140,
      render: (endDate) => endDate || '-',
    },
    {
      title: t('recurring.includeInBudget'),
      dataIndex: 'include_in_budget',
      key: 'include_in_budget',
      width: 120,
      render: (includeInBudget) => includeInBudget !== false ? '是' : '否',
    },
    {
      title: t('recurring.enabled'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled) => enabled ? '启用' : '禁用',
    },
    {
      title: t('config.action'),
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setEditingRecurringRule(record)
              setRecurringEditOpen(true)
            }}
          >
            编辑
          </Button>
          <Button danger type="link" icon={<DeleteOutlined />} onClick={() => handleRecurringDelete(record.id)}>
            {t('config.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  const templateColumns = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
    },
    {
      title: '匹配关键词',
      dataIndex: 'match',
      key: 'match',
      width: 300,
      render: (match) => {
        const keywords = []
        if (match?.any) keywords.push(...match.any)
        if (match?.all) keywords.push(...match.all)
        if (match?.regex_any) keywords.push(...match.regex_any)
        return keywords.join(', ')
      },
    },
    {
      title: '商品名行号',
      dataIndex: 'extract',
      key: 'item_line',
      width: 120,
      render: (extract) => {
        const itemLine = extract?.item?.line
        if (Array.isArray(itemLine)) {
          return itemLine.join(', ')
        }
        return itemLine || '-'
      },
    },
    {
      title: '金额行号',
      dataIndex: 'extract',
      key: 'amount_line',
      width: 120,
      render: (extract) => {
        const amountLine = extract?.amount?.line
        if (Array.isArray(amountLine)) {
          return amountLine.join(', ')
        }
        return amountLine || '-'
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setEditingTemplate(record)
              setTemplateEditOpen(true)
            }}
          >
            编辑
          </Button>
          <Button
            danger
            type="link"
            icon={<DeleteOutlined />}
            onClick={() => handleTemplateDelete(record.name)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const ledgerBackupColumns = [
    {
      title: t('ledger.backupLedger'),
      dataIndex: 'ledger_name',
      key: 'ledger_name',
      render: (value, record) => value || `ID ${record.ledger_id}`,
    },
    {
      title: t('ledger.backupAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
    },
    {
      title: t('ledger.backupAction'),
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Popconfirm
            title={t('ledger.restoreConfirm')}
            okText={t('ledger.restore')}
            cancelText="取消"
            onConfirm={() => restoreLedgerBackup(record)}
          >
            <Button type="link">{t('ledger.restore')}</Button>
          </Popconfirm>
          <Popconfirm
            title={t('ledger.deleteBackupConfirm')}
            okText={t('ledger.deleteBackup')}
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteLedgerBackup(record)}
          >
            <Button danger type="link" icon={<DeleteOutlined />}>
              {t('ledger.deleteBackup')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const uploadFileList = useMemo(

    () => selectedFiles.map((file) => ({ uid: fileKey(file), name: file.name, status: 'done' })),
    [selectedFiles],
  )

  return (
    <ConfigProvider
      theme={{
        token: {
          // 保持与原有主题相似的配置
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
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
                          value={uploadDate ? dayjs(uploadDate, 'YYYY-MM-DD') : null}
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
                        selectedRowKeys: selectedResultKeys,
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
                            ? [dayjs(analyticsFilters.start_date, 'YYYY-MM-DD'), dayjs(analyticsFilters.end_date, 'YYYY-MM-DD')]
                            : []
                        }
                        onCalendarChange={(dates) => {
                          if (!dates) return
                          const [start, end] = dates
                          setAnalyticsFilters((prev) => ({
                            ...prev,
                            start_date: start ? start.format('YYYY-MM-DD') : prev.start_date,
                            end_date: end ? end.format('YYYY-MM-DD') : prev.end_date,
                          }))
                        }}
                        onChange={(dates) => {
                          if (!dates || !dates[0] || !dates[1]) return
                          const [start, end] = dates
                          const nextFilters = {
                            ...analyticsFilters,
                            start_date: start.format('YYYY-MM-DD'),
                            end_date: end.format('YYYY-MM-DD'),
                          }
                          setAnalyticsFilters(nextFilters)
                          setAnalyticsPage(1)
                          refreshAnalytics(1, nextFilters)
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
                          <Card
                            size="small"
                            hoverable
                            onClick={() => setPieChartOpen(true)}
                            style={{ cursor: 'pointer' }}
                          >
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
                  {selectedRowKeys.length > 0 && (
                    <div style={{ marginBottom: 16, padding: '8px 16px', backgroundColor: '#f0f2f5', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>已选择 {selectedRowKeys.length} 项</Text>
                      <Space>
                        <Button
                          size="small"
                          onClick={() => setSelectedRowKeys([])}
                        >
                          取消选择
                        </Button>
                        <Button
                          size="small"
                          onClick={() => batchToggleBudget(false)}
                        >
                          不计入预算
                        </Button>
                        <Button
                          size="small"
                          onClick={() => batchToggleBudget(true)}
                        >
                          计入预算
                        </Button>
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={batchDeleteBills}
                        >
                          删除
                        </Button>
                      </Space>
                    </div>
                  )}
                  <Table
                    rowKey="id"
                    columns={analyticsColumns}
                    dataSource={analyticsItems}
                    rowSelection={{
                      selectedRowKeys,
                      onChange: setSelectedRowKeys,
                      preserveSelectedRowKeys: true,
                    }}
                    onRow={(record) => ({
                      onClick: (event) => {
                        // 如果点击的是checkbox，不触发编辑
                        if (event.target.closest('.ant-checkbox-wrapper')) {
                          return
                        }
                        openBillEdit(record)
                      },
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
                  title="消费类别占比"
                  open={pieChartOpen}
                  onCancel={() => setPieChartOpen(false)}
                  footer={null}
                  width={800}
                >
                  <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={getPieChartData()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={150}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {getPieChartData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(value) => `${currency}${Number(value).toFixed(2)}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Modal>

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
                            value={billEditForm.bill_date ? dayjs(billEditForm.bill_date, 'YYYY-MM-DD') : null}
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
                              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <Button type="primary" icon={<SaveOutlined />} onClick={saveLedger}>
                                  {t('ledger.save')}
                                </Button>
                              </div>
                            </Form>

                            <Divider style={{ borderTop: '2px solid #bfbfbf', margin: '20px 0' }} />

                            <Row justify="space-between" align="middle">
                              <Col>
                                <Text strong>账单识别管理</Text>
                              </Col>
                              <Col>
                                <Space>
                                  <Button type="primary" onClick={() => setTemplateWizardOpen(true)}>
                                    新增
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      setTemplateManageOpen(true)
                                      loadTemplates()
                                    }}
                                  >
                                    查看修改
                                  </Button>
                                </Space>
                              </Col>
                            </Row>

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
                                    <Form.Item label={t('config.major')}>
                                      <Select
                                        value={recurringForm.major || undefined}
                                        placeholder={t('config.major')}
                                        onChange={handleRecurringMajorChange}
                                        allowClear
                                      >
                                        {recurringMajorOptions.map((m) => (
                                          <Select.Option key={m} value={m}>
                                            {m}
                                          </Select.Option>
                                        ))}
                                      </Select>
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} md={6}>
                                    <Form.Item label={t('config.minor')}>
                                      <Select
                                        value={recurringForm.category_id ?? undefined}
                                        placeholder={t('config.minor')}
                                        onChange={handleRecurringMinorChange}
                                        disabled={!recurringForm.major}
                                        allowClear
                                      >
                                        {recurringMinorOptions.map((c) => (
                                          <Select.Option key={c.id} value={c.id}>
                                            {c.minor || c.full_name}
                                          </Select.Option>
                                        ))}
                                      </Select>
                                    </Form.Item>
                                  </Col>
                                </Row>
                                <Row gutter={12}>
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
                                            ? dayjs(recurringForm.start_date, 'YYYY-MM-DD')
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
                                          recurringForm.end_date ? dayjs(recurringForm.end_date, 'YYYY-MM-DD') : null
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
                                scroll={{ x: 1360 }}
                              />
                            </Modal>

                            <Modal
                              title="账单模板管理"
                              open={templateManageOpen}
                              onCancel={() => setTemplateManageOpen(false)}
                              footer={null}
                              style={{ top: '20%' }}
                              width={1200}
                            >
                              <Table
                                rowKey="name"
                                columns={templateColumns}
                                dataSource={templates}
                                pagination={{ pageSize: 8 }}
                                scroll={{ x: 1000 }}
                              />
                            </Modal>

                            <Modal
                              title="删除模板"
                              open={templateDeleteOpen}
                              onCancel={() => setTemplateDeleteOpen(false)}
                              onOk={confirmTemplateDelete}
                              okButtonProps={{ danger: true }}
                              okText="删除"
                              cancelText="取消"
                              style={{ top: '20%' }}
                            >
                              <p>确定要删除模板 "{templateToDelete}" 吗？</p>
                            </Modal>

                            <Modal
                              title="编辑模板"
                              open={templateEditOpen}
                              onCancel={() => {
                                setTemplateEditOpen(false)
                                setEditingTemplate(null)
                              }}
                              onOk={saveTemplateEdit}
                              okText="保存"
                              cancelText="取消"
                              style={{ top: '20%' }}
                              width={800}
                            >
                              {editingTemplate && (
                                <Form layout="vertical">
                                  <Row gutter={12}>
                                    <Col xs={24} md={12}>
                                      <Form.Item label="模板名称">
                                        <Input
                                          value={editingTemplate.name}
                                          onChange={(e) => setEditingTemplate({
                                            ...editingTemplate,
                                            name: e.target.value
                                          })}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                      <Form.Item label="优先级">
                                        <InputNumber
                                          min={0}
                                          max={1000}
                                          value={editingTemplate.priority}
                                          onChange={(value) => setEditingTemplate({
                                            ...editingTemplate,
                                            priority: value
                                          })}
                                          style={{ width: '100%' }}
                                        />
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                  <Row gutter={12}>
                                    <Col xs={24} md={12}>
                                      <Form.Item label="商品名行号">
                                        <Input
                                          value={Array.isArray(editingTemplate.extract?.item?.line)
                                            ? editingTemplate.extract.item.line.join(',')
                                            : editingTemplate.extract?.item?.line || ''}
                                          onChange={(e) => {
                                            const value = e.target.value
                                            const lineNumbers = value.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n))
                                            setEditingTemplate({
                                              ...editingTemplate,
                                              extract: {
                                                ...editingTemplate.extract,
                                                item: {
                                                  ...editingTemplate.extract?.item,
                                                  line: lineNumbers.length === 1 ? lineNumbers[0] : lineNumbers
                                                }
                                              }
                                            })
                                          }}
                                          placeholder="例如: 0 或 0,1,2"
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                      <Form.Item label="金额行号">
                                        <Input
                                          value={Array.isArray(editingTemplate.extract?.amount?.line)
                                            ? editingTemplate.extract.amount.line.join(',')
                                            : editingTemplate.extract?.amount?.line || ''}
                                          onChange={(e) => {
                                            const value = e.target.value
                                            const lineNumbers = value.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n))
                                            setEditingTemplate({
                                              ...editingTemplate,
                                              extract: {
                                                ...editingTemplate.extract,
                                                amount: {
                                                  ...editingTemplate.extract?.amount,
                                                  line: lineNumbers.length === 1 ? lineNumbers[0] : lineNumbers
                                                }
                                              }
                                            })
                                          }}
                                          placeholder="例如: 5 或 4,5,6"
                                        />
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                  <Form.Item label="匹配关键词 (any)">
                                    <Input.TextArea
                                      rows={3}
                                      value={editingTemplate.match?.any?.join('\n') || ''}
                                      onChange={(e) => {
                                        const keywords = e.target.value.split('\n').filter(k => k.trim())
                                        setEditingTemplate({
                                          ...editingTemplate,
                                          match: {
                                            ...editingTemplate.match,
                                            any: keywords
                                          }
                                        })
                                      }}
                                      placeholder="每行一个关键词"
                                    />
                                  </Form.Item>
                                </Form>
                              )}
                            </Modal>

                            <Modal
                              title="删除周期性规则"
                              open={recurringDeleteOpen}
                              onCancel={() => setRecurringDeleteOpen(false)}
                              onOk={confirmRecurringDelete}
                              okButtonProps={{ danger: true }}
                              okText="删除"
                              cancelText="取消"
                              style={{ top: '20%' }}
                            >
                              <p>确定要删除这条周期性规则吗？</p>
                            </Modal>

                            <Modal
                              title="编辑周期性规则"
                              open={recurringEditOpen}
                              onCancel={() => {
                                setRecurringEditOpen(false)
                                setEditingRecurringRule(null)
                              }}
                              onOk={saveRecurringEdit}
                              okText="保存"
                              cancelText="取消"
                              style={{ top: '20%' }}
                              width={900}
                            >
                              {editingRecurringRule && (
                                <Form layout="vertical">
                                  <Row gutter={12}>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('recurring.amount')}>
                                        <InputNumber
                                          min={0}
                                          value={editingRecurringRule.amount}
                                          onChange={(value) => setEditingRecurringRule({
                                            ...editingRecurringRule,
                                            amount: value
                                          })}
                                          style={{ width: '100%' }}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('recurring.keyword')}>
                                        <Input
                                          value={editingRecurringRule.keyword}
                                          onChange={(e) => setEditingRecurringRule({
                                            ...editingRecurringRule,
                                            keyword: e.target.value
                                          })}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('config.major')}>
                                        <Select
                                          value={categories.find(c => c.id === editingRecurringRule.category_id)?.major || undefined}
                                          placeholder={t('config.major')}
                                          onChange={(value) => {
                                            setEditingRecurringRule({
                                              ...editingRecurringRule,
                                              category_id: null,
                                              category: ''
                                            })
                                          }}
                                          allowClear
                                        >
                                          {recurringMajorOptions.map((m) => (
                                            <Select.Option key={m} value={m}>
                                              {m}
                                            </Select.Option>
                                          ))}
                                        </Select>
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('config.minor')}>
                                        <Select
                                          value={editingRecurringRule.category_id ?? undefined}
                                          placeholder={t('config.minor')}
                                          onChange={(value) => {
                                            const match = categories.find((c) => c.id === value)
                                            setEditingRecurringRule({
                                              ...editingRecurringRule,
                                              category_id: value || null,
                                              category: match ? match.full_name : ''
                                            })
                                          }}
                                          allowClear
                                        >
                                          {categories.filter(c => c.major === categories.find(cat => cat.id === editingRecurringRule.category_id)?.major).map((c) => (
                                            <Select.Option key={c.id} value={c.id}>
                                              {c.minor || c.full_name}
                                            </Select.Option>
                                          ))}
                                        </Select>
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                  <Row gutter={12}>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('recurring.scheduleType')}>
                                        <Select
                                          value={editingRecurringRule.schedule_type}
                                          onChange={(value) => setEditingRecurringRule({
                                            ...editingRecurringRule,
                                            schedule_type: value,
                                            schedule_value: normalizeScheduleValues(value, editingRecurringRule.schedule_value).length
                                              ? normalizeScheduleValues(value, editingRecurringRule.schedule_value)
                                              : [1]
                                          })}
                                        >
                                          <Select.Option value="weekly">{t('recurring.scheduleWeekly')}</Select.Option>
                                          <Select.Option value="monthly">{t('recurring.scheduleMonthly')}</Select.Option>
                                        </Select>
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('recurring.scheduleValue')}>
                                        <Select
                                          mode="multiple"
                                          value={Array.isArray(editingRecurringRule.schedule_value) ? editingRecurringRule.schedule_value : []}
                                          onChange={(value) => setEditingRecurringRule({
                                            ...editingRecurringRule,
                                            schedule_value: value
                                          })}
                                          options={editingRecurringRule.schedule_type === 'weekly' ? weekdayOptions : monthDayOptions}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('recurring.startDate')}>
                                        <DatePicker
                                          value={editingRecurringRule.start_date ? dayjs(editingRecurringRule.start_date, 'YYYY-MM-DD') : null}
                                          onChange={(date) => setEditingRecurringRule({
                                            ...editingRecurringRule,
                                            start_date: date ? date.format('YYYY-MM-DD') : '',
                                            end_date: editingRecurringRule.end_date && date && editingRecurringRule.end_date < date.format('YYYY-MM-DD')
                                              ? date.format('YYYY-MM-DD') : editingRecurringRule.end_date
                                          })}
                                          style={{ width: '100%' }}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('recurring.endDate')}>
                                        <DatePicker
                                          allowClear
                                          value={editingRecurringRule.end_date ? dayjs(editingRecurringRule.end_date, 'YYYY-MM-DD') : null}
                                          onChange={(date) => setEditingRecurringRule({
                                            ...editingRecurringRule,
                                            end_date: date ? date.format('YYYY-MM-DD') : ''
                                          })}
                                          style={{ width: '100%' }}
                                        />
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                  <Row gutter={12}>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('recurring.enabled')}>
                                        <Switch
                                          checked={Boolean(editingRecurringRule.enabled)}
                                          onChange={(checked) => setEditingRecurringRule({
                                            ...editingRecurringRule,
                                            enabled: checked
                                          })}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                      <Form.Item label={t('recurring.includeInBudget')}>
                                        <Switch
                                          checked={editingRecurringRule.include_in_budget !== false}
                                          onChange={(checked) => setEditingRecurringRule({
                                            ...editingRecurringRule,
                                            include_in_budget: checked
                                          })}
                                        />
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                </Form>
                              )}
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
                      <Col span={24}>
                        <Card title="删除账本" style={{ borderColor: '#ff4d4f' }}>
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ marginBottom: 16, color: '#666' }}>
                              删除当前账本将移除所有相关数据，但会自动生成备份，可在下方恢复。
                            </p>
                            <Button
                              danger
                              size="large"
                              icon={<DeleteOutlined />}
                              onClick={deleteLedger}
                              disabled={!currentLedgerId || ledgers.length <= 1}
                            >
                              {t('ledger.delete')}
                            </Button>
                          </div>
                        </Card>
                      </Col>
                      <Col span={24}>
                        <Card title={t('ledger.backupsTitle')}>
                          <Table
                            rowKey="id"
                            columns={ledgerBackupColumns}
                            dataSource={ledgerBackups}
                            pagination={{ pageSize: 6 }}
                            locale={{ emptyText: t('ledger.backupEmpty') }}
                          />
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
                          onCancel={() => {
                            setCategoryCreateOpen(false)
                            setCategoryCreateError('')
                          }}
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
                                <Form.Item
                                  label={t('config.major')}
                                  validateStatus={categoryCreateError ? 'error' : ''}
                                  help={categoryCreateError}
                                >
                                  <Input
                                    value={catForm.major}
                                    placeholder=""
                                    onChange={(e) => {
                                      setCatForm({ ...catForm, major: e.target.value })
                                      if (categoryCreateError) setCategoryCreateError('')
                                    }}
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
                        <Modal
                          title="修改分类"
                          open={categoryEditOpen}
                          onCancel={() => setCategoryEditOpen(false)}
                          onOk={handleCategoryEditSave}
                          okText="修改"
                          cancelText="取消"
                          style={{ top: '20%' }}
                          width={600}
                        >
                          <Form layout="vertical">
                            <Row gutter={12}>
                              <Col xs={24} md={12}>
                                <Form.Item label={t('config.major')}>
                                  <Input
                                    value={categoryEditForm.major}
                                    onChange={(e) =>
                                      setCategoryEditForm({ ...categoryEditForm, major: e.target.value })
                                    }
                                  />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item label={t('config.minor')}>
                                  <Input
                                    value={categoryEditForm.minor}
                                    onChange={(e) =>
                                      setCategoryEditForm({ ...categoryEditForm, minor: e.target.value })
                                    }
                                  />
                                </Form.Item>
                              </Col>
                            </Row>
                            <Row gutter={12}>
                              <Col xs={24} md={12}>
                                <Form.Item label={t('config.scope')}>
                                  <Select
                                    value={categoryEditForm.scope}
                                    onChange={(value) =>
                                      setCategoryEditForm({ ...categoryEditForm, scope: value })
                                    }
                                  >
                                    <Select.Option value="current">{t('config.scopeCurrent')}</Select.Option>
                                    <Select.Option value="global">{t('config.scopeGlobal')}</Select.Option>
                                  </Select>
                                </Form.Item>
                              </Col>
                            </Row>
                          </Form>
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
                              <Button
                                type="primary"
                                onClick={() => {
                                  setRuleCreateError('')
                                  setRuleCreateOpen(true)
                                }}
                              >
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
                          onCancel={() => {
                            setRuleCreateOpen(false)
                            setRuleCreateError('')
                          }}
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
                                <Form.Item
                                  label={t('config.keyword')}
                                  validateStatus={ruleCreateError ? 'error' : ''}
                                  help={ruleCreateError}
                                >
                                  <Input
                                    value={ruleForm.keyword}
                                    placeholder=""
                                    onChange={(e) => {
                                      setRuleForm({ ...ruleForm, keyword: e.target.value })
                                      if (ruleCreateError) setRuleCreateError('')
                                    }}
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
                        <Modal
                          title="修改规则"
                          open={ruleEditOpen}
                          onCancel={() => setRuleEditOpen(false)}
                          onOk={handleRuleEditSave}
                          okText="修改"
                          cancelText="取消"
                          style={{ top: '20%' }}
                          width={800}
                        >
                          <Form layout="vertical">
                            <Row gutter={12}>
                              <Col xs={24} md={8}>
                                <Form.Item label={t('config.keyword')}>
                                  <Input
                                    value={ruleEditForm.keyword}
                                    onChange={(e) =>
                                      setRuleEditForm({ ...ruleEditForm, keyword: e.target.value })
                                    }
                                  />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={8}>
                                <Form.Item label={t('config.major')}>
                                  <Select
                                    value={ruleEditForm.major || undefined}
                                    placeholder={t('config.major')}
                                    onChange={handleRuleEditMajorChange}
                                    allowClear
                                  >
                                    {ruleMajorOptions.map((m) => (
                                      <Select.Option key={`rule-edit-major-${m}`} value={m}>
                                        {m}
                                      </Select.Option>
                                    ))}
                                  </Select>
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={8}>
                                <Form.Item label={t('config.minor')}>
                                  <Select
                                    value={ruleEditForm.category_id ?? undefined}
                                    placeholder={t('config.minor')}
                                    onChange={handleRuleEditMinorChange}
                                    disabled={!ruleEditForm.major}
                                    allowClear
                                  >
                                    {ruleEditMinorOptions.map((c) => (
                                      <Select.Option key={`rule-edit-minor-${c.id}`} value={c.id}>
                                        {c.minor || c.full_name}
                                      </Select.Option>
                                    ))}
                                  </Select>
                                </Form.Item>
                              </Col>
                            </Row>
                            <Row gutter={12}>
                              <Col xs={24} md={8}>
                                <Form.Item label={t('config.priority')}>
                                  <InputNumber
                                    min={1}
                                    value={ruleEditForm.priority}
                                    onChange={(value) =>
                                      setRuleEditForm({ ...ruleEditForm, priority: value })
                                    }
                                    style={{ width: '100%' }}
                                  />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={8}>
                                <Form.Item label={t('config.scope')}>
                                  <Select
                                    value={ruleEditForm.scope}
                                    onChange={(value) => setRuleEditForm({ ...ruleEditForm, scope: value })}
                                  >
                                    <Select.Option value="current">{t('config.scopeCurrent')}</Select.Option>
                                    <Select.Option value="global">{t('config.scopeGlobal')}</Select.Option>
                                  </Select>
                                </Form.Item>
                              </Col>
                            </Row>
                          </Form>
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
            此操作将删除账本及其所有账单数据，并生成备份可供恢复。
          </p>
        </Modal>

        {/* Batch Delete Bills Confirmation Modal */}
        <Modal
          title="确认删除"
          visible={batchDeleteOpen}
          onOk={handleBatchDeleteConfirm}
          onCancel={() => setBatchDeleteOpen(false)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          style={{ top: '20%' }}
        >
          <p>确定要删除选中的 {selectedRowKeys.length} 条账单吗？</p>
          <p style={{ color: '#ff4d4f', marginTop: 8 }}>
            此操作不可恢复，请谨慎操作。
          </p>
        </Modal>

        {/* Batch Budget Update Confirmation Modal */}
        <Modal
          title="确认操作"
          visible={batchBudgetOpen}
          onOk={handleBatchBudgetConfirm}
          onCancel={() => setBatchBudgetOpen(false)}
          okText="确认"
          cancelText="取消"
          style={{ top: '20%' }}
        >
          <p>确定要将选中的 {selectedRowKeys.length} 条账单设为{batchBudgetAction ? '计入预算' : '不计入预算'}吗？</p>
        </Modal>
      </Layout>
    </ConfigProvider>
  )
}

export default App
