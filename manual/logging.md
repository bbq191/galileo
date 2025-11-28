# 日志系统文档

> 作者: xusy
> 版本: 1.0
> 最后更新: 2025-11-25

---

## 目录

1. [日志系统概览](#1-日志系统概览)
2. [日志分类](#2-日志分类)
3. [日志配置](#3-日志配置)
4. [审计日志](#4-审计日志)
5. [性能日志](#5-性能日志)
6. [错误日志](#6-错误日志)
7. [日志查询与分析](#7-日志查询与分析)
8. [日志维护](#8-日志维护)
9. [最佳实践](#9-最佳实践)

---

## 1. 日志系统概览

### 1.1 多层日志架构

Galileo 实现了完整的日志体系，覆盖应用运行的各个层面：

```
┌─────────────────────────────────────────────┐
│            应用层日志                        │
│   文件日志 (logs/app.log, error.log)        │
├─────────────────────────────────────────────┤
│            审计层日志                        │
│   数据库表 (queryAuditLog, systemAlert)     │
├─────────────────────────────────────────────┤
│            性能监控日志                       │
│   数据库表 (performance_metrics)            │
├─────────────────────────────────────────────┤
│            业务日志                          │
│   同步日志、速率限制日志、缓存日志            │
└─────────────────────────────────────────────┘
```

### 1.2 日志技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| 核心日志库 | Pino | 高性能日志框架 |
| 日志美化 | pino-pretty | 开发环境可读输出 |
| 文件滚动 | pino-roll | 日志文件轮转 |
| 审计存储 | Prisma + MySQL | 持久化审计数据 |
| 告警通知 | 钉钉/邮件 | 严重错误通知 |

### 1.3 日志输出位置总览

| 日志类型 | 输出位置 | 环境 | 保留期 |
|---------|---------|------|--------|
| 应用日志 | `logs/app.log` | 生产 | 30天 |
| 错误日志 | `logs/error.log` | 生产 | 90天 |
| 审计日志 | `queryAuditLog` 表 | 全部 | 90天 |
| 性能日志 | `performance_metrics` 表 | 全部 | 30天 |
| 同步日志 | 内存 + 数据库 | 全部 | 30天 |
| 系统告警 | `systemAlert` 表 | 全部 | 180天 |
| 控制台 | stdout/stderr | 开发 | - |

---

## 2. 日志分类

### 2.1 应用日志

**用途**: 记录应用运行的常规信息、警告和错误。

**日志级别**:
- `debug`: 调试信息（仅开发环境）
- `info`: 常规信息
- `warn`: 警告信息
- `error`: 错误信息

**实现位置**: 见 `lib/logger.ts` 第 1-100 行

**输出示例**:
```
[2025-11-25 10:30:00] INFO: 数据源连接成功 datasourceId=123
[2025-11-25 10:30:05] WARN: Redis 连接延迟较高 latency=150ms
[2025-11-25 10:30:10] ERROR: SQL 执行失败 error="Table not found"
```

### 2.2 审计日志

**用途**: 完整记录用户查询操作，支持合规审计和行为分析。

**记录内容**:
- 用户身份（userId, userName, sessionId）
- 查询信息（自然语言、生成的SQL、执行结果）
- 元数据（使用的数据库、表、列）
- 性能指标（各阶段耗时）
- 网络信息（IP地址、User-Agent）

**存储位置**: `queryAuditLog` 数据库表

**实现位置**: 见 `lib/audit/audit-logger.ts`

### 2.3 性能日志

**用途**: 监控系统性能指标，识别性能瓶颈。

**监控指标**:
- 响应时间（P50、P95、P99）
- 请求数量统计
- 慢查询检测（默认阈值 1000ms）
- 各操作的耗时分布

**存储位置**:
- API 性能: `performance_metrics` 表
- 审计日志中的 `performance` 字段

**实现位置**: 见 `lib/api/performance-monitor.ts`

### 2.4 错误日志

**用途**: 系统错误的分类管理和告警。

**错误分类**:
- `NETWORK`: 网络错误
- `API`: API 调用错误
- `DATABASE`: 数据库错误
- `VALIDATION`: 验证错误
- `TIMEOUT`: 超时错误
- `RATE_LIMIT`: 速率限制
- `UNKNOWN`: 未知错误

**错误级别**:
- `INFO`: 信息性错误
- `WARNING`: 警告
- `ERROR`: 错误
- `CRITICAL`: 严重错误（触发告警）

**实现位置**: 见 `lib/ai/error-logger.ts`

### 2.5 业务日志

**同步日志**:
- 记录数据源元数据同步过程
- 统计新增/更新/删除的表和列
- 见 `lib/metadata/sync/sync-logger.ts`

**速率限制日志**:
- 记录速率限制违规
- 检测滥用行为
- 见 `lib/security/rate-limit-logger.ts`

**缓存日志**:
- 缓存命中率统计
- 缓存预热监控
- 见 `lib/cache/warmup/warmup-monitor.ts`

---

## 3. 日志配置

### 3.1 环境变量配置

在 `.env` 文件中配置日志相关参数：

```bash
# 日志级别
LOG_LEVEL=info              # debug | info | warn | error

# 日志目录
LOG_DIR=./logs

# 文件日志开关
ENABLE_FILE_LOGGING=true    # 生产环境建议 true

# 日志轮转配置
LOG_FILE_MAX_SIZE=10        # MB
LOG_FILE_RETENTION_DAYS=30  # 天

# 审计日志保留期
AUDIT_LOG_RETENTION_DAYS=90

# 慢查询阈值
SLOW_QUERY_THRESHOLD=1000   # 毫秒

# 告警配置
ALERT_SYSTEM_URL=           # 第三方告警系统 URL
DINGTALK_WEBHOOK_URL=       # 钉钉 Webhook
EMAIL_SERVICE_URL=          # 邮件服务 URL
ALERT_EMAIL=                # 告警接收邮箱
```

### 3.2 日志级别说明

| 级别 | 开发环境 | 生产环境 | 说明 |
|------|---------|---------|------|
| debug | ✅ 推荐 | ❌ 不建议 | 包含详细的调试信息，可能泄露敏感数据 |
| info | ✅ | ✅ 推荐 | 常规运行信息 |
| warn | ✅ | ✅ | 警告信息，不影响正常运行 |
| error | ✅ | ✅ | 错误信息 |

### 3.3 日志格式

**开发环境** (使用 pino-pretty):
```
[2025-11-25 10:30:00.123] INFO (12345): 查询执行成功
    datasourceId: "ds_001"
    executionTime: 150
    rowCount: 100
```

**生产环境** (JSON 格式):
```json
{
  "level": 30,
  "time": 1732521000123,
  "pid": 12345,
  "hostname": "server-01",
  "msg": "查询执行成功",
  "datasourceId": "ds_001",
  "executionTime": 150,
  "rowCount": 100
}
```

---

## 4. 审计日志

### 4.1 审计日志记录

**自动记录场景**:
- 所有通过 `/api/query/execute` 的查询
- 数据源的连接、配置变更
- 元数据同步操作
- 速率限制违规
- 用户认证操作

**记录内容结构**:
```
审计日志
├── 用户信息
│   ├── userId (用户ID)
│   ├── userName (用户名)
│   ├── sessionId (会话ID)
│   ├── ipAddress (IP地址)
│   └── userAgent (客户端信息)
├── 查询信息
│   ├── naturalLanguageQuery (原始查询)
│   ├── intent (识别的查询意图)
│   ├── generatedSQL (生成的SQL)
│   └── executionResult (执行结果)
├── 元数据
│   ├── usedDatabases (使用的数据库)
│   ├── usedTables (使用的表)
│   └── usedColumns (使用的列)
└── 性能指标
    ├── intentRecognitionTime (意图识别耗时)
    ├── sqlGenerationTime (SQL生成耗时)
    ├── validationTime (验证耗时)
    ├── executionTime (执行耗时)
    └── totalTime (总耗时)
```

### 4.2 审计日志查询

**API 接口**:

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/audit/logs` | GET | 查询审计日志列表 |
| `/api/audit/stats` | GET | 获取审计统计 |

**查询参数**:
- `limit`: 返回数量（默认 50）
- `offset`: 偏移量
- `action`: 操作类型筛选
- `startDate`: 开始日期
- `endDate`: 结束日期
- `userId`: 用户筛选

**编程接口**: 见 `lib/audit/audit-logger.ts` 第 50-200 行

### 4.3 审计数据分析

**分析维度**:

| 分析类型 | 方法 | 说明 |
|---------|------|------|
| 查询模式分析 | `analyzeQueryPatterns()` | 识别常见查询类型 |
| 用户活动分析 | `analyzeUserActivity()` | 分析用户行为 |
| 数据库使用分析 | `analyzeDatabaseUsage()` | 统计数据库访问 |
| 性能趋势分析 | `analyzePerformanceTrend()` | 按天统计性能趋势 |
| 异常查询识别 | `identifyAnomalousQueries()` | 识别异常查询 |
| 热门查询分析 | `analyzePopularQueries()` | 统计热门查询 |
| 表使用统计 | `analyzeTableUsage()` | 分析表访问频率 |

**实现位置**: 见 `lib/audit/audit-analyzer.ts`

---

## 5. 性能日志

### 5.1 性能监控指标

**API 性能监控**:

| 指标 | 说明 | 用途 |
|------|------|------|
| P50 (中位数) | 50% 请求的响应时间 | 了解典型性能 |
| P95 | 95% 请求的响应时间 | SLA 指标 |
| P99 | 99% 请求的响应时间 | 发现性能尖刺 |
| 平均响应时间 | 所有请求的平均值 | 整体性能参考 |
| 慢查询数量 | 超过阈值的请求 | 优化目标 |

**查看方式**:
- API: `GET /api/performance`
- 响应头: `X-Response-Time` (毫秒)

### 5.2 慢查询检测

**阈值配置**:
```bash
# 默认 1000ms，可通过环境变量调整
SLOW_QUERY_THRESHOLD=1000
```

**慢查询日志内容**:
- 请求路径
- 执行时间
- 查询参数
- 时间戳

**查询慢查询**:
- API: `GET /api/audit/logs?executionTime_gte=1000`
- 方法: `getSlowQueries()` 见 `lib/audit/audit-logger.ts`

### 5.3 性能装饰器

**使用方式**:

见 `lib/api/performance-monitor.ts` 第 100-120 行
```typescript
// 自动记录性能指标
@withPerformanceMonitor
async function handler(request) {
  // 业务逻辑
}
```

见 `lib/ai/error-logger.ts` 第 200-220 行
```typescript
// 记录操作耗时
@measurePerformance('operation_name')
async function someOperation() {
  // 业务逻辑
}
```

---

## 6. 错误日志

### 6.1 错误日志分类

**按级别分类**:

| 级别 | 处理方式 | 示例 |
|------|---------|------|
| INFO | 仅记录 | 缓存未命中、配置更新 |
| WARNING | 记录 + 监控 | Redis 延迟、AI 超时重试 |
| ERROR | 记录 + 告警 | 数据库连接失败、SQL 执行错误 |
| CRITICAL | 记录 + 告警 + 通知 | 系统崩溃、数据损坏 |

**按类型分类**:

| 类型 | 常见原因 | 处理建议 |
|------|---------|---------|
| NETWORK | 网络不通、DNS 解析失败 | 检查网络、防火墙 |
| API | 外部 API 调用失败 | 检查 API Key、服务可用性 |
| DATABASE | 连接失败、查询错误 | 检查连接配置、SQL 语法 |
| VALIDATION | 输入验证失败 | 检查请求参数 |
| TIMEOUT | 操作超时 | 调整超时配置、优化查询 |
| RATE_LIMIT | 超过速率限制 | 调整限制策略或优化客户端 |

### 6.2 错误日志记录

**记录方法**: 见 `lib/ai/error-logger.ts` 第 50-150 行

```typescript
// 使用示例（实际代码见上述文件）
await errorLogger.error(
  '数据库连接失败',
  ErrorCategory.DATABASE,
  error,
  { datasourceId: 'ds_001' }
);
```

**严重错误告警**: 见 `lib/ai/error-logger.ts` 第 250-300 行

CRITICAL 级别错误会触发：
- 控制台告警
- 第三方告警系统通知
- 钉钉 Webhook 通知
- 邮件告警

### 6.3 错误日志查询

**通过 API 查询**:
```
GET /api/audit/logs?action=error&level=CRITICAL
```

**通过数据库查询**:
```sql
-- 查询最近 24 小时的错误统计
SELECT errorCategory, COUNT(*) as count
FROM queryAuditLog
WHERE timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)
  AND executionResult_success = false
GROUP BY errorCategory
ORDER BY count DESC;
```

### 6.4 错误脱敏

**敏感信息脱敏**: 见 `lib/audit/error-sanitizer.ts`

自动脱敏内容：
- 密码 (password, pwd, passwd)
- Token (token, apiKey, secret)
- 数据库连接串中的密码
- SQL 中的敏感数据

---

## 7. 日志查询与分析

### 7.1 文件日志查询

**实时日志监控**:
```bash
# 查看实时日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log

# 查看最近 100 行
tail -n 100 logs/app.log
```

**日志过滤**:
```bash
# 查看特定级别日志
grep "ERROR" logs/app.log

# 查看特定时间段
grep "2025-11-25 10:" logs/app.log

# 查看特定操作
grep "数据源同步" logs/app.log

# 统计错误数量
grep -c "ERROR" logs/app.log
```

**日志分析**:
```bash
# 统计各级别日志数量
grep -o "INFO\|WARN\|ERROR" logs/app.log | sort | uniq -c

# 查找慢查询
grep "executionTime" logs/app.log | awk -F'executionTime=' '{if($2 > 1000) print}'

# 分析访问量最高的 IP
grep "ipAddress" logs/app.log | grep -o 'ipAddress="[^"]*"' | sort | uniq -c | sort -rn | head -10
```

### 7.2 审计日志查询

**通过 Web API**:

见 `manual/api-reference.md` 第 480-500 行

**常用查询场景**:

| 场景 | API 调用 |
|------|---------|
| 查询用户历史 | `GET /api/audit/logs?userId=123` |
| 查询失败操作 | `GET /api/audit/logs?status=failed` |
| 查询慢查询 | `GET /api/audit/logs?executionTime_gte=1000` |
| 时间范围查询 | `GET /api/audit/logs?startDate=2025-11-01&endDate=2025-11-25` |

**编程接口**:

见 `lib/audit/audit-logger.ts` 第 150-250 行

### 7.3 统计分析

**系统统计**:
```
GET /api/statistics/overview
```

返回内容：
- 总查询数
- 今日查询数
- 平均响应时间
- 成功率

**热点分析**:
```
GET /api/statistics/hotspots
```

返回内容：
- 热门查询表
- 热门查询字段
- 访问频率分布

**性能趋势**:

见 `lib/audit/audit-analyzer.ts` 第 150-200 行

---

## 8. 日志维护

### 8.1 日志轮转

**文件日志轮转**:
- 采用 pino-roll 自动轮转
- 按日期归档: `app.log.2025-11-25`
- 达到最大大小自动分割

**配置**:
```bash
LOG_FILE_MAX_SIZE=10        # MB
LOG_FILE_RETENTION_DAYS=30  # 天
```

**轮转策略**:
- 每日轮转一次
- 文件大小超过限制立即轮转
- 自动压缩旧日志（可选）

### 8.2 日志清理

**自动清理策略**:

| 日志类型 | 默认保留期 | 清理方法 |
|---------|-----------|---------|
| 应用日志 | 30天 | 系统定时任务 |
| 错误日志 | 90天 | 系统定时任务 |
| 审计日志 | 90天 | `cleanupOldLogs()` |
| 性能日志 | 30天 | `cleanupOldLogs()` |
| 系统告警 | 180天 | `cleanupOldLogs()` |

**手动清理**:

见 `lib/audit/audit-logger.ts` 第 300-320 行
```typescript
// 清理 90 天前的审计日志
await auditLogger.cleanupOldLogs(90);
```

**清理监控**:
- 清理操作记录到应用日志
- 统计清理的记录数
- 异常时触发告警

### 8.3 日志归档

**归档策略**:
1. 定期将数据库日志导出为文件
2. 压缩归档文件
3. 上传到对象存储（可选）
4. 清理数据库中的旧数据

**归档脚本示例**:
```bash
# 导出审计日志
mysqldump galileo queryAuditLog \
  --where="timestamp < DATE_SUB(NOW(), INTERVAL 90 DAY)" \
  > audit_archive_$(date +%Y%m%d).sql

# 压缩
gzip audit_archive_$(date +%Y%m%d).sql

# 删除已归档数据
mysql galileo -e "DELETE FROM queryAuditLog
  WHERE timestamp < DATE_SUB(NOW(), INTERVAL 90 DAY)"
```

---

## 9. 最佳实践

### 9.1 开发环境

**推荐配置**:
```bash
LOG_LEVEL=debug
ENABLE_FILE_LOGGING=false
```

**调试技巧**:
- 使用 `logger.debug()` 输出详细信息
- 利用 pino-pretty 的彩色输出
- 通过上下文参数传递结构化数据

### 9.2 生产环境

**推荐配置**:
```bash
LOG_LEVEL=info
ENABLE_FILE_LOGGING=true
LOG_FILE_RETENTION_DAYS=30
AUDIT_LOG_RETENTION_DAYS=90
```

**注意事项**:
- ✅ 避免在日志中记录敏感信息
- ✅ 使用错误脱敏功能
- ✅ 定期检查日志文件大小
- ✅ 配置日志告警
- ✅ 监控日志磁盘使用率

### 9.3 日志记录规范

**结构化日志**:
```typescript
// ✅ 推荐：结构化日志
logger.info('查询执行成功', {
  datasourceId,
  executionTime,
  rowCount
});

// ❌ 不推荐：字符串拼接
logger.info(`查询执行成功: ${datasourceId}, 耗时: ${executionTime}ms`);
```

**上下文信息**:
- 包含必要的追踪信息（requestId、sessionId）
- 记录关键参数和结果
- 包含时间戳和操作者信息

**敏感信息处理**:
- 不记录密码、Token 等敏感数据
- 使用脱敏函数处理敏感字段
- 错误堆栈不包含环境变量

### 9.4 性能优化

**异步记录**:
- 审计日志异步记录，不阻塞业务
- 使用日志队列缓冲高并发
- 批量写入数据库

**日志采样**:
- 高频操作可采样记录
- DEBUG 日志仅在开发环境启用
- 过滤重复的错误日志

**索引优化**:
- 审计日志表添加必要索引
- 定期分析查询性能
- 考虑分表策略（按月分表）

### 9.5 监控与告警

**关键指标监控**:
- 错误日志增长速率
- 慢查询数量
- 审计日志写入延迟
- 日志磁盘使用率

**告警配置**:
- 错误率突增（10分钟内超过阈值）
- 慢查询数量异常
- 日志磁盘空间不足
- 审计日志写入失败

**告警渠道**:
- 钉钉 Webhook
- 邮件通知
- 短信告警（严重错误）

---

## 附录: 日志相关文件清单

### 核心日志模块

| 文件路径 | 功能 |
|---------|------|
| `lib/logger.ts` | 主日志系统配置 |
| `lib/utils/logger.ts` | 通用日志工具 |
| `lib/audit/audit-logger.ts` | 审计日志记录器 |
| `lib/audit/audit-analyzer.ts` | 审计日志分析器 |
| `lib/audit/error-sanitizer.ts` | 错误脱敏工具 |
| `lib/api/performance-monitor.ts` | API 性能监控 |
| `lib/ai/error-logger.ts` | 错误日志和性能记录 |
| `lib/metadata/sync/sync-logger.ts` | 同步日志 |
| `lib/security/rate-limit-logger.ts` | 速率限制日志 |
| `lib/cache/warmup/warmup-monitor.ts` | 缓存预热监控 |

### 编排器

| 文件路径 | 功能 |
|---------|------|
| `lib/di/orchestrators/audit.orchestrator.ts` | 审计日志编排器 |

### API 端点

| 端点 | 功能 |
|------|------|
| `GET /api/audit/logs` | 查询审计日志 |
| `GET /api/audit/stats` | 审计统计 |
| `GET /api/performance` | 性能指标 |
| `GET /api/statistics/overview` | 系统统计概览 |
| `GET /api/statistics/hotspots` | 热点分析 |

---

**相关文档**:
- [系统架构](./architecture.md) - 了解日志系统在整体架构中的位置
- [运维手册](./operations.md) - 日志监控和故障排查
- [API 参考](./api-reference.md) - 日志查询 API 详细说明
