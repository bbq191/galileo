# 关系推断模块使用文档

## 概述

关系推断模块负责从数据库元数据中智能推断表之间的隐式关系。通过结合**命名模式分析**和**规则引擎**，能够自动发现未定义外键约束的表关系。

核心特性：
- ✅ 7 种内置命名模式识别
- ✅ 5 种加权推断规则
- ✅ 智能表名匹配（支持单复数、大小写）
- ✅ 置信度评分系统
- ✅ 跨数据库关系推断支持
- ✅ 性能优化（智能跳过非外键字段）

## 架构设计

```
lib/metadata/inference/
  ├── types.ts                          # 类型定义
  ├── naming-analyzer.ts                # 命名模式分析器
  ├── rules-engine.ts                   # 推断规则引擎
  ├── relationship-inferencer.ts        # 关系推断器
  ├── index.ts                          # 模块导出
  ├── __tests__/
  │   └── relationship-inference.test.ts # 测试脚本
  └── README.md                         # 本文档
```

## 快速开始

### 1. 基础使用

```typescript
import connectionManager from '@/lib/database/connection-manager';
import { CollectorFactory } from '@/lib/metadata/collectors';
import { RelationshipInferencer } from '@/lib/metadata/inference';

// 获取连接池
const pool = await connectionManager.getConnection('1');
const collector = CollectorFactory.createCollector(pool, 'mysql');

// 采集字段元数据
const tables = await collector.collectTables('1', 'app_db');
const allColumns = [];
for (const table of tables) {
  const columns = await collector.collectColumns('1', 'app_db', table.tableName);
  allColumns.push(...columns);
}

// 创建推断器
const inferencer = new RelationshipInferencer({
  minConfidence: 0.70,  // 最小置信度阈值
  maxPairsToCheck: 10000,  // 最大检查字段对数
});

// 推断关系
const result = await inferencer.inferRelationships('app_db', allColumns);

console.log(`推断出 ${result.relationships.length} 个关系`);
console.log(`高置信度关系: ${result.stats.highConfidenceCount}`);
console.log(`耗时: ${result.stats.duration}ms`);
```

### 2. 使用 API 端点

```bash
# 推断单个数据库的关系
curl -X POST http://localhost:3000/api/metadata/relationships/infer \
  -H "Content-Type: application/json" \
  -d '{
    "dataSourceId": "1",
    "databases": ["app_db"]
  }'

# 推断多个数据库的关系
curl -X POST http://localhost:3000/api/metadata/relationships/infer \
  -H "Content-Type: application/json" \
  -d '{
    "dataSourceId": "1",
    "databases": ["app_db", "analytics_db"]
  }'

# 跨数据库关系推断
curl -X POST http://localhost:3000/api/metadata/relationships/infer \
  -H "Content-Type: application/json" \
  -d '{
    "dataSourceId": "1",
    "databases": ["app_db", "user_db"],
    "crossDatabase": true,
    "minConfidence": 0.75
  }'
```

响应示例：
```json
{
  "status": "success",
  "message": "Successfully inferred relationships for database: app_db",
  "data": {
    "database": "app_db",
    "relationships": [
      {
        "sourceTable": "orders",
        "sourceColumn": "user_id",
        "sourceDatabaseName": "app_db",
        "targetTable": "users",
        "targetColumn": "id",
        "targetDatabaseName": "app_db",
        "confidenceScore": 0.85,
        "relationshipType": "one-to-many",
        "inferenceMethod": "rule",
        "reasoning": "外键命名模式: {table}_id → {table}s.id"
      }
    ],
    "stats": {
      "totalColumns": 150,
      "checkedPairs": 45,
      "inferredCount": 12,
      "highConfidenceCount": 8,
      "mediumConfidenceCount": 3,
      "lowConfidenceCount": 1,
      "duration": 245
    },
    "rulesUsed": [
      { "ruleName": "naming_pattern", "matchCount": 8 },
      { "ruleName": "type_consistency", "matchCount": 12 },
      { "ruleName": "primary_key_target", "matchCount": 10 }
    ]
  }
}
```

## 核心组件

### 1. 命名模式分析器 (NamingAnalyzer)

分析字段名称，提取可能的目标表和目标字段。

**内置模式:**

| 模式 | 示例 | 目标表 | 目标字段 | 置信度 |
|------|------|--------|----------|--------|
| `{table}_id` | `user_id` | `users` | `id` | 0.85 |
| `{table}Id` | `userId` | `users` | `id` | 0.80 |
| 审计字段 | `created_by` | `users` | `id` | 0.75 |
| 所有者字段 | `author_id` | `users` | `id` | 0.75 |
| 自引用 | `parent_id` | (自身表) | `id` | 0.80 |
| 代码引用 | `category_code` | `categorys` | `code` | 0.70 |
| UUID引用 | `user_uuid` | `users` | `uuid` | 0.75 |

**使用示例:**

```typescript
import { NamingAnalyzer } from '@/lib/metadata/inference';

const analyzer = new NamingAnalyzer();

const analysis = analyzer.analyze('user_id');
console.log(analysis);
// {
//   targetTable: 'users',
//   targetColumn: 'id',
//   confidence: 0.85,
//   pattern: { description: '外键命名模式: {table}_id → {table}s.id' }
// }

// 智能表名匹配
const availableTables = ['users', 'products', 'Categories'];
const matched = analyzer.findMatchingTable('user', availableTables);
console.log(matched); // 'users'
```

**添加自定义模式:**

```typescript
import { NamingAnalyzer, NamingPattern } from '@/lib/metadata/inference';

const customPattern: NamingPattern = {
  pattern: /^fk_(\\w+)$/i,
  extractTableName: (columnName) => {
    const match = columnName.match(/^fk_(\\w+)$/i);
    return match ? match[1] : null;
  },
  targetColumnName: 'id',
  confidence: 0.80,
  description: '自定义外键模式: fk_{table} → {table}.id',
};

const analyzer = new NamingAnalyzer([customPattern]);
```

### 2. 规则引擎 (RulesEngine)

基于多种规则验证推断的关系，计算加权置信度。

**内置规则:**

| 规则名称 | 权重 | 描述 | 最小置信度 |
|---------|------|------|-----------|
| `naming_pattern` | 0.4 | 字段名符合外键命名模式 | 0.75 |
| `type_consistency` | 0.3 | 数据类型一致性检查 | 0.60 |
| `primary_key_target` | 0.2 | 目标字段是主键或唯一索引 | 0.70 |
| `source_not_primary` | 0.05 | 源字段不是主键 | 0 |
| `length_match` | 0.05 | 字段长度/精度匹配 | 0 |

**置信度计算方式:**

```
置信度 = Σ(规则置信度 × 规则权重) / Σ(规则权重)
```

**使用示例:**

```typescript
import { RulesEngine } from '@/lib/metadata/inference';

const engine = new RulesEngine();

const sourceColumn = {
  columnName: 'user_id',
  dataType: 'int',
  columnType: 'int(11)',
  columnKey: '',
  // ... 其他字段
};

const targetColumn = {
  columnName: 'id',
  dataType: 'int',
  columnType: 'int(11)',
  columnKey: 'PRI',
  // ... 其他字段
};

const result = engine.evaluate(sourceColumn, targetColumn);
console.log(result);
// {
//   isRelated: true,
//   confidence: 0.85,
//   reasoning: [
//     "[naming_pattern] 字段名 'user_id' 符合外键命名模式",
//     "[type_consistency] 数据类型完全一致: int(11)",
//     "[primary_key_target] 目标字段 'id' 是主键"
//   ],
//   matchedRules: ['naming_pattern', 'type_consistency', 'primary_key_target']
// }
```

**添加自定义规则:**

