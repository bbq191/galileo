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
7. [定时任务](#7-定时任务)
8. [查询反馈与已验证查询](#8-查询反馈与已验证查询)
9. [保存的查询与定时刷新](#9-保存的查询与定时刷新)
10. [推荐问题](#10-推荐问题)

---

## 1. 部署

### 1.1 部署前检查

| 检查项 | 说明 |
|--------|------|
| Node.js 版本 | >= 20.19（Prisma 7 的最低要求，同时满足 Next.js 16 的 20.9） |
| MySQL 连接 | 确认 DATABASE_URL 可达 |
| Redis 连接 | 确认 REDIS_HOST:PORT 可达 |
| AI 服务 | Ollama 运行或 API Key 有效 |

### 1.2 部署步骤

```bash
# 1. 安装依赖（构建与 prisma CLI 需要开发依赖，不要加 --production）
npm ci

# 2. 同步表结构并生成 Prisma Client（项目使用 db push，没有 migrations 目录）
npm run db:push

# 3. 首次部署：创建初始管理员
npm run db:seed

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
| 同步日志 | 标准输出 + `MetadataChange` 表 | 未自动清理 | 见 `lib/metadata/sync/metadata-sync-service.ts` |

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

## 7. 定时任务

维护任务以管理员接口的形式提供，由外部调度（crontab、k8s CronJob 等）定时调用。
**不在应用进程内定时执行**，避免多实例部署时每个实例各跑一遍。

| 接口 | 作用 | 建议频率 |
|------|------|----------|
| `POST /api/admin/maintenance/cleanup-history` | 删除超过保留期的查询历史与定时查询执行记录（默认 90 天，`QUERY_HISTORY_RETENTION_DAYS` 或请求体 `{"days": N}`，最少 7 天） | 每天一次 |
| `POST /api/admin/maintenance/run-saved-queries` | 执行到期的定时刷新查询（见第 9 节） | 每 10 分钟 |
| `POST /api/admin/maintenance/rebuild-suggestions` | 重建查询页的推荐问题（见第 10 节） | 每天一次 |
| `POST /api/admin/maintenance/sync-datasources` | 依次增量同步所有 active 数据源的元数据（不做关系推断与 AI 标注） | 按表结构变更频率，如每天凌晨 |

调用需要管理员权限，定时任务使用 `X-API-Key: $ADMIN_API_KEY`：

```bash
# crontab -e
API=https://galileo.example.com
KEY=请替换为 ADMIN_API_KEY 的值

# 每天 03:00 清理查询历史
0 3 * * * curl -fsS -X POST -H "X-API-Key: $KEY" $API/api/admin/maintenance/cleanup-history >> /var/log/galileo/cron.log 2>&1

# 每 10 分钟执行到期的定时查询
*/10 * * * * curl -fsS -X POST -H "X-API-Key: $KEY" $API/api/admin/maintenance/run-saved-queries >> /var/log/galileo/cron.log 2>&1

# 每天 05:00 重建推荐问题
0 5 * * * curl -fsS -X POST -H "X-API-Key: $KEY" $API/api/admin/maintenance/rebuild-suggestions >> /var/log/galileo/cron.log 2>&1

# 每天 04:00 同步元数据；有数据源失败时返回 207，用 jq 检查 failed 并告警
0 4 * * * curl -sS -X POST -H "X-API-Key: $KEY" $API/api/admin/maintenance/sync-datasources | tee -a /var/log/galileo/cron.log | jq -e '.data.failed == 0' > /dev/null || echo "元数据同步存在失败" | mail -s galileo ops@example.com
```

注意：

- 同步接口最长运行 5 分钟（`maxDuration`），数据源较多时请拆分时段或调大限制
- 同一实例上重复触发会返回 409；多实例部署时请确保调度间隔大于单次同步耗时
- 两个接口都经过 proxy.ts 的 30 次/分钟通用限流

---

## 8. 查询反馈与已验证查询

用户在查询页对结果点赞 / 点踩，或编辑 SQL 后执行成功（自动记为「已纠正」），反馈进入 `/admin/feedback` 的审核队列。
管理员采纳后生成已验证查询；`ENABLE_VERIFIED_QUERIES=true` 时：

- **完全相同的问题**（忽略空白、标点与大小写）：直接执行已验证的 SQL（按 enforce 模式校验），不调用 AI，结果页显示「已验证」；
  执行失败时自动回退到 AI 生成
- **相似问题**：最多 2 条作为示例注入 SQL 生成 Prompt（要求示例涉及的表都在本次检索结果中）

上线建议：

1. 开关关闭期间先收集反馈；优先审核「已纠正」类型，这类反馈附带用户验证过能执行的 SQL
2. 采纳前确认 SQL 的口径适用于所有提同一问题的用户（例如不要包含某个用户特有的过滤条件）
3. 开启开关后，按日志前缀 `[VerifiedQuery]` 观察直接命中与示例注入的次数，并对比开启前后的点踩比例

注意：

- 采纳时记录涉及表的结构哈希（增量同步写入）；使用前发现表被删除或结构变化会自动停用，停用原因显示在「已验证查询」页，确认 SQL 仍正确后可重新启用
- 同一问题、同一数据源只保留最新采纳的一条
- 反馈表冗余保存问题与 SQL，不随查询历史清理；审计日志超过保留期后，对应的查询不能再提交新反馈

---

## 9. 保存的查询与定时刷新

用户在查询结果下方保存查询（同一问题 14 天内问过 3 次时会主动提示），之后在「我的查询」页直接执行保存的 SQL，
不调用 AI；可选每天或每周某天的整点自动刷新，结果预览保存在执行记录中，导航栏显示未读数。

执行规则：

- 走编辑 SQL 的执行路径（enforce 校验），权限按保存人计算；保存人被禁用后自动暂停
- 定时执行最多返回 1000 行、超时 30 秒，只保存前 `SAVED_QUERY_PREVIEW_ROWS` 行预览；手动执行返回完整结果
- 时间按服务器时区（`TZ`）计算，在所选整点后一小时内执行（按查询 ID 错开，避免同时压到业务库）；
  实际执行时刻还取决于调度频率，每 10 分钟调度时最多延后约 10 分钟
- 执行前比较保存时记录的表结构哈希：表被删除或结构变化时不执行，状态改为「需要确认」，用户确认 SQL 仍正确后恢复
- 连续 3 次执行失败后暂停定时刷新，原因显示在「我的查询」页
- 多个调度同时触发时，每个查询只会被执行一次（按 `nextRunAt` 乐观锁认领）

容量估算：单次调度最多执行 `SAVED_QUERY_MAX_PER_TICK`（默认 8）个查询，每个最长 30 秒，最坏 240 秒，低于接口 `maxDuration` 的 300 秒。
每 10 分钟调度时每小时最多执行约 48 个；到期查询更多时会顺延到下一次调度。需要更大容量时提高调度频率
（不要单纯调大 `SAVED_QUERY_MAX_PER_TICK`，否则可能超过 `maxDuration`），并关注业务库负载。

---

## 10. 推荐问题

查询页空白时展示「大家常问的问题」，输入时联想相似问题，查询失败或没有数据时推荐相似的、之前得到过结果的问题。
推荐列表每天重建，来源按优先级：

1. **已验证查询**（第 8 节）：`ENABLE_VERIFIED_QUERIES=true` 时标记「已验证」，点击后直接使用已验证的 SQL 执行
2. **多人问过**：近 30 天至少 2 个不同用户问过，且 80% 以上执行成功并返回数据（只统计鉴权上线后带用户 ID 的记录）
3. **查询模板示例**：仅 `ENABLE_BUSINESS_RULES=true` 时使用（认为模板已按实际业务维护），带 `{占位符}` 的示例不推荐

隐私：「多人问过」会把其他用户的提问展示给所有人。重建时排除包含 6 位以上连续数字（手机号、证件号、订单号等）或邮箱的问题；
其余不宜公开的问题请在 `/admin/feedback` 的「推荐问题」页隐藏，隐藏状态在重建后保留。该页也可以手动「立即重建」。

上线初期审计记录较少，推荐可能为空，此时查询页仍显示原有的通用示例。

---

## 附录: 运维命令速查

| 场景 | 命令 |
|------|------|
| 健康检查 | `curl http://localhost:3000/api/health` |
| 清除缓存 | `curl -X POST http://localhost:3000/api/cache/clear` |
| 查看进程 | `pm2 status` |
| 查看日志 | `pm2 logs galileo` |
| 重启服务 | `pm2 restart galileo` |
