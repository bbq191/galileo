/**
 * 向量搜索基本使用示例
 */

import { VectorSearchService } from '../vector-search-service';
import { EmbeddingGenerator } from '../embedding-generator';
import { VectorStore } from '../vector-store';
import { SimilarityMetric } from '../types';

/**
 * 示例 1: 基本的向量搜索
 */
async function example1BasicSearch() {
  console.log('\n=== 示例 1: 基本的向量搜索 ===\n');

  // 创建向量搜索服务
  const vectorSearch = new VectorSearchService({
    enableRedis: false,
    dimension: 384,
  });

  // 初始化（会自动建立索引）
  await vectorSearch.initialize();

  // 搜索表
  console.log('搜索: "用户信息"');
  const results = await vectorSearch.searchTables('用户信息', {
    limit: 5,
    threshold: 0.3,
  });

  console.log(`找到 ${results.length} 个结果:`);
  results.forEach((result, index) => {
    console.log(
      `${index + 1}. ${result.item.tableName} (相似度: ${result.score.toFixed(3)})`
    );
  });

  // 关闭服务
  await vectorSearch.close();
}

/**
 * 示例 2: 搜索字段
 */
async function example2SearchColumns() {
  console.log('\n=== 示例 2: 搜索字段 ===\n');

  const vectorSearch = new VectorSearchService({
    enableRedis: false,
  });

  await vectorSearch.initialize();

  // 搜索字段
  console.log('搜索: "用户 ID"');
  const results = await vectorSearch.searchColumns('用户 ID', {
    limit: 5,
    threshold: 0.4,
  });

  console.log(`找到 ${results.length} 个字段:`);
  results.forEach((result, index) => {
    console.log(
      `${index + 1}. ${result.item.tableName}.${result.item.columnName} (${
        result.item.dataType
      }) - 相似度: ${result.score.toFixed(3)}`
    );
  });

  await vectorSearch.close();
}

/**
 * 示例 3: 使用底层组件
 */
async function example3LowLevel() {
  console.log('\n=== 示例 3: 使用底层组件 ===\n');

  // 创建向量生成器
  const embedder = new EmbeddingGenerator();

  // 生成向量
  const texts = ['用户表', '产品表', '订单表'];
  const results = await embedder.generateBatch(texts);

  console.log('生成的向量:');
  results.forEach((result, index) => {
    console.log(
      `${index + 1}. "${result.text}" -> 向量维度: ${result.dimension}`
    );
  });

  // 创建向量存储
  const store = new VectorStore({
    name: 'example-index',
    dimension: embedder.getDimension(),
    metric: SimilarityMetric.COSINE,
    persistent: false,
  });

  await store.initialize();

  // 添加向量
  for (let i = 0; i < results.length; i++) {
    await store.add(
      `table${i}`,
      results[i].vector,
      { name: texts[i] },
      { index: i }
    );
  }

  console.log(`\n已添加 ${store.size()} 个向量到存储`);

  // 搜索
  console.log('\n搜索: "用户"');
  const queryVector = await embedder.generate('用户');
  const searchResults = await store.search(queryVector.vector, {
    limit: 3,
  });

  console.log(`找到 ${searchResults.length} 个结果:`);
  searchResults.forEach((result, index) => {
    console.log(
      `${index + 1}. ${result.item.name} (相似度: ${result.score.toFixed(3)})`
    );
  });
}

/**
 * 示例 4: 不同相似度度量对比
 */
async function example4SimilarityMetrics() {
  console.log('\n=== 示例 4: 不同相似度度量对比 ===\n');

  const embedder = new EmbeddingGenerator();

  // 准备测试数据
  const data = [
    { id: '1', text: '用户表' },
    { id: '2', text: '用户信息表' },
    { id: '3', text: '产品表' },
  ];

  const embeddings = await Promise.all(
    data.map(async d => ({
      id: d.id,
      text: d.text,
      vector: (await embedder.generate(d.text)).vector,
    }))
  );

  const metrics = [
    SimilarityMetric.COSINE,
    SimilarityMetric.EUCLIDEAN,
    SimilarityMetric.DOT_PRODUCT,
  ];

  const query = '用户';
  const queryVector = (await embedder.generate(query)).vector;

  for (const metric of metrics) {
    console.log(`\n使用 ${metric} 相似度:`);

    const store = new VectorStore({
      name: `test-${metric}`,
      dimension: embedder.getDimension(),
      metric,
      persistent: false,
    });

    await store.initialize();

    for (const emb of embeddings) {
      await store.add(emb.id, emb.vector, { text: emb.text });
    }

    const results = await store.search(queryVector, { limit: 3 });

    results.forEach((result, index) => {
      console.log(
        `  ${index + 1}. ${result.item.text} (${result.score.toFixed(4)})`
      );
    });
  }
}

