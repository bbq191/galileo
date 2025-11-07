/**
 * CacheOrchestrator 单元测试
 */

import { CacheOrchestrator } from '../cache.orchestrator';
import type { MultiLevelCache } from '@/lib/cache/multi-level-cache';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import type { CacheWarmer } from '@/lib/cache/cache-warmer';
import type { DatabaseService } from '../../services/database.service';

// Mock 依赖服务
const mockMultiLevelCache = {
  set: jest.fn(),
  get: jest.fn(),
} as unknown as MultiLevelCache;

const mockQueryCacheManager = {
  clearAll: jest.fn(),
  getStatistics: jest.fn(),
  resetStatistics: jest.fn(),
} as unknown as QueryCacheManager;

const mockCacheInvalidation = {
  invalidateMetadata: jest.fn(),
  invalidateTable: jest.fn(),
} as unknown as CacheInvalidationService;

const mockCacheWarmer = {
  warmup: jest.fn(),
} as unknown as CacheWarmer;

const mockDbService = {
  prisma: {
    databaseMeta: {
      findMany: jest.fn(),
    },
    dataSource: {
      findMany: jest.fn(),
    },
    tableMeta: {
      findMany: jest.fn(),
    },
    auditLog: {
      groupBy: jest.fn(),
    },
  },
} as unknown as DatabaseService;

describe('CacheOrchestrator', () => {
  let orchestrator: CacheOrchestrator;

  beforeEach(() => {
    orchestrator = new CacheOrchestrator(
      mockMultiLevelCache,
      mockQueryCacheManager,
      mockCacheInvalidation,
      mockCacheWarmer,
      mockDbService
    );
    jest.clearAllMocks();
  });

  describe('缓存预热', () => {
    it('应该成功预热缓存', async () => {
      // 准备
      (mockCacheWarmer.warmup as jest.Mock).mockResolvedValue(undefined);

      // 执行
      const result = await orchestrator.warmupCache();

      // 断言
      expect(result.success).toBe(true);
      expect(mockCacheWarmer.warmup).toHaveBeenCalled();
    });
  });

  describe('缓存失效', () => {
    it('应该失效元数据缓存', async () => {
      // 准备
      (mockCacheInvalidation.invalidateMetadata as jest.Mock).mockResolvedValue(undefined);

      // 执行
      const result = await orchestrator.invalidateCache({
        dataSourceId: 1,
        pattern: 'metadata',
      });

      // 断言
      expect(result.success).toBe(true);
      expect(mockCacheInvalidation.invalidateMetadata).toHaveBeenCalledWith({
        dataSourceId: 1,
        databases: undefined,
      });
    });

    it('应该失效查询缓存', async () => {
      // 准备
      (mockQueryCacheManager.clearAll as jest.Mock).mockResolvedValue(undefined);

      // 执行
      const result = await orchestrator.invalidateCache({
        pattern: 'query',
      });

      // 断言
      expect(result.success).toBe(true);
      expect(mockQueryCacheManager.clearAll).toHaveBeenCalled();
    });
  });

  describe('获取缓存统计', () => {
    it('应该返回缓存统计信息', async () => {
      // 准备
      (mockQueryCacheManager.getStatistics as jest.Mock).mockResolvedValue({
        intentHits: 10,
        sqlHits: 20,
        resultHits: 30,
        totalQueries: 100,
      });

      // 执行
      const result = await orchestrator.getStatistics();

      // 断言
      expect(result.overall).toBeDefined();
      expect(result.layers.L1).toBeDefined();
      expect(result.layers.L2).toBeDefined();
      expect(result.queryCache).toBeDefined();
      expect(result.queryCache?.intentCacheHits).toBe(10);
    });
  });

  describe('缓存健康检查', () => {
    it('应该返回健康状态', async () => {
      // 准备
      (mockQueryCacheManager.getStatistics as jest.Mock).mockResolvedValue({});

      // 执行
      const result = await orchestrator.healthCheck();

      // 断言
      expect(result.L1).toBeDefined();
      expect(result.L2).toBeDefined();
      expect(typeof result.healthy).toBe('boolean');
    });
  });

  describe('预热数据源缓存', () => {
    it('应该成功预热数据源缓存', async () => {
      // 准备
      const mockDatabases = [
        {
          id: 1,
          databaseName: 'test_db',
          sourceId: 1,
          tables: [
            {
              id: 1,
              tableName: 'users',
              columns: [
                { id: 1, columnName: 'id' },
                { id: 2, columnName: 'name' },
              ],
            },
          ],
        },
      ];

      (mockDbService.prisma.databaseMeta.findMany as jest.Mock).mockResolvedValue(mockDatabases);
      (mockMultiLevelCache.set as jest.Mock).mockResolvedValue(undefined);

      // 执行
      const result = await orchestrator.warmupDataSource(1);

      // 断言
      expect(result.success).toBe(true);
      expect(mockMultiLevelCache.set).toHaveBeenCalled();
    });
  });
});
