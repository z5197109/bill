#!/bin/bash

# CloudBase 部署脚本
# 使用方法: ./deploy.sh [环境] [操作]
# 环境: dev (开发环境) | prod (生产环境)
# 操作: all (全部) | functions (仅云函数) | db (仅数据库)

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查参数
ENV=${1:-dev}
ACTION=${2:-all}

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
    log_error "环境参数错误，请使用 dev 或 prod"
    exit 1
fi

if [[ "$ACTION" != "all" && "$ACTION" != "functions" && "$ACTION" != "db" ]]; then
    log_error "操作参数错误，请使用 all、functions 或 db"
    exit 1
fi

log_info "开始部署到 $ENV 环境，操作: $ACTION"

# 设置环境变量
if [ "$ENV" = "prod" ]; then
    export CLOUDBASE_ENV="bill-assistant-prod"
    log_warning "部署到生产环境，请确认所有配置正确！"
    read -p "是否继续？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "部署已取消"
        exit 0
    fi
else
    export CLOUDBASE_ENV="bill-assistant-dev"
fi

log_info "使用环境 ID: $CLOUDBASE_ENV"

# 检查 CloudBase CLI
if ! command -v cloudbase &> /dev/null; then
    log_error "CloudBase CLI 未安装，请先安装: npm install -g @cloudbase/cli"
    exit 1
fi

# 检查登录状态
if ! cloudbase auth:list &> /dev/null; then
    log_error "未登录 CloudBase，请先登录: cloudbase login"
    exit 1
fi

# 安装依赖函数
install_dependencies() {
    log_info "安装项目依赖..."
    npm install

    log_info "安装云函数依赖..."
    for func_dir in functions/*/; do
        if [ -f "$func_dir/package.json" ]; then
            func_name=$(basename "$func_dir")
            log_info "安装 $func_name 依赖..."
            (cd "$func_dir" && npm install)
        fi
    done

    log_info "安装脚本依赖..."
    (cd scripts && npm install)
}

# 部署云函数
deploy_functions() {
    log_info "部署云函数..."
    
    # 获取所有云函数目录
    functions=($(ls -d functions/*/ | xargs -n 1 basename))
    
    for func in "${functions[@]}"; do
        log_info "部署云函数: $func"
        if cloudbase functions:deploy "$func" --env "$CLOUDBASE_ENV"; then
            log_success "云函数 $func 部署成功"
        else
            log_error "云函数 $func 部署失败"
            exit 1
        fi
    done
}

# 初始化数据库
init_database() {
    log_info "初始化数据库..."
    
    cd scripts
    if npm run init-db-full; then
        log_success "数据库初始化成功"
    else
        log_error "数据库初始化失败"
        cd ..
        exit 1
    fi
    cd ..
}

# 验证部署
verify_deployment() {
    log_info "验证部署..."
    
    # 检查云函数状态
    log_info "检查云函数状态..."
    functions=($(ls -d functions/*/ | xargs -n 1 basename))
    
    for func in "${functions[@]}"; do
        if cloudbase functions:detail "$func" --env "$CLOUDBASE_ENV" &> /dev/null; then
            log_success "云函数 $func 运行正常"
        else
            log_warning "云函数 $func 可能存在问题"
        fi
    done
    
    # 检查数据库集合
    log_info "检查数据库集合..."
    cd scripts
    if npm run db-stats; then
        log_success "数据库检查完成"
    else
        log_warning "数据库检查失败"
    fi
    cd ..
}

# 主要部署流程
main() {
    # 安装依赖
    install_dependencies
    
    # 根据操作类型执行相应步骤
    case $ACTION in
        "all")
            deploy_functions
            init_database
            verify_deployment
            ;;
        "functions")
            deploy_functions
            verify_deployment
            ;;
        "db")
            init_database
            ;;
    esac
    
    log_success "部署完成！"
    
    # 显示后续步骤
    echo
    log_info "后续步骤:"
    echo "1. 在小程序中配置环境 ID: $CLOUDBASE_ENV"
    echo "2. 在 CloudBase 控制台配置环境变量"
    echo "3. 测试小程序功能"
    if [ "$ENV" = "prod" ]; then
        echo "4. 提交小程序审核"
    fi
}

# 错误处理
trap 'log_error "部署过程中发生错误，请检查日志"; exit 1' ERR

# 执行主流程
main

log_success "所有操作完成！"