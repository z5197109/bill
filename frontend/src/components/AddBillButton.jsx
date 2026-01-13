import { Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import PropTypes from 'prop-types'

function AddBillButton({ onAddBill, loading = false }) {
  return (
    <div 
      className="add-bill-button-container"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1000
      }}
    >
      <Button
        type="primary"
        size="large"
        shape="round"
        icon={<PlusOutlined />}
        onClick={onAddBill}
        loading={loading}
        className="add-bill-button"
        style={{
          backgroundColor: '#001529',
          borderColor: '#001529',
          height: '48px',
          paddingLeft: '20px',
          paddingRight: '20px',
          fontSize: '16px',
          fontWeight: '500',
          boxShadow: '0 4px 12px rgba(0, 21, 41, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 21, 41, 0.4)'
            e.currentTarget.style.backgroundColor = '#002766'
          }
        }}
        onMouseLeave={(e) => {
          if (!loading) {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 21, 41, 0.3)'
            e.currentTarget.style.backgroundColor = '#001529'
          }
        }}
        onMouseDown={(e) => {
          if (!loading) {
            e.currentTarget.style.transform = 'translateY(0) scale(0.95)'
          }
        }}
        onMouseUp={(e) => {
          if (!loading) {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1)'
          }
        }}
      >
        添加账单
      </Button>
      
      {/* Ripple effect overlay */}
      <div 
        className="add-bill-button-ripple"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100%',
          height: '100%',
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.1)',
          transform: 'translate(-50%, -50%) scale(0)',
          opacity: 0,
          pointerEvents: 'none',
          transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      />
    </div>
  )
}

AddBillButton.propTypes = {
  onAddBill: PropTypes.func.isRequired,
  loading: PropTypes.bool
}

AddBillButton.defaultProps = {
  loading: false
}

export default AddBillButton