# 向量搜索模块

## 概述

向量搜索模块为 Galileo 项目提供语义搜索能力，通过向量化技术实现对数据库元数据（表、字段）的智能检索。

## 核心功能

- **向量嵌入生成**：将文本转换为数值向量表示
- **向量存储与索引**：高效存储和管理向量数据
- **相似度搜索**：基于向量相似度进行语义搜索
- **多种相似度度量**：支持余弦相似度、欧氏距离、点积
- **元数据过滤**：支持基于元数据的过滤查询
- **持久化支持**：可选 Redis 持久化

## 架构设计

```
┌─────────────────────────────────────────┐
│         VectorSearchService             │
│   (统一的向量搜索服务接口)               │
└─────────────────┬───────────────────────┘
                  │
         ┌────────┴─────────┐
         │                  │
┌────────▼────────┐  ┌─────▼──────────┐
│  VectorStore    │  │ EmbeddingGen   │
│  (向量存储)     │  │ (向量生成器)   │
└─────────────────┘  └────────────────┘
         │
         ▼
  ┌──────────────┐
  │    Redis     │
  │  (可选持久化) │
  └──────────────┘
```

## 使用示例

### 1. 基本使用

```typescript
import { VectorSearchService } from '@/lib/vector';

// 创建服务实例
const vectorSearch = new VectorSearchService({
  enableRedis: false, // 是否启用 Redis
  dimension: 384,     // 向量维度
});

// 初始化服务（会自动建立索引）
await vectorSearch.initialize();

// 搜索表
const results = await vectorSearch.searchTables('用户信息', {
  limit: 10,          // 返回数量
  threshold: 0.5,     // 相似度阈值
});

console.log(results);
// [
//   {
//     item: { id: 1, tableName: 'users', ... },
//     score: 0.85,
//     metadata: { ... }
//   },
//   ...
// ]
```

### 2. 搜索字段

```typescript
const columnResults = await vectorSearch.searchColumns('用户 ID', {
  limit: 5,
  threshold: 0.6,
});
```

### 3. 更新向量索引

```typescript
// 添加或更新单个表的向量
await vectorSearch.upsertTableVector(tableId);

// 添加或更新单个字段的向量
await vectorSearch.upsertColumnVector(columnId);

// 重建整个索引
await vectorSearch.rebuildIndex();
```

### 4. 获取统计信息

```typescript
const stats = await vectorSearch.getStats();

console.log(stats);
// {
//   tables: { totalItems: 100, dimension: 384, sizeBytes: 153600, ... },
//   columns: { totalItems: 500, dimension: 384, sizeBytes: 768000, ... },
//   total: { items: 600, sizeBytes: 921600 }
// }
```

### 5. 集成到元数据检索

```typescript
import { SemanticSearch } from '@/lib/metadata/retrieval';

// SemanticSearch 已自动集成向量搜索
const semanticSearch = new SemanticSearch({
  enableVectorSearch: true, // 启用向量搜索
});

// 搜索会自动结合关键词匹配和向量搜索
const results = await semanticSearch.searchTables('查询用户订单信息', {
  limit: 10,
});
```

## 底层组件

### EmbeddingGenerator

负责将文本转换为向量。

```typescript
import { EmbeddingGenerator } from '@/lib/vector';

const embedder = new EmbeddingGenerator();

// 生成单个向量
const result = await embedder.generate('user table');
console.log(result.vector); // [0.123, 0.456, ...]

// 批量生成
const results = await embedder.generateBatch([
  'user table',
  'product table',
  'order table',
]);
```

**特性**：
- 默认 384 维向量
- 基于 n-gram 特征哈希（可扩展为 AI 模型）
- 自动文本归一化
- 支持批量处理

### VectorStore

负责向量的存储和检索。

```typescript
import { VectorStore, SimilarityMetric } from '@/lib/vector';

const store = new VectorStore({
  name: 'my-index',
  dimension: 384,
  metric: SimilarityMetric.COSINE,
  persistent: true,
  redisPrefix: 'vector:my-index',
});

await store.initialize();

// 添加向量
await store.add('id1', vector, data, metadata);

// 搜索
const results = await store.search(queryVector, {
  limit: 10,
  threshold: 0.5,
  filter: { category: 'A' },
  includeVector: false,
});
```

**相似度度量**：
- `COSINE`：余弦相似度（默认，推荐用于文本）
- `EUCLIDEAN`：欧氏距离
- `DOT_PRODUCT`：点积

## 性能优化

### 1. 批量索引

