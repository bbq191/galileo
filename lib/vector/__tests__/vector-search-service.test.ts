/**
 * 向量搜索服务测试
 */

import { VectorSearchService } from '../vector-search-service';

// Mock Prisma client
const mockPrisma = {
  tableMeta: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  columnMeta: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  $disconnect: jest.fn(),
};

// Mock the prisma client module
jest.mock('@/lib/prisma/client', () => mockPrisma);

describe('VectorSearchService', () => {
  let service: VectorSearchService;
  let prisma: any;

  beforeEach(() => {
    service = new VectorSearchService({
      enableRedis: false,
      dimension: 384,
    });

    prisma = mockPrisma;
  });

  afterEach(async () => {
    await service.close();
  });

  describe('buildTableText', () => {
    it('应该正确构建表的文本表示', () => {
      const table = {
        id: 1,
        tableName: 'users',
        tableComment: 'User information table',
        semanticDescription: 'Stores user account data',
        database: {
          databaseName: 'main_db',
        },
      };

      const text = (service as any).buildTableText(table);

      expect(text).toContain('users');
      expect(text).toContain('main_db');
      expect(text).toContain('User information table');
      expect(text).toContain('Stores user account data');
    });

    it('应该处理缺失的可选字段', () => {
      const table = {
        id: 1,
        tableName: 'users',
      };

      const text = (service as any).buildTableText(table);
      expect(text).toContain('users');
    });
  });

  describe('buildColumnText', () => {
    it('应该正确构建字段的文本表示', () => {
      const column = {
        id: 1,
        columnName: 'user_id',
        dataType: 'bigint',
        columnComment: 'User identifier',
        semanticDescription: 'Unique identifier for each user',
        table: {
          tableName: 'users',
          database: {
            databaseName: 'main_db',
          },
        },
      };

      const text = (service as any).buildColumnText(column);

      expect(text).toContain('user_id');
      expect(text).toContain('users');
      expect(text).toContain('main_db');
      expect(text).toContain('bigint');
      expect(text).toContain('User identifier');
    });
  });

  describe('indexTables', () => {
    it('应该为所有表建立索引', async () => {
      const mockTables = [
        {
          id: 1,
          tableName: 'users',
          tableComment: 'User table',
          database: { databaseName: 'main_db' },
        },
        {
          id: 2,
          tableName: 'products',
          tableComment: 'Product table',
          database: { databaseName: 'main_db' },
        },
      ];

      prisma.tableMeta.findMany.mockResolvedValue(mockTables);
      prisma.columnMeta.findMany.mockResolvedValue([]);

      await service.initialize();

      // 验证表向量存储不为空
      const stats = await service.getStats();
      expect(stats.tables.totalItems).toBeGreaterThan(0);
    });
  });

  describe('searchTables', () => {
    beforeEach(async () => {
      const mockTables = [
        {
          id: 1,
          tableName: 'users',
          tableComment: 'User information',
          semanticDescription: 'Stores user data',
          database: { databaseName: 'main_db' },
        },
        {
          id: 2,
          tableName: 'products',
          tableComment: 'Product catalog',
          semanticDescription: 'Product inventory data',
          database: { databaseName: 'shop_db' },
        },
      ];

      prisma.tableMeta.findMany.mockResolvedValue(mockTables);
      prisma.columnMeta.findMany.mockResolvedValue([]);

      await service.initialize();
    });

    it('应该搜索表', async () => {
      const results = await service.searchTables('user', { limit: 5 });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('应该返回相似度分数', async () => {
      const results = await service.searchTables('user data', { limit: 3 });

      results.forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    it('应该支持阈值过滤', async () => {
      const results = await service.searchTables('user', {
        threshold: 0.8,
      });

      results.forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('searchColumns', () => {
    beforeEach(async () => {
      const mockColumns = [
        {
          id: 1,
          columnName: 'user_id',
          dataType: 'bigint',
          columnComment: 'User ID',
          table: {
            tableName: 'users',
            database: { databaseName: 'main_db' },
          },
        },
        {
          id: 2,
          columnName: 'username',
          dataType: 'varchar',
          columnComment: 'User name',
          table: {
            tableName: 'users',
            database: { databaseName: 'main_db' },
          },
        },
      ];

      prisma.tableMeta.findMany.mockResolvedValue([]);
      prisma.columnMeta.findMany.mockResolvedValue(mockColumns);

      await service.initialize();
    });

    it('应该搜索字段', async () => {
      const results = await service.searchColumns('user id', { limit: 5 });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('upsertTableVector', () => {
    it('应该添加新表向量', async () => {
      const mockTable = {
        id: 100,
        tableName: 'new_table',
        tableComment: 'New table',
        database: { databaseName: 'test_db' },
      };

      prisma.tableMeta.findUnique.mockResolvedValue(mockTable);
      prisma.tableMeta.findMany.mockResolvedValue([]);
      prisma.columnMeta.findMany.mockResolvedValue([]);

      await service.initialize();
      await service.upsertTableVector(100);

      // 验证表已添加
      const stats = await service.getStats();
      expect(stats.tables.totalItems).toBeGreaterThan(0);
    });

    it('应该更新现有表向量', async () => {
      const mockTable = {
        id: 1,
        tableName: 'users',
        tableComment: 'Updated comment',
        database: { databaseName: 'main_db' },
      };

      prisma.tableMeta.findUnique.mockResolvedValue(mockTable);
      prisma.tableMeta.findMany.mockResolvedValue([mockTable]);
      prisma.columnMeta.findMany.mockResolvedValue([]);

      await service.initialize();
      await service.upsertTableVector(1);

      const stats = await service.getStats();
      expect(stats.tables.totalItems).toBeGreaterThan(0);
    });

    it('应该抛出错误当表不存在', async () => {
      prisma.tableMeta.findUnique.mockResolvedValue(null);
      prisma.tableMeta.findMany.mockResolvedValue([]);
      prisma.columnMeta.findMany.mockResolvedValue([]);

      await service.initialize();

      await expect(service.upsertTableVector(999)).rejects.toThrow(
        'Table not found'
      );
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', async () => {
      prisma.tableMeta.findMany.mockResolvedValue([
        {
          id: 1,
          tableName: 'users',
          database: { databaseName: 'main_db' },
        },
      ]);
      prisma.columnMeta.findMany.mockResolvedValue([
        {
          id: 1,
          columnName: 'user_id',
          table: { tableName: 'users', database: { databaseName: 'main_db' } },
        },
      ]);

      await service.initialize();
      const stats = await service.getStats();

      expect(stats).toBeDefined();
      expect(stats.tables).toBeDefined();
      expect(stats.columns).toBeDefined();
      expect(stats.total).toBeDefined();
      expect(stats.total.items).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rebuildIndex', () => {
    it('应该重建索引', async () => {
      prisma.tableMeta.findMany.mockResolvedValue([
        {
          id: 1,
          tableName: 'users',
          database: { databaseName: 'main_db' },
        },
      ]);
      prisma.columnMeta.findMany.mockResolvedValue([]);

      await service.initialize();
      await service.rebuildIndex();

      const stats = await service.getStats();
      expect(stats.tables.totalItems).toBeGreaterThan(0);
    });
  });
});
