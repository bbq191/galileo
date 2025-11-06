/**
 * MetadataOrchestrator 单元测试
 */

import 'reflect-metadata';
import { MetadataOrchestrator } from '../metadata.orchestrator';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { MetadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import type { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import type { MetadataRepository } from '@/lib/metadata/storage/metadata-repository';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import type { QueryIntent } from '@/lib/nlp/intent-recognizer';

describe('MetadataOrchestrator', () => {
  let orchestrator: MetadataOrchestrator;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockSyncService: jest.Mocked<MetadataSyncService>;
  let mockRetriever: jest.Mocked<MetadataRetriever>;
  let mockRepository: jest.Mocked<MetadataRepository>;
  let mockCacheInvalidation: jest.Mocked<CacheInvalidationService>;

  beforeEach(() => {
    // 创建 mock 对象
    mockConnectionManager = {
      hasConnection: jest.fn(),
      loadConnectionsFromDatabase: jest.fn(),
      getConnection: jest.fn(),
      testConnection: jest.fn(),
    } as any;

    mockSyncService = {
      syncDataSource: jest.fn(),
    } as any;

    mockRetriever = {
      retrieveContext: jest.fn(),
    } as any;

    mockRepository = {
      getLastSyncTime: jest.fn(),
      detectChanges: jest.fn(),
      getMetadata: jest.fn(),
      getStatistics: jest.fn(),
    } as any;

    mockCacheInvalidation = {
      invalidateMetadata: jest.fn(),
    } as any;

    // 创建编排器实例
    orchestrator = new MetadataOrchestrator(
      mockConnectionManager,
      mockSyncService,
      mockRetriever,
      mockRepository,
      mockCacheInvalidation
    );
  });

  describe('syncDataSource', () => {
    it('应该成功同步数据源元数据', async () => {
      const dataSourceId = 1;
      const mockSyncResult = {
        databaseCount: 2,
        tableCount: 10,
        columnCount: 50,
        relationshipCount: 5,
        changes: {
          added: { databases: 1, tables: 5, columns: 20 },
          updated: { databases: 1, tables: 3, columns: 15 },
          removed: { databases: 0, tables: 2, columns: 15 },
        },
      };

      mockConnectionManager.hasConnection.mockResolvedValue(true);
      mockSyncService.syncDataSource.mockResolvedValue(mockSyncResult);
      mockCacheInvalidation.invalidateMetadata.mockResolvedValue(undefined);

      const result = await orchestrator.syncDataSource({
        dataSourceId,
        inferRelationships: true,
        trackChanges: true,
      });

      expect(result.success).toBe(true);
      expect(result.databaseCount).toBe(2);
      expect(result.tableCount).toBe(10);
      expect(result.columnCount).toBe(50);
      expect(mockSyncService.syncDataSource).toHaveBeenCalledWith({
        dataSourceId,
        databases: undefined,
        inferRelationships: true,
        minConfidence: 0.70,
        trackChanges: true,
      });
      expect(mockCacheInvalidation.invalidateMetadata).toHaveBeenCalled();
    });

    it('应该在连接不存在时重新加载', async () => {
      const dataSourceId = 1;
      const mockSyncResult = {
        databaseCount: 1,
        tableCount: 5,
        columnCount: 20,
      };

      mockConnectionManager.hasConnection.mockResolvedValue(false);
      mockConnectionManager.loadConnectionsFromDatabase.mockResolvedValue(undefined);
      mockSyncService.syncDataSource.mockResolvedValue(mockSyncResult);
      mockCacheInvalidation.invalidateMetadata.mockResolvedValue(undefined);

      const result = await orchestrator.syncDataSource({ dataSourceId });

      expect(result.success).toBe(true);
      expect(mockConnectionManager.loadConnectionsFromDatabase).toHaveBeenCalled();
    });

    it('应该处理同步失败', async () => {
      const dataSourceId = 1;

      mockConnectionManager.hasConnection.mockResolvedValue(true);
      mockSyncService.syncDataSource.mockRejectedValue(new Error('Sync failed'));

      const result = await orchestrator.syncDataSource({ dataSourceId });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sync failed');
    });
  });

  describe('refreshMetadata', () => {
    it('应该强制全量刷新元数据', async () => {
      const dataSourceId = 1;
      const mockSyncResult = {
        databaseCount: 1,
        tableCount: 5,
        columnCount: 20,
      };

      mockConnectionManager.hasConnection.mockResolvedValue(true);
      mockSyncService.syncDataSource.mockResolvedValue(mockSyncResult);
      mockCacheInvalidation.invalidateMetadata.mockResolvedValue(undefined);

      const result = await orchestrator.refreshMetadata(dataSourceId);

      expect(result.success).toBe(true);
      // 验证 syncDataSource 被调用，且参数包含必要字段
      expect(mockSyncService.syncDataSource).toHaveBeenCalledWith({
        dataSourceId,
        databases: undefined,
        inferRelationships: true,
        minConfidence: 0.70,
        trackChanges: true,
      });
    });
  });

  describe('detectChanges', () => {
    it('应该检测到元数据变更', async () => {
      const dataSourceId = 1;
      const mockLastSync = new Date('2024-01-01');
      const mockChanges = [
        {
          database: 'testdb',
          table: 'users',
          changeType: 'modified',
        },
        {
          database: 'testdb',
          table: 'orders',
          changeType: 'added',
        },
      ];

      mockRepository.getLastSyncTime.mockResolvedValue(mockLastSync);
      mockRepository.detectChanges.mockResolvedValue(mockChanges);

      const result = await orchestrator.detectChanges(dataSourceId);

      expect(result.hasChanges).toBe(true);
      expect(result.changedDatabases).toContain('testdb');
      expect(result.changedTables).toHaveLength(2);
      expect(result.lastSyncTime).toEqual(mockLastSync);
    });

    it('应该在无变更时返回正确结果', async () => {
      const dataSourceId = 1;

      mockRepository.getLastSyncTime.mockResolvedValue(new Date());
      mockRepository.detectChanges.mockResolvedValue([]);

      const result = await orchestrator.detectChanges(dataSourceId);

      expect(result.hasChanges).toBe(false);
      expect(result.changedDatabases).toEqual([]);
      expect(result.changedTables).toEqual([]);
    });
  });

  describe('getMetadataContext', () => {
    it('应该获取查询意图的元数据上下文', async () => {
      const mockIntent: QueryIntent = {
        type: 'select',
        entities: ['users'],
        conditions: [],
      };
      const mockContext = {
        tables: [
          {
            tableName: 'users',
            databaseName: 'testdb',
            columns: [],
          },
        ],
        relationships: [],
        columns: [],
      };

      mockRetriever.retrieveContext.mockResolvedValue(mockContext);

      const result = await orchestrator.getMetadataContext(mockIntent);

      expect(result).toEqual(mockContext);
      expect(result.tables).toHaveLength(1);
      expect(mockRetriever.retrieveContext).toHaveBeenCalledWith(mockIntent);
    });
  });

  describe('validateConnection', () => {
    it('应该验证连接成功', async () => {
      const dataSourceId = 1;

      mockConnectionManager.getConnection.mockResolvedValue({} as any);
      mockConnectionManager.testConnection.mockResolvedValue(true);

      const result = await orchestrator.validateConnection(dataSourceId);

      expect(result).toBe(true);
    });

    it('应该处理连接验证失败', async () => {
      const dataSourceId = 1;

      mockConnectionManager.getConnection.mockRejectedValue(new Error('Connection not found'));

      const result = await orchestrator.validateConnection(dataSourceId);

      expect(result).toBe(false);
    });
  });

  describe('warmupCache', () => {
    it('应该预热元数据缓存', async () => {
      const dataSourceId = 1;
      const databases = ['testdb'];
      const mockMetadata = [
        { database: 'testdb', table: 'users' },
        { database: 'testdb', table: 'orders' },
      ];

      mockRepository.getMetadata.mockResolvedValue(mockMetadata);

      await orchestrator.warmupCache(dataSourceId, databases);

      expect(mockRepository.getMetadata).toHaveBeenCalledWith(dataSourceId, databases);
    });

    it('应该处理预热失败而不抛出错误', async () => {
      const dataSourceId = 1;

      mockRepository.getMetadata.mockRejectedValue(new Error('Warmup failed'));

      // 不应该抛出错误
      await expect(orchestrator.warmupCache(dataSourceId)).resolves.not.toThrow();
    });
  });

  describe('getStatistics', () => {
    it('应该获取元数据统计信息', async () => {
      const dataSourceId = 1;
      const mockStats = {
        databaseCount: 2,
        tableCount: 10,
        columnCount: 50,
      };

      mockRepository.getStatistics.mockResolvedValue(mockStats);

      const result = await orchestrator.getStatistics(dataSourceId);

      expect(result).toEqual(mockStats);
    });
  });
});
