import { useState } from 'react'
import {
  Modal,
  Steps,
  Upload,
  Button,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Space,
  Typography,
  Divider,
  Tag,
  Alert
} from 'antd'
import {
  FileImageOutlined,
  SaveOutlined
} from '@ant-design/icons'
import PropTypes from 'prop-types'

const { TextArea } = Input
const { Text, Title } = Typography

function TemplateWizardModal({ visible, onClose, onSuccess }) {
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(false)
  const [ocrData, setOcrData] = useState(null)
  const [form] = Form.useForm()
  const [selectedLines, setSelectedLines] = useState({
    item: null,
    amount: null
  })

  // Step 1: 上传图片并OCR
  const handleUpload = async (file) => {
    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/templates/ocr', {
        method: 'POST',
        body: formData
      })
      const result = await response.json()

      if (result.success) {
        setOcrData(result.data)
        message.success('OCR识别成功')
        setCurrent(1)
      } else {
        message.error(result.error || 'OCR识别失败')
      }
    } catch (error) {
      message.error('上传失败: ' + error.message)
    } finally {
      setLoading(false)
    }

    return false // 阻止默认上传行为
  }

  // Step 2: 配置模板
  const handleNext = () => {
    if (current === 1) {
      // 验证是否选择了必要的行
      if (selectedLines.item === null || selectedLines.amount === null) {
        message.warning('请至少选择商品名称和金额所在行')
        return
      }
    }
    setCurrent(current + 1)
  }

  const handlePrev = () => {
    setCurrent(current - 1)
  }

  // Step 3: 保存模板
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      const template = {
        name: values.name,
        priority: values.priority || 90,
        match: {
          any: values.matchKeywords ? values.matchKeywords.split(',').map(k => k.trim()) : [],
          min_score: 1
        },
        scope: {},
        extract: {
          item: {
            line: selectedLines.item,
            search_window: 0,
            join_next: 0,
            clean: true,
            skip_datetime_phone: true
          },
          amount: {
            line: selectedLines.amount,
            search_window: 0,
            require_regex: "(¥|￥)\\s*\\d",
            money_pick: "max_abs",
            abs: true,
            round: 2
          }
        }
      }

      if (values.category) {
        template.category = values.category
      }

      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          template,
          temp_filename: ocrData?.temp_filename
        })
      })

      const result = await response.json()

      if (result.success) {
        message.success('模板保存成功')
        if (onSuccess) {
          onSuccess(result.data)
        }
        handleClose()
      } else {
        message.error(result.error || '保存失败')
      }
    } catch (error) {
      message.error('保存失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setCurrent(0)
    setOcrData(null)
    setSelectedLines({ item: null, amount: null })
    form.resetFields()
    if (onClose) {
      onClose()
    }
  }

  const steps = [
    {
      title: '上传图片',
      content: (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Upload.Dragger
            accept="image/*"
            beforeUpload={handleUpload}
            showUploadList={false}
            disabled={loading}
          >
            <p className="ant-upload-drag-icon">
              <FileImageOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽账单图片到此处</p>
            <p className="ant-upload-hint">
              支持 JPG、PNG 格式，文件大小不超过 16MB
            </p>
          </Upload.Dragger>
        </div>
      )
    },
    {
      title: '选择字段',
      content: ocrData && (
        <div>
          <Alert
            message="请选择商品名称和金额所在的行号"
            description="点击行号可以选择该行作为对应字段"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <div style={{ display: 'flex', gap: 16 }}>
            {/* OCR结果列表 */}
            <div style={{ flex: 1 }}>
              <Title level={5}>OCR识别结果</Title>
              <List
                size="small"
                bordered
                dataSource={ocrData.lines}
                style={{ maxHeight: 400, overflow: 'auto' }}
                renderItem={(line, index) => (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      backgroundColor:
                        selectedLines.item === index
                          ? '#e6f7ff'
                          : selectedLines.amount === index
                          ? '#fff7e6'
                          : 'white'
                    }}
                    onClick={() => {
                      // 简单逻辑：如果还没选item，就选item；否则选amount
                      if (selectedLines.item === null) {
                        setSelectedLines({ ...selectedLines, item: index })
                      } else if (selectedLines.amount === null) {
                        setSelectedLines({ ...selectedLines, amount: index })
                      } else {
                        // 都选了，就重新选item
                        setSelectedLines({ item: index, amount: null })
                      }
                    }}
                  >
                    <Space>
                      <Tag color="blue">{index}</Tag>
                      <Text>{line}</Text>
                      {selectedLines.item === index && <Tag color="cyan">商品名称</Tag>}
                      {selectedLines.amount === index && <Tag color="orange">金额</Tag>}
                    </Space>
                  </List.Item>
                )}
              />
            </div>

            {/* 预览图 */}
            <div style={{ width: 300 }}>
              <Title level={5}>图片预览</Title>
              <img
                src={ocrData.preview}
                alt="账单预览"
                style={{ width: '100%', border: '1px solid #d9d9d9', borderRadius: 4 }}
              />
            </div>
          </div>

          <Divider />

          <div>
            <Text strong>已选择：</Text>
            <div style={{ marginTop: 8 }}>
              <Text>商品名称行: {selectedLines.item !== null ? selectedLines.item : '未选择'}</Text>
              <br />
              <Text>金额行: {selectedLines.amount !== null ? selectedLines.amount : '未选择'}</Text>
            </div>
          </div>
        </div>
      )
    },
    {
      title: '配置模板',
      content: (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            priority: 90
          }}
        >
          <Form.Item
            label="模板名称"
            name="name"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="例如: taobao_order_detail" />
          </Form.Item>

          <Form.Item
            label="匹配关键词"
            name="matchKeywords"
            rules={[{ required: true, message: '请输入匹配关键词' }]}
            extra="用逗号分隔多个关键词，例如: 订单信息,实付款"
          >
            <Input placeholder="订单信息,实付款" />
          </Form.Item>

          <Form.Item
            label="优先级"
            name="priority"
            extra="数值越大优先级越高，建议范围 50-150"
          >
            <InputNumber min={1} max={200} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            label="分类"
            name="category"
          >
            <Input placeholder="可选，例如: 购物" />
          </Form.Item>
        </Form>
      )
    }
  ]

  return (
    <Modal
      title="账单模板向导"
      open={visible}
      onCancel={handleClose}
      width={800}
      footer={null}
      destroyOnClose
    >
      <Steps current={current} style={{ marginBottom: 24 }}>
        {steps.map((item, index) => (
          <Steps.Step key={item.title} title={item.title} />
        ))}
      </Steps>

      <div style={{ minHeight: 300 }}>
        {steps[current].content}
      </div>

      <Divider />

      <div style={{ textAlign: 'right' }}>
        <Space>
          {current > 0 && (
            <Button onClick={handlePrev} disabled={loading}>
              上一步
            </Button>
          )}
          {current < steps.length - 1 && (
            <Button type="primary" onClick={handleNext} disabled={loading}>
              下一步
            </Button>
          )}
          {current === steps.length - 1 && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={loading}
            >
              保存模板
            </Button>
          )}
        </Space>
      </div>
    </Modal>
  )
}

TemplateWizardModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func,
  onSuccess: PropTypes.func
}

export default TemplateWizardModal
