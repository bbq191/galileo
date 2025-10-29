/**
 * 缓存失效服务单元测试
 */

import {
  CacheInvalidationService,
  InvalidationEvent,
  onMetadataSynced,
  onTableStructureChanged,
  onDatabaseSynced,
  onRelationshipChanged,
  clearAllCaches,
} from '../cache-invalidation';
import { queryCacheManager } from '../query-cache-manager';
import { multiLevelCache } from '../multi-level-cache';

// Mock dependencies
jest.mock('../query-cache-manager', () => ({
  queryCacheManager: {
    invalidateAll: jest.fn(),
    invalidateIntents: jest.fn(),
    invalidateSQL: jest.fn(),
    invalidateResults: jest.fn(),
    getStatistics: jest.fn(() => ({
      totalHits: 100,
      totalMisses: 50,
      hitRate: 0.67,
    })),
  },
}));

jest.mock('../multi-level-cache', () => ({
  multiLevelCache: {
    invalidate: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    getStats: jest.fn(() => ({
      l1Size: 50,
      hitRate: 0.7,
    })),
  },
}));

describe('CacheInvalidationService', () => {
  let service: CacheInvalidationService;

  beforeEach(() => {
    service = new CacheInvalidationService();
    jest.clearAllMocks();
  });

  describe('invalidate', () => {
    test('应该正确处理 METADATA_SYNCED 事件', async () => {
      await service.invalidate(InvalidationEvent.METADATA_SYNCED, {
        reason: '元数据同步测试',
      });

      // 应该失效查询缓存
      expect(queryCacheManager.invalidateIntents).toHaveBeenCalled();
      expect(queryCacheManager.invalidateSQL).toHaveBeenCalled();

      // 应该失效元数据缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith('metadata_synced');
    });

    test('应该正确处理 TABLE_STRUCTURE_CHANGED 事件', async () => {
      await service.invalidate(InvalidationEvent.TABLE_STRUCTURE_CHANGED);

      // 应该失效所有查询缓存
      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();

      // 应该失效元数据缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith('table_structure_changed');
    });

    test('应该正确处理 RELATIONSHIP_CHANGED 事件', async () => {
      await service.invalidate(InvalidationEvent.RELATIONSHIP_CHANGED);

      // 应该失效 SQL 缓存
      expect(queryCacheManager.invalidateSQL).toHaveBeenCalled();

      // 应该失效关系缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith('relationship_changed');
    });

    test('应该正确处理 DATABASE_SYNCED 事件', async () => {
      await service.invalidate(InvalidationEvent.DATABASE_SYNCED);

      // 应该失效所有查询缓存
      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();

      // 应该失效数据库缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith('database_synced');
    });

    test('应该正确处理 DATA_UPDATED 事件', async () => {
      await service.invalidate(InvalidationEvent.DATA_UPDATED);

      // 只应该失效结果缓存
      expect(queryCacheManager.invalidateResults).toHaveBeenCalled();
      expect(queryCacheManager.invalidateIntents).not.toHaveBeenCalled();
      expect(queryCacheManager.invalidateSQL).not.toHaveBeenCalled();
    });

    test('应该正确处理 MANUAL_SYNC 事件', async () => {
      await service.invalidate(InvalidationEvent.MANUAL_SYNC);

      // 应该失效所有查询缓存
      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();

      // 应该失效元数据缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith('manual_sync');
    });

    test('应该正确处理 MANUAL_CLEAR_ALL 事件', async () => {
      await service.invalidate(InvalidationEvent.MANUAL_CLEAR_ALL);

      // 应该清空所有缓存
      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();
      expect(multiLevelCache.clear).toHaveBeenCalled();
    });

    test('应该支持禁用查询缓存失效', async () => {
      await service.invalidate(InvalidationEvent.METADATA_SYNCED, {
        invalidateQueries: false,
      });

      // 不应该失效查询缓存
      expect(queryCacheManager.invalidateIntents).not.toHaveBeenCalled();
      expect(queryCacheManager.invalidateSQL).not.toHaveBeenCalled();

      // 仍应该失效元数据缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalled();
    });

    test('应该支持禁用元数据缓存失效', async () => {
      await service.invalidate(InvalidationEvent.METADATA_SYNCED, {
        invalidateMetadata: false,
      });

      // 应该失效查询缓存
      expect(queryCacheManager.invalidateIntents).toHaveBeenCalled();

      // 不应该失效元数据缓存
      expect(multiLevelCache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('invalidateTableCache', () => {
    test('应该失效特定表的缓存', async () => {
      await service.invalidateTableCache(123, 'orders');

      // 应该失效所有查询缓存
      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();

      // 应该失效表元数据缓存
      expect(multiLevelCache.delete).toHaveBeenCalledWith('table_meta', {
        id: 123,
        version: '*',
      });

      // 应该失效字段缓存
      expect(multiLevelCache.delete).toHaveBeenCalledWith('column_meta', {
        tableId: 123,
      });

      // 应该失效关系缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'table_structure_changed',
        'relationships:*:table:123*'
      );
    });
  });

  describe('invalidateDatabaseCache', () => {
    test('应该失效特定数据库的缓存', async () => {
      await service.invalidateDatabaseCache(456, 'sales_db');

      // 应该失效所有查询缓存
      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();

      // 应该失效数据库元数据缓存
      expect(multiLevelCache.delete).toHaveBeenCalledWith('database_meta', {
        id: 456,
      });

      // 应该失效表列表缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'database_synced',
        'tables:list:db:456*'
      );
    });
  });

  describe('invalidateRelationshipCache', () => {
    test('应该失效关系缓存', async () => {
      await service.invalidateRelationshipCache();

      // 应该失效 SQL 缓存
      expect(queryCacheManager.invalidateSQL).toHaveBeenCalled();

      // 应该失效关系图谱缓存
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'relationship_changed',
        'graph:*'
      );
      expect(multiLevelCache.invalidate).toHaveBeenCalledWith(
        'relationship_changed',
        'relationships:*'
      );
    });
  });

  describe('clearAllCaches', () => {
    test('应该清空所有缓存', async () => {
      await service.clearAllCaches();

      // 应该清空查询缓存
      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();

      // 应该清空元数据缓存
      expect(multiLevelCache.clear).toHaveBeenCalled();
    });
  });

  describe('getCacheStatus', () => {
    test('应该返回缓存状态报告', () => {
      const status = service.getCacheStatus();

      expect(status).toHaveProperty('queryCacheStats');
      expect(status).toHaveProperty('cacheStats');
      expect(status.queryCacheStats).toHaveProperty('hitRate');
      expect(status.cacheStats).toHaveProperty('hitRate');
    });
  });

  describe('便捷函数', () => {
    test('onMetadataSynced 应该正常工作', async () => {
      await onMetadataSynced('测试同步');

      expect(queryCacheManager.invalidateIntents).toHaveBeenCalled();
      expect(queryCacheManager.invalidateSQL).toHaveBeenCalled();
    });

    test('onTableStructureChanged 应该正常工作', async () => {
      await onTableStructureChanged(123, 'orders');

      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();
      expect(multiLevelCache.delete).toHaveBeenCalledWith('table_meta', {
        id: 123,
        version: '*',
      });
    });

    test('onDatabaseSynced 应该正常工作', async () => {
      await onDatabaseSynced(456, 'sales_db');

      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();
      expect(multiLevelCache.delete).toHaveBeenCalledWith('database_meta', {
        id: 456,
      });
    });

    test('onRelationshipChanged 应该正常工作', async () => {
      await onRelationshipChanged();

      expect(queryCacheManager.invalidateSQL).toHaveBeenCalled();
    });

    test('clearAllCaches 应该正常工作', async () => {
      await clearAllCaches();

      expect(queryCacheManager.invalidateAll).toHaveBeenCalled();
      expect(multiLevelCache.clear).toHaveBeenCalled();
    });
  });
});
