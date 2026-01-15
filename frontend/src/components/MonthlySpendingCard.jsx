import { Card, Spin, Typography } from 'antd'
import PropTypes from 'prop-types'

const { Text } = Typography

function MonthlySpendingCard({ amount, nonBudgetAmount, loading, currency = '¥' }) {
  return (
    <Card 
      title="本月支出" 
      className="monthly-spending-card"
      style={{ height: '100%' }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">正在加载支出数据...</Text>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div 
            className="monthly-amount"
            style={{ 
              fontSize: '36px', 
              fontWeight: 'bold', 
              color: '#1890ff',
              marginBottom: '8px',
              lineHeight: 1.2
            }}
          >
            {currency} {formatAmount(amount)}
          </div>
          <Text type="secondary" style={{ fontSize: '14px' }}>
            当前月份总支出
          </Text>
          {Number(nonBudgetAmount) > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                其中 {currency} {formatAmount(nonBudgetAmount)} 不计入预算
              </Text>
            </div>
          )}
        </div>
      )}
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
  
  return numAmount.toLocaleString('zh-CN', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })
}

MonthlySpendingCard.propTypes = {
  amount: PropTypes.number,
  nonBudgetAmount: PropTypes.number,
  loading: PropTypes.bool,
  currency: PropTypes.string
}

MonthlySpendingCard.defaultProps = {
  amount: 0,
  nonBudgetAmount: 0,
  loading: false,
  currency: '¥'
}

export default MonthlySpendingCard