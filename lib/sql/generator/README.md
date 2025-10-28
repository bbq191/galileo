# SQL 生成模块

## 概述

SQL 生成模块是 Galileo 系统的核心组件，负责根据用户意图和元数据上下文生成精确的 SQL 查询语句。

## 功能特性

- ✅ 基于 AI 的智能 SQL 生成
- ✅ 支持复杂的跨表 JOIN 查询
- ✅ 支持跨数据库查询
- ✅ 自动 SQL 格式化和验证
- ✅ 聚合查询支持（SUM, COUNT, AVG, MAX, MIN）
- ✅ 时间范围查询优化
- ✅ 错误重试机制
- ✅ 安全性检查（仅允许 SELECT 查询）

## 使用示例

### 基本用法

```typescript
import { SQLGenerator } from '@/lib/sql/generator';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

// 创建 SQL 生成器实例
const generator = new SQLGenerator();

// 定义用户意图
const intent: QueryIntent = {
  type: 'select',
  entities: {
    tables: ['users']
  },
  conditions: {
    limit: 10
  }
};

// 定义元数据上下文
const context: MetadataContext = {
  tables: [{
    id: 1,
    databaseName: 'test_db',
    tableName: 'users',
    tableComment: '用户表',
    semanticDescription: '存储用户信息',
    columns: [
      {
        id: 1,
        columnName: 'id',
        dataType: 'INT',
        isPrimaryKey: true,
        isNullable: false
      },
      {
        id: 2,
        columnName: 'name',
        dataType: 'VARCHAR',
        isPrimaryKey: false,
        isNullable: false
      }
    ],
    primaryKeys: ['id'],
    indexes: []
  }],
  relationships: [],
  columns: [],
  estimatedComplexity: 'low'
};

// 生成 SQL
const result = await generator.generate(intent, context);

console.log('生成的 SQL:', result.sql);
console.log('说明:', result.explanation);
console.log('置信度:', result.confidence);
```

### 聚合查询示例

```typescript
const intent: QueryIntent = {
  type: 'aggregate',
  entities: {
    tables: ['orders']
  },
  aggregations: {
    function: 'SUM',
    column: 'amount',
    groupBy: ['product_id']
  },
  conditions: {
    timeRange: {
      relative: '最近一个月'
    },
    orderBy: {
      column: 'total',
      direction: 'DESC'
    },
    limit: 10
  }
};

const result = await generator.generate(intent, context);
// 生成类似: SELECT product_id, SUM(amount) as total
//          FROM orders
//          WHERE order_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
//          GROUP BY product_id
//          ORDER BY total DESC
//          LIMIT 10
```

### 跨库查询示例

```typescript
const intent: QueryIntent = {
  type: 'select',
  entities: {
    tables: ['orders', 'products']
  },
  joins: {
    type: 'inner',
    tables: ['orders', 'products']
  }
};

const context: MetadataContext = {
  tables: [
    {
      id: 1,
      databaseName: 'sales_db',
      tableName: 'orders',
      // ...
    },
    {
      id: 2,
      databaseName: 'product_db',
      tableName: 'products',
      // ...
    }
  ],
  relationships: [
    {
      sourceTable: 'orders',
      sourceColumn: 'product_id',
      targetTable: 'products',
      targetColumn: 'id',
      type: 'explicit'
    }
  ],
  // ...
};

const result = await generator.generate(intent, context);
// 生成类似: SELECT o.*, p.product_name
//          FROM `sales_db`.`orders` o
//          INNER JOIN `product_db`.`products` p
//          ON o.product_id = p.id
```

## API 文档

### SQLGenerator

#### 构造函数

```typescript
constructor()
```

创建一个新的 SQL 生成器实例。

#### generate()

```typescript
async generate(
  intent: QueryIntent,
  context: MetadataContext,
  options?: SQLGenerationOptions
): Promise<SQLGenerationResult>
```

根据用户意图和元数据上下文生成 SQL 查询。

**参数：**

- `intent`: 用户查询意图
- `context`: 元数据上下文
- `options`: 生成选项（可选）
  - `verbose`: 是否启用详细模式
  - `maxRetries`: 最大重试次数（默认 2）
  - `timeout`: 超时时间（默认 30000ms）
  - `enableOptimization`: 是否启用查询优化建议

