/**
 * 查询缓存管理器单元测试
 */

import { QueryCacheManager } from '../query-cache-manager';
import { multiLevelCache } from '../multi-level-cache';
import type { QueryIntent } from '@/lib/nlp/types';
import type { SQLGenerationResult } from '@/lib/sql/generator/types';
import type { ExecutionResult } from '@/lib/sql/executor/types';

// Mock multiLevelCache
jest.mock('../multi-level-cache', () => ({
  multiLevelCache: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidate: jest.fn(),
    getStats: jest.fn(() => ({
      l1Size: 10,
      l1MaxSize: 1000,
      metrics: {
        hits: 50,
        misses: 50,
        l1Hits: 30,
        l2Hits: 20,
        sets: 100,
        invalidations: 5,
      },
      hitRate: 0.5,
    })),
  },
}));

describe('QueryCacheManager', () => {
  let cacheManager: QueryCacheManager;

  beforeEach(() => {
    cacheManager = new QueryCacheManager();
    jest.clearAllMocks();
  });

  describe('意图缓存', () => {
    const testQuery = '查询最近一个月的销售数据';
    const testIntent: QueryIntent = {
      type: 'select',
      entities: {
        databases: ['sales_db'],
        tables: ['orders'],
        columns: ['order_date', 'amount'],
      },
      conditions: {
        timeRange: {
          relative: 'last_30_days',
        },
        filters: [],
      },
      confidence: 0.9,
      ambiguities: [],
    };

    test('应该正确缓存和获取意图', async () => {
      // Mock get 返回缓存命中
      (multiLevelCache.get as jest.Mock).mockResolvedValueOnce(testIntent);

      // 获取缓存
      const result = await cacheManager.getIntent(testQuery);

      expect(result).toEqual(testIntent);
      expect(multiLevelCache.get).toHaveBeenCalled();

      // 验证统计
      const stats = cacheManager.getStatistics();
      expect(stats.intentCacheHits).toBe(1);
      expect(stats.intentCacheMisses).toBe(0);
    });

    test('应该处理缓存未命中', async () => {
      // Mock get 抛出错误（缓存未命中）
      (multiLevelCache.get as jest.Mock).mockRejectedValueOnce(new Error('Cache miss'));

      // 获取缓存
      const result = await cacheManager.getIntent(testQuery);

      expect(result).toBeNull();

      // 验证统计
      const stats = cacheManager.getStatistics();
      expect(stats.intentCacheHits).toBe(0);
      expect(stats.intentCacheMisses).toBe(1);
    });

    test('应该正确设置意图缓存', async () => {
      await cacheManager.setIntent(testQuery, testIntent);

      expect(multiLevelCache.set).toHaveBeenCalledWith(
        'query_intent',
        expect.objectContaining({ query_hash: expect.any(String) }),
        testIntent
      );
    });

    test('应该标准化查询文本', async () => {
      const query1 = '查询最近一个月的销售数据';
      const query2 = '查询  最近   一个月的销售数据'; // 多余空格
      const query3 = '查询最近一个月的销售数据。'; // 带标点

      // 缓存第一个查询
      await cacheManager.setIntent(query1, testIntent);

      // Mock get 返回缓存
      (multiLevelCache.get as jest.Mock).mockResolvedValue(testIntent);

      // 获取不同格式的查询应该命中相同缓存
      const result2 = await cacheManager.getIntent(query2);
      const result3 = await cacheManager.getIntent(query3);

      expect(result2).toEqual(testIntent);
      expect(result3).toEqual(testIntent);
    });
  });

  describe('SQL 缓存', () => {
    const testIntent: QueryIntent = {
      type: 'select',
      entities: {
        databases: ['sales_db'],
        tables: ['orders'],
        columns: ['order_date', 'amount'],
      },
      conditions: {
        filters: [],
      },
      confidence: 0.9,
      ambiguities: [],
    };

    const testSQLResult: SQLGenerationResult = {
      sql: 'SELECT order_date, amount FROM sales_db.orders WHERE order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
      explanation: '查询最近30天的订单数据',
      confidence: 0.95,
      usedTables: ['sales_db.orders'],
      usedColumns: ['order_date', 'amount'],
      warnings: [],
    };

    test('应该正确缓存和获取SQL', async () => {
      // Mock get 返回缓存命中
      (multiLevelCache.get as jest.Mock).mockResolvedValueOnce(testSQLResult);

      // 获取缓存
      const result = await cacheManager.getSQL(testIntent);

      expect(result).toEqual(testSQLResult);
      expect(multiLevelCache.get).toHaveBeenCalled();

      // 验证统计
      const stats = cacheManager.getStatistics();
      expect(stats.sqlCacheHits).toBe(1);
    });

    test('应该处理SQL缓存未命中', async () => {
      // Mock get 抛出错误
      (multiLevelCache.get as jest.Mock).mockRejectedValueOnce(new Error('Cache miss'));

      const result = await cacheManager.getSQL(testIntent);

      expect(result).toBeNull();

      // 验证统计
      const stats = cacheManager.getStatistics();
      expect(stats.sqlCacheMisses).toBe(1);
    });

    test('应该正确设置SQL缓存', async () => {
      await cacheManager.setSQL(testIntent, testSQLResult);

      expect(multiLevelCache.set).toHaveBeenCalledWith(
        'query_sql',
        expect.objectContaining({ intent_hash: expect.any(String) }),
        testSQLResult
      );
    });
  });

  describe('结果缓存', () => {
    const testSQL = 'SELECT * FROM orders WHERE order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    const testResult: ExecutionResult<any> = {
      success: true,
      data: [
        { order_id: 1, order_date: '2025-01-01', amount: 100 },
        { order_id: 2, order_date: '2025-01-02', amount: 200 },
      ],
      executionTime: 150,
      rowCount: 2,
      fromCache: false,
      metadata: {
        columns: [
          { name: 'order_id', type: 'INT', length: 11 },
          { name: 'order_date', type: 'DATE' },
          { name: 'amount', type: 'DECIMAL' },
        ],
      },
    };

    test('应该正确缓存和获取查询结果', async () => {
      // Mock get 返回缓存命中
      (multiLevelCache.get as jest.Mock).mockResolvedValueOnce(testResult);

      // 获取缓存
      const result = await cacheManager.getResult(testSQL);

      expect(result).toEqual(testResult);
      expect(multiLevelCache.get).toHaveBeenCalled();

      // 验证统计
      const stats = cacheManager.getStatistics();
      expect(stats.resultCacheHits).toBe(1);
    });

    test('应该处理结果缓存未命中', async () => {
      // Mock get 抛出错误
      (multiLevelCache.get as jest.Mock).mockRejectedValueOnce(new Error('Cache miss'));

      const result = await cacheManager.getResult(testSQL);

      expect(result).toBeNull();

      // 验证统计
      const stats = cacheManager.getStatistics();
      expect(stats.resultCacheMisses).toBe(1);
    });

    test('应该正确设置结果缓存（小结果集）', async () => {
      await cacheManager.setResult(testSQL, testResult);

      expect(multiLevelCache.set).toHaveBeenCalledWith(
        'query_result',
        expect.objectContaining({ sql_hash: expect.any(String) }),
        testResult
      );
    });

    test('不应该缓存大结果集', async () => {
      const largeResult: ExecutionResult<any> = {
        ...testResult,
        rowCount: 1500, // 超过 1000 行
        data: Array(1500).fill({ order_id: 1, amount: 100 }),
      };

      await cacheManager.setResult(testSQL, largeResult);

      // 不应该调用 set
      expect(multiLevelCache.set).not.toHaveBeenCalled();
    });

    test('不应该缓存失败的结果', async () => {
      const failedResult: ExecutionResult<any> = {
        success: false,
        error: '查询执行失败',
        executionTime: 50,
        rowCount: 0,
        fromCache: false,
        metadata: { columns: [] },
      };

      await cacheManager.setResult(testSQL, failedResult);

      // 不应该调用 set
      expect(multiLevelCache.set).not.toHaveBeenCalled();
    });

    test('应该标准化SQL语句', async () => {
      const sql1 = 'SELECT * FROM orders';
      const sql2 = 'SELECT   *   FROM   orders'; // 多余空格
      const sql3 = 'SELECT * FROM orders;'; // 带分号

      // Mock get 返回缓存
      (multiLevelCache.get as jest.Mock).mockResolvedValue(testResult);

      // 获取不同格式的SQL应该命中相同缓存
      const result1 = await cacheManager.getResult(sql1);
      const result2 = await cacheManager.getResult(sql2);
      const result3 = await cacheManager.getResult(sql3);

      expect(result1).toEqual(testResult);
      expect(result2).toEqual(testResult);
      expect(result3).toEqual(testResult);
    });
  });

  describe('缓存失效', () => {
    test('应该失效所有查询缓存', async () => {
      await cacheManager.invalidateAll();

      expect(multiLevelCache.invalidate).toHaveBeenCalledTimes(3);
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'metadata_synced',
        'query:intent:*'
      );
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'metadata_synced',
        'query:sql:*'
      );
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'data_updated',
        'query:result:*'
      );
    });

    test('应该失效意图缓存', async () => {
      await cacheManager.invalidateIntents();

      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'metadata_synced',
        'query:intent:*'
      );
    });

    test('应该失效SQL缓存', async () => {
      await cacheManager.invalidateSQL();

      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'metadata_synced',
        'query:sql:*'
      );
    });

    test('应该失效结果缓存', async () => {
      await cacheManager.invalidateResults();

      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'data_updated',
        'query:result:*'
      );
    });
  });

  describe('统计信息', () => {
    test('应该正确计算命中率', async () => {
      // Mock 3次命中，2次未命中
      (multiLevelCache.get as jest.Mock)
        .mockResolvedValueOnce({ test: 'data' })
        .mockResolvedValueOnce({ test: 'data' })
        .mockRejectedValueOnce(new Error('miss'))
        .mockResolvedValueOnce({ test: 'data' })
        .mockRejectedValueOnce(new Error('miss'));

      await cacheManager.getIntent('query1');
      await cacheManager.getIntent('query2');
      await cacheManager.getIntent('query3');
      await cacheManager.getIntent('query4');
      await cacheManager.getIntent('query5');

      const stats = cacheManager.getStatistics();
      expect(stats.totalHits).toBe(3);
      expect(stats.totalMisses).toBe(2);
      expect(stats.hitRate).toBe(0.6); // 3/5 = 0.6
    });

    test('应该返回完整的缓存报告', () => {
      const report = cacheManager.getCacheReport();

      expect(report).toHaveProperty('statistics');
      expect(report).toHaveProperty('cacheStatus');
      expect(report.cacheStatus).toHaveProperty('hitRate');
    });

    test('应该能够重置统计信息', () => {
      // 模拟一些缓存操作
      (multiLevelCache.get as jest.Mock).mockResolvedValue({ test: 'data' });
      cacheManager.getIntent('test query');

      // 重置
      cacheManager.resetStatistics();

      const stats = cacheManager.getStatistics();
      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });
});
