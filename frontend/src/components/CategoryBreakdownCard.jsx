import { Card, Col, Row, Spin, Typography, Empty } from 'antd'
import { ShoppingOutlined } from '@ant-design/icons'
import PropTypes from 'prop-types'

const { Text } = Typography

function CategoryBreakdownCard({ categories, loading }) {
  if (loading) {
    return (
      <Card 
        title="主要支出类别" 
        className="category-breakdown-card"
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">正在加载类别数据...</Text>
          </div>
        </div>
      </Card>
    )
  }

  // Handle empty state
  if (!categories || categories.length === 0) {
    return (
      <Card 
        title="主要支出类别" 
        className="category-breakdown-card"
      >
        <Empty
          image={<ShoppingOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
          description={
            <span style={{ color: '#999' }}>
              暂无支出数据
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                开始记录账单后，这里将显示您的主要支出类别
              </Text>
            </span>
          }
        />
      </Card>
    )
  }

  // Sort categories by amount (descending) and take top 3
  const sortedCategories = [...categories]
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 3)

  return (
    <Card 
      title="主要支出类别" 
      className="category-breakdown-card"
      extra={
        <Text type="secondary" style={{ fontSize: '12px' }}>
          前 {Math.min(categories.length, 3)} 项
        </Text>
      }
    >
      <Row gutter={[16, 16]}>
        {sortedCategories.map((category, index) => (
          <Col xs={24} sm={8} key={`${category.category}-${index}`}>
            <CategoryItem 
              category={category}
              rank={index + 1}
            />
          </Col>
        ))}
      </Row>
      
      {/* Summary info */}
      {categories.length > 3 && (
        <div style={{ 
          marginTop: '16px', 
          padding: '8px 12px', 
          backgroundColor: '#fafafa', 
          borderRadius: '6px',
          textAlign: 'center'
        }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            还有 {categories.length - 3} 个其他类别
          </Text>
        </div>
      )}
    </Card>
  )
}

function CategoryItem({ category, rank }) {
  const {
    category: categoryName = '未知类别',
    amount = 0,
    count = 0,
    icon = '📦',
    color = '#95de64'
  } = category

  return (
    <div 
      className="category-item"
      style={{ 
        display: 'flex', 
        alignItems: 'center',
        padding: '16px 12px',
        backgroundColor: '#fafafa',
        borderRadius: '8px',
        border: '1px solid #f0f0f0',
        position: 'relative',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#f0f0f0'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#fafafa'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Rank Badge */}
      <div 
        className="category-rank-badge"
        style={{
          backgroundColor: color,
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 'bold',
          color: 'white',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          zIndex: 10
        }}
      >
        {rank}
      </div>
      
      {/* Category Icon */}
      <div 
        className="category-icon"
        style={{ 
          fontSize: '28px', 
          marginRight: '12px',
          minWidth: '36px',
          textAlign: 'center',
          filter: `drop-shadow(0 2px 4px ${color}40)`
        }}
      >
        {icon}
      </div>
      
      {/* Category Info */}
      <div className="category-info" style={{ flex: 1, minWidth: 0 }}>
        <div 
          className="category-name"
          style={{ 
            fontWeight: 'bold',
            marginBottom: '4px',
            fontSize: '14px',
            color: '#262626',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          title={categoryName}
        >
          {categoryName}
        </div>
        
        <div 
          className="category-amount"
          style={{ 
            color: color,
            marginBottom: '2px',
            fontSize: '16px',
            fontWeight: '600'
          }}
        >
          ¥{formatAmount(amount)}
        </div>
        
        <div 
          className="category-count"
          style={{ 
            fontSize: '11px', 
            color: '#8c8c8c'
          }}
        >
          {count} 笔交易
        </div>
      </div>
      
      {/* Amount Bar Indicator */}
      <div style={{ 
        width: '4px', 
        height: '40px', 
        backgroundColor: color,
        borderRadius: '2px',
        marginLeft: '8px',
        opacity: 0.8
      }} />
    </div>
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

CategoryBreakdownCard.propTypes = {
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      category: PropTypes.string,
      amount: PropTypes.number,
      count: PropTypes.number,
      icon: PropTypes.string,
      color: PropTypes.string
    })
  ),
  loading: PropTypes.bool
}

CategoryBreakdownCard.defaultProps = {
  categories: [],
  loading: false
}

CategoryItem.propTypes = {
  category: PropTypes.shape({
    category: PropTypes.string,
    amount: PropTypes.number,
    count: PropTypes.number,
    icon: PropTypes.string,
    color: PropTypes.string
  }).isRequired,
  rank: PropTypes.number.isRequired
}

export default CategoryBreakdownCard