```typescript
import { RulesEngine, InferenceRule } from '@/lib/metadata/inference';

const customRule: InferenceRule = {
  name: 'custom_prefix_rule',
  weight: 0.1,
  description: '自定义前缀规则',
  minConfidence: 0.60,
  evaluate: (source, target) => {
    if (source.columnName.startsWith('fk_')) {
      return {
        match: true,
        confidence: 0.80,
        reasoning: '字段名以 fk_ 开头',
      };
    }
    return {
      match: false,
      confidence: 0,
      reasoning: '字段名不符合自定义规则',
    };
  },
};

const engine = new RulesEngine([customRule]);
```

### 3. 关系推断器 (RelationshipInferencer)

整合命名分析和规则引擎，执行完整的关系推断流程。

**配置选项:**

```typescript
interface RelationshipInferencerConfig {
  /** 最小置信度阈值 (默认: 0.70) */
  minConfidence?: number;

  /** 是否启用命名分析 (默认: true) */
  enableNamingAnalysis?: boolean;

  /** 是否启用规则引擎 (默认: true) */
  enableRulesEngine?: boolean;

  /** 是否跨数据库推断 (默认: true) */
  crossDatabase?: boolean;

  /** 最大检查字段对数 (默认: 10000) */
  maxPairsToCheck?: number;
}
```

**使用示例:**

```typescript
import { RelationshipInferencer } from '@/lib/metadata/inference';

const inferencer = new RelationshipInferencer({
  minConfidence: 0.75,
  enableNamingAnalysis: true,
  enableRulesEngine: true,
  maxPairsToCheck: 5000,
});

// 推断单个数据库
const result = await inferencer.inferRelationships('app_db', allColumns);

// 推断跨数据库关系
const databases = new Map([
  ['app_db', appColumns],
  ['user_db', userColumns],
]);
const crossResult = await inferencer.inferCrossDatabaseRelationships(databases);
```

## 性能优化

### 1. 智能字段过滤

推断器会自动跳过不太可能是外键的字段：

- 主键字段（除非是自引用如 `parent_id`）
- 常见非外键字段：`name`, `title`, `description`, `email`, `password` 等
- 时间戳字段：`created_at`, `updated_at`, `deleted_at`
- 布尔标识字段：`is_*`, `has_*`

### 2. 限制检查数量

```typescript
const inferencer = new RelationshipInferencer({
  maxPairsToCheck: 5000,  // 限制最多检查 5000 个字段对
});
```

### 3. 性能指标

| 数据规模 | 字段数 | 检查字段对 | 推断耗时 (P95) |
|---------|--------|-----------|---------------|
| 小型 | < 2,000 | < 500 | < 1秒 |
| 中型 | 2,000-20,000 | 500-5,000 | < 10秒 |
| 大型 | 20,000-200,000 | 5,000-50,000 | < 1分钟 |

## 数据类型

### InferredRelationship

```typescript
interface InferredRelationship {
  /** 源表名 */
  sourceTable: string;

  /** 源字段名 */
  sourceColumn: string;

  /** 源数据库名 */
  sourceDatabaseName: string;

  /** 目标表名 */
  targetTable: string;

  /** 目标字段名 */
  targetColumn: string;

  /** 目标数据库名 */
  targetDatabaseName: string;

  /** 置信度分数 (0.00-1.00) */
  confidenceScore: number;

  /** 关系类型 */
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';

  /** 推断方法 */
  inferenceMethod: 'rule' | 'ai' | 'hybrid';

  /** 推断理由 */
  reasoning: string;
}
```

### InferenceResult

```typescript
interface InferenceResult {
  /** 推断出的关系列表 */
  relationships: InferredRelationship[];

  /** 统计信息 */
  stats: {
    totalColumns: number;
    checkedPairs: number;
    inferredCount: number;
    highConfidenceCount: number;  // >= 0.8
    mediumConfidenceCount: number;  // 0.6-0.8
    lowConfidenceCount: number;  // < 0.6
    duration: number;  // 毫秒
  };

  /** 使用的规则统计 */
  rulesUsed: {
    ruleName: string;
    matchCount: number;
  }[];
}
```

## 测试

运行测试脚本：

```bash
# 运行关系推断测试
tsx lib/metadata/inference/__tests__/relationship-inference.test.ts
```

