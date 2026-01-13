import { useEffect, useState, useRef } from 'react'
import {
  Card,
  Col,
  Row,
  Spin,
  Alert,
  Button,
  Typography,
  Space
} from 'antd'
import {
  ReloadOutlined,
  PlusOutlined
} from '@ant-design/icons'
import moment from 'moment'
import { MonthlySpendingCard, BudgetStatusCard, CategoryBreakdownCard, AddBillButton } from './components'
import PropTypes from 'prop-types'

const { Title, Text } = Typography

function Dashboard({ currentLedgerId, onAddBill, refreshTrigger }) {
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const lastRefreshTriggerRef = useRef(null)

  // Fetch dashboard data with caching
  const fetchDashboardData = async (forceRefresh = false) => {
    if (!currentLedgerId) {
      setError('请先选择一个账本')
      setLoading(false)
      return
    }

    try {
      // Only show loading for initial load or forced refresh
      if (forceRefresh || !dashboardData) {
        setLoading(true)
      }
      setError(null)
      
      const response = await fetch(`/api/dashboard/summary?ledger_id=${currentLedgerId}`)
      const result = await response.json()
      
      if (result.success) {
        setDashboardData(result.data)
        setLastRefresh(Date.now())
      } else {
        setError(result.error || '获取看板数据失败')
      }
    } catch (err) {
      setError('网络连接失败，请检查网络设置')
    } finally {
      setLoading(false)
    }
  }

  // Load data when component mounts or ledger changes
  useEffect(() => {
    if (!currentLedgerId) {
      setError('请先选择一个账本')
      setLoading(false)
      return
    }

    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch(`/api/dashboard/summary?ledger_id=${currentLedgerId}`)
        const result = await response.json()
        
        if (result.success) {
          setDashboardData(result.data)
          setLastRefresh(Date.now())
        } else {
          setError(result.error || '获取看板数据失败')
        }
      } catch (err) {
        setError('网络连接失败，请检查网络设置')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [currentLedgerId])

  // Auto-refresh when refreshTrigger changes (e.g., after bill operations)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger !== lastRefreshTriggerRef.current) {
      lastRefreshTriggerRef.current = refreshTrigger
      setLastRefresh(refreshTrigger)
      fetchDashboardData()
    }
  }, [refreshTrigger]) // 移除lastRefresh依赖项，避免无限循环

  // Auto-refresh every 5 minutes to keep data current
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading && currentLedgerId) {
        fetchDashboardData()
      }
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [loading, currentLedgerId])

  // Handle manual refresh
  const handleRefresh = () => {
    fetchDashboardData(true) // Force refresh with loading indicator
  }

  // Handle add bill navigation
  const handleAddBill = () => {
    if (onAddBill) {
      onAddBill()
    }
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text>正在加载看板数据...</Text>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <Alert
          message="数据加载失败"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={handleRefresh}>
              重试
            </Button>
          }
        />
      </div>
    )
  }

  // No data state
  if (!dashboardData) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Text>暂无数据</Text>
        <div style={{ marginTop: 16 }}>
          <Button onClick={handleRefresh} icon={<ReloadOutlined />}>
            刷新
          </Button>
        </div>
      </div>
    )
  }

  const { monthly_spending, budget_info, top_categories, metadata } = dashboardData

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            财务看板
            {loading && !dashboardData && <Spin size="small" style={{ marginLeft: 8 }} />}
          </Title>
          <Text type="secondary">
            {moment(metadata.month, 'YYYY-MM').format('YYYY年M月')} 数据概览
            {lastRefresh && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: '12px' }}>
                • 更新于 {moment(lastRefresh).format('HH:mm')}
              </Text>
            )}
          </Text>
        </div>
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
            loading={loading}
            size="small"
          >
            刷新
          </Button>
        </Space>
      </div>

      {/* Main Dashboard Grid */}
      <Row gutter={[16, 16]}>
        {/* Monthly Spending Card - Full width on mobile, half on desktop */}
        <Col xs={24} lg={12}>
          <MonthlySpendingCard 
            amount={monthly_spending}
            loading={loading}
            currency="¥"
          />
        </Col>

        {/* Budget Status Card */}
        <Col xs={24} lg={12}>
          <BudgetStatusCard 
            budgetInfo={budget_info}
            loading={loading}
          />
        </Col>

        {/* Top Categories Card */}
        <Col xs={24}>
          <CategoryBreakdownCard 
            categories={top_categories}
            loading={loading}
          />
        </Col>
      </Row>

      {/* Floating Add Bill Button */}
      <AddBillButton 
        onAddBill={handleAddBill}
        loading={loading}
      />
    </div>
  )
}

Dashboard.propTypes = {
  currentLedgerId: PropTypes.number,
  onAddBill: PropTypes.func,
  refreshTrigger: PropTypes.number
}

Dashboard.defaultProps = {
  currentLedgerId: null,
  onAddBill: null,
  refreshTrigger: null
}

export default Dashboard