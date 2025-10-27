# 自然语言处理模块 (NLP Module)

## 概述

本模块负责识别用户的自然语言查询意图，是 SQL 生成流程的第一步。

## 核心功能

- **意图识别**：识别查询类型（SELECT/聚合/统计/对比）
- **实体提取**：提取表名、字段名、数据库名
- **条件解析**：提取时间范围、过滤条件、排序、限制
- **实体消歧**：处理多义性实体
- **关系推断**：推断表之间的关联关系

## 模块结构

```
lib/nlp/
├── types.ts                    # 类型定义
├── intent-recognizer.ts        # 意图识别器（核心）
├── entity-resolver.ts          # 实体解析器
├── time-parser.ts              # 时间表达式解析器
├── prompts/
│   ├── intent-prompts.ts       # 意图识别 Prompt
│   └── entity-prompts.ts       # 实体提取 Prompt
├── __tests__/
│   ├── intent-recognizer.test.ts
│   └── time-parser.test.ts
├── index.ts                    # 统一导出
└── README.md                   # 本文档
```

## 使用示例

### 基本使用

```typescript
import { IntentRecognizer } from '@/lib/nlp';

// 创建识别器实例
const recognizer = new IntentRecognizer();

// 识别用户意图
const intent = await recognizer.recognize('查询最近一个月销售额TOP10的产品');

console.log(intent);
// 输出：
// {
//   type: 'aggregate',
//   entities: {
//     tables: ['orders', 'products'],
//     columns: ['product_name', 'amount']
//   },
//   conditions: {
//     timeRange: {
//       start: Date,
//       end: Date,
//       relative: '最近一个月',
//       normalized: 'last_1_months'
//     },
//     orderBy: { column: 'amount', direction: 'DESC' },
//     limit: 10
//   },
//   aggregations: {
//     function: 'SUM',
//     column: 'amount',
//     groupBy: ['product_name']
//   },
//   joins: { type: 'inner', tables: [...] },
//   confidence: 0.9,
//   ambiguities: []
// }

// 清理资源
await recognizer.cleanup();
```

### 单独使用时间解析器

```typescript
import { TimeParser } from '@/lib/nlp';

const parser = new TimeParser();

// 解析相对时间
const result1 = parser.parse('最近7天');
console.log(result1);
// {
//   start: Date,
//   end: Date,
//   relative: '最近7天',
//   normalized: 'last_7_days'
// }

// 解析具体日期范围
const result2 = parser.parse('2025-01-01至2025-01-31');
console.log(result2);
// {
//   start: Date,
//   end: Date,
//   relative: '2025-01-01 至 2025-01-31',
//   normalized: 'custom_range'
// }
```

### 单独使用实体解析器

```typescript
import { EntityResolver } from '@/lib/nlp';

const resolver = new EntityResolver();

// 搜索表
const tableMatches = await resolver.searchTables('用户', 10);
console.log(tableMatches);
// [
//   { hint: '用户', matched: {...}, score: 0.95, type: 'fuzzy' },
//   ...
// ]

// 搜索字段
const columnMatches = await resolver.searchColumns('订单号', undefined, 10);
console.log(columnMatches);

// 选择最佳匹配
const bestMatch = resolver.selectBestMatch(tableMatches);

await resolver.disconnect();
```

## 支持的查询类型

### 1. SELECT 查询（明细查询）

```
查询用户表的所有数据
查询订单信息
获取产品列表
```

### 2. AGGREGATE 查询（聚合查询）

```
查询最近一个月销售额TOP10的产品
统计每个分类的订单数量
计算用户的平均年龄
```

### 3. STATISTICS 查询（统计分析）

```
统计近7天的订单趋势
分析各地区的销售分布
查看用户增长情况
```

### 4. COMPARISON 查询（对比分析）

```
对比今年和去年的销售额
比较不同分类的产品销量
```

## 支持的时间表达式

### 相对时间

- `最近N天` / `过去N天` / `近N天`
- `最近N周` / `过去N周`
- `最近N个月` / `过去N个月`
- `最近N年` / `过去N年`

### 具体时间单位

- `今天` / `今日`
- `昨天` / `昨日`
- `本周` / `这周`
- `上周` / `上星期`
- `本月` / `这个月`
- `上月` / `上个月`
- `今年` / `本年`
- `去年` / `上年`

### 日期范围

- `2025-01-01至2025-01-31`
- `2025/1/1到2025/1/31`

## 配置选项

### 自定义 AI 客户端

```typescript
import { IntentRecognizer } from '@/lib/nlp';
import { createDeepseekClient } from '@/lib/ai/deepseek-client';

const customClient = createDeepseekClient({
  apiUrl: 'http://localhost:11434',
  model: 'deepseek-r1:1.5b',
  timeout: 60000,
});

const recognizer = new IntentRecognizer(customClient);
```

## 测试

### 运行单元测试

```bash
npm test lib/nlp/__tests__/time-parser.test.ts
npm test lib/nlp/__tests__/intent-recognizer.test.ts
```

### 运行手动测试脚本

```bash
npx tsx scripts/test-intent-recognizer.ts
```

## 性能指标

| 查询复杂度 | P95 响应时间 | 准确率目标 |
|----------|------------|----------|
| 简单查询 | < 200ms    | > 95%    |
| 中等查询 | < 500ms    | > 90%    |
| 复杂查询 | < 1000ms   | > 85%    |

## 错误处理

模块会抛出以下错误：

- **意图识别失败**：AI 返回格式不正确或无法解析
- **无法识别查询涉及的表**：缺少必要的实体信息
- **实体消歧失败**：无法确定唯一的实体匹配

示例：

```typescript
try {
  const intent = await recognizer.recognize(query);
} catch (error) {
  if (error.message.includes('无法识别查询涉及的表')) {
    // 处理缺少表信息的情况
  }
}
```

## 注意事项

1. **资源清理**：使用完毕后务必调用 `recognizer.cleanup()` 清理数据库连接
2. **实体歧义**：当存在多个匹配时，会选择分数最高的，并在 `ambiguities` 中记录警告
3. **时间解析**：无法解析的时间表达式会保留原始文本，不会抛出错误
4. **AI 依赖**：需要确保 Deepseek 服务可用，否则会失败

## 下一步

本模块的输出（QueryIntent）将传递给下一阶段：

- **元数据检索模块**：基于意图检索相关的表和字段元数据
- **SQL 生成模块**：根据意图和元数据生成 SQL 查询

## 维护者

- 开发时间：第 7 周
- 版本：v1.0.0