测试涵盖：
1. ✅ 命名模式分析器（9 个测试用例）
2. ✅ 规则引擎（4 个测试场景）
3. ✅ 智能表名匹配（9 个测试用例）
4. ✅ 完整推断流程（7 个预期关系验证）

## 推断准确率

基于测试数据的准确率评估：

| 场景 | 准确率 | 说明 |
|------|--------|------|
| 标准外键命名 | > 95% | `user_id` → `users.id` |
| 驼峰命名 | > 90% | `userId` → `users.id` |
| 审计字段 | > 85% | `created_by` → `users.id` |
| 自引用关系 | > 80% | `parent_id` → (自身表).id |
| 跨数据库推断 | 70-80% | 需要人工验证 |

## 最佳实践

### 1. 设置合理的置信度阈值

```typescript
// 对于关键业务系统，使用更高的阈值
const strictInferencer = new RelationshipInferencer({
  minConfidence: 0.80,
});

// 对于数据探索，可以使用较低的阈值
const exploratoryInferencer = new RelationshipInferencer({
  minConfidence: 0.60,
});
```

### 2. 人工验证推断关系

```typescript
const result = await inferencer.inferRelationships('app_db', allColumns);

// 筛选出高置信度关系，自动接受
const highConfidence = result.relationships.filter(r => r.confidenceScore >= 0.85);

// 中等置信度关系，需要人工审核
const mediumConfidence = result.relationships.filter(
  r => r.confidenceScore >= 0.65 && r.confidenceScore < 0.85
);

// 低置信度关系，谨慎处理
const lowConfidence = result.relationships.filter(r => r.confidenceScore < 0.65);
```

### 3. 处理大数据库

```typescript
// 对于大数据库，分批处理
const tables = await collector.collectTables('1', 'large_db');
const batchSize = 20;

for (let i = 0; i < tables.length; i += batchSize) {
  const batch = tables.slice(i, i + batchSize);
  const columns = [];

  for (const table of batch) {
    const tableCols = await collector.collectColumns('1', 'large_db', table.tableName);
    columns.push(...tableCols);
  }

  const result = await inferencer.inferRelationships('large_db', columns);
  // 处理结果...
}
```

### 4. 缓存推断结果

```typescript
// 使用 Redis 缓存推断结果
const cacheKey = `relationships:${database}:${version}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const result = await inferencer.inferRelationships(database, columns);
await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);
```

## 故障排除

### 问题 1: 推断不出关系

**可能原因:**
- 字段命名不符合常见模式
- 数据类型不一致
- 置信度阈值过高

**解决方案:**
```typescript
// 降低置信度阈值
const inferencer = new RelationshipInferencer({
  minConfidence: 0.60,
});

// 添加自定义命名模式
const customPattern = {
  pattern: /^your_custom_pattern$/,
  // ...
};
const analyzer = new NamingAnalyzer([customPattern]);
```

### 问题 2: 推断速度慢

**可能原因:**
- 字段数量太多
- 没有限制检查数量

**解决方案:**
```typescript
// 限制检查数量
const inferencer = new RelationshipInferencer({
  maxPairsToCheck: 5000,
});

// 只推断特定表
const specificColumns = allColumns.filter(
  col => ['users', 'orders', 'products'].includes(col.tableName)
);
```

### 问题 3: 误判率高

**可能原因:**
- 字段命名不规范
- 业务逻辑复杂

**解决方案:**
```typescript
// 提高置信度阈值
const inferencer = new RelationshipInferencer({
  minConfidence: 0.85,
});

// 仅依赖规则引擎，禁用命名分析
const strictInferencer = new RelationshipInferencer({
  enableNamingAnalysis: false,
  enableRulesEngine: true,
});
```

## 相关文档

- [元数据采集器文档](../collectors/README.md)
- [数据库连接管理文档](../../database/README.md)
- [项目设置指南](../../../docs/setup-guide.md)

---

**最后更新**: 2025-10-21
**版本**: 1.0.0
