#!/bin/bash
###############################################################################
# Galileo 生产环境部署脚本
# 用于VM环境的应用部署和日志管理配置
# @author xusy
###############################################################################

set -e  # 遇到错误立即退出

echo "====================================================="
echo "  Galileo 生产环境部署"
echo "====================================================="

# 配置变量
APP_NAME="galileo"
LOG_DIR="/var/log/${APP_NAME}"
APP_DIR=$(pwd)

echo ""
echo "[1/7] 创建日志目录..."
sudo mkdir -p ${LOG_DIR}
sudo chmod 755 ${LOG_DIR}
sudo chown -R $(whoami):$(whoami) ${LOG_DIR}
echo "✓ 日志目录创建完成: ${LOG_DIR}"

echo ""
echo "[2/7] 安装依赖..."
npm ci --production
echo "✓ 依赖安装完成"

echo ""
echo "[3/7] 构建项目..."
npm run build
echo "✓ 项目构建完成"

echo ""
echo "[4/7] 安装/更新 PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "PM2 未安装，正在安装..."
    sudo npm install -g pm2
else
    echo "PM2 已安装，版本: $(pm2 -v)"
fi
echo "✓ PM2 准备完成"

echo ""
echo "[5/7] 配置 PM2 日志轮转..."
pm2 install pm2-logrotate || echo "pm2-logrotate 已安装"
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
echo "✓ 日志轮转配置完成"

echo ""
echo "[6/7] 启动应用..."
if pm2 list | grep -q ${APP_NAME}; then
    echo "应用已存在，正在重启..."
    pm2 reload ${APP_NAME}
else
    echo "首次部署，正在启动..."
    pm2 start ecosystem.config.js --env production
fi
pm2 save
echo "✓ 应用启动完成"

echo ""
echo "[7/7] 配置开机自启动..."
sudo pm2 startup systemd -u $(whoami) --hp ${HOME}
echo "✓ 开机自启动配置完成"

echo ""
echo "====================================================="
echo "  部署完成！"
echo "====================================================="
echo ""
echo "应用状态:"
pm2 list
echo ""
echo "查看日志:"
echo "  实时日志: pm2 logs ${APP_NAME}"
echo "  应用日志: tail -f ${LOG_DIR}/app.log"
echo "  错误日志: tail -f ${LOG_DIR}/error.log"
echo ""
echo "管理命令:"
echo "  重启: pm2 reload ${APP_NAME}"
echo "  停止: pm2 stop ${APP_NAME}"
echo "  查看状态: pm2 status ${APP_NAME}"
echo "  查看监控: pm2 monit"
echo ""
