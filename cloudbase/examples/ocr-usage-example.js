// OCR 服务使用示例
// 在小程序页面中使用

const api = require('../utils/api')

Page({
  data: {
    ocrResults: []
  },

  // 选择图片并进行 OCR 识别
  chooseAndProcessImage() {
    const that = this
    
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const filePath = res.tempFilePaths[0]
        
        // 显示加载提示
        wx.showLoading({
          title: '识别中...'
        })
        
        // 读取图片为 base64
        wx.getFileSystemManager().readFile({
          filePath: filePath,
          encoding: 'base64',
          success(fileRes) {
            // 调用 OCR 识别
            api.processImageOCR(fileRes.data, getApp().globalData.currentLedgerId)
              .then(result => {
                wx.hideLoading()
                
                console.log('OCR 识别结果:', result)
                
                // 显示识别结果
                that.setData({
                  ocrResults: [result, ...that.data.ocrResults]
                })
                
                // 询问是否保存为账单
                wx.showModal({
                  title: '识别完成',
                  content: `商户: ${result.parsed_data.merchant}\n金额: ¥${result.parsed_data.amount}\n分类: ${result.parsed_data.suggested_category}`,
                  confirmText: '保存账单',
                  cancelText: '重新识别',
                  success(modalRes) {
                    if (modalRes.confirm) {
                      that.saveBillFromOCR(result.parsed_data)
                    }
                  }
                })
              })
              .catch(error => {
                wx.hideLoading()
                wx.showToast({
                  title: '识别失败: ' + error.message,
                  icon: 'none'
                })
              })
          },
          fail(error) {
            wx.hideLoading()
            wx.showToast({
              title: '读取图片失败',
              icon: 'none'
            })
          }
        })
      }
    })
  },

  // 批量处理多张图片
  batchProcessImages() {
    const that = this
    
    wx.chooseImage({
      count: 9, // 最多选择9张
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const filePaths = res.tempFilePaths
        
        wx.showLoading({
          title: `处理中 0/${filePaths.length}`
        })
        
        // 将所有图片转换为 base64
        const imagePromises = filePaths.map((filePath, index) => {
          return new Promise((resolve, reject) => {
            wx.getFileSystemManager().readFile({
              filePath: filePath,
              encoding: 'base64',
              success(fileRes) {
                resolve({
                  index: index,
                  image_base64: fileRes.data
                })
              },
              fail: reject
            })
          })
        })
        
        Promise.all(imagePromises)
          .then(images => {
            // 调用批量 OCR 识别
            return api.batchProcessImages(images, getApp().globalData.currentLedgerId)
          })
          .then(result => {
            wx.hideLoading()
            
            console.log('批量识别结果:', result)
            
            const successResults = result.results.filter(r => r.success)
            
            wx.showModal({
              title: '批量识别完成',
              content: `成功识别 ${result.success_count}/${result.total} 张图片`,
              confirmText: '查看结果',
              success(modalRes) {
                if (modalRes.confirm) {
                  that.showBatchResults(successResults)
                }
              }
            })
          })
          .catch(error => {
            wx.hideLoading()
            wx.showToast({
              title: '批量识别失败: ' + error.message,
              icon: 'none'
            })
          })
      }
    })
  },

  // 保存 OCR 识别结果为账单
  saveBillFromOCR(parsedData) {
    const billData = {
      ledger_id: getApp().globalData.currentLedgerId,
      merchant: parsedData.merchant,
      amount: parsedData.amount,
      category: parsedData.category,
      bill_date: parsedData.bill_date,
      raw_text: parsedData.raw_text,
      is_manual: false,
      include_in_budget: true
    }
    
    api.createBill(billData)
      .then(result => {
        wx.showToast({
          title: '账单保存成功',
          icon: 'success'
        })
        
        // 触发页面刷新或其他操作
        this.triggerEvent('billCreated', result)
      })
      .catch(error => {
        wx.showToast({
          title: '保存失败: ' + error.message,
          icon: 'none'
        })
      })
  },

  // 显示批量识别结果
  showBatchResults(results) {
    // 可以跳转到结果页面或显示结果列表
    wx.navigateTo({
      url: `/pages/batch-results/batch-results?results=${JSON.stringify(results)}`
    })
  },

  // 获取 OCR 服务状态
  checkOCRStatus() {
    api.getOCRStatus()
      .then(status => {
        console.log('OCR 服务状态:', status)
        wx.showModal({
          title: 'OCR 服务状态',
          content: `提供商: ${status.provider}\n支持格式: ${status.supported_formats.join(', ')}\n最大文件: ${status.max_file_size}`,
          showCancel: false
        })
      })
      .catch(error => {
        wx.showToast({
          title: '获取状态失败',
          icon: 'none'
        })
      })
  }
})