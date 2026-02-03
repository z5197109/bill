# 账单助手 CloudBase 后端

这是账单助手小程序的 CloudBase 后端实现，提供云函数、云数据库和云存储服务。

## 项目结构

```
cloudbase/
├── functions/              # 云函数目录
│   ├── user-service/       # 用户管理服务
│   ├── ledger-service/     # 账本管理服务
│   ├── bill-service/       # 账单管理服务
│   ├── file-service/       # 文件处理服务
│   ├── analytics-service/  # 分析统计服务
│   └── config-service/     # 配置管理服务
├── shared/                 # 共享代码
│   ├── config.js          # 配置文件
│   ├── utils.js           # 工具函数
│   └── data-migrator.js   # 数据迁移工具
├── scripts/               # 管理脚本
│   ├── init-database.js   # 数据库初始化
│   ├── migrate-data.js    # 数据迁移脚本
│   └── package.json       # 脚本依赖
├── cloudbaserc.json       # CloudBase 配置
└── package.json           # 项目依赖
```

## 环境要求

- Node.js 16+
- CloudBase CLI
- 腾讯云账号和 CloudBase 环境

## 快速开始

### 1. 安装 CloudBase CLI

```bash
npm install -g @cloudbase/cli
```

### 2. 登录腾讯云

```bash
cloudbase login
```

### 3. 创建 CloudBase 环境

在腾讯云控制台创建云开发环境，获取环境 ID。

### 4. 配置环境

修改 `cloudbaserc.json` 中的环境 ID：

```json
{
  "envId": "your-env-id",
  "framework": {
    "name": "bill-assistant",
    "plugins": {
      "node": {
        "use": "@cloudbase/framework-plugin-node",
        "inputs": {
          "entry": "app.js",
          "path": "/functions"
        }
      }
    }
  }
}
```

### 5. 安装依赖

```bash
# 安装项目依赖
npm install

# 安装各云函数依赖
cd functions/user-service && npm install && cd ../..
cd functions/ledger-service && npm install && cd ../..
cd functions/bill-service && npm install && cd ../..
cd functions/file-service && npm install && cd ../..
cd functions/analytics-service && npm install && cd ../..
cd functions/config-service && npm install && cd ../..

# 安装脚本依赖
cd scripts && npm install && cd ..
```

### 6. 初始化数据库

```bash
cd scripts
npm run init-db-full
cd ..
```

### 7. 部署云函数

```bash
# 部署所有云函数
cloudbase functions:deploy

# 或单独部署
cloudbase functions:deploy user-service
cloudbase functions:deploy ledger-service
cloudbase functions:deploy bill-service
cloudbase functions:deploy file-service
cloudbase functions:deploy analytics-service
cloudbase functions:deploy config-service
```

## 云函数说明

### user-service (用户管理)
- 微信登录
- 用户信息管理
- 权限验证

### ledger-service (账本管理)
- 账本 CRUD 操作
- 默认账本设置
- 账本权限控制

### bill-service (账单管理)
- 账单 CRUD 操作
- 批量操作
- 账单统计

### file-service (文件处理)
- 文件上传到云存储
- 文件权限管理
- 存储使用统计

### analytics-service (分析统计)
- 消费统计分析
- 趋势分析
- 数据导出

### config-service (配置管理)
- 分类管理
- 分类规则管理
- 默认配置初始化

## 数据迁移

如果您有现有的 SQLite 数据需要迁移：

```bash
cd scripts
node migrate-data.js ../path/to/your/sqlite.db
```

## 环境变量

在 CloudBase 控制台设置以下环境变量：

```
CLOUDBASE_ENV=your-env-id
TENCENT_SECRET_ID=your-secret-id (可选，用于腾讯云 OCR)
TENCENT_SECRET_KEY=your-secret-key (可选，用于腾讯云 OCR)
```

## 数据库集合

系统会自动创建以下集合：

- `users` - 用户信息
- `ledgers` - 账本信息
- `bills` - 账单记录
- `categories` - 分类信息
- `category_rules` - 分类规则
- `recurring_rules` - 循环规则

## 存储桶

系统使用以下存储桶：

- `bill-images` - 账单图片
- `user-avatars` - 用户头像
- `data-exports` - 数据导出文件
- `temp-files` - 临时文件

## 监控和日志

- 在 CloudBase 控制台查看云函数执行日志
- 监控数据库读写次数
- 查看存储使用情况

## 成本优化

- 合理设置云函数内存和超时时间
- 使用数据库索引优化查询性能
- 定期清理临时文件和过期数据
- 监控资源使用情况

## 故障排查

### 常见问题

1. **云函数调用失败**
   - 检查环境 ID 配置
   - 确认云函数已正确部署
   - 查看云函数执行日志

2. **数据库连接失败**
   - 确认数据库服务已开通
   - 检查集合权限设置
   - 验证索引是否创建成功

3. **文件上传失败**
   - 确认云存储服务已开通
   - 检查存储桶权限配置
   - 验证文件大小和格式限制

### 日志查看

```bash
# 查看云函数日志
cloudbase functions:log user-service

# 查看数据库统计
cd scripts && npm run db-stats
```

## 开发调试

### 本地调试

```bash
# 启动本地调试
cloudbase functions:invoke user-service --params '{"action":"getUserInfo"}'
```

### 测试数据

```bash
# 创建测试数据
cd scripts
node init-database.js create-default
```

## 部署到生产环境

1. 创建生产环境
2. 修改配置文件中的环境 ID
3. 设置生产环境变量
4. 部署云函数
5. 初始化数据库
6. 配置域名和 SSL 证书

## 版本更新

1. 备份现有数据
2. 更新云函数代码
3. 执行数据库迁移脚本
4. 测试功能正常
5. 发布小程序新版本

## 技术支持

如有问题，请查看：
- [CloudBase 官方文档](https://docs.cloudbase.net/)
- [微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/)
- 项目 Issues 页面