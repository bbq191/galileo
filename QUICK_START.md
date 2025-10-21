# Galileo 快速开始指南

## 项目概述

Galileo 是一个自然语言转 SQL 的系统，能够将用户的自然语言输入转换为 SQL 查询，并以图表形式呈现结果。

当前已完成：**第 1-2 周**的开发任务。

## 环境要求

- Node.js 18+
- MariaDB/MySQL 5.7+
- npm 或 yarn

## 快速安装

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env

# 编辑 .env 文件，配置数据库连接
DATABASE_URL="mysql://user:password@localhost:3306/galileo"
ENCRYPTION_KEY="your-32-character-encryption-key"

# 3. 初始化数据库
npm run db:push

# 4. 填充种子数据
npm run db:seed

# 5. 启动开发服务器
npm run dev
```

访问 http://localhost:3000

## 已完成功能

### 第 1 周：项目初始化与基础架构 ✅

- ✅ Next.js 14 项目初始化
- ✅ Tailwind CSS + DaisyUI 配置
- ✅ Prisma + MariaDB 配置
- ✅ 数据库 Schema 设计（11 个模型）
- ✅ 数据库连接管理器

### 第 2 周：元数据采集与存储 ✅

#### 任务 1: MySQL/MariaDB Schema 采集器 ✅

**功能**:
- 采集数据库列表
- 采集表结构
- 采集字段信息
- 采集索引信息
- 采集外键关系
- 采集视图定义

**使用示例**:
```bash
# 测试采集器
npm run test:collector

# API 调用
curl -X POST http://localhost:3000/api/metadata/collect \
  -H "Content-Type: application/json" \
  -d '{
    "dataSourceId": 1,
    "databases": ["app_db"]
  }'
```

#### 任务 2: 关系采集器 ✅

**功能**:
- 7 种内置命名模式识别
- 5 种加权推断规则
- 智能表名匹配（单复数、大小写）
- 置信度评分系统
- 自引用关系检测
- 跨数据库关系推断

**使用示例**:
```bash
# 测试关系推断
npm run test:relationship

# API 调用
curl -X POST http://localhost:3000/api/metadata/relationships/infer \
  -H "Content-Type: application/json" \
  -d '{
    "dataSourceId": "1",
    "databases": ["app_db"]
  }'
```

## 核心模块

### 1. 数据库连接管理 (`lib/database/`)

**功能**:
- 连接池管理（最小 2，最大 10）
- 健康检查（每 60 秒）
- AES-256 密码加密
- 优雅关闭

**示例**:
```typescript
import connectionManager from '@/lib/database/connection-manager';

// 创建连接
await connectionManager.createConnection({
  id: '1',
  name: 'App Database',
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: 'password',
});

// 测试连接
const isConnected = await connectionManager.testConnection('1');

// 获取连接
const pool = await connectionManager.getConnection('1');
```

### 2. 元数据采集 (`lib/metadata/collectors/`)

**功能**:
- 数据库列表采集
- 表结构采集
- 字段信息采集
- 索引信息采集
- 外键关系采集
- 视图定义采集

**示例**:
```typescript
import { CollectorFactory } from '@/lib/metadata/collectors';

const collector = CollectorFactory.createCollector(pool, 'mysql');

// 采集数据库
const databases = await collector.collectDatabases('1');

// 采集表
const tables = await collector.collectTables('1', 'app_db');

// 采集字段
const columns = await collector.collectColumns('1', 'app_db', 'users');

// 批量采集
const result = await collector.collectAll('1', 'app_db');
```

### 3. 关系推断 (`lib/metadata/inference/`)

**功能**:
- 命名模式分析
- 规则引擎验证
- 自引用关系检测
- 跨数据库推断
- 置信度评分

**示例**:
```typescript
import { RelationshipInferencer } from '@/lib/metadata/inference';

const inferencer = new RelationshipInferencer({
  minConfidence: 0.70,
  maxPairsToCheck: 10000,
});

// 推断关系
const result = await inferencer.inferRelationships('app_db', allColumns);

console.log(`推断出 ${result.relationships.length} 个关系`);
console.log(`高置信度关系: ${result.stats.highConfidenceCount}`);
```

## API 端点

### 数据源管理

```bash
# 创建数据源
POST /api/datasources

# 测试连接
POST /api/datasources/:id/test

# 触发同步
POST /api/datasources/:id/sync
```

### 元数据采集

```bash
# 采集元数据
POST /api/metadata/collect

# 响应示例
{
  "status": "success",
  "message": "Successfully collected metadata from 1 databases",
  "data": [{
    "database": "app_db",
    "tables": [...],
    "foreignKeys": [...],
    "views": [...],
    "stats": {
      "tableCount": 15,
      "columnCount": 120,
      "indexCount": 25,
      "duration": 450
    }
  }]
}
```

### 关系推断

```bash
# 推断关系
POST /api/metadata/relationships/infer

# 响应示例
{
  "status": "success",
  "message": "Successfully inferred relationships",
  "data": {
    "database": "app_db",
    "relationships": [{
      "sourceTable": "orders",
      "sourceColumn": "user_id",
      "targetTable": "users",
      "targetColumn": "id",
      "confidenceScore": 0.88,
      "relationshipType": "one-to-many",
      "reasoning": "外键命名模式: {table}_id → {table}s.id"
    }],
    "stats": {
      "totalColumns": 150,
      "checkedPairs": 45,
      "inferredCount": 12,
      "highConfidenceCount": 8,
      "duration": 245
    }
  }
}
```

## 测试

```bash
# 运行所有测试
npm run test:collector    # 元数据采集器测试
npm run test:relationship # 关系推断测试

