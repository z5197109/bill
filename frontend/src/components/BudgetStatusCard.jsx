import { Card, Spin, Typography } from 'antd'
import PropTypes from 'prop-types'

const { Text } = Typography

function BudgetStatusCard({ budgetInfo, loading }) {
  if (loading) {
    return (
      <Card 
        title="预算状态" 
        className="budget-status-card"
        style={{ height: '100%' }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">正在加载预算数据...</Text>
          </div>
        </div>
      </Card>
    )
  }

  const {
    total_budget: totalBudget = 0,
    used_percentage: usedPercentage = 0,
    time_progress: timeProgress = 0,
    remaining_budget: remainingBudget = 0
  } = budgetInfo || {}

  return (
    <Card 
      title="预算状态" 
      className="budget-status-card"
      style={{ height: '100%' }}
    >
      <div>
        {/* Budget Overview */}
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ fontSize: '16px' }}>
            总预算: ¥{formatAmount(totalBudget)}
          </Text>
        </div>
        
        {/* Custom Progress Bar with Time Marker */}
        <div style={{ marginBottom: '16px' }}>
          <div className="budget-progress-container">
            <div 
              className="budget-progress-bar"
              style={{ 
                width: '100%', 
                height: '20px', 
                backgroundColor: '#f0f0f0', 
                borderRadius: '10px',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Used amount (navy blue) */}
              <div 
                className="budget-progress-used"
                style={{
                  width: `${Math.min(usedPercentage, 100)}%`,
                  height: '100%',
                  backgroundColor: '#1A237E',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transition: 'width 0.3s ease',
                  borderRadius: usedPercentage >= 100 ? '10px' : '10px 0 0 10px'
                }} 
              />
              
              {/* Remaining budget (light blue) - only show if not over budget */}
              {usedPercentage < 100 && (
                <div 
                  style={{
                    width: `${100 - usedPercentage}%`,
                    height: '100%',
                    backgroundColor: '#90CAF9',
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    borderRadius: '0 10px 10px 0'
                  }} 
                />
              )}
              
              {/* Time progress marker (dashed line) */}
              <div 
                className="budget-progress-marker"
                style={{
                  position: 'absolute',
                  left: `${Math.min(timeProgress, 100)}%`,
                  top: '-2px',
                  height: 'calc(100% + 4px)',
                  width: '2px',
                  backgroundColor: '#1890ff',
                  borderLeft: '2px dashed #1890ff',
                  zIndex: 10
                }} 
              />
              
              {/* Time progress label */}
              <div
                style={{
                  position: 'absolute',
                  left: `${Math.min(timeProgress, 100)}%`,
                  top: '-25px',
                  transform: 'translateX(-50%)',
                  fontSize: '10px',
                  color: '#1890ff',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}
              >
                今天
              </div>
            </div>
            
            {/* Progress Labels */}
            <div 
              className="budget-progress-labels"
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                marginTop: '8px',
                fontSize: '12px'
              }}
            >
              <Text type="secondary">
                已用 {usedPercentage.toFixed(1)}%
              </Text>
              <Text type="secondary">
                本月已过 {timeProgress.toFixed(1)}%
              </Text>
            </div>
          </div>
        </div>
        
        {/* Budget Summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text style={{ fontSize: '14px' }}>
              剩余预算: 
              <span style={{ 
                color: remainingBudget >= 0 ? '#52c41a' : '#ff4d4f',
                fontWeight: 'bold',
                marginLeft: '4px'
              }}>
                ¥{formatAmount(remainingBudget)}
              </span>
            </Text>
          </div>
          
          {/* Budget Status Indicator */}
          <div>
            {getBudgetStatusIndicator(usedPercentage, timeProgress)}
          </div>
        </div>
        
        {/* Budget Health Message */}
        <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#f6ffed', borderRadius: '4px' }}>
          <Text style={{ fontSize: '12px', color: '#389e0d' }}>
            {getBudgetHealthMessage(usedPercentage, timeProgress)}
          </Text>
        </div>
      </div>
    </Card>
  )
}

// Format amount with proper locale and decimal places
function formatAmount(amount) {
  if (amount === null || amount === undefined) {
    return '0.00'
  }
  
  const numAmount = Number(amount)
  if (isNaN(numAmount)) {
    return '0.00'
  }
  
  return Math.abs(numAmount).toLocaleString('zh-CN', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })
}

// Get budget status indicator
function getBudgetStatusIndicator(usedPercentage, timeProgress) {
  if (usedPercentage > 100) {
    return <span style={{ color: '#ff4d4f', fontSize: '12px' }}>⚠️ 超预算</span>
  } else if (usedPercentage > timeProgress + 10) {
    return <span style={{ color: '#faad14', fontSize: '12px' }}>⚡ 偏高</span>
  } else {
    return <span style={{ color: '#52c41a', fontSize: '12px' }}>✅ 良好</span>
  }
}

// Get budget health message
function getBudgetHealthMessage(usedPercentage, timeProgress) {
  const difference = usedPercentage - timeProgress
  
  if (usedPercentage > 100) {
    return `已超出预算 ${(usedPercentage - 100).toFixed(1)}%，建议控制支出`
  } else if (difference > 15) {
    return `支出进度超前 ${difference.toFixed(1)}%，建议适当控制消费`
  } else if (difference > 5) {
    return `支出进度略微超前，请注意控制`
  } else if (difference < -10) {
    return `支出进度良好，剩余预算充足`
  } else {
    return `支出进度正常，继续保持良好的理财习惯`
  }
}

BudgetStatusCard.propTypes = {
  budgetInfo: PropTypes.shape({
    totalBudget: PropTypes.number,
    usedAmount: PropTypes.number,
    usedPercentage: PropTypes.number,
    timeProgress: PropTypes.number,
    remainingBudget: PropTypes.number
  }),
  loading: PropTypes.bool
}

BudgetStatusCard.defaultProps = {
  budgetInfo: {
    totalBudget: 0,
    usedAmount: 0,
    usedPercentage: 0,
    timeProgress: 0,
    remainingBudget: 0
  },
  loading: false
}

export default BudgetStatusCard