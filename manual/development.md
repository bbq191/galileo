# 开发指南

> 作者: xusy
> 版本: 1.1
> 最后更新: 2025-11-26

---

## 目录

1. [环境配置](#1-环境配置)
2. [项目启动](#2-项目启动)
3. [开发规范](#3-开发规范)
4. [调试技巧](#4-调试技巧)
5. [测试](#5-测试)

---

## 1. 环境配置

### 1.1 前置依赖

| 依赖 | 版本要求 | 用途 |
|------|----------|------|
| Node.js | >= 18.x | 运行时 |
| pnpm/npm | 最新 | 包管理 |
| MySQL | 8.0+ | 元数据存储 |
| Redis | 6.0+ | 缓存 |
| Ollama | 可选 | 本地 AI 模型 |

### 1.2 环境变量

复制 `.env.example` 为 `.env`，配置以下关键项：

**数据库配置**
```
DATABASE_URL=mysql://user:pass@localhost:3306/galileo
DATABASE_ENCRYPTION_KEY=<32字符密钥>
```

**Redis 配置**
```
REDIS_HOST=localhost
REDIS_PORT=6379
```

**AI 配置**
```
# 本地 Ollama
DEEPSEEK_API_URL=http://localhost:11434
DEEPSEEK_MODEL=deepseek-r1:1.5b

# 或官方 API
DEEPSEEK_API_KEY=<your-key>
DEEPSEEK_API_URL=https://api.deepseek.com
```

### 1.3 数据库初始化

```bash
npx prisma generate
npx prisma db push
```

数据模型定义见 `prisma/schema.prisma`。

---

## 2. 项目启动

### 2.1 安装依赖

```bash
npm install
```

### 2.2 开发模式

```bash
npm run dev
```

访问 http://localhost:3000

### 2.3 生产构建

```bash
npm run build
npm start
```

---

## 3. 开发规范

### 3.1 代码规范

**必须遵守**
- 单一职责原则：每个方法只做一件事
- TypeScript 严格模式：`npx tsc --noEmit` 必须通过
- ESLint 检查：`npm run lint --fix` 必须通过

**文件组织**
- API 路由：`app/api/<功能>/route.ts`
- 业务逻辑：`lib/<模块>/`
- 类型定义：`lib/types/`

### 3.2 新增 API

1. 在 `app/api/` 下创建路由文件
2. 使用 Zod 定义请求/响应 Schema
3. 通过 DI 容器获取服务
4. 调用对应编排器处理业务

示例结构见 `app/api/query/execute/route.ts`。

### 3.3 新增服务

**遵循单一职责原则**，每个服务类只负责一个明确的功能。

**步骤：**
1. 在 `lib/` 下创建服务类，遵循命名规范（如 `xxx.service.ts`）
2. 在 `lib/di/tokens.ts` 添加对应的 DI Token
3. 在 `lib/di/setup.ts` 的适当阶段注册服务
4. 使用 `@injectable()` 装饰类，使用 `@inject(TOKEN)` 注入依赖

**DI 注册的 4 个阶段**：

见 `lib/di/setup.ts` 第 1-500 行。

| 阶段 | 何时注册 | 示例 |
|------|---------|------|
| Phase 2.0 | 核心基础设施 | RedisClient, DatabaseService |
| Phase 2.1 | 扩展服务（依赖 2.0） | ConnectionPool, MultiLevelCache |
| Phase 2.2 | AI 和元数据（依赖 2.0-2.1） | DeepseekClient, MetadataRepository |
| Phase 2.3 | SQL 处理（依赖 2.0-2.2） | SQLGenerator, QueryExecutor |
| Phase 2.4 | SQL 管道（依赖 2.0-2.3） | SQLGenerationPipeline |
| Phase 3 | 编排器（依赖 2.0-2.4） | QueryOrchestrator |
| Phase 4 | 统计服务（依赖 2.0-3） | StatisticsAggregationService |

**聚合编排器模式**：

如果需要协调多个相关服务，考虑创建编排器并委托给子服务：
- 编排器：提供统一入口
- 子服务：各自遵循单一职责

参考实现：
- `lib/di/orchestrators/datasource.orchestrator.ts` + 4 个子服务
- `lib/di/orchestrators/relationship.orchestrator.ts` + 4 个子服务

### 3.4 数据模型变更

1. 修改 `prisma/schema.prisma`
2. 执行 `npx prisma generate`
3. 执行 `npx prisma db push` (开发) 或 `npx prisma migrate` (生产)

---

## 4. 调试技巧

### 4.1 日志查看

- 查询审计：`query_audit_logs` 表
- 错误日志：`error_logs` 表
- AI 成本：`/api/ai/cost` 接口

### 4.2 缓存调试

- 查看统计：`/api/cache/stats`
- 清除缓存：`/api/cache/clear`

### 4.3 AI 诊断

- 诊断信息：`/api/ai/diagnostic`
- Prompt 缓存状态：`/api/ai/prompt-cache`

### 4.4 常见问题

**DI 注入失败**
- 检查 Token 是否在 `tokens.ts` 定义
- 检查服务是否在 `setup.ts` 注册
- 确认依赖顺序正确

**AI 调用超时**
- 检查 Ollama 是否运行
- 调整 `DEEPSEEK_TIMEOUT` 配置

---

## 5. 测试

### 5.1 类型检查

```bash
npx tsc --noEmit
```

### 5.2 代码检查

```bash
npm run lint --fix
```

### 5.3 API 测试

使用 Postman 或 curl 测试，核心接口：

| 接口 | 方法 | 用途 |
|------|------|------|
| /api/health | GET | 健康检查 |
| /api/query/execute | POST | 执行查询 |
| /api/datasources | GET | 数据源列表 |

---

## 附录: 常用命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | 开发模式 |
| `npm run build` | 生产构建 |
| `npx tsc --noEmit` | 类型检查 |
| `npm run lint --fix` | 代码检查 |
| `npx prisma studio` | 数据库管理 UI |
| `npx prisma generate` | 生成 Prisma Client |