**返回值：**

返回 `SQLGenerationResult` 对象，包含：

- `sql`: 生成的 SQL 语句
- `explanation`: SQL 解释说明
- `confidence`: 置信度（0-1）
- `usedTables`: 使用的表列表
- `usedColumns`: 使用的字段列表
- `estimatedRows`: 预估返回行数
- `warnings`: 警告信息数组

## 核心功能说明

### 1. AI 驱动的 SQL 生成

使用 Deepseek AI 模型理解用户意图，结合元数据上下文生成精确的 SQL 查询。

### 2. 智能 Prompt 构建

根据查询类型（简单查询、聚合查询、跨库查询等）构建不同的 Prompt，确保 AI 生成高质量的 SQL。

### 3. SQL 格式化

使用 `node-sql-parser` 自动格式化生成的 SQL，确保代码可读性和一致性。

### 4. 安全验证

- 只允许 SELECT 查询
- 拒绝 DELETE, UPDATE, DROP 等危险操作
- 验证 SQL 语法正确性

### 5. 错误重试机制

当 SQL 生成失败时，自动重试最多 2 次，提高成功率。

## Prompt 模板

模块包含多个专业的 Prompt 模板：

- `SQL_GENERATION_SYSTEM_PROMPT`: 基础系统 Prompt
- `CROSS_DATABASE_PROMPT_ADDITION`: 跨库查询增强 Prompt
- `AGGREGATION_QUERY_PROMPT_ADDITION`: 聚合查询增强 Prompt
- `TIME_RANGE_QUERY_PROMPT_ADDITION`: 时间范围查询增强 Prompt
- `COMPLEX_JOIN_PROMPT_ADDITION`: 复杂 JOIN 查询增强 Prompt

## 测试

运行单元测试：

```bash
npm test lib/sql/generator/__tests__/sql-generator.test.ts
```

## 性能优化建议

### 1. 元数据上下文优化

- 只传递相关的表和字段，避免上下文过大
- 使用语义搜索筛选最相关的元数据
- 限制示例数据的数量（最多 3-5 个）

### 2. 缓存策略

- 缓存相同意图的 SQL 生成结果
- 设置合理的 TTL（建议 1 小时）

### 3. 超时控制

- 设置合理的超时时间（默认 30 秒）
- 对于复杂查询，可以适当增加超时时间

## 最佳实践

### 1. 提供丰富的元数据

```typescript
// 好的做法：提供完整的语义描述和示例值
{
  columnName: 'created_at',
  dataType: 'DATETIME',
  columnComment: '创建时间',
  semanticDescription: '记录创建的时间戳',
  sampleValues: ['2025-01-01 10:00:00', '2025-01-02 11:30:00']
}

// 不好的做法：缺少描述信息
{
  columnName: 'created_at',
  dataType: 'DATETIME'
}
```

### 2. 明确表关系

```typescript
// 好的做法：提供显式的表关系
relationships: [
  {
    sourceTable: 'orders',
    sourceColumn: 'user_id',
    targetTable: 'users',
    targetColumn: 'id',
    type: 'explicit',
    confidence: 1.0
  }
]
```

### 3. 处理生成结果

```typescript
const result = await generator.generate(intent, context);

// 检查置信度
if (result.confidence < 0.7) {
  console.warn('SQL 生成置信度较低，建议人工审核');
}

// 检查警告
if (result.warnings && result.warnings.length > 0) {
  console.warn('警告:', result.warnings);
}

// 使用生成的 SQL
const sql = result.sql;
```

## 故障排查

### SQL 生成失败

**问题：** `SQL 生成失败（已重试 2 次）`

**解决方案：**
1. 检查 AI 服务是否可用
2. 验证元数据上下文是否完整
3. 检查网络连接
4. 增加超时时间

### SQL 验证失败

**问题：** `SQL 结构验证失败`

**解决方案：**
1. 检查生成的 SQL 语法
2. 验证表名和字段名是否正确
3. 查看详细错误信息

### 置信度过低

**问题：** 生成的 SQL 置信度低于 0.7

**解决方案：**
1. 提供更详细的元数据描述
2. 增加示例数据
3. 明确表关系
4. 优化用户意图描述

