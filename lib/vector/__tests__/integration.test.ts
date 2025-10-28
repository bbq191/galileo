/**
 * 向量搜索集成测试
 */

import { VectorSearchService } from '../vector-search-service';
import { EmbeddingGenerator } from '../embedding-generator';
import { VectorStore } from '../vector-store';
import { SimilarityMetric } from '../types';

describe('Vector Search Integration', () => {
  describe('端到端流程', () => {
    it('应该完成从文本到向量搜索的完整流程', async () => {
      // 1. 创建向量生成器
      const embedder = new EmbeddingGenerator();

      // 2. 生成向量
      const text1 = 'user table with id name and email columns';
      const text2 = 'product table with sku price and description';
      const text3 = 'user account information table';

      const result1 = await embedder.generate(text1);
      const result2 = await embedder.generate(text2);
      const result3 = await embedder.generate(text3);

      expect(result1.vector).toBeDefined();
      expect(result2.vector).toBeDefined();
      expect(result3.vector).toBeDefined();

      // 3. 创建向量存储
      const store = new VectorStore({
        name: 'integration-test',
        dimension: embedder.getDimension(),
        persistent: false,
      });
      await store.initialize();

      // 4. 添加向量
      await store.add('table1', result1.vector, {
        name: 'users',
        description: text1,
      });
      await store.add('table2', result2.vector, {
        name: 'products',
        description: text2,
      });
      await store.add('table3', result3.vector, {
        name: 'accounts',
        description: text3,
      });

      // 5. 搜索
      const query = 'find user data';
      const queryResult = await embedder.generate(query);
      const searchResults = await store.search(queryResult.vector, {
        limit: 2,
      });

      expect(searchResults.length).toBe(2);
      expect(searchResults[0].item.name).toMatch(/users|accounts/);

      // 6. 验证结果
      const topResult = searchResults[0];
      expect(topResult.score).toBeGreaterThan(0);
      expect(topResult.score).toBeLessThanOrEqual(1);
    });

    it('应该正确处理相似度排序', async () => {
      const embedder = new EmbeddingGenerator();
      const store = new VectorStore({
        name: 'similarity-test',
        dimension: embedder.getDimension(),
        persistent: false,
      });
      await store.initialize();

      // 添加不同相似度的数据
      const texts = [
        { id: 'exact', text: 'user authentication system' },
        { id: 'similar', text: 'user login and authentication' },
        { id: 'related', text: 'customer account management' },
        { id: 'unrelated', text: 'product inventory tracking' },
      ];

      for (const { id, text } of texts) {
        const result = await embedder.generate(text);
        await store.add(id, result.vector, { text });
      }

      // 搜索
      const query = 'user authentication';
      const queryVector = await embedder.generate(query);
      const results = await store.search(queryVector.vector, { limit: 10 });

      // 验证排序
      expect(results.length).toBeGreaterThan(0);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }

      // 最相似的应该是 exact 或 similar
      const topId = results[0].item.text;
      expect(topId).toMatch(/authentication/);
    });
  });

  describe('批量操作性能', () => {
    it('应该高效处理批量向量生成', async () => {
      const embedder = new EmbeddingGenerator();
      const count = 100;
      const texts = Array.from(
        { length: count },
        (_, i) => `test table ${i} with various columns`
      );

      const startTime = Date.now();
      const results = await embedder.generateBatch(texts);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(count);
      console.log(`批量生成 ${count} 个向量耗时: ${duration}ms`);

      // 性能基准：100个向量应在合理时间内完成
      expect(duration).toBeLessThan(5000); // 5秒
    });

    it('应该高效处理批量向量添加', async () => {
      const store = new VectorStore({
        name: 'batch-test',
        dimension: 384,
        persistent: false,
      });
      await store.initialize();

      const embedder = new EmbeddingGenerator();
      const count = 100;
      const items = [];

      for (let i = 0; i < count; i++) {
        const text = `table ${i}`;
        const result = await embedder.generate(text);
        items.push({
          id: `item${i}`,
          vector: result.vector,
          data: { name: `table_${i}` },
        });
      }

      const startTime = Date.now();
      await store.addBatch(items);
      const duration = Date.now() - startTime;

      expect(store.size()).toBe(count);
      console.log(`批量添加 ${count} 个向量耗时: ${duration}ms`);

      // 性能基准
      expect(duration).toBeLessThan(1000); // 1秒
    });

    it('应该高效执行大规模搜索', async () => {
      const store = new VectorStore({
        name: 'search-perf-test',
        dimension: 384,
        persistent: false,
      });
      await store.initialize();

      const embedder = new EmbeddingGenerator();
      const dataCount = 500;

      // 准备数据
      const items = [];
      for (let i = 0; i < dataCount; i++) {
        const text = `table ${i} with columns col1 col2 col3`;
        const result = await embedder.generate(text);
        items.push({
          id: `item${i}`,
          vector: result.vector,
          data: { name: `table_${i}` },
        });
      }

      await store.addBatch(items);

      // 执行多次搜索
      const queryCount = 10;
      const queries = Array.from(
        { length: queryCount },
        (_, i) => `search query ${i}`
      );

      const startTime = Date.now();
      for (const query of queries) {
        const queryVector = await embedder.generate(query);
        await store.search(queryVector.vector, { limit: 10 });
      }
      const duration = Date.now() - startTime;

      console.log(
        `在 ${dataCount} 条数据中执行 ${queryCount} 次搜索耗时: ${duration}ms`
      );

      // 性能基准
      expect(duration).toBeLessThan(3000); // 3秒
    });
  });

  describe('不同相似度度量对比', () => {
    it('应该支持余弦相似度', async () => {
      const store = new VectorStore({
        name: 'cosine-test',
        dimension: 4,
        metric: SimilarityMetric.COSINE,
        persistent: false,
      });
      await store.initialize();

      await store.add('item1', [1, 0, 0, 0], { name: 'test1' });
      await store.add('item2', [0.9, 0.1, 0, 0], { name: 'test2' });
      await store.add('item3', [0, 1, 0, 0], { name: 'test3' });

      const results = await store.search([1, 0, 0, 0], { limit: 3 });

      expect(results.length).toBe(3);
      expect(results[0].item.name).toBe('test1');
      expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('应该支持欧氏距离', async () => {
      const store = new VectorStore({
        name: 'euclidean-test',
        dimension: 4,
        metric: SimilarityMetric.EUCLIDEAN,
        persistent: false,
      });
      await store.initialize();

      await store.add('item1', [1, 0, 0, 0], { name: 'test1' });
      await store.add('item2', [0.9, 0.1, 0, 0], { name: 'test2' });
      await store.add('item3', [0, 1, 0, 0], { name: 'test3' });

      const results = await store.search([1, 0, 0, 0], { limit: 3 });

      expect(results.length).toBe(3);
      expect(results[0].item.name).toBe('test1');
      expect(results[0].score).toBeCloseTo(1.0, 2);
    });

    it('应该支持点积', async () => {
      const store = new VectorStore({
        name: 'dotproduct-test',
        dimension: 4,
        metric: SimilarityMetric.DOT_PRODUCT,
        persistent: false,
      });
      await store.initialize();

      await store.add('item1', [1, 0, 0, 0], { name: 'test1' });
      await store.add('item2', [0.5, 0.5, 0, 0], { name: 'test2' });

      const results = await store.search([1, 0, 0, 0], { limit: 2 });

      expect(results.length).toBe(2);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });

  describe('过滤功能', () => {
    it('应该支持元数据过滤', async () => {
      const store = new VectorStore({
        name: 'filter-test',
        dimension: 4,
        persistent: false,
      });
      await store.initialize();

      await store.add(
        'item1',
        [1, 0, 0, 0],
        { name: 'test1' },
        { category: 'A', priority: 1 }
      );
      await store.add(
        'item2',
        [0.9, 0.1, 0, 0],
        { name: 'test2' },
        { category: 'A', priority: 2 }
      );
      await store.add(
        'item3',
        [0.8, 0.2, 0, 0],
        { name: 'test3' },
        { category: 'B', priority: 1 }
      );

      // 按类别过滤
      const resultsA = await store.search([1, 0, 0, 0], {
        filter: { category: 'A' },
        limit: 10,
      });

      expect(resultsA.length).toBe(2);
      resultsA.forEach(r => {
        expect(r.metadata?.category).toBe('A');
      });

      // 按优先级过滤
      const resultsP1 = await store.search([1, 0, 0, 0], {
        filter: { priority: 1 },
        limit: 10,
      });

      expect(resultsP1.length).toBe(2);
      resultsP1.forEach(r => {
        expect(r.metadata?.priority).toBe(1);
      });
    });
  });

  describe('边界情况', () => {
    it('应该处理空索引搜索', async () => {
      const store = new VectorStore({
        name: 'empty-test',
        dimension: 4,
        persistent: false,
      });
      await store.initialize();

      const results = await store.search([1, 0, 0, 0]);
      expect(results).toEqual([]);
    });

    it('应该处理零向量', async () => {
      const embedder = new EmbeddingGenerator();
      const result = await embedder.generate('');

      expect(result.vector).toBeDefined();
      expect(result.vector.length).toBe(embedder.getDimension());
    });

    it('应该处理非常长的文本', async () => {
      const embedder = new EmbeddingGenerator();
      const longText = 'word '.repeat(10000);

      const result = await embedder.generate(longText);

      expect(result.vector).toBeDefined();
      expect(result.vector.length).toBe(embedder.getDimension());
    });

    it('应该处理特殊字符', async () => {
      const embedder = new EmbeddingGenerator();
      const specialText = '!@#$%^&*()_+-={}[]|:;<>?,./~`';

      const result = await embedder.generate(specialText);

      expect(result.vector).toBeDefined();
      expect(result.vector.length).toBe(embedder.getDimension());
    });
  });
});
