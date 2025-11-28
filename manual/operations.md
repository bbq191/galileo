# 运维手册

> 作者: xusy
> 版本: 1.1
> 最后更新: 2025-11-26

---

## 目录

1. [部署](#1-部署)
2. [配置管理](#2-配置管理)
3. [监控告警](#3-监控告警)
4. [故障排查](#4-故障排查)
5. [性能调优](#5-性能调优)
6. [备份恢复](#6-备份恢复)

---

## 1. 部署

### 1.1 部署前检查

| 检查项 | 说明 |
|--------|------|
| Node.js 版本 | >= 18.x |
| MySQL 连接 | 确认 DATABASE_URL 可达 |
| Redis 连接 | 确认 REDIS_HOST:PORT 可达 |
| AI 服务 | Ollama 运行或 API Key 有效 |

### 1.2 部署步骤

```bash
# 1. 安装依赖
npm ci --production

# 2. 生成 Prisma Client
npx prisma generate

# 3. 数据库迁移
npx prisma migrate deploy

# 4. 构建
npm run build

# 5. 启动
npm start
```

### 1.3 进程管理

推荐使用 PM2：

```bash
pm2 start npm --name "galileo" -- start
pm2 save
```

### 1.4 反向代理

**Nginx 完整配置**

```nginx
# /etc/nginx/conf.d/galileo.conf

# 上游服务器配置
upstream galileo_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name galileo.example.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS 主配置
server {
    listen 443 ssl http2;
    server_name galileo.example.com;

    # SSL 证书
    ssl_certificate /etc/nginx/ssl/galileo.crt;
    ssl_certificate_key /etc/nginx/ssl/galileo.key;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # 日志
    access_log /var/log/nginx/galileo_access.log;
    error_log /var/log/nginx/galileo_error.log;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript;

    # 客户端配置
    client_max_body_size 50M;
    client_body_buffer_size 128k;

    # 主代理配置
    location / {
        proxy_pass http://galileo_backend;
        proxy_http_version 1.1;

        # 保持连接
        proxy_set_header Connection "";

        # 转发头信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时配置 (AI 请求需要较长时间)
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        # 缓冲配置
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 24k;
    }

    # API 路由 - 更长超时
    location /api/query/execute {
        proxy_pass http://galileo_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # AI 查询需要更长超时
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # 元数据同步 - 长时间操作
    location /api/datasources/ {
        proxy_pass http://galileo_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }

    # 静态资源缓存
    location /_next/static {
        proxy_pass http://galileo_backend;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, immutable";
    }

    # 健康检查 (内部)
    location /api/health {
        proxy_pass http://galileo_backend;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        access_log off;
    }
}
```

**配置要点说明**

| 配置项 | 说明 |
|--------|------|
| keepalive 64 | 上游连接复用，减少握手开销 |
| proxy_read_timeout 300s | AI 查询接口需要较长超时 |
| gzip | 启用压缩减少传输量 |
| ssl_protocols | 仅启用 TLS 1.2+ |
| client_max_body_size | 支持较大请求体 |

**配置生效**

```bash
# 检查配置语法
nginx -t

# 重载配置
nginx -s reload
```

---

## 2. 配置管理

### 2.1 关键环境变量

**必填项**

| 变量 | 说明 |
|------|------|
| DATABASE_URL | MySQL 连接串 |
| DATABASE_ENCRYPTION_KEY | 加密密钥 (32字符) |
| REDIS_HOST | Redis 主机 |

**AI 配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| DEEPSEEK_API_URL | AI 服务地址 | - |
| DEEPSEEK_MODEL | 模型名称 | deepseek-r1:1.5b |
| DEEPSEEK_TIMEOUT | 超时(ms) | 30000 |

**缓存配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| L1_CACHE_MAX_SIZE | 内存缓存容量 | 1000 |
| QUERY_CACHE_TTL | 查询缓存TTL(秒) | 3600 |
| SEMANTIC_CACHE_TTL | 语义缓存TTL(秒) | 86400 |

**推断配置**

| 变量 | 说明 | 默认值 |
|------|------|--------|
| MIN_CONFIDENCE | 最低置信度 | 0.7 |
| DOMAIN_INFERENCE_AUTO_APPLY_THRESHOLD | 自动应用阈值 | 0.8 |

完整配置见 `.env.example`。

### 2.2 配置热更新

以下配置支持运行时更新，无需重启：
- 缓存 TTL
- 速率限制参数

---

## 3. 监控告警

### 3.1 健康检查

```
GET /api/health
```

返回系统各组件状态。

### 3.2 监控接口

| 接口 | 用途 |
|------|------|
| GET /api/statistics/overview | 系统总览 |
| GET /api/statistics/hotspots | 热点分析 |
| GET /api/performance | 性能指标 (P50/P95/P99) |
| GET /api/cache/stats | 缓存统计 (L1/L2 命中率、语义缓存) |
| GET /api/ai/cost | AI 成本统计 (Token 消耗) |
| GET /api/docs/openapi | OpenAPI 文档规范 |

### 3.3 关键指标

**需监控的指标**

| 指标类别 | 具体指标 | 告警阈值 | 数据来源 | 监控频率 |
|---------|---------|----------|----------|---------|
| **性能指标** | 查询响应时间（P95） | > 5s | `GET /api/performance` | 实时 |
| | 慢查询数量 | > 10/小时 | `performance_metrics` 表 | 每小时 |
| | API 响应时间（P99） | > 10s | 响应头 `X-Response-Time` | 实时 |
| **缓存指标** | 缓存命中率 | < 50% | `GET /api/cache/stats` | 每10分钟 |
| | L1 缓存容量使用率 | > 90% | `GET /api/cache/stats` | 每10分钟 |
| | Redis 连接延迟 | > 100ms | `logs/app.log` | 实时 |
| **业务指标** | 查询总数 | 异常波动 | `GET /api/statistics/overview` | 每小时 |
| | 查询成功率 | < 95% | `GET /api/audit/stats` | 每10分钟 |
| | 热门表访问量 | - | `GET /api/statistics/hotspots` | 每日 |
| **AI 指标** | Token 消耗速率 | 超预算 | `GET /api/ai/cost` | 每小时 |
| | AI 服务响应时间 | > 30s | `performance_metrics` 表 | 实时 |
| | AI 错误率 | > 10% | `error_logs` 表 | 每10分钟 |
| **系统指标** | 错误率 | > 5% | `GET /api/audit/stats` | 每5分钟 |
| | 数据库连接数 | > 80% 连接池 | 数据库监控 | 实时 |
| | Redis 内存使用率 | > 80% | Redis INFO 命令 | 每10分钟 |
| | 磁盘使用率 | > 85% | 系统监控 | 每小时 |
| **安全指标** | 速率限制触发次数 | > 100/小时 | 见 `lib/security/rate-limit-logger.ts` | 每10分钟 |
| | 认证失败次数 | > 50/小时 | `queryAuditLog` 表 | 每10分钟 |
| | 异常 IP 访问 | 单 IP > 1000 次/小时 | `queryAuditLog` 表 | 每小时 |

### 3.4 告警配置

**告警级别**

| 级别 | 说明 | 响应时间 | 通知渠道 |
|------|------|---------|---------|
| **P0 - 紧急** | 系统完全不可用 | 立即 | 电话 + 短信 + 钉钉 + 邮件 |
| **P1 - 严重** | 核心功能不可用 | 5 分钟内 | 短信 + 钉钉 + 邮件 |
| **P2 - 重要** | 部分功能受影响 | 15 分钟内 | 钉钉 + 邮件 |
| **P3 - 一般** | 性能下降或警告 | 1 小时内 | 邮件 |

**告警规则示例**

| 告警名称 | 级别 | 触发条件 | 处理建议 |
|---------|------|---------|---------|
| 数据库连接失败 | P0 | 连接失败持续 > 1 分钟 | 检查数据库服务、网络、连接配置 |
| Redis 连接失败 | P1 | 连接失败持续 > 2 分钟 | 检查 Redis 服务、重启应用 |
| 查询成功率过低 | P1 | 成功率 < 90% 持续 10 分钟 | 查看错误日志、检查 AI 服务 |
| 响应时间过长 | P2 | P95 > 5s 持续 10 分钟 | 查看慢查询、检查缓存、优化 SQL |
| 缓存命中率低 | P2 | 命中率 < 40% 持续 30 分钟 | 检查 Redis、缓存预热、调整 TTL |
| Token 消耗超预算 | P2 | 当日消耗 > 预算 120% | 检查异常查询、优化 Prompt |
| 速率限制频繁触发 | P3 | > 100 次/小时 | 检查是否有滥用、调整限制策略 |
| 磁盘空间不足 | P1 | 使用率 > 90% | 清理日志、扩容磁盘 |

**告警配置**: 见 `lib/ai/error-logger.ts` 第 250-300 行

**告警通知渠道配置**:
```bash
# .env 文件
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx
EMAIL_SERVICE_URL=https://your-email-service.com/send
ALERT_EMAIL=ops@example.com
SMS_SERVICE_URL=https://your-sms-service.com/send
ALERT_PHONE=+86-xxx-xxxx-xxxx
```

### 3.5 监控仪表板

**推荐监控工具**:
- **Grafana**: 可视化性能指标和趋势
- **Prometheus**: 时序数据采集和存储
- **Sentry**: 错误追踪和告警
- **ELK Stack**: 日志聚合和分析

**关键指标仪表板**:
1. **系统概览**: 健康状态、请求量、成功率、响应时间
2. **性能监控**: P50/P95/P99 响应时间趋势、慢查询列表
3. **缓存监控**: 命中率、容量使用、各层级统计
4. **业务监控**: 查询总数、热门表、用户活跃度
5. **错误监控**: 错误率、错误分类、错误趋势
6. **资源监控**: CPU、内存、磁盘、网络

### 3.6 日志位置

| 日志类型 | 存储位置 | 保留期 | 查询方式 |
|----------|----------|--------|---------|
| 应用日志 | `logs/app.log` | 30 天 | `tail -f logs/app.log` |
| 错误日志 | `logs/error.log` | 90 天 | `tail -f logs/error.log` |
| 查询审计 | `queryAuditLog` 表 | 90 天 | `GET /api/audit/logs` |
| 性能数据 | `performance_metrics` 表 | 30 天 | `GET /api/performance` |
| 系统告警 | `systemAlert` 表 | 180 天 | 数据库查询 |
| 同步日志 | 内存 + 数据库 | 30 天 | 见 `lib/metadata/sync/sync-logger.ts` |

**详细日志配置**: 见 [日志系统文档](./logging.md)

---

## 4. 故障排查

### 4.1 排查流程

```
1. 检查健康状态 → /api/health
2. 查看错误日志 → error_logs 表
3. 检查审计日志 → query_audit_logs 表
4. 检查服务连接 → 数据库/Redis/AI服务
```

### 4.2 常见问题

**问题: 查询超时**

检查点：
1. AI 服务响应时间
2. 数据库连接池是否耗尽
3. 查询 SQL 是否过于复杂

相关代码：`lib/sql/executor/query-executor.ts`

**问题: 缓存不生效**

检查点：
1. Redis 连接状态
2. 缓存 Key 是否正确生成
3. TTL 配置是否合理

相关代码：`lib/cache/multi-level-cache.ts`

**问题: AI 推断失败**

检查点：
1. Ollama 服务是否运行
2. API Key 是否有效
3. 模型是否已下载

相关代码：`lib/ai/deepseek-client.ts`

**问题: 元数据同步失败**

检查点：
1. 数据源连接配置
2. 数据库账号权限
3. 网络连通性

相关代码：`lib/metadata/sync/metadata-sync-service.ts`

### 4.3 日志级别调整

修改环境变量 `LOG_LEVEL`：
- `debug`: 详细日志
- `info`: 常规日志
- `warn`: 警告及以上
- `error`: 仅错误

---

## 5. 性能调优

### 5.1 缓存优化

**提高命中率**
- 增大 L1_CACHE_MAX_SIZE (内存允许时)
- 延长 QUERY_CACHE_TTL
- 启用语义缓存 SEMANTIC_CACHE_ENABLED=true

**缓存预热**
- 系统启动时自动预热热点数据
- 相关代码：`lib/cache/cache-warmer.ts`

### 5.2 数据库优化

**连接池配置**
```
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=30000
```

**索引检查**
- 确保 `prisma/schema.prisma` 中定义的索引已创建
- 定期检查慢查询日志

### 5.3 AI 优化

**减少 Token 消耗**
- 启用 Prompt 缓存
- 调整 AI_BATCH_SIZE 批量处理

**提高响应速度**
- 使用本地 Ollama 减少网络延迟
- 适当降低模型参数 (temperature)

---

## 6. 备份恢复

### 6.1 备份策略

| 数据类型 | 备份频率 | 保留周期 |
|----------|----------|----------|
| 元数据库 | 每日 | 30天 |
| Redis 缓存 | 不备份 | 可重建 |
| 配置文件 | 版本控制 | 永久 |

### 6.2 备份命令

```bash
# MySQL 备份
mysqldump -u user -p galileo > backup_$(date +%Y%m%d).sql

# Prisma 快照
npx prisma db pull
```

### 6.3 恢复流程

```bash
# 1. 停止服务
pm2 stop galileo

# 2. 恢复数据库
mysql -u user -p galileo < backup.sql

# 3. 清除 Redis 缓存
redis-cli FLUSHDB

# 4. 重启服务
pm2 start galileo
```

---

## 附录: 运维命令速查

| 场景 | 命令 |
|------|------|
| 健康检查 | `curl http://localhost:3000/api/health` |
| 清除缓存 | `curl -X POST http://localhost:3000/api/cache/clear` |
| 查看进程 | `pm2 status` |
| 查看日志 | `pm2 logs galileo` |
| 重启服务 | `pm2 restart galileo` |
