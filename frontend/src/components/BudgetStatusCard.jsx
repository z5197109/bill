import { Card, Spin, Tooltip, Typography } from 'antd'
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

  // ---------- 3 档提示颜色：绿（良好）/橙（偏高）/红（超预算） ----------
  const diff = usedPercentage - timeProgress
  const isOver = remainingBudget < 0 || usedPercentage > 100
  const isWarn = !isOver && diff > 10 // “超前很多” → 橙色（你可调阈值）

  const msgBg = isOver ? '#fff2f0' : (isWarn ? '#fff7e6' : '#f6ffed')
  const msgColor = isOver ? '#cf1322' : (isWarn ? '#d46b08' : '#389e0d')

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
              <Text type="secondary">已用 {Number(usedPercentage).toFixed(1)}%</Text>
              <Text type="secondary">本月已过 {Number(timeProgress).toFixed(1)}%</Text>
            </div>
          </div>
        </div>

        {/* Budget Summary（✅ 超预算显示“开支超额”） */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {(() => {
              const over = remainingBudget < 0 || usedPercentage > 100
              const label = over ? '开支超额' : '剩余预算'
              const value = over ? Math.abs(remainingBudget) : remainingBudget
              const color = over ? '#ff4d4f' : '#52c41a'

              return (
                <Text style={{ fontSize: '14px' }}>
                  {label}:
                  <span
                    style={{
                      color,
                      fontWeight: 'bold',
                      marginLeft: '4px'
                    }}
                  >
                    ¥{formatAmount(value)}
                  </span>
                </Text>
              )
            })()}
          </div>

          {/* Budget Status Indicator */}
          <div>{getBudgetStatusIndicator(usedPercentage, timeProgress)}</div>
        </div>

        {/* Budget Health Message（✅ 绿/橙/红 三档） */}
        <div style={{ marginTop: '12px', padding: '8px', backgroundColor: msgBg, borderRadius: '4px' }}>
          <Text style={{ fontSize: '13px', color: msgColor }}>
            {(() => {
              const healthMessage = getBudgetHealthMessage(totalBudget, remainingBudget, usedPercentage, timeProgress)
              if (healthMessage.detail) {
                return (
                  <Tooltip title={healthMessage.detail}>
                    <span style={{ cursor: "help" }}>{healthMessage.summary}</span>
                  </Tooltip>
                )
              }
              return healthMessage.summary
            })()}
          </Text>
        </div>
      </div>
    </Card>
  )
}

// Format amount with proper locale and decimal places
function formatAmount(amount) {
  if (amount === null || amount === undefined) return '0.00'
  const numAmount = Number(amount)
  if (isNaN(numAmount)) return '0.00'

  return Math.abs(numAmount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

// Get budget status indicator
function getBudgetStatusIndicator(usedPercentage, timeProgress) {
  const diff = usedPercentage - timeProgress
  if (usedPercentage > 100) {
    return <span style={{ color: '#ff4d4f', fontSize: '12px' }}>⚠️ 超预算</span>
  } else if (diff > 10) {
    return <span style={{ color: '#faad14', fontSize: '12px' }}>⚡ 偏高</span>
  } else {
    return <span style={{ color: '#52c41a', fontSize: '12px' }}>✅ 良好</span>
  }
}

// ✅ Get budget health message（包含：剩余日均可用 + 提高/下降提示）
function getBudgetHealthMessage(totalBudget, remainingBudget, usedPercentage, timeProgress) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-11
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const day = now.getDate()
  const remainingDays = Math.max(0, daysInMonth - day)
  const remainingDaysForCalc = Math.max(1, remainingDays)

  const diff = usedPercentage - timeProgress
  let paceMsg = ''

  const baseDaily = totalBudget > 0 ? totalBudget / daysInMonth : 0
  const remainingDaily = remainingDaysForCalc > 0 ? remainingBudget / remainingDaysForCalc : remainingBudget

  const Pace = () => (paceMsg ? <span>{paceMsg} </span> : null)

  if (remainingBudget < 0) {
    const deficit = Math.abs(remainingBudget)

    return {
      summary: (
        <span>
          <Pace />
          本月剩余 <b>{remainingDays}</b> 天，预算缺口 <b>¥{formatAmount(deficit)}</b>
        </span>
      ),
      detail: null
    }
  }

  if (!totalBudget || totalBudget <= 0) {
    return {
      summary: (
        <span>
          <Pace />
          本月剩余 <b>{remainingDays}</b> 天，日均可用 <b>¥{formatAmount(remainingDaily)}</b>
        </span>
      ),
      detail: null
    }
  }

  const delta = remainingDaily - baseDaily
  const up = delta >= 0
  const arrow = up ? '📈' : '📉'
  const trendWord = up ? '提高' : '下降'

  return {
    summary: (
      <span>
        <Pace />
        本月剩余 <b>{remainingDays}</b> 天，日均可用 <b>¥{formatAmount(remainingDaily)}</b>
      </span>
    ),
    detail: (
      <span>
        较月均日预算 <b>¥{formatAmount(baseDaily)}</b>/天 {trendWord}{' '}
        <b>¥{formatAmount(Math.abs(delta))}</b>/天 {arrow}。
      </span>
    )
  }
}


BudgetStatusCard.propTypes = {
  budgetInfo: PropTypes.shape({
    total_budget: PropTypes.number,
    used_percentage: PropTypes.number,
    time_progress: PropTypes.number,
    remaining_budget: PropTypes.number
  }),
  loading: PropTypes.bool
}

BudgetStatusCard.defaultProps = {
  budgetInfo: {
    total_budget: 0,
    used_percentage: 0,
    time_progress: 0,
    remaining_budget: 0
  },
  loading: false
}

export default BudgetStatusCard
