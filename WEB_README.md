# SnapLedger Web Interface

## 概述

SnapLedger 现在提供了一个现代化的Web界面，让您可以通过浏览器轻松处理账单截图。

## 功能特性

- 📱 **拖拽上传**: 支持拖拽多个账单截图到浏览器
- 🔍 **智能识别**: 自动识别商户、金额和分类信息
- ✏️ **在线编辑**: 可以直接在网页上修改识别结果
- 💾 **批量保存**: 一键保存所有处理结果到数据库和Excel
- 📊 **响应式设计**: 支持桌面和移动设备

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动Web应用

```bash
python web_app.py
```

### 3. 打开浏览器

访问 http://localhost:5000

## 使用方法

1. **上传图片**: 拖拽账单截图到上传区域，或点击选择文件
2. **开始处理**: 点击"开始处理"按钮，等待OCR识别完成
3. **检查结果**: 查看识别结果，可以直接编辑商户、金额、分类
4. **确认保存**: 点击"确认保存"将结果保存到数据库

## API接口

- `GET /api/categories` - 获取可用分类列表
- `POST /api/upload` - 上传并处理账单图片
- `POST /api/save` - 保存处理结果

## 技术栈

- **后端**: Flask + Python
- **前端**: HTML5 + CSS3 + JavaScript
- **OCR**: PaddleOCR
- **存储**: SQLite + Excel