```typescript
// 建立索引时使用批处理
const batchSize = 50;
for (let i = 0; i < tables.length; i += batchSize) {
  const batch = tables.slice(i, i + batchSize);
  await processBatch(batch);
}
```

### 2. 缓存策略

```typescript
// 使用 Redis 持久化，避免每次重建索引
const vectorSearch = new VectorSearchService({
  enableRedis: true,
  redisConfig: {
    host: 'localhost',
    port: 6379,
  },
});
```

### 3. 增量更新

```typescript
// 只更新变更的表/字段，而不是重建整个索引
await vectorSearch.upsertTableVector(tableId);
await vectorSearch.upsertColumnVector(columnId);
```

## 测试

```bash
# 运行所有向量搜索测试
npm test lib/vector

# 运行单元测试
npm test lib/vector/__tests__/embedding-generator.test.ts
npm test lib/vector/__tests__/vector-store.test.ts
npm test lib/vector/__tests__/vector-search-service.test.ts

# 运行集成测试
npm test lib/vector/__tests__/integration.test.ts
```

## 扩展与定制

### 集成 AI 模型

当前实现使用简单的特征哈希生成向量。可以扩展为使用真正的 AI embedding 模型：

```typescript
// embedding-generator.ts 中的 aiModelEmbedding 方法

private async aiModelEmbedding(text: string): Promise<Vector> {
  // 调用 Deepseek Embedding API
  const response = await fetch('https://api.deepseek.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-embedding-v1',
      input: text
    })
  });

  const data = await response.json();
  return data.data[0].embedding;
}
```

### 自定义相似度计算

```typescript
// 在 VectorStore 中添加自定义度量
class CustomVectorStore extends VectorStore {
  private calculateSimilarity(vectorA: Vector, vectorB: Vector): number {
    // 自定义相似度计算逻辑
    return customSimilarityFunction(vectorA, vectorB);
  }
}
```

### 添加更多过滤条件

```typescript
// 扩展搜索选项
interface ExtendedSearchOptions extends VectorSearchOptions {
  dateRange?: { start: Date; end: Date };
  tags?: string[];
  minRowCount?: number;
}
```

## 最佳实践

1. **选择合适的相似度度量**
   - 文本语义搜索：使用余弦相似度
   - 精确匹配：使用欧氏距离
   - 相关性排序：使用点积

2. **设置合理的阈值**
   - 高精度：threshold >= 0.8
   - 平衡：threshold = 0.5-0.7
   - 高召回：threshold <= 0.4

3. **定期重建索引**
   - 在元数据大量变更后重建
   - 定时任务（如每日凌晨）重建

4. **监控性能指标**
   - 索引大小
   - 搜索延迟
   - 缓存命中率

## 故障排查

### 问题：向量搜索返回空结果

**可能原因**：
- 索引未建立或为空
- 阈值设置过高
- 查询文本过短或无意义

**解决方案**：
```typescript
// 检查索引状态
const stats = await vectorSearch.getStats();
console.log('索引项数:', stats.total.items);

// 降低阈值
const results = await vectorSearch.searchTables(query, { threshold: 0.3 });

// 重建索引
await vectorSearch.rebuildIndex();
```

### 问题：搜索速度慢

**可能原因**：
- 索引过大
- 未启用 Redis
- 批量查询未优化

**解决方案**：
```typescript
// 启用 Redis 持久化
const vectorSearch = new VectorSearchService({
  enableRedis: true,
});

// 限制搜索范围
const results = await vectorSearch.searchTables(query, {
  limit: 10, // 限制返回数量
  filter: { databaseId: 1 }, // 添加过滤条件
});
```

### 问题：内存占用过高

**可能原因**：
- 向量维度过高
- 索引项过多
- 未启用持久化

**解决方案**：
```typescript
// 使用较低的向量维度
const vectorSearch = new VectorSearchService({
  dimension: 128, // 降低维度
});

// 定期清理无用向量
await vectorSearch.deleteTableVector(obsoleteTableId);

// 启用 Redis 持久化，减少内存占用
```

## 未来改进

- [ ] 集成真正的 AI Embedding 模型（Deepseek、OpenAI）
- [ ] 支持 HNSW 等近似最近邻算法，提升大规模搜索性能
- [ ] 支持向量压缩（PQ、LSH）
- [ ] 增加实时增量索引更新
- [ ] 添加 A/B 测试框架，对比不同算法效果
- [ ] 支持多语言文本处理
- [ ] 添加向量可视化工具

## 相关文档

- [元数据检索模块](../metadata/retrieval/README.md)
- [语义搜索实现](../metadata/retrieval/semantic-search.ts)
- [上下文构建器](../metadata/retrieval/context-builder.ts)
