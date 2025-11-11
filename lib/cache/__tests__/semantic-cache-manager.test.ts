/**
 * SemanticCacheManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SemanticCacheManager } from '../semantic-cache-manager';
import type { QueryIntent } from '@/lib/nlp/types';

describe('SemanticCacheManager', () => {
  let semanticCache: SemanticCacheManager;

  // 测试用的查询意图
  const mockIntent1: QueryIntent = {
    type: 'select',
    entities: {
      tables: ['orders'],
      columns: ['id', 'user_id', 'total'],
    },
    conditions: {},
  };

  const mockIntent2: QueryIntent = {
    type: 'aggregate',
    entities: {
      tables: ['sales'],
      columns: ['amount'],
    },
    conditions: {},
    aggregations: {
      function: 'SUM',
      column: 'amount',
    },
  };

  beforeEach(async () => {
    // 初始化语义缓存管理器（不使用 Redis，仅测试向量功能）
    semanticCache = new SemanticCacheManager();
    await semanticCache.initialize();
  });

  afterEach(async () => {
    // 清理
    await semanticCache.clear();
  });

  describe('基础功能', () => {
    it('应该能添加查询到语义缓存', async () => {
      await semanticCache.addQuery('查询用户订单', mockIntent1);

      const stats = await semanticCache.getStats();
      expect(stats.totalEntries).toBe(1);
    });

    it('应该能找到完全相同的查询', async () => {
      await semanticCache.addQuery('查询用户订单', mockIntent1);

      const result = await semanticCache.findSimilar('查询用户订单', {
        threshold: 0.8,
      });

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0.95); // 相同查询，相似度应该很高
      expect(result!.entry.intent).toEqual(mockIntent1);
    });

    it('应该能找到相似的查询', async () => {
      await semanticCache.addQuery('查询用户订单', mockIntent1);

      const result = await semanticCache.findSimilar('获取用户订单信息', {
        threshold: 0.7,
      });

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0.7);
      expect(result!.entry.originalQuery).toBe('查询用户订单');
    });

    it('应该忽略不相似的查询', async () => {
      await semanticCache.addQuery('查询用户订单', mockIntent1);

      const result = await semanticCache.findSimilar('统计产品销售额', {
        threshold: 0.8,
      });

      expect(result).toBeNull();
    });

    it('应该能处理多个缓存条目', async () => {
      await semanticCache.addQuery('查询用户订单', mockIntent1);
      await semanticCache.addQuery('统计销售额', mockIntent2);

      const stats = await semanticCache.getStats();
      expect(stats.totalEntries).toBe(2);

      // 应该能找到正确的匹配
      const result1 = await semanticCache.findSimilar('获取订单', {
        threshold: 0.6,
      });
      expect(result1).not.toBeNull();
      expect(result1!.entry.intent.entities.tables).toContain('orders');

      const result2 = await semanticCache.findSimilar('计算销售总额', {
        threshold: 0.6,
      });
      expect(result2).not.toBeNull();
      expect(result2!.entry.intent.entities.tables).toContain('sales');
    });
  });

  describe('相似度阈值', () => {
    beforeEach(async () => {
      await semanticCache.addQuery('查询用户订单', mockIntent1);
    });

    it('高阈值应该只匹配非常相似的查询', async () => {
      const result = await semanticCache.findSimilar('获取用户订单信息', {
        threshold: 0.95,
      });

      // 可能不匹配（取决于向量化算法）
      if (result) {
        expect(result.score).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('中等阈值应该匹配较相似的查询', async () => {
      const result = await semanticCache.findSimilar('用户订单查询', {
        threshold: 0.7,
      });

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.7);
    });

    it('低阈值应该匹配更多查询', async () => {
      const result = await semanticCache.findSimilar('订单', {
        threshold: 0.5,
      });

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('清理功能', () => {
    it('应该能清理低质量缓存', async () => {
      // 添加多个查询
      await semanticCache.addQuery('查询A', mockIntent1);
      await semanticCache.addQuery('查询B', mockIntent2);

      // 模拟访问（通过查找来增加访问次数）
      await semanticCache.findSimilar('查询A');
      await semanticCache.findSimilar('查询A');
      await semanticCache.findSimilar('查询A'); // 查询A 被访问 3 次

      // 清理访问次数少于 3 的缓存
      const removed = await semanticCache.cleanup({
        minAccessCount: 3,
        maxAge: 0, // 忽略年龄限制
      });

      expect(removed).toBeGreaterThan(0); // 应该清理了查询B
    });

    it('应该能清空所有缓存', async () => {
      await semanticCache.addQuery('查询A', mockIntent1);
      await semanticCache.addQuery('查询B', mockIntent2);

      expect(semanticCache.size()).toBe(2);

      await semanticCache.clear();

      expect(semanticCache.size()).toBe(0);
    });
  });

  describe('标准化查询', () => {
    it('应该忽略标点符号差异', async () => {
      await semanticCache.addQuery('查询用户订单', mockIntent1);

      const result = await semanticCache.findSimilar('查询用户订单！', {
        threshold: 0.9,
      });

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0.9);
    });

    it('应该忽略大小写差异', async () => {
      await semanticCache.addQuery('Query User Orders', mockIntent1);

      const result = await semanticCache.findSimilar('query user orders', {
        threshold: 0.9,
      });

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0.9);
    });

    it('应该忽略多余空格', async () => {
      await semanticCache.addQuery('查询用户订单', mockIntent1);

      const result = await semanticCache.findSimilar('查询  用户   订单', {
        threshold: 0.9,
      });

      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0.9);
    });
  });

  describe('统计信息', () => {
    it('应该正确报告统计信息', async () => {
      await semanticCache.addQuery('查询A', mockIntent1);
      await semanticCache.addQuery('查询B', mockIntent2);

      const stats = await semanticCache.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.dimension).toBe(384); // simple-hash 默认维度
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });

    it('size() 应该返回正确的条目数', async () => {
      expect(semanticCache.size()).toBe(0);

      await semanticCache.addQuery('查询A', mockIntent1);
      expect(semanticCache.size()).toBe(1);

      await semanticCache.addQuery('查询B', mockIntent2);
      expect(semanticCache.size()).toBe(2);

      await semanticCache.clear();
      expect(semanticCache.size()).toBe(0);
    });
  });
});