/**
 * 示例 5: 使用过滤器
 */
async function example5Filtering() {
  console.log('\n=== 示例 5: 使用过滤器 ===\n');

  const embedder = new EmbeddingGenerator();
  const store = new VectorStore({
    name: 'filter-example',
    dimension: embedder.getDimension(),
    persistent: false,
  });

  await store.initialize();

  // 添加带元数据的数据
  const tables = [
    { name: 'users', db: 'main', category: 'core' },
    { name: 'products', db: 'shop', category: 'business' },
    { name: 'orders', db: 'shop', category: 'business' },
    { name: 'user_profiles', db: 'main', category: 'core' },
  ];

  for (const table of tables) {
    const vector = (await embedder.generate(table.name)).vector;
    await store.add(table.name, vector, table, {
      database: table.db,
      category: table.category,
    });
  }

  console.log('添加了以下表:');
  tables.forEach((t, i) => {
    console.log(`${i + 1}. ${t.name} (数据库: ${t.db}, 类别: ${t.category})`);
  });

  // 不使用过滤器搜索
  console.log('\n搜索 "user" (无过滤):');
  const query = (await embedder.generate('user')).vector;
  const allResults = await store.search(query, { limit: 5 });
  allResults.forEach((r, i) => {
    console.log(`${i + 1}. ${r.item.name} (${r.score.toFixed(3)})`);
  });

  // 使用数据库过滤
  console.log('\n搜索 "user" (过滤: database=main):');
  const mainResults = await store.search(query, {
    limit: 5,
    filter: { database: 'main' },
  });
  mainResults.forEach((r, i) => {
    console.log(`${i + 1}. ${r.item.name} (${r.score.toFixed(3)})`);
  });

  // 使用类别过滤
  console.log('\n搜索 "user" (过滤: category=business):');
  const businessResults = await store.search(query, {
    limit: 5,
    filter: { category: 'business' },
  });
  businessResults.forEach((r, i) => {
    console.log(`${i + 1}. ${r.item.name} (${r.score.toFixed(3)})`);
  });
}

/**
 * 示例 6: 索引更新
 */
async function example6IndexUpdate() {
  console.log('\n=== 示例 6: 索引更新 ===\n');

  const vectorSearch = new VectorSearchService({
    enableRedis: false,
  });

  await vectorSearch.initialize();

  // 获取初始统计
  let stats = await vectorSearch.getStats();
  console.log('初始索引统计:');
  console.log(`- 表: ${stats.tables.totalItems} 个`);
  console.log(`- 字段: ${stats.columns.totalItems} 个`);
  console.log(`- 总大小: ${(stats.total.sizeBytes / 1024).toFixed(2)} KB`);

  // 模拟更新（实际使用中会从数据库读取）
  console.log('\n更新表向量 (tableId=1)...');
  try {
    await vectorSearch.upsertTableVector(1);
    console.log('✓ 更新成功');
  } catch (error: any) {
    console.log(`× 更新失败: ${error.message}`);
  }

  // 重建索引
  console.log('\n重建整个索引...');
  await vectorSearch.rebuildIndex();
  console.log('✓ 索引重建完成');

  // 获取更新后的统计
  stats = await vectorSearch.getStats();
  console.log('\n更新后的索引统计:');
  console.log(`- 表: ${stats.tables.totalItems} 个`);
  console.log(`- 字段: ${stats.columns.totalItems} 个`);
  console.log(`- 总大小: ${(stats.total.sizeBytes / 1024).toFixed(2)} KB`);

  await vectorSearch.close();
}

/**
 * 主函数 - 运行所有示例
 */
async function main() {
  console.log('='.repeat(60));
  console.log('向量搜索使用示例');
  console.log('='.repeat(60));

  try {
    // 运行示例
    await example1BasicSearch();
    await example2SearchColumns();
    await example3LowLevel();
    await example4SimilarityMetrics();
    await example5Filtering();
    await example6IndexUpdate();

    console.log('\n' + '='.repeat(60));
    console.log('所有示例运行完成！');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('运行示例时出错:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

export {
  example1BasicSearch,
  example2SearchColumns,
  example3LowLevel,
  example4SimilarityMetrics,
  example5Filtering,
  example6IndexUpdate,
};