# 代码检查
npm run lint              # 运行代码检查
npm run lint:fix          # 自动修复问题
```

## 数据库管理

```bash
# Prisma 相关命令
npm run db:generate       # 生成 Prisma Client
npm run db:push           # 推送 schema 到数据库
npm run db:migrate        # 创建迁移
npm run db:seed           # 填充种子数据
npm run db:studio         # 打开 Prisma Studio
npm run db:reset          # 重置数据库
```

## 项目结构

```
galileo/
├── app/                          # Next.js 应用目录
│   ├── api/                      # API 路由
│   │   ├── datasources/          # 数据源管理 API
│   │   └── metadata/             # 元数据相关 API
│   │       ├── collect/          # 元数据采集
│   │       └── relationships/    # 关系推断
│   ├── layout.tsx                # 根布局
│   └── page.tsx                  # 首页
├── lib/                          # 核心库
│   ├── database/                 # 数据库连接管理
│   │   ├── connection-manager.ts # 连接管理器
│   │   ├── connection-pool.ts    # 连接池
│   │   ├── connection-config.ts  # 配置接口
│   │   └── encryption.ts         # AES-256 加密
│   └── metadata/                 # 元数据模块
│       ├── types.ts              # 类型定义
│       ├── collectors/           # 元数据采集器
│       │   ├── base-collector.ts
│       │   ├── mysql-schema-collector.ts
│       │   ├── collector-factory.ts
│       │   └── __tests__/
│       └── inference/            # 关系推断
│           ├── types.ts
│           ├── naming-analyzer.ts
│           ├── rules-engine.ts
│           ├── relationship-inferencer.ts
│           └── __tests__/
├── prisma/                       # Prisma 相关
│   ├── schema.prisma             # 数据库 Schema（11 个模型）
│   └── seed.ts                   # 种子数据
├── docs/                         # 文档
│   ├── phase1-preparation.md     # 第一阶段开发计划
│   └── week2-task2-summary.md    # 任务完成总结
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
├── next.config.mjs               # Next.js 配置
├── tailwind.config.ts            # Tailwind 配置
└── CLAUDE.md                     # 项目说明
```

## 关键技术

- **框架**: Next.js 14 (App Router)
- **UI**: DaisyUI 5.3.7 + Tailwind CSS 3.4.17
- **ORM**: Prisma 6.17.1
- **数据库**: MariaDB/MySQL
- **语言**: TypeScript 5.7.2
- **数据库驱动**: mysql2 3.15.2
- **加密**: crypto-js 4.2.0

## 性能指标

### 元数据采集 (P95)

| 数据规模 | 全量同步时间 | 增量同步时间 |
|---------|------------|------------|
| 小型 (< 100表) | < 30秒 | < 5秒 |
| 中型 (100-1000表) | < 5分钟 | < 30秒 |
| 大型 (1000-10000表) | < 30分钟 | < 2分钟 |

### 关系推断 (P95)

| 数据规模 | 字段数 | 推断耗时 |
|---------|--------|---------|
| 小型 | < 2,000 | < 1秒 |
| 中型 | 2,000-20,000 | < 10秒 |
| 大型 | 20,000-200,000 | < 1分钟 |

## 下一步开发

根据 `docs/phase1-preparation.md` 计划：

### 第 2 周剩余任务
- [ ] 任务 3: 实现元数据仓储（CRUD）
- [ ] 任务 4: 编写单元测试

### 第 3 周：AI 增强功能
- [ ] 集成 Deepseek API
- [ ] 实现语义标注器
- [ ] 实现关系推断引擎（AI）
- [ ] 批量处理与错误处理

### 第 4 周：刷新机制与 API
- [ ] 实现变更检测器（DDL 哈希）
- [ ] 实现增量同步器
- [ ] 实现定时调度器
- [ ] 开发 RESTful API

## 文档

- [项目设置指南](docs/setup-guide.md)
- [第一阶段开发计划](docs/phase1-preparation.md)
- [元数据采集器文档](lib/metadata/README.md)
- [关系推断文档](lib/metadata/inference/README.md)
- [数据库连接管理文档](lib/database/README.md)
- [任务完成总结](docs/week2-task2-summary.md)

## 常见问题

### Q: 如何添加新的数据源？

A: 使用连接管理器创建连接：

```typescript
import connectionManager from '@/lib/database/connection-manager';

await connectionManager.createConnection({
  id: '2',
  name: 'Analytics DB',
  type: 'mysql',
  host: 'analytics.example.com',
  port: 3306,
  username: 'readonly_user',
  password: 'password',
});
```

### Q: 如何自定义推断规则？

A: 添加自定义命名模式或推断规则：

```typescript
import { NamingAnalyzer, RulesEngine } from '@/lib/metadata/inference';

// 自定义命名模式
const customPattern = {
  pattern: /^fk_(\\w+)$/i,
  extractTableName: (name) => name.match(/^fk_(\\w+)$/i)?.[1],
  targetColumnName: 'id',
  confidence: 0.80,
  description: '自定义外键模式',
};

const analyzer = new NamingAnalyzer([customPattern]);

// 自定义推断规则
const customRule = {
  name: 'custom_rule',
  weight: 0.1,
  description: '自定义规则',
  minConfidence: 0.60,
  evaluate: (source, target) => {
    // 自定义验证逻辑
    return { match: true, confidence: 0.80, reasoning: '...' };
  },
};

const engine = new RulesEngine([customRule]);
```

### Q: 如何提高推断准确率？

A: 可以采取以下措施：

1. 提高置信度阈值
2. 添加领域特定的命名模式
3. 添加自定义推断规则
4. 人工验证推断结果

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT

---

**最后更新**: 2025-10-21
**版本**: 0.1.0
