# 系统架构文档

> 作者: xusy
> 版本: 2.0
> 最后更新: 2025-11-26

---

## 目录

1. [整体架构](#1-整体架构)
2. [核心模块](#2-核心模块)
3. [数据流](#3-数据流)
4. [数据模型](#4-数据模型)
5. [依赖注入](#5-依赖注入)
6. [设计模式](#6-设计模式)

---

## 1. 整体架构

### 1.1 分层架构

```
┌─────────────────────────────────────────────┐
│           表示层 (app/)                      │
│    Next.js 页面 + API 路由                   │
├─────────────────────────────────────────────┤
│           编排层 (lib/di/orchestrators/)     │
│    QueryOrchestrator, MetadataOrchestrator  │
├─────────────────────────────────────────────┤
│           业务层 (lib/)                      │
│    NLP、SQL生成、元数据、缓存、审计          │
├─────────────────────────────────────────────┤
│           数据层                             │
│    Prisma ORM + Redis + 外部数据源          │
└─────────────────────────────────────────────┘
```

### 1.2 目录结构

| 目录 | 职责 | 关键文件 |
|------|------|----------|
| `app/api/` | API 路由层 | 40 个端点 (54 个 HTTP 方法) |
| `lib/di/` | 依赖注入 | `setup.ts` (4 阶段注册), `tokens.ts` (114 个 Token) |
| `lib/ai/` | AI 集成 | `deepseek-client.ts`、批处理、成本追踪 |
| `lib/nlp/` | 自然语言处理 | `intent-recognizer.ts`、实体解析、时间解析 |
| `lib/sql/` | SQL 生成执行 | `generator/` (6 阶段管道)、`executor/`、`validator/` |
| `lib/metadata/` | 元数据管理 | 11 个子模块 (采集、同步、推断、检索、分表、存储) |
| `lib/cache/` | 多级缓存 | L1/L2 + 语义缓存 + 防击穿守卫 |
| `lib/security/` | 安全模块 | 双层速率限制、加密、错误清理 |
| `lib/vector/` | 向量搜索 | 嵌入生成、向量存储、语义搜索 |
| `prisma/` | 数据模型 | `schema.prisma` (24 个表) |

---

## 2. 核心模块

### 2.1 编排器 (Orchestrators)

编排器是业务流程的协调者，位于 `lib/di/orchestrators/`。系统采用**聚合编排器模式**，部分编排器委托给多个单一职责的子服务。

| 编排器 | 职责 | 架构模式 | 源码位置 |
|--------|------|----------|----------|
| QueryOrchestrator | 查询执行全流程编排 | 直接编排 | `query.orchestrator.ts` |
| MetadataOrchestrator | 元数据同步流程编排 | 直接编排 | `metadata.orchestrator.ts` |
| **DataSourceOrchestrator** | 数据源聚合编排 | **聚合模式** (4 个子服务) | `datasource.orchestrator.ts` |
| **RelationshipOrchestrator** | 关系管理聚合编排 | **聚合模式** (4 个子服务) | `relationship.orchestrator.ts` |
| CacheOrchestrator | 缓存管理编排 | 直接编排 | `cache.orchestrator.ts` |
| AuditOrchestrator | 审计日志编排 | 直接编排 | `audit.orchestrator.ts` |

#### 聚合编排器子服务

**DataSourceOrchestrator 子服务** (`lib/di/orchestrators/datasource/`):
| 子服务 | 单一职责 | 文件 |
|--------|---------|------|
| DataSourceLifecycleService | 数据源 CRUD 生命周期管理 | `datasource-lifecycle.service.ts` |
| DataSourceConnectionService | 数据源连接测试 | `datasource-connection.service.ts` |
| DataSourceSyncService | 元数据同步协调 | `datasource-sync.service.ts` |
| DataSourceQueryService | 数据源列表和详情查询 | `datasource-query.service.ts` |

**RelationshipOrchestrator 子服务** (`lib/di/orchestrators/relationship/`):
| 子服务 | 单一职责 | 文件 |
|--------|---------|------|
| RelationshipInferenceService | AI 驱动的关系推断 | `relationship-inference.service.ts` |
| RelationshipVerificationService | 关系有效性验证 | `relationship-verification.service.ts` |
| RelationshipGraphService | 关系图谱构建 | `relationship-graph.service.ts` |
| RelationshipStatisticsService | 关系统计分析 | `relationship-statistics.service.ts` |

### 2.2 AI 模块

位于 `lib/ai/`，负责与 Deepseek API 交互。

| 模块 | 职责 |
|------|------|
| DeepseekClient | API 调用封装 |
| PromptCacheManager | Prompt 缓存减少 Token 消耗 |
| AICostTracker | Token 用量和费用追踪 |
| SemanticAnnotator | AI 生成字段语义描述 |
| BatchProcessor | 批量 AI 请求处理 |

配置项见 `lib/ai/config.ts`。

### 2.3 NLP 模块

位于 `lib/nlp/`，负责自然语言理解。

| 模块 | 职责 | 输出 |
|------|------|------|
| IntentRecognizer | 意图识别 | QueryIntent |
| EntityResolver | 实体解析 | 表名、列名映射 |
| TimeParser | 时间解析 | SQL 时间条件 |
| QueryDomainInferencer | 查询域推断 | 涉及的业务域 |

### 2.4 SQL 模块

位于 `lib/sql/`，分为四个子模块：

**生成器 (`generator/`)**
- SQLGenerationPipeline：6 阶段管道式处理
- 支持模板匹配、提示词缓存、SQL 缓存、AI 生成、质量增强、验证
- 见 `lib/sql/generator/pipeline/sql-generation-pipeline.ts`

**6 阶段 SQL 生成管道** (`generator/pipeline/stages/`):
| 阶段 | 职责 | 文件 |
|------|------|------|
| 1. TemplateMatcher | 尝试匹配预定义查询模板 | `template-matcher-stage.ts` |
| 2. PromptCacheChecker | 检查提示词缓存避免重复生成 | `prompt-cache-checker-stage.ts` |
| 3. SQLCacheChecker | 检查 SQL 结果缓存 | `sql-cache-checker-stage.ts` |
| 4. AIGenerator | 使用 DeepSeek AI 生成 SQL | `ai-generator-stage.ts` |
| 5. QualityEnhancer | 质量增强（优化、修复） | `quality-enhancer-stage.ts` |
| 6. Validator | 最终验证（语法、安全、性能） | `validator-stage.ts` |

**验证器 (`validator/`)**
- 语法验证、安全检查 (SQL 注入防护)、性能分析
- 成本估计、优化建议、模式检测
- 见 `lib/sql/validator/sql-validator.ts`、`security-checker.ts`、`performance-analyzer.ts`

**执行器 (`executor/`)**
- 连接池管理、超时控制、结果格式化、统计追踪
- 见 `lib/sql/executor/query-executor.ts`、`result-formatter.ts`

**质量保障 (`quality/`)**
- SQL 自动修复、质量评估、用户反馈收集
- 见 `lib/sql/quality/sql-auto-fixer.ts`、`sql-quality-assessor.ts`

### 2.5 元数据模块

位于 `lib/metadata/`，包含 11 个子模块：

| 子模块 | 职责 | 关键文件 |
|--------|------|----------|
| `collectors/` | Schema 采集 (MySQL/PostgreSQL) | `mysql-schema-collector.ts`、`postgresql-schema-collector.ts` |
| `sync/` | 增量/全量同步、变更记录 | `metadata-sync-service.ts`、`structure-hash.ts` |
| `inference/` | 关系/业务域推断（3 种策略） | `relationship-inferencer.ts`、`domain-inferencer.ts` |
| `retrieval/` | 元数据检索、语义搜索、相关性排序 | `metadata-retriever.ts`、`semantic-search.ts` |
| `shard/` | 分表管理、分表组检测 | `shard-group-detector.ts`、`shard-group.service.ts` |
| `storage/` | 数据存储、变更追踪 | `metadata-repository.ts`、`change-tracker.ts` |
| `discovery/` | 业务域自动发现 | `domain-discoverer.ts` |
| `graph/` | 关系图谱构建 | `relationship-graph-builder.ts` |

#### 3 种关系推断策略

系统采用**混合推断策略**，综合运用三种方法：

| 策略 | 权重 | 工作原理 | 文件位置 |
|------|------|---------|----------|
| 1. **命名规则策略** | 30% | 基于列名模式匹配（如 `user_id` → `users.id`） | `strategies/naming-rule-strategy.ts` |
| 2. **向量相似度策略** | 30% | 基于列名语义嵌入的向量相似度 | `strategies/vector-similarity-strategy.ts` |
| 3. **AI 推理策略** | 40% | 使用 DeepSeek AI 深度推理关系 | `strategies/ai-reasoning-strategy.ts` |

综合置信度 = 命名规则置信度 × 30% + 向量相似度 × 30% + AI 置信度 × 40%

推断策略配置见 `lib/metadata/inference/config.ts`。

#### 分表优化机制

系统自动检测分表模式（如 `orders_202501`、`orders_202502`），将其归入 **TableShardGroup**，推断时仅对分表组代表进行关系推断，大幅降低推断成本。

见 `lib/metadata/shard/shard-group-detector.ts` 第 1-100 行。

### 2.6 缓存模块

位于 `lib/cache/`，**多级缓存 + 语义缓存 + 防击穿**三位一体架构：

#### 多级缓存架构

| 层级 | 存储 | 延迟 | 容量 | 适用场景 |
|------|------|------|------|---------|
| L1 | 进程内存 (Map) | ~1ms | 1000 条 | 热点数据、高频访问 |
| L2 | Redis 分布式 | ~10ms | 大容量 | 跨实例共享、持久化 |
| L3 | 数据库 | ~100ms | 无限 | 最终数据源 |

#### 语义缓存系统

**基于向量相似度的智能缓存**：不仅匹配精确查询，还匹配语义相似的查询。

- 查询 "最近一周订单" 和 "过去 7 天订单" 被视为相似，共享缓存
- 使用 DeepSeek 生成查询嵌入向量
- 余弦相似度阈值：0.85（可配置）
- 见 `lib/cache/semantic-cache-manager.ts` 第 1-200 行

#### 防击穿守卫

**三层防护机制**：

| 机制 | 原理 | 防护目标 |
|------|------|---------|
| SingleFlight | 并发请求合并为单个后端请求 | 缓存失效时的流量风暴 |
| 分布式锁 (Redis) | 跨实例协调缓存重建 | 多实例同时重建缓存 |
| 空值缓存 | 缓存不存在的 Key | 恶意查询不存在数据 |

见 `lib/cache/cache-breakthrough-guard.ts` 第 1-150 行。

#### 缓存预热系统

**智能预热 (`warmup/`)**：

- 基于历史查询分析热点数据
- 系统启动时自动预热
- 支持定时预热和手动触发
- 见 `lib/cache/warmup/warmup-strategy.ts`、`warmup-analyzer.ts`

#### 缓存失效策略

**关键字驱动的智能失效**：

- 元数据同步时自动失效相关缓存
- 基于表名、列名等关键字智能匹配
- 见 `lib/cache/cache-invalidation.ts` 第 1-100 行

---

## 3. 数据流

### 3.1 自然语言查询流程

```
用户输入（可选：指定数据源）
    │
    ▼
[API] /api/query/execute ── middleware：登录校验、身份注入、限流
    │
    ▼
[结果缓存] key = 数据可见范围 + 指定数据源 + 问题 ─── 命中 ──→ 返回结果
    │ 未命中
    ▼
[意图识别] IntentRecognizer → [业务域推断] QueryDomainInferencer → [实体/时间解析]
    │
    ▼
[元数据检索] MetadataRetriever（指定数据源时只在该数据源的表中检索）
    │
    ▼
[数据源路由] QueryExecutor.resolveSource ── 跨实例 ──→ 422 cross_source_unsupported（不调用 AI）
    │
    ▼
[SQL 生成] SQLGenerator，或 SQLGenerationPipeline（ENABLE_SQL_PIPELINE=true）
    │
    ▼
[SQL 校验] SQLValidator（SQL_VALIDATOR_MODE：off / shadow / enforce）── enforce 不通过 ──→ 422 validation_failed
    │
    ▼
[执行] QueryExecutor（执行层缓存 key = 数据源 + maxRows + SQL）
    │
    ▼
[审计] AuditOrchestrator（异步）
    │
    ▼
返回结果（含 dataSourceIds、usedDatabases）
```

详见 `lib/di/orchestrators/query.orchestrator.ts` 的 `processNaturalLanguageQuery`。

#### 多数据源执行规则

元数据检索可能命中多个数据源的表，执行方式由 `lib/sql/executor/source-router.ts` 决定：

| 情况 | 行为 |
|------|------|
| 只涉及一个数据源 | 在该数据源执行 |
| 多个数据源，位于同一实例（host 忽略大小写 + port 相同） | 用第一个数据源的连接执行跨库 SQL（SQL 已带库名前缀） |
| 多个数据源，位于不同实例 | 返回 422 `cross_source_unsupported`，提示用户在查询页指定数据源 |

限制：

- 跨实例查询（应用层 JOIN）未实现
- 同一台服务器用不同主机名（IP 与域名）登记的数据源会被视为不同实例
- 同实例执行时使用第一个数据源的账号，该账号需要对所有涉及的库有读权限

### 3.2 元数据同步流程

```
触发同步
    │
    ▼
[连接] ConnectionManager
    │
    ▼
[采集] MetadataCollector
    │
    ▼
[存储] MetadataRepository
    │
    ▼
[推断] RelationshipInferencer + DomainInferencer
    │
    ▼
[缓存失效] CacheInvalidationService
```

详见 `lib/metadata/sync/metadata-sync-service.ts`。

---

## 4. 数据模型

### 4.1 核心表 (24 个表)

完整定义见 `prisma/schema.prisma`。

**业务实体表 (5 个)**

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| BusinessDomain | 业务域定义 | name, description, color |
| BusinessDomainKeyword | 业务域关键词 | domainId, keyword |
| DataSource | 数据源配置 | type, host, database, encrypted_password |
| DatabaseMeta | 数据库元数据 | datasourceId, databaseName |
| TableMeta | 表元数据 | databaseId, tableName, tableComment, shardGroupId |
| ColumnMeta | 列元数据 | tableId, columnName, dataType, semanticType |

**关系表 (3 个)**

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| ExplicitRelationship | 显式外键关系 | sourceTableId, targetTableId, relationshipType |
| InferredRelationship | AI 推断的关系 | sourceTableId, targetTableId, confidence, inferenceMethod |
| TableShardGroup | 分表组定义 | shardingPattern, representativeTableId |

**元数据管理表 (3 个)**

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| SchemaSnapshot | 模式快照 | datasourceId, snapshotType, snapshotData |
| MetadataChange | 元数据变更追踪 | entityType, changeType, oldValue, newValue |
| MetadataSnapshot | 元数据版本快照 | snapshotData, createdAt |

**业务规则表 (5 个)**

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| BusinessTermMapping | 业务术语映射 | businessTerm, technicalTerm, domainId |
| ShardingPattern | 分表模式定义 | pattern, description |
| QueryTemplate | 查询模板 | intentPattern, sqlTemplate, domainId |
| CommonFilter | 常用过滤规则 | filterName, sqlCondition |
| AggregationRule | 聚合规则 | ruleName, aggregationType |

**监控表 (4 个)**

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| QueryAuditLog | 查询审计日志 | userId, naturalLanguageQuery, generatedSQL, executionTime |
| ErrorLog | 错误日志 | errorCategory, errorLevel, errorMessage |
| PerformanceMetric | 性能指标 | metricName, metricValue, timestamp |
| SystemAlert | 系统告警 | alertType, severity, message |

### 4.2 关键索引

索引定义见 `prisma/schema.prisma` 末尾部分，包括：
- 全文搜索索引 (FULLTEXT)
- 组合索引
- 唯一性约束

---

## 5. 服务编排架构

项目采用基于 `tsyringe` 的依赖注入框架，配合编排器模式实现复杂业务流程的协调。

### 5.1 架构层次

```
┌─────────────────────────────────────────────────────┐
│                    API Routes                        │
│              (app/api/**/route.ts)                   │
├─────────────────────────────────────────────────────┤
│                   Orchestrators                      │  ← 编排层
│        (协调多个服务完成复杂业务流程)                   │
│  lib/di/orchestrators/*.orchestrator.ts             │
├─────────────────────────────────────────────────────┤
│                    Services                          │  ← 服务层
│            (单一职责的业务服务)                        │
│  lib/di/services/*.service.ts                       │
├─────────────────────────────────────────────────────┤
│              Repositories / Clients                  │  ← 数据层
│         (Prisma, Redis, DeepSeek AI)                │
│  lib/di/factories/*.factory.ts                      │
└─────────────────────────────────────────────────────┘
```

### 5.2 DI 容器核心

**容器配置**: 见 `lib/di/container.ts`

**核心方法**:
- `getContainer()`: 获取全局容器
- `resolve<T>(token: symbol)`: 解析服务实例
- `registerSingleton<T>()`: 注册单例服务
- `registerTransient<T>()`: 注册瞬态服务

### 5.3 Token 定义

所有服务 Token 定义在 `lib/di/tokens.ts`，按功能分组：

| 分组 | Token 数量 | 示例 |
|------|-----------|------|
| 数据库层 | 5 | PrismaClient, ConnectionManager |
| 缓存层 | 11 | RedisClient, MultiLevelCache, SemanticCacheManager |
| AI 服务 | 8 | DeepseekClient, PromptCacheManager, AICostTracker |
| 元数据管理 | 12 | MetadataRepository, DomainInferencer |
| SQL 处理 | 12 | IntentRecognizer, SQLGenerator, QueryExecutor |
| SQL 生成管道 | 6 | SQLGenerationPipeline, AIGenerator |
| 审计安全 | 4 | AuditLogger, RateLimiter |
| 统计服务 | 2 | StatisticsAggregationService |
| 向量搜索 | 3 | EmbeddingGenerator, VectorStore |
| 编排器 | 6 | QueryOrchestrator, MetadataOrchestrator |
| 关系管理 | 4 | RelationshipInferenceService |
| 数据源管理 | 4 | DataSourceLifecycleService |

**总计**: ~60+ 个服务 Token

### 5.4 六大编排器详解

| 编排器 | 职责 | 协调的服务 |
|--------|------|-----------|
| **QueryOrchestrator** | NL→SQL 查询全流程 | IntentRecognizer → EntityResolver → SQLGenerator → QueryExecutor → ResultFormatter |
| **MetadataOrchestrator** | 元数据同步与变更检测 | MetadataCollector → MetadataRepository → DomainInferencer → CacheInvalidation |
| **DataSourceOrchestrator** | 数据源生命周期管理 | DataSourceLifecycle → ConnectionService → SyncService → QueryService |
| **RelationshipOrchestrator** | 表关系推断与图谱 | InferenceService → VerificationService → GraphService → StatisticsService |
| **CacheOrchestrator** | 多级缓存管理 | CacheWarmer → CacheStats → CacheInvalidation → BreakthroughGuard |
| **AuditOrchestrator** | 审计日志与异常检测 | AuditLogger → AuditAnalyzer → ErrorSanitizer |

### 5.5 编排器子服务

**RelationshipOrchestrator 子服务** (`lib/di/orchestrators/relationship/`):
- `relationship-inference.service.ts` - 关系推断
- `relationship-verification.service.ts` - 关系验证
- `relationship-graph.service.ts` - 图谱生成
- `relationship-statistics.service.ts` - 关系统计

**DataSourceOrchestrator 子服务** (`lib/di/orchestrators/datasource/`):
- `datasource-lifecycle.service.ts` - 生命周期管理
- `datasource-connection.service.ts` - 连接管理
- `datasource-sync.service.ts` - 元数据同步
- `datasource-query.service.ts` - 查询执行

### 5.6 注册流程 (4 阶段注册)

见 `lib/di/setup.ts` 第 1-500 行，采用**分阶段依赖注册**策略：

| 阶段 | 内容 | Token 范围 | 注册数量 |
|------|------|-----------|---------|
| **Phase 2.0** | 核心基础设施 | RedisClient, DatabaseService, CacheService | 3 个 |
| **Phase 2.1** | 扩展服务 | ConnectionPool, MultiLevelCache, QueryCacheManager, AuditLogger 等 | 10+ 个 |
| **Phase 2.2** | AI 和元数据服务 | DeepseekClient, SemanticCacheManager, VectorSearch, MetadataRepository, DomainInferencer 等 | 20+ 个 |
| **Phase 2.3** | SQL 处理服务 | IntentRecognizer, EntityResolver, SQLGenerator, QueryExecutor, SQLValidator, TimeParser 等 | 15+ 个 |
| **Phase 2.4** | SQL 生成管道 | SQLGenerationPipeline, TemplateMatcher, AIGenerator, QualityEnhancer, Validator 等 | 7 个 |
| **Phase 3** | 编排器层 | MetadataOrchestrator, QueryOrchestrator, DataSourceOrchestrator (+ 4 子服务), RelationshipOrchestrator (+ 4 子服务), CacheOrchestrator, AuditOrchestrator | 14 个 (6 编排器 + 8 子服务) |
| **Phase 4** | 统计服务 | StatisticsPersistenceService, StatisticsAggregationService | 2 个 |

**总计**: 70+ 个服务注册，114 个 DI Token 定义。

#### 阶段依赖关系

```
Phase 2.0 (核心)
    ↓
Phase 2.1 (扩展服务，依赖 Phase 2.0)
    ↓
Phase 2.2 (AI 和元数据，依赖 Phase 2.0-2.1)
    ↓
Phase 2.3 (SQL 处理，依赖 Phase 2.0-2.2)
    ↓
Phase 2.4 (SQL 管道，依赖 Phase 2.0-2.3)
    ↓
Phase 3 (编排器，依赖 Phase 2.0-2.4)
    ↓
Phase 4 (统计，依赖 Phase 2.0-3)
```

### 5.7 工厂模式

位于 `lib/di/factories/`:

| 工厂 | 产出 | 特点 |
|------|------|------|
| `prisma.factory.ts` | PrismaClient | 单例，连接池 |
| `redis.factory.ts` | Redis | 单例，自动重连 |
| `deepseek.factory.ts` | DeepseekClient | API 封装 |
| `connection-pool.factory.ts` | ConnectionPool | 多数据源连接池 |

### 5.8 使用方式

**装饰器注入**: 见 `lib/di/` 目录下的服务实现
- 使用 `@injectable()` 声明可注入类
- 使用 `@inject(TOKEN)` 注入依赖

**手动解析**: 见 `lib/di/container.ts`
- 通过 `resolve<T>(token)` 获取服务实例

### 5.9 API 路由中的使用

**辅助函数**: 见 `lib/di/helpers/app-router.ts`
- 提供 `getQueryOrchestrator()` 等快捷方法
- 简化 API 路由中的服务获取

---

## 6. 设计模式

| 模式 | 应用场景 | 示例 |
|------|----------|------|
| 编排器 | 业务流程协调 | QueryOrchestrator |
| 策略 | 多算法选择 | 业务域推断策略 |
| 工厂 | 对象创建 | ConnectionPoolFactory |
| 装饰器 | 功能增强 | CachedMetadataRepository |
| 管道 | 链式处理 | SQLGenerationPipeline |
| 模板方法 | 统一流程 | BaseCollector |

---

## 附录: 关键配置项

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| AI 模型 | DEEPSEEK_MODEL | deepseek-r1:1.5b (本地) |
| 缓存 TTL | QUERY_CACHE_TTL | 默认 3600 秒 |
| 推断置信度 | MIN_CONFIDENCE | 默认 0.7 |

完整配置见 `.env.example`。
