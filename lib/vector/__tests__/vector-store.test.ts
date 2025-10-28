/**
 * 向量存储测试
 */

import { VectorStore } from '../vector-store';
import { SimilarityMetric } from '../types';

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(async () => {
    store = new VectorStore({
      name: 'test-index',
      dimension: 4,
      metric: SimilarityMetric.COSINE,
      persistent: false, // 不使用 Redis，只用内存
    });
    await store.initialize();
  });

  describe('add', () => {
    it('应该添加向量项', async () => {
      await store.add('item1', [0.5, 0.5, 0.5, 0.5], { name: 'test' });

      expect(store.has('item1')).toBe(true);
      expect(store.size()).toBe(1);

      const item = await store.get('item1');
      expect(item).toBeDefined();
      expect(item!.vector).toEqual([0.5, 0.5, 0.5, 0.5]);
      expect(item!.data).toEqual({ name: 'test' });
    });

    it('应该抛出错误当向量维度不匹配', async () => {
      await expect(
        store.add('item1', [0.5, 0.5], { name: 'test' })
      ).rejects.toThrow('Vector dimension mismatch');
    });

    it('应该支持元数据', async () => {
      await store.add(
        'item1',
        [0.5, 0.5, 0.5, 0.5],
        { name: 'test' },
        { category: 'A', score: 100 }
      );

      const item = await store.get('item1');
      expect(item!.metadata).toEqual({ category: 'A', score: 100 });
    });
  });

  describe('addBatch', () => {
    it('应该批量添加向量项', async () => {
      const items = [
        { id: 'item1', vector: [0.5, 0.5, 0.5, 0.5], data: { name: 'test1' } },
        { id: 'item2', vector: [0.3, 0.3, 0.3, 0.3], data: { name: 'test2' } },
        { id: 'item3', vector: [0.7, 0.7, 0.7, 0.7], data: { name: 'test3' } },
      ];

      await store.addBatch(items);

      expect(store.size()).toBe(3);
      expect(store.has('item1')).toBe(true);
      expect(store.has('item2')).toBe(true);
      expect(store.has('item3')).toBe(true);
    });
  });

  describe('update', () => {
    it('应该更新现有项', async () => {
      await store.add('item1', [0.5, 0.5, 0.5, 0.5], { name: 'old' });
      await store.update('item1', undefined, { name: 'new' });

      const item = await store.get('item1');
      expect(item!.data).toEqual({ name: 'new' });
    });

    it('应该抛出错误当项不存在', async () => {
      await expect(
        store.update('nonexistent', [0.5, 0.5, 0.5, 0.5])
      ).rejects.toThrow('Item not found');
    });

    it('应该更新向量', async () => {
      await store.add('item1', [0.5, 0.5, 0.5, 0.5], { name: 'test' });
      await store.update('item1', [0.3, 0.3, 0.3, 0.3]);

      const item = await store.get('item1');
      expect(item!.vector).toEqual([0.3, 0.3, 0.3, 0.3]);
    });
  });

  describe('delete', () => {
    it('应该删除项', async () => {
      await store.add('item1', [0.5, 0.5, 0.5, 0.5], { name: 'test' });
      await store.delete('item1');

      expect(store.has('item1')).toBe(false);
      expect(store.size()).toBe(0);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // 添加测试数据
      await store.add('item1', [1, 0, 0, 0], { name: 'item1', category: 'A' });
      await store.add('item2', [0.9, 0.1, 0, 0], { name: 'item2', category: 'A' });
      await store.add('item3', [0, 1, 0, 0], { name: 'item3', category: 'B' });
      await store.add('item4', [0, 0, 1, 0], { name: 'item4', category: 'C' });
    });

    it('应该找到最相似的项', async () => {
      const query = [1, 0, 0, 0];
      const results = await store.search(query, { limit: 2 });

      expect(results.length).toBe(2);
      expect(results[0].item.name).toBe('item1');
      expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('应该按相似度排序', async () => {
      const query = [1, 0, 0, 0];
      const results = await store.search(query, { limit: 3 });

      expect(results.length).toBe(3);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    });

    it('应该支持阈值过滤', async () => {
      const query = [1, 0, 0, 0];
      const results = await store.search(query, { threshold: 0.9 });

      // 只有非常相似的项
      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('应该支持元数据过滤', async () => {
      const query = [1, 0, 0, 0];
      const results = await store.search(query, {
        filter: { category: 'A' },
      });

      expect(results.length).toBe(2);
      results.forEach(r => {
        expect(r.metadata?.category).toBe('A');
      });
    });

    it('应该支持包含向量选项', async () => {
      const query = [1, 0, 0, 0];
      const results = await store.search(query, {
        limit: 1,
        includeVector: true,
      });

      expect(results[0].vector).toBeDefined();
      expect(results[0].vector).toEqual([1, 0, 0, 0]);
    });

    it('应该处理空查询', async () => {
      const results = await store.search([0, 0, 0, 0]);
      expect(results).toBeDefined();
    });
  });

  describe('searchByText', () => {
    it('应该根据文本搜索', async () => {
      await store.add('item1', [0.5, 0.5, 0.5, 0.5], { name: 'user table' });
      await store.add('item2', [0.3, 0.3, 0.3, 0.3], { name: 'product table' });

      const results = await store.searchByText('user', { limit: 1 });
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('应该返回索引统计信息', async () => {
      await store.add('item1', [0.5, 0.5, 0.5, 0.5], { name: 'test' });
      await store.add('item2', [0.3, 0.3, 0.3, 0.3], { name: 'test2' });

      const stats = await store.getStats();

      expect(stats.totalItems).toBe(2);
      expect(stats.dimension).toBe(4);
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('clear', () => {
    it('应该清空所有项', async () => {
      await store.add('item1', [0.5, 0.5, 0.5, 0.5], { name: 'test1' });
      await store.add('item2', [0.3, 0.3, 0.3, 0.3], { name: 'test2' });

      await store.clear();

      expect(store.size()).toBe(0);
      expect(store.getAllIds()).toEqual([]);
    });
  });

  describe('getAllIds', () => {
    it('应该返回所有项的 ID', async () => {
      await store.add('item1', [0.5, 0.5, 0.5, 0.5], { name: 'test1' });
      await store.add('item2', [0.3, 0.3, 0.3, 0.3], { name: 'test2' });
      await store.add('item3', [0.7, 0.7, 0.7, 0.7], { name: 'test3' });

      const ids = store.getAllIds();
      expect(ids.sort()).toEqual(['item1', 'item2', 'item3'].sort());
    });
  });
});
