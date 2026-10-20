# API 参考

> 作者: xusy
> 版本: 2.1
> 最后更新: 2025-11-26

---

## 目录

1. [概述](#1-概述)
2. [Query - 智能查询](#2-query---智能查询)
3. [Datasources - 数据源管理](#3-datasources---数据源管理)
4. [Metadata - 元数据管理](#4-metadata---元数据管理)
5. [Domains - 业务域管理](#5-domains---业务域管理)
6. [Relationships - 表关系管理](#6-relationships---表关系管理)
7. [Statistics - 统计分析](#7-statistics---统计分析)
8. [AI - AI 服务](#8-ai---ai-服务)
9. [Cache - 缓存管理](#9-cache---缓存管理)
10. [Audit - 审计日志](#10-audit---审计日志)
11. [System - 系统管理](#11-system---系统管理)

---

## 1. 概述

### 1.1 基础信息

- **基础路径**: `/api`
- **数据格式**: JSON
- **编码**: UTF-8
- **API 总数**: 40 个端点，54 个 HTTP 方法

### 1.2 通用响应结构

**成功响应**
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应**
```json
{
  "success": false,
  "error": "错误信息"
}
```

### 1.3 速率限制

| 接口类型 | 限制 |
|----------|------|
| /api/query/execute | 10 次/分钟 |
| /api/metadata/sync | 5 次/小时 |
| /api/ai/* | 20 次/分钟 |
| 其他 | 30 次/分钟 |

超限返回 HTTP 429，响应头包含 `X-RateLimit-*` 信息。

### 1.4 API 端点分组总览

| 分组 | 端点数 | 说明 |
|------|--------|------|
| Query | 4 | 自然语言查询、SQL 预览、执行、历史 |
| Datasources | 7 | 数据源 CRUD、连接测试、元数据同步、语义标注 |
| Metadata | 11 | 数据库/表/列浏览、搜索、关系推断、业务域 |
| Domains | 6 | 业务域 CRUD、关键词管理、自动发现 |
| Relationships | 2 | 关系图谱、关系验证 |
| Statistics | 2 | 统计概览、热点分析 |
| AI | 3 | 成本统计、诊断、提示词缓存 |
| Cache | 2 | 缓存统计、清除 |
| Audit | 2 | 审计日志、统计 |
| System | 2 | 健康检查、性能监控 |
| Docs | 1 | OpenAPI 文档 |

**总计**: 40 个端点

---

## 2. Query - 智能查询

自然语言查询相关接口，核心功能。

### 2.1 预览 SQL 查询

**POST /api/query/preview**

将自然语言转换为 SQL 查询并预览，不执行。

请求体：
```json
{
  "query": "查询最近一周的订单数量",
  "datasourceId": "ds_001"
}
```

响应：
```json
{
  "sql": "SELECT COUNT(*) FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
  "tables": ["orders"],
  "confidence": 0.95
}
```

源码: `app/api/query/preview/route.ts`

### 2.2 执行 SQL 查询

**POST /api/query/execute**

执行 SQL 查询并返回结果。

请求体：
```json
{
  "sql": "SELECT * FROM users LIMIT 10",
  "datasourceId": "ds_001"
}
```

响应：
```json
{
  "data": [...],
  "rowCount": 10,
  "executionTime": 123
}
```

源码: `app/api/query/execute/route.ts`

### 2.3 获取查询历史列表

**GET /api/query/history**

查询参数：
- `limit`: 每页数量 (默认 20)
- `offset`: 偏移量 (默认 0)

源码: `app/api/query/history/route.ts`

### 2.4 获取查询历史详情

**GET /api/query/history/{id}**

路径参数：
- `id`: 查询历史 ID

源码: `app/api/query/history/[id]/route.ts`

### 2.5 查询结果反馈

**POST /api/query/feedback**

对自己的一次查询结果点赞 / 点踩，进入管理员审核队列。`runId` 来自 `/api/query/execute` 的响应（已记录审计日志时返回，失败的查询同样返回）。

请求体：
```json
{
  "runId": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  "rating": "down",
  "reason": "wrong_filter",
  "comment": "应该只统计已支付订单"
}
```

- `rating`: `up` | `down`；`reason`（仅 `down`）: `wrong_table` | `wrong_filter` | `wrong_metric` | `other`
- 重复提交覆盖原反馈；不是自己的查询返回 403，查询记录不存在或已过期返回 404，已审核返回 409

编辑 SQL 后执行（`POST /api/query/execute-sql`）时传入 `sourceRunId`（原查询的 runId），执行成功且 SQL 有改动时自动记为「已纠正」，响应中 `correctionRecorded: true`。

源码: `app/api/query/feedback/route.ts`

### 2.6 反馈审核与已验证查询（管理员）

| 端点 | 说明 |
|------|------|
| `GET /api/admin/feedback?status=pending&rating=&page=1&limit=20` | 审核队列；`status`: `pending`（默认）\| `accepted` \| `rejected` \| `all`；`rating`: `up` \| `down` \| `corrected` |
| `POST /api/admin/feedback/{id}` | `{ "action": "accept" \| "reject", "question"?, "sql"? }`；采纳时 SQL 默认取用户纠正后的版本，SQL 中的表必须都已同步（否则 400） |
| `GET /api/admin/verified-queries?active=true&page=1&limit=20` | 已验证查询列表 |
| `PATCH /api/admin/verified-queries/{id}` | `{ "isActive": boolean }`；重新启用时按当前元数据刷新表结构快照 |

已验证查询在 `ENABLE_VERIFIED_QUERIES=true` 时生效，见 `manual/operations.md` 第 8 节。

源码: `app/api/admin/feedback/`、`app/api/admin/verified-queries/`

### 2.7 保存的查询

只能访问自己保存的查询（其他用户的返回 404）。

| 端点 | 说明 |
|------|------|
| `POST /api/saved-queries` | `{ "runId", "title"?, "schedule"?: "none" \| "daily" \| "weekly", "runAtHour"?: 0-23, "runOnWeekday"?: 1-7 }`；保存该次执行成功的查询最终执行的 SQL，返回 201 |
| `GET /api/saved-queries` | 列表，每项含 `unreadRuns`（未查看的定时执行结果数） |
| `GET /api/saved-queries/suggestion?runId=` | `{ suggest, count }`：14 天内问过至少 3 次相同问题且未保存时 `suggest=true` |
| `GET /api/saved-queries/unread-count` | `{ count }`，导航栏角标 |
| `GET /api/saved-queries/{id}` | 详情与最近 20 次执行记录；查看后标记为已读 |
| `PATCH /api/saved-queries/{id}` | `{ title?, schedule?, runAtHour?, runOnWeekday?, status?: "active" \| "paused" }`；对「需要确认」的查询设置 `active` 会刷新表结构快照 |
| `DELETE /api/saved-queries/{id}` | 删除（执行记录一并删除） |
| `POST /api/saved-queries/{id}/run` | 立即执行，响应结构同 `/api/query/execute`，另含 `savedQueryRunId`；与执行查询共用 10 次/分钟限额 |
| `GET /api/saved-queries/{id}/runs/{runId}` | 一次执行的结果预览 |

源码: `app/api/saved-queries/`、`lib/saved-queries/`

### 2.8 推荐问题

| 端点 | 说明 |
|------|------|
| `GET /api/query/suggestions?dataSourceId=` | 最多 200 条推荐问题（按分数倒序），`source`: `verified` \| `popular` \| `template`；`verifiedEnabled` 表示已验证问题是否会直接使用已验证的 SQL。前端在这份列表内做输入联想，不按输入逐字请求 |
| `GET /api/admin/suggestions?page=1&limit=20` | 全部推荐问题（含已隐藏，管理员） |
| `PATCH /api/admin/suggestions/{id}` | `{ "isHidden": boolean }`，隐藏后不再推荐，重建时保留 |
| `POST /api/admin/maintenance/rebuild-suggestions` | 重建推荐问题（定时任务，见 `manual/operations.md` 第 10 节） |

源码: `app/api/query/suggestions/`、`lib/suggestions/`

---

## 3. Datasources - 数据源管理

数据源连接配置与管理。

### 3.1 获取数据源列表

**GET /api/datasources**

源码: `app/api/datasources/route.ts`

### 3.2 创建数据源

**POST /api/datasources**

请求体：
```json
{
  "name": "生产库",
  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "database": "mydb",
  "username": "root",
  "password": "xxx"
}
```

支持类型: `mysql`, `postgresql`, `sqlserver`

源码: `app/api/datasources/route.ts`

### 3.3 获取/更新/删除数据源

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/datasources/{id} | 获取详情 |
| PUT | /api/datasources/{id} | 更新配置 |
| DELETE | /api/datasources/{id} | 删除数据源 |

源码: `app/api/datasources/[id]/route.ts`

### 3.4 测试数据源连接

**POST /api/datasources/{id}/test**

测试数据源连接是否正常。

源码: `app/api/datasources/[id]/test/route.ts`

### 3.5 同步数据源元数据

**POST /api/datasources/{id}/sync**

从数据源同步表结构等元数据。

源码: `app/api/datasources/[id]/sync/route.ts`

### 3.6 AI 语义标注

**POST /api/datasources/{id}/annotate**

使用 AI 为数据源的表和列生成语义描述和业务含义。

请求体：
```json
{
  "scope": "all",  // all | tables | columns
  "targetIds": []  // 可选：指定表或列 ID
}
```

响应：
```json
{
  "success": true,
  "data": {
    "annotatedTables": 10,
    "annotatedColumns": 150,
    "tokensUsed": 5000
  }
}
```

源码: `app/api/datasources/[id]/annotate/route.ts`

---

## 4. Metadata - 元数据管理

元数据浏览、搜索与业务域推断。

### 4.1 获取数据库列表

**GET /api/metadata/databases**

源码: `app/api/metadata/databases/route.ts`

### 4.2 获取表列表

**GET /api/metadata/tables**

查询参数：
- `datasourceId`: 数据源 ID
- `database`: 数据库名

源码: `app/api/metadata/tables/route.ts`

### 4.3 获取列信息

**GET /api/metadata/columns**

查询参数：
- `tableId`: 表 ID

源码: `app/api/metadata/columns/route.ts`

### 4.4 搜索元数据

**GET /api/metadata/search**

查询参数：
- `q`: 搜索关键词 (必填)

源码: `app/api/metadata/search/route.ts`

### 4.5 推断表关系

**POST /api/metadata/relationships/infer**

基于命名规则和数据特征推断表之间的关系。

请求体：
```json
{
  "datasourceId": "ds_001"
}
```

源码: `app/api/metadata/relationships/infer/route.ts`

### 4.6 元数据业务域管理（已弃用）

> **已弃用，2027-01-20 移除。** 业务域的增删改查请使用 [第 5 节 /api/domains](#51-获取创建业务域)，
> 它同时支持关键词维护（查询时的业务域推断依赖关键词）。调用以下接口会收到 `Deprecation`、`Sunset`、
> `Link` 响应头，服务端记录 `[Deprecation Warning]` 日志。下方 4.7 ~ 4.10 的推断与指标接口不受影响。

| 方法 | 路径 | 替代接口 |
|------|------|----------|
| GET | /api/metadata/domains | GET /api/domains |
| POST | /api/metadata/domains | POST /api/domains |
| PUT | /api/metadata/domains/{id} | PUT /api/domains/{id} |
| DELETE | /api/metadata/domains/{id} | DELETE /api/domains/{id} |

源码: `app/api/metadata/domains/route.ts`、`app/api/metadata/domains/[id]/route.ts`

### 4.7 推断单表业务域

**POST /api/metadata/domains/infer**

使用 AI 推断表所属的业务域。

源码: `app/api/metadata/domains/infer/route.ts`

### 4.8 批量推断业务域

**POST /api/metadata/domains/batch-infer**

批量推断多个表的业务域。

源码: `app/api/metadata/domains/batch-infer/route.ts`

### 4.9 应用业务域分配

**PUT /api/metadata/domains/apply**

将推断的业务域应用到表。

源码: `app/api/metadata/domains/apply/route.ts`

### 4.10 获取业务域指标

**GET /api/metadata/domains/metrics**

获取业务域分配的统计指标。

源码: `app/api/metadata/domains/metrics/route.ts`

---

## 5. Domains - 业务域管理

独立的业务域管理接口。

### 5.1 获取/创建业务域

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/domains | 获取业务域列表 |
| POST | /api/domains | 创建业务域 |

源码: `app/api/domains/route.ts`

### 5.2 业务域详情操作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/domains/{id} | 获取详情 |
| PUT | /api/domains/{id} | 更新业务域 |
| DELETE | /api/domains/{id} | 删除业务域 |

源码: `app/api/domains/[id]/route.ts`

### 5.3 业务域关键词管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/domains/{id}/keywords | 获取关键词 |
| PUT | /api/domains/{id}/keywords | 更新关键词 |

源码: `app/api/domains/[id]/keywords/route.ts`

### 5.4 自动发现业务域

**POST /api/domains/discover**

基于表结构和数据自动发现潜在的业务域。

源码: `app/api/domains/discover/route.ts`

---

## 6. Relationships - 表关系管理

表关系图谱与验证。

### 6.1 获取关系图谱数据

**GET /api/relationships/graph**

获取表之间的关系图谱，用于可视化展示。

查询参数：
- `datasourceId`: 数据源 ID

源码: `app/api/relationships/graph/route.ts`

### 6.2 验证表关系

**POST /api/relationships/verify**

验证推断的表关系是否正确。

请求体：
```json
{
  "relationshipId": "rel_001",
  "valid": true
}
```

源码: `app/api/relationships/verify/route.ts`

---

## 7. Statistics - 统计分析

系统统计与分析。

### 7.1 获取统计概览

**GET /api/statistics/overview**

响应：
```json
{
  "totalQueries": 1000,
  "todayQueries": 50,
  "avgResponseTime": 150,
  "successRate": 0.98
}
```

源码: `app/api/statistics/overview/route.ts`

### 7.2 获取热点统计

**GET /api/statistics/hotspots**

获取查询热点表和字段统计。

源码: `app/api/statistics/hotspots/route.ts`

---

## 8. AI - AI 服务

AI 相关功能与成本管理。

### 8.1 获取 AI 成本统计

**GET /api/ai/cost**

查询参数：
- `startDate`: 开始日期 (YYYY-MM-DD)
- `endDate`: 结束日期 (YYYY-MM-DD)

源码: `app/api/ai/cost/route.ts`

### 8.2 AI 诊断信息

**GET /api/ai/diagnostic**

获取 AI 服务的诊断信息。

源码: `app/api/ai/diagnostic/route.ts`

### 8.3 提示词缓存管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/ai/prompt-cache | 获取缓存状态 |
| DELETE | /api/ai/prompt-cache | 清除缓存 |

源码: `app/api/ai/prompt-cache/route.ts`

---

## 9. Cache - 缓存管理

查询缓存管理。

### 9.1 获取缓存统计

**GET /api/cache/stats**

获取查询缓存的命中率等统计信息。

源码: `app/api/cache/stats/route.ts`

### 9.2 清除缓存

**POST /api/cache/clear**

请求体：
```json
{
  "type": "all"  // all | query | metadata
}
```

源码: `app/api/cache/clear/route.ts`

---

## 10. Audit - 审计日志

审计日志记录与统计。

### 10.1 获取审计日志

**GET /api/audit/logs**

查询参数：
- `limit`: 数量限制 (默认 50)
- `offset`: 偏移量 (默认 0)
- `action`: 操作类型筛选
- `startDate`: 开始日期
- `endDate`: 结束日期

源码: `app/api/audit/logs/route.ts`

### 10.2 获取审计统计

**GET /api/audit/stats**

获取审计日志的统计汇总。

源码: `app/api/audit/stats/route.ts`

---

## 11. System - 系统管理

系统健康与性能监控。

### 11.1 健康检查

**GET /api/health**

响应：
```json
{
  "status": "healthy",
  "database": { "status": "connected" },
  "redis": { "status": "connected" }
}
```

源码: `app/api/health/route.ts`

### 11.2 获取性能指标

**GET /api/performance**

获取系统性能监控指标。

响应：
```json
{
  "success": true,
  "data": {
    "p50ResponseTime": 150,
    "p95ResponseTime": 350,
    "p99ResponseTime": 800,
    "avgResponseTime": 180,
    "slowQueryCount": 5,
    "totalRequests": 10000
  }
}
```

源码: `app/api/performance/route.ts`

---

## 12. Docs - 文档

### 12.1 OpenAPI 规范

**GET /api/docs/openapi**

获取系统的 OpenAPI 3.0 规范文档（JSON 格式）。

响应：
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Galileo API",
    "version": "1.0.0"
  },
  "paths": { ... },
  "components": { ... }
}
```

**用途**:
- 导入到 Postman、Insomnia 等 API 客户端
- 生成 SDK 和客户端代码
- API 文档自动生成

源码: `app/api/docs/openapi/route.ts`

---

## 附录: 完整接口清单 (40 个)

### Query (4)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/query/preview | 预览 SQL 查询 |
| POST | /api/query/execute | 执行 SQL 查询 |
| GET | /api/query/history | 获取查询历史列表 |
| GET | /api/query/history/{id} | 获取查询历史详情 |

### Datasources (7)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/datasources | 获取数据源列表 |
| POST | /api/datasources | 创建数据源 |
| GET | /api/datasources/{id} | 获取数据源详情 |
| PUT | /api/datasources/{id} | 更新数据源 |
| DELETE | /api/datasources/{id} | 删除数据源 |
| POST | /api/datasources/{id}/test | 测试连接 |
| POST | /api/datasources/{id}/sync | 同步元数据 |
| POST | /api/datasources/{id}/annotate | AI 语义标注 |

### Metadata (11)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/metadata/databases | 获取数据库列表 |
| GET | /api/metadata/tables | 获取表列表 |
| GET | /api/metadata/columns | 获取列信息 |
| GET | /api/metadata/search | 搜索元数据 |
| POST | /api/metadata/relationships/infer | 推断表关系 |
| GET | /api/metadata/domains | 获取元数据业务域列表 |
| POST | /api/metadata/domains | 创建元数据业务域 |
| GET | /api/metadata/domains/{id} | 获取业务域详情 |
| PUT | /api/metadata/domains/{id} | 更新业务域 |
| DELETE | /api/metadata/domains/{id} | 删除业务域 |
| POST | /api/metadata/domains/infer | 推断单表业务域 |
| POST | /api/metadata/domains/batch-infer | 批量推断业务域 |
| POST | /api/metadata/domains/apply | 应用业务域分配 |
| GET | /api/metadata/domains/metrics | 获取业务域指标 |

### Domains (6)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/domains | 获取业务域列表 |
| POST | /api/domains | 创建业务域 |
| GET | /api/domains/{id} | 获取业务域详情 |
| PUT | /api/domains/{id} | 更新业务域 |
| DELETE | /api/domains/{id} | 删除业务域 |
| GET | /api/domains/{id}/keywords | 获取业务域关键词 |
| PUT | /api/domains/{id}/keywords | 更新业务域关键词 |
| POST | /api/domains/discover | 自动发现业务域 |

### Relationships (2)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/relationships/graph | 获取关系图谱数据 |
| POST | /api/relationships/verify | 验证表关系 |

### Statistics (2)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/statistics/overview | 获取统计概览 |
| GET | /api/statistics/hotspots | 获取热点统计 |

### AI (3)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/ai/cost | 获取 AI 成本统计 |
| GET | /api/ai/diagnostic | AI 诊断信息 |
| GET | /api/ai/prompt-cache | 获取提示词缓存状态 |
| DELETE | /api/ai/prompt-cache | 清除提示词缓存 |

### Cache (2)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/cache/stats | 获取缓存统计 |
| POST | /api/cache/clear | 清除缓存 |

### Audit (2)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/audit/logs | 获取审计日志 |
| GET | /api/audit/stats | 获取审计统计 |

### System (2)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/performance | 获取性能指标 |

### Docs (1)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/docs/openapi | 获取 OpenAPI 规范 |
