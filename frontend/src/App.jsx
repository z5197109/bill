import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
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
  Table,
  Tabs,
  Tag,
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
} from '@ant-design/icons'
import moment from 'moment'
import Dashboard from './Dashboard'
import './App.css'
import './Dashboard.css'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const I18N = {
    appTitle: '账单助手 - React',
    appSubtitle: '上传识别、消费分析、分类配置',
    tabs: ['财务看板', '上传识别', '消费分析', '分类与规则'],
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
      weakMatch: '弱匹配',
      addRule: '添加规则',
      action: '操作',
      delete: '删除',
      tableHeaders: ['关键词', '分类', '优先级', '操作'],
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
      categoryAddFail: '添加分类失败',
      categoryDeleted: '分类已删除',
      categoryDeleteFail: '删除分类失败',
      ruleAdded: '规则已添加',
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
    },
    confirm: {
      deleteCategory: '删除该分类？',
      deleteRule: '删除该规则？',
    },
  }

const today = () => moment().format('YYYY-MM-DD')
const buildQuery = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()

const numberOrZero = (val) => {
  const n = Number(val)
  return Number.isNaN(n) ? 0 : n
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
  const pageSize = 20

  // Dashboard refresh trigger
  const [dashboardRefreshTrigger, setDashboardRefreshTrigger] = useState(null)

  const [catForm, setCatForm] = useState({ major: '', minor: '', scope: 'current' })
  const [ruleForm, setRuleForm] = useState({
    keyword: '',
    category: '',
    priority: 1,
    is_weak: false,
    scope: 'current',
  })

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
    if (!currentLedgerId) return
    Modal.confirm({
      title: t('ledger.deleteConfirm'),
      okText: t('ledger.delete'),
      cancelText: 'ȡ��',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch(`/api/ledgers/${currentLedgerId}`, { method: 'DELETE' })
          const data = await res.json()
          if (data.success) {
            pushToast(t('toasts.ledgerDeleted'), 'success')
            setCurrentLedgerId(null)
            loadLedgers()
          } else {
            pushToast(data.error || t('toasts.ledgerDeleteFail'), 'error')
          }
        } catch {
          pushToast(t('toasts.ledgerDeleteFail'), 'error')
        }
      },
    })
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

  const addCategoryGroup = async () => {
    if (!catForm.major.trim()) {
      pushToast(t('toasts.categoryAddFail'), 'warn')
      return
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
      } else {
        pushToast(data.error || t('toasts.categoryAddFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.categoryAddFail'), 'error')
    }
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
    if (!ruleForm.keyword.trim() || !ruleForm.category) {
      pushToast(t('toasts.ruleAddFail'), 'warn')
      return
    }
    try {
      const payload = {
        keyword: ruleForm.keyword.trim(),
        category: ruleForm.category,
        priority: Number(ruleForm.priority) || 1,
        is_weak: !!ruleForm.is_weak,
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
        setRuleForm({ keyword: '', category: '', priority: 1, is_weak: false, scope: ruleForm.scope })
        loadRules()
      } else {
        pushToast(data.error || t('toasts.ruleAddFail'), 'error')
      }
    } catch {
      pushToast(t('toasts.ruleAddFail'), 'error')
    }
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

  const refreshAnalytics = async (page = analyticsPage, filtersOverride = null) => {
    if (currentLedgerId === null) {
      return
    }
    setAnalyticsPage(page)
    const params = withLedgerParams(filtersOverride || analyticsFilters)
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
    { title: t('analytics.headers')[0], dataIndex: 'bill_date', key: 'bill_date', width: 140 },
    { title: t('analytics.headers')[1], dataIndex: 'merchant', key: 'merchant' },
    { title: t('analytics.headers')[2], dataIndex: 'category', key: 'category', width: 160 },
    {
      title: t('analytics.headers')[3],
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (value) => `${currency} ${Number(value).toFixed(2)}`,
    },
  ]

  const rulesColumns = [
    { title: t('config.tableHeaders')[0], dataIndex: 'keyword', key: 'keyword' },
    { title: t('config.tableHeaders')[1], dataIndex: 'category', key: 'category' },
    { title: t('config.tableHeaders')[2], dataIndex: 'priority', key: 'priority', width: 100 },
    {
      title: t('config.tableHeaders')[3],
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button danger type="link" onClick={() => deleteRule(record.id)} icon={<DeleteOutlined />}>
          {t('config.delete')}
        </Button>
      ),
    },
  ]

  const groupedCategories = useMemo(() => {
    return categories.reduce((acc, c) => {
      acc[c.major] = acc[c.major] || []
      acc[c.major].push(c)
      return acc
    }, {})
  }, [categories])

  const uploadFileList = useMemo(
    () => selectedFiles.map((file) => ({ uid: fileKey(file), name: file.name, status: 'done' })),
    [selectedFiles],
  )

  return (
    <Layout className="app" style={{
    background:
      "radial-gradient(circle at 10% 20%, rgba(79, 70, 229, 0.08), transparent 25%)," +
      "radial-gradient(circle at 80% 0%, rgba(14, 165, 233, 0.08), transparent 25%)," +
      "#f3f4f6"
  }}>
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
              <Card title={t('ledger.section')}>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form layout="vertical">
                      <Form.Item label={t('ledger.name')}>
                        <Input value={ledgerForm.name} onChange={(e) => setLedgerForm({ ...ledgerForm, name: e.target.value })} />
                      </Form.Item>
                      <Form.Item label={t('ledger.budget')}>
                        <InputNumber
                          min={0}
                          value={ledgerForm.monthly_budget}
                          onChange={(value) => setLedgerForm({ ...ledgerForm, monthly_budget: value })}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                      <Space>
                        <Button type="primary" icon={<SaveOutlined />} onClick={saveLedger}>
                          {t('ledger.save')}
                        </Button>
                        <Button danger onClick={deleteLedger}>
                          {t('ledger.delete')}
                        </Button>
                      </Space>
                    </Form>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form layout="vertical">
                      <Form.Item label={t('ledger.newLedger')}>
                        <Input value={newLedger.name} onChange={(e) => setNewLedger({ ...newLedger, name: e.target.value })} />
                      </Form.Item>
                      <Form.Item label={t('ledger.budget')}>
                        <InputNumber
                          min={0}
                          value={newLedger.monthly_budget}
                          onChange={(value) => setNewLedger({ ...newLedger, monthly_budget: value })}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                      <Button type="dashed" icon={<PlusOutlined />} onClick={createLedger}>
                        {t('ledger.create')}
                      </Button>
                    </Form>
                  </Col>
                </Row>
              </Card>

              <Row gutter={16}>
                <Col xs={24} lg={12}>
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
                        <Text>{t('upload.billDate')}</Text>
                        <DatePicker
                          value={uploadDate ? moment(uploadDate, 'YYYY-MM-DD') : null}
                          onChange={(date) => setUploadDate(date ? date.format('YYYY-MM-DD') : today())}
                        />
                        <Button onClick={() => setUploadDate(today())}>{t('upload.today')}</Button>
                      </Space>

                      <Space>
                        <Button type="primary" icon={<UploadOutlined />} onClick={processFiles} loading={uploading}>
                          {t('upload.run')}
                        </Button>
                        <Button onClick={addManualRow}>{t('upload.addManual')}</Button>
                      </Space>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
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
                </Col>
              </Row>
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
                  <Col xs={24} md={2}>
                    <Button type="primary" onClick={() => refreshAnalytics(1)}>
                      {t('analytics.refresh')}
                    </Button>
                  </Col>
                </Row>

                <Divider />

                <Space size="small" wrap>
                  <Button onClick={() => quickRange('today')}>{t('analytics.rangeToday')}</Button>
                  <Button onClick={() => quickRange('week')}>{t('analytics.rangeWeek')}</Button>
                  <Button onClick={() => quickRange('month')}>{t('analytics.rangeMonth')}</Button>
                  <Button onClick={() => quickRange('year')}>{t('analytics.rangeYear')}</Button>
                  <Button onClick={resetAnalyticsFilters}>{t('analytics.reset')}</Button>
                </Space>

                {analyticsSummary && (
                  <Row gutter={12} style={{ marginTop: 16 }}>
                    <Col xs={12} md={6}>
                      <Card size="small">
                        <Statistic title={t('analytics.totalAmount')} value={analyticsSummary.total_amount} prefix={currency} precision={2} />
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
                )}
              </Card>

              <Card>
                <Table
                  rowKey="id"
                  columns={analyticsColumns}
                  dataSource={analyticsItems}
                  pagination={{
                    current: analyticsPage,
                    pageSize,
                    total: analyticsTotal,
                    onChange: (page) => refreshAnalytics(page),
                    showSizeChanger: false,
                  }}
                  size="middle"
                  scroll={{ x: 800 }}
                />
              </Card>
            </Space>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('tabs.3')} key="config">
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <Card title={t('config.categoriesTitle')}>
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
                      <Col xs={24} md={12}>
                        <Form.Item label=" ">
                          <Button type="primary" icon={<PlusOutlined />} onClick={addCategoryGroup}>
                            {t('config.addCategory')}
                          </Button>
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>

                  <Divider />

                  {Object.keys(groupedCategories).length === 0 && <Text>{t('config.noCategories')}</Text>}
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {Object.entries(groupedCategories).map(([major, minors]) => (
                      <div key={major}>
                        <Text strong>{major}</Text>
                        <div style={{ marginTop: 8 }}>
                          <Space size={[8, 8]} wrap>
                            {minors.map((m) => (
                              <Tag
                                key={m.id}
                                closable
                                onClose={(e) => {
                                  e.preventDefault()
                                  deleteCategory(m.id)
                                }}
                              >
                                {m.minor || 'N/A'}
                              </Tag>
                            ))}
                          </Space>
                        </div>
                      </div>
                    ))}
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title={t('config.rulesTitle')}>
                  <Form layout="vertical">
                    <Row gutter={12}>
                      <Col xs={24} md={12}>
                        <Form.Item label={t('config.keyword')}>
                          <Input
                            value={ruleForm.keyword}
                            placeholder=""
                            onChange={(e) => setRuleForm({ ...ruleForm, keyword: e.target.value })}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label={t('config.category')}>
                          <Select
                            value={ruleForm.category || undefined}
                            placeholder={t('config.category')}
                            onChange={(value) => setRuleForm({ ...ruleForm, category: value || '' })}
                          >
                            {categories.map((c) => (
                              <Select.Option key={c.id} value={c.full_name}>
                                {c.full_name}
                              </Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={12} align="middle">
                      <Col xs={24} md={6}>
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
                      <Col xs={24} md={6}>
                        <Form.Item label=" ">
                          <Checkbox checked={ruleForm.is_weak} onChange={(e) => setRuleForm({ ...ruleForm, is_weak: e.target.checked })}>
                            {t('config.weakMatch')}
                          </Checkbox>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        <Form.Item label=" ">
                          <Button type="primary" icon={<PlusOutlined />} onClick={addRule}>
                            {t('config.addRule')}
                          </Button>
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>

                  <Divider />

                  <Table rowKey="id" columns={rulesColumns} dataSource={rules} pagination={{ pageSize: 8 }} />
                </Card>
              </Col>
            </Row>
          </Tabs.TabPane>
        </Tabs>
      </Layout.Content>
    </Layout>
  )
}

export default App
