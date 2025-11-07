/**
 * DataSourceOrchestrator 单元测试
 */

import { DataSourceOrchestrator } from '../datasource.orchestrator';
import type { DatabaseService } from '../../services/database.service';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { MetadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';

// Mock 依赖服务
const mockDbService = {
  prisma: {
    dataSource: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    databaseMeta: {
      findMany: jest.fn(),
    },
    tableMeta: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: {
      groupBy: jest.fn(),
    },
  },
} as unknown as DatabaseService;

const mockConnectionManager = {
  hasConnection: jest.fn(),
  createConnection: jest.fn(),
  removeConnection: jest.fn(),
  testConnection: jest.fn(),
  getConnectionStats: jest.fn(),
  loadConnectionsFromDatabase: jest.fn(),
} as unknown as ConnectionManager;

const mockSyncService = {
  syncDataSource: jest.fn(),
} as unknown as MetadataSyncService;

const mockCacheInvalidation = {
  invalidateMetadata: jest.fn(),
} as unknown as CacheInvalidationService;

describe('DataSourceOrchestrator', () => {
  let orchestrator: DataSourceOrchestrator;

  beforeEach(() => {
    orchestrator = new DataSourceOrchestrator(
      mockDbService,
      mockConnectionManager,
      mockSyncService,
      mockCacheInvalidation
    );
    jest.clearAllMocks();
  });

  describe('创建数据源', () => {
    it('应该成功创建数据源', async () => {
      // 准备
      const options = {
        name: 'test-db',
        type: 'mysql' as const,
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'password',
        databases: ['test_db'],
        autoSync: false,
      };

      (mockDbService.prisma.dataSource.findUnique as jest.Mock).mockResolvedValue(null);
      (mockDbService.prisma.dataSource.create as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'test-db',
        type: 'mysql',
        status: 'inactive',
      });
      (mockDbService.prisma.dataSource.update as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'test-db',
        type: 'mysql',
        status: 'active',
      });
      (mockConnectionManager.createConnection as jest.Mock).mockResolvedValue(undefined);
      (mockConnectionManager.testConnection as jest.Mock).mockResolvedValue({
        healthy: true,
        responseTime: 10,
        checkedAt: new Date(),
      });

      // 执行
      const result = await orchestrator.createDataSource(options);

      // 断言
      expect(result.success).toBe(true);
      expect(result.id).toBe(1);
      expect(result.status).toBe('active');
      expect(mockDbService.prisma.dataSource.create).toHaveBeenCalled();
      expect(mockConnectionManager.createConnection).toHaveBeenCalled();
      expect(mockConnectionManager.testConnection).toHaveBeenCalled();
    });

    it('应该在名称已存在时返回错误', async () => {
      // 准备
      (mockDbService.prisma.dataSource.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        name: 'test-db',
      });

      // 执行
      const result = await orchestrator.createDataSource({
        name: 'test-db',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'password',
      });

      // 断言
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });

  describe('获取数据源列表', () => {
    it('应该返回数据源列表', async () => {
      // 准备
      const mockDataSources = [
        {
          id: 1,
          name: 'test-db',
          type: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'root',
          status: 'active',
          targetDatabases: ['test_db'],
          lastSyncAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockDbService.prisma.dataSource.findMany as jest.Mock).mockResolvedValue(mockDataSources);
      (mockConnectionManager.hasConnection as jest.Mock).mockResolvedValue(true);
      (mockConnectionManager.getConnectionStats as jest.Mock).mockResolvedValue({
        activeConnections: 2,
        idleConnections: 3,
        totalConnections: 5,
        waitingRequests: 0,
      });

      // 执行
      const result = await orchestrator.listDataSources();

      // 断言
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-db');
      expect(result[0].isConnected).toBe(true);
      expect(result[0].connectionStats).toBeDefined();
    });
  });

  describe('删除数据源', () => {
    it('应该成功删除数据源', async () => {
      // 准备
      const mockDataSource = {
        id: 1,
        name: 'test-db',
        type: 'mysql',
      };

      (mockDbService.prisma.dataSource.findUnique as jest.Mock).mockResolvedValue(mockDataSource);
      (mockConnectionManager.hasConnection as jest.Mock).mockResolvedValue(true);
      (mockConnectionManager.removeConnection as jest.Mock).mockResolvedValue(undefined);
      (mockDbService.prisma.dataSource.delete as jest.Mock).mockResolvedValue(mockDataSource);
      (mockCacheInvalidation.invalidateMetadata as jest.Mock).mockResolvedValue(undefined);

      // 执行
      const result = await orchestrator.deleteDataSource(1);

      // 断言
      expect(result.success).toBe(true);
      expect(result.id).toBe(1);
      expect(mockConnectionManager.removeConnection).toHaveBeenCalled();
      expect(mockDbService.prisma.dataSource.delete).toHaveBeenCalled();
      expect(mockCacheInvalidation.invalidateMetadata).toHaveBeenCalled();
    });
  });
});
