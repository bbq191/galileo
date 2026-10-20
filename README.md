# Galileo

自然语言转 SQL 智能查询系统。基于 Next.js 14 全栈架构，集成 Deepseek AI 引擎，将用户的自然语言问题转换为精确的 SQL 查询并执行。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) + React 18 + TypeScript 5 |
| 样式 | Tailwind CSS 3 + DaisyUI 5 |
| 状态管理 | Redux 5 |
| ORM | Prisma 6 + MySQL 8 |
| 缓存 | IORedis + Upstash Redis |
| AI 引擎 | Deepseek (本地 Ollama / 官方 API) |
| 依赖注入 | tsyringe |
| 验证 | Zod 4 |
| 日志 | Pino + pino-roll |
| 可视化 | ReactFlow / @xyflow/react |
| 测试 | Jest 30 + ts-jest |

---

## 模块技术亮点

### SQL 生成管道 (`lib/sql/`)

**6 阶段流水线架构**，每个阶段独立可测试、可替换：

```
Template Matcher -> Prompt Cache -> SQL Cache -> AI Generator -> Quality Enhancer -> Validator
```

- **分级降级策略**: 优先模板匹配（零成本），其次缓存命中，最后才调用 AI，最大化减少 API 开销
- **质量增强**: AI 生成后自动检测并修复 SQL 语法问题（`sql-auto-fixer`）
- **跨库处理**: 支持跨数据源的 SQL 生成（`cross-db-handler`）
- **管道模式**: 各 Stage 遵循统一接口，支持动态编排和短路返回

### 多级缓存系统 (`lib/cache/`)

**L1 / L2 / 语义缓存三层架构**：

| 层级 | 实现 | 特征 |
|------|------|------|
| L1 | 进程内存 | 零网络延迟，单实例有效 |
| L2 | Redis | 分布式共享，多实例一致 |
| 语义层 | 向量相似度 | "上月销售额" 与 "上个月的销售数据" 命中同一缓存 |

- **缓存穿透防护**: 布隆过滤器拦截无效 key，防止击穿数据库（`cache-breakthrough-guard`）
- **缓存预热**: 基于热点分析主动预加载高频数据（`warmup-analyzer`）
- **分级 TTL**: 短期(60s) / 中期(5min) / 长期(30min) / 超长(24h) 四级过期策略
- **语义缓存统计**: 独立的命中率与相似度分布追踪（`semantic-cache-stats`）

### NLP 预处理 (`lib/nlp/`)

**自建轻量级 NLP 管线**，在 AI 调用前完成结构化解析，降低 Prompt 复杂度：

- **意图识别** (`intent-recognizer`): 区分查询、统计、对比、趋势等意图类型
- **实体解析** (`entity-resolver`): 从自然语言中提取表名、字段名、条件值，映射到元数据
- **时间解析** (`time-parser`): 处理 "上个月"、"最近 7 天"、"今年 Q2" 等相对时间表达式
- **查询域推断** (`query-domain-inferencer`): 自动判定查询归属的业务域，缩小元数据检索范围

### 元数据管理 (`lib/metadata/`)

**采集 - 存储 - 推断 - 发现 全生命周期管理**：

- **增量同步**: 按表计算 DDL 的 SHA-256 哈希（已排除随数据写入变化的 `AUTO_INCREMENT`），结构未变化的表只更新行数与注释，跳过字段采集与写入；`fullSync` 可强制全量
- **多策略域推断**: 命名规则(40%) + 向量相似度(30%) + AI 推理(30%) 加权融合，自动判定表归属业务域
- **自动发现**: 基于命名规则和语义分析发现业务域边界（`domain-discoverer`）
- **分表支持**: 同步时按命名与结构哈希自动识别分表组（`shard/`）；查询命中任意分表时展开同组全部分表，Prompt 中只描述一次结构并要求 `UNION ALL` 合并
- **全文搜索**: 基于 MySQL FULLTEXT 索引的元数据语义搜索

### AI 模块 (`lib/ai/`)

**成本控制 + 弹性处理**，贯穿设计始终：

- **规则 + AI 混合标注**: 命名规范字段直接规则标注，AI 仅处理模糊场景（`naming-rules`）
- **智能批处理**: 合并相似请求减少 API 调用次数（`smart-batch-processor`）
- **断点恢复**: 批量标注中断后可从断点继续，不丢失进度（`resume-manager`）
- **优先级队列**: 高优先级查询优先处理，避免低优先级任务阻塞（`priority-processor` + `task-queue`）
- **成本追踪**: 实时追踪 token 消耗和 API 费用，支持按时间段聚合分析（`ai-cost-tracker`）
- **Prompt 缓存**: 相同 Prompt 结果复用，避免重复调用（`prompt-cache-manager`）

### 依赖注入框架 (`lib/di/`)

**4 阶段分层注册 + Orchestrator 编排模式**：

- **分阶段注册**: 基础设施 -> 扩展服务 -> AI/元数据 -> SQL 处理 -> 编排层 -> 统计，严格保证依赖方向单一
- **Token 机制**: 面向接口编程，Service 通过 Token 解耦，支持运行时替换实现
- **Orchestrator 层**: 聚合多个细粒度 Service 对外提供粗粒度 API，降低 API Route 层复杂度
- **工厂模式**: 复杂对象通过 Factory 延迟构造，支持条件化创建（`factories/`）

### 安全与运维

- **分布式限流**: Proxy (proxy.ts, 内存或 Upstash) + API Routes (Redis) 双层防护，按接口差异化配额（查询执行 10/min，元数据同步 5/hour）
- **连接加密**: 数据源密码 AES 加密存储，密钥与数据分离（`encryption`）
- **安全响应头**: X-Frame-Options / X-Content-Type-Options / XSS-Protection / Referrer-Policy 全覆盖
- **审计日志**: 全链路操作记录 + 审计分析（`audit-logger` + `audit-analyzer`）
- **文件系统隔离**: 自定义 Webpack 插件阻止构建过程访问 Windows 系统敏感目录
- **生产构建保护**: 禁用 Source Map，移除 console 输出（保留 error/warn）

### 向量处理 (`lib/vector/`)

- **嵌入生成**: 与 Deepseek 集成的 Embedding 生成器，支持元数据和查询语句的向量化
- **向量搜索**: 基于余弦相似度的向量检索服务，驱动语义缓存和业务域推断

### 统计分析 (`lib/statistics/`)

- **双存储持久化**: Redis (实时) + MySQL (历史) 双写，兼顾查询性能和数据持久
- **聚合分析**: 支持按时间维度、数据源、业务域多维聚合，驱动热点分析和使用趋势

---

## 作者

afu

## 许可证

Private