## 复杂查询分解（Multi-Step SQL Generator）

### 概述

对于高复杂度的查询（涉及多表跨库 JOIN），`MultiStepSQLGenerator` 会自动将查询分解为多个步骤，使用 CTE（Common Table Expression）来提高可读性和性能。

### 使用方法

```typescript
import { MultiStepSQLGenerator } from '@/lib/sql/generator';

const generator = new MultiStepSQLGenerator();

const intent: QueryIntent = {
  type: 'aggregate',
  entities: {
    tables: ['sales_db.orders', 'product_db.products', 'category_db.categories'],
    columns: ['product_name', 'category_name', 'total_amount']
  },
  conditions: {
    timeRange: { relative: 'last_30_days' },
    orderBy: { column: 'total_amount', direction: 'DESC' },
    limit: 10
  },
  aggregations: {
    function: 'SUM',
    column: 'amount',
    groupBy: ['product_name', 'category_name']
  }
};

const context: MetadataContext = {
  tables: [/* 多个表的元数据 */],
  relationships: [/* 跨库关系 */],
  estimatedComplexity: 'high'  // 高复杂度
};

const result = await generator.generateComplex(intent, context);
```

### 生成结果示例

```sql
WITH step1 AS (
  -- 步骤1: 过滤订单数据
  SELECT order_id, product_id, amount, order_date
  FROM `sales_db`.`orders`
  WHERE order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
),
step2 AS (
  -- 步骤2: 关联产品信息（跨库JOIN）
  SELECT o.product_id, p.product_name, p.category_id, o.amount
  FROM step1 o
  INNER JOIN `product_db`.`products` p ON o.product_id = p.id
),
step3 AS (
  -- 步骤3: 关联分类信息（跨库JOIN）
  SELECT p.product_name, c.category_name, p.amount
  FROM step2 p
  INNER JOIN `category_db`.`categories` c ON p.category_id = c.id
),
step4 AS (
  -- 步骤4: 聚合统计
  SELECT product_name, category_name, SUM(amount) as total_amount
  FROM step3
  GROUP BY product_name, category_name
  ORDER BY total_amount DESC
  LIMIT 10
)
SELECT * FROM step4
```

### 分解原理

1. **自动复杂度检测**：根据 `estimatedComplexity` 判断是否需要分解
   - Low/Medium: 使用简单生成器
   - High: 使用多步分解

2. **AI 驱动的步骤分解**：使用 AI 分析查询意图，自动分解为逻辑步骤
   - 优先在同一数据库内进行过滤
   - 跨库 JOIN 尽量后置
   - 每个步骤独立可执行

3. **CTE 合并**：将所有步骤合并为一个完整的 WITH 查询

### 性能优势

相比直接生成复杂的多表 JOIN：

✅ **更好的可读性**：每个步骤清晰明了
✅ **优化的执行计划**：先过滤再关联，减少数据量
✅ **降低跨库开销**：最小化跨库数据传输
✅ **易于调试**：可以单独测试每个步骤

### API

#### MultiStepSQLGenerator.generateComplex()

```typescript
async generateComplex(
  intent: QueryIntent,
  context: MetadataContext,
  options?: SQLGenerationOptions
): Promise<SQLGenerationResult>
```

**智能决策：**
- 自动判断是否需要多步分解
- Low/Medium 复杂度：自动使用简单生成器
- High 复杂度：使用多步分解

### 测试

运行多步生成器测试：

```bash
npm run test:multi-step-generator
```

测试覆盖：
- ✅ 跨库 JOIN 计数
- ✅ 步骤分解逻辑
- ✅ CTE 合并
- ✅ 单步优化
- ✅ 错误处理

### 配置选项

```typescript
interface QueryStep {
  stepName: string;           // 步骤名称
  description: string;        // 步骤说明
  tables: string[];          // 涉及的表
  outputColumns: string[];   // 输出的列
  stepType?: 'filter' | 'join' | 'aggregate' | 'sort' | 'limit';
}
```

## 相关模块

- [意图识别模块](../../nlp/intent-recognizer/README.md)
- [元数据检索模块](../../metadata/retrieval/README.md)
- [SQL 验证模块](../validator/README.md)
- [查询执行模块](../executor/README.md)

## 许可证

MIT
