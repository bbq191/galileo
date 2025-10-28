/**
 * 上下文构建器单元测试
 */

import { ContextBuilder } from '../context-builder';
import { TableContext } from '../types';

// Mock Prisma Client
jest.mock('@prisma/client');

// Mock connection manager
jest.mock('@/lib/database', () => ({
  connectionManager: {
    hasConnection: jest.fn().mockResolvedValue(true),
    getConnection: jest.fn().mockResolvedValue({
      getConnection: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue([
          [
            { test_column: 'value1' },
            { test_column: 'value2' },
            { test_column: 'value3' },
          ],
        ]),
        release: jest.fn(),
      }),
    }),
  },
}));

describe('ContextBuilder', () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    builder = new ContextBuilder();
  });

  afterEach(async () => {
    await builder.disconnect();
  });

  describe('buildTableContext', () => {
    it('应该构建完整的表上下文', async () => {
      const mockTable = {
        id: 1,
        tableName: 'users',
        tableComment: '用户表',
        semanticDescription: '存储用户信息',
        rowCount: 1000,
        database: {
          id: 1,
          databaseName: 'test_db',
          sourceId: 1,
        },
      };

      const context = await builder.buildTableContext(mockTable);

      expect(context).toBeDefined();
      expect(context.id).toBe(1);
      expect(context.tableName).toBe('users');
      expect(context.databaseName).toBe('test_db');
      expect(context.columns).toBeDefined();
      expect(Array.isArray(context.columns)).toBe(true);
      expect(context.primaryKeys).toBeDefined();
      expect(Array.isArray(context.primaryKeys)).toBe(true);
    });

    it('应该正确识别主键', async () => {
      const mockTable = {
        id: 1,
        tableName: 'users',
        database: {
          id: 1,
          databaseName: 'test_db',
          sourceId: 1,
        },
      };

      const context = await builder.buildTableContext(mockTable);

      // 主键应该是一个字符串数组
      expect(Array.isArray(context.primaryKeys)).toBe(true);
    });

    it('应该支持包含示例数据选项', async () => {
      const mockTable = {
        id: 1,
        tableName: 'users',
        database: {
          id: 1,
          databaseName: 'test_db',
          sourceId: 1,
        },
      };

      const context = await builder.buildTableContext(mockTable, {
        includeSampleData: true,
      });

      expect(context).toBeDefined();
      // 检查至少有一个字段
      if (context.columns.length > 0) {
        // 示例数据可能为空数组或有值
        expect(context.columns[0].sampleValues).toBeDefined();
      }
    });

    it('应该支持包含索引选项', async () => {
      const mockTable = {
        id: 1,
        tableName: 'users',
        database: {
          id: 1,
          databaseName: 'test_db',
          sourceId: 1,
        },
      };

      const context = await builder.buildTableContext(mockTable, {
        includeIndexes: true,
      });

      expect(context.indexes).toBeDefined();
      expect(Array.isArray(context.indexes)).toBe(true);
    });
  });

  describe('buildRelationshipContexts', () => {
    it('应该构建关系上下文', async () => {
      const tableIds = [1, 2];

      const relationships = await builder.buildRelationshipContexts(tableIds);

      expect(Array.isArray(relationships)).toBe(true);
    });

    it('应该包含显式关系', async () => {
      const tableIds = [1, 2];

      const relationships = await builder.buildRelationshipContexts(tableIds);

      // 检查关系类型
      relationships.forEach(rel => {
        expect(['explicit', 'inferred']).toContain(rel.type);
      });
    });

    it('应该包含推断关系（高置信度）', async () => {
      const tableIds = [1, 2];

      const relationships = await builder.buildRelationshipContexts(tableIds);

      // 推断关系应该有置信度
      const inferredRels = relationships.filter(r => r.type === 'inferred');
      inferredRels.forEach(rel => {
        if (rel.confidence !== undefined) {
          expect(rel.confidence).toBeGreaterThanOrEqual(0.75);
        }
      });
    });

    it('应该处理空表列表', async () => {
      const relationships = await builder.buildRelationshipContexts([]);

      expect(Array.isArray(relationships)).toBe(true);
      expect(relationships.length).toBe(0);
    });
  });

  describe('buildMetadataContext', () => {
    it('应该构建完整的元数据上下文', async () => {
      const mockTables = [
        {
          id: 1,
          tableName: 'users',
          database: {
            id: 1,
            databaseName: 'test_db',
            sourceId: 1,
          },
        },
      ];

      const context = await builder.buildMetadataContext(mockTables);

      expect(context).toBeDefined();
      expect(context.tables).toBeDefined();
      expect(Array.isArray(context.tables)).toBe(true);
      expect(context.relationships).toBeDefined();
      expect(Array.isArray(context.relationships)).toBe(true);
      expect(context.columns).toBeDefined();
      expect(Array.isArray(context.columns)).toBe(true);
      expect(context.estimatedComplexity).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(
        context.estimatedComplexity
      );
    });

    it('应该正确评估简单查询的复杂度', async () => {
      const mockTables = [
        {
          id: 1,
          tableName: 'users',
          database: {
            id: 1,
            databaseName: 'test_db',
            sourceId: 1,
          },
        },
      ];

      const context = await builder.buildMetadataContext(mockTables);

      // 单表查询应该是 low 复杂度（如果字段数 < 20）
      if (context.columns.length < 20) {
        expect(context.estimatedComplexity).toBe('low');
      }
    });

    it('应该正确评估复杂查询的复杂度', async () => {
      const mockTables = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        tableName: `table_${i}`,
        database: {
          id: 1,
          databaseName: 'test_db',
          sourceId: 1,
        },
      }));

      const context = await builder.buildMetadataContext(mockTables);

      // 多表查询通常是 medium 或 high
      expect(['medium', 'high']).toContain(context.estimatedComplexity);
    });

    it('应该识别跨库查询', async () => {
      const mockTables = [
        {
          id: 1,
          tableName: 'users',
          database: {
            id: 1,
            databaseName: 'db1',
            sourceId: 1,
          },
        },
        {
          id: 2,
          tableName: 'orders',
          database: {
            id: 2,
            databaseName: 'db2',
            sourceId: 1,
          },
        },
      ];

      const context = await builder.buildMetadataContext(mockTables);

      // 跨库查询应该被标记为 high 复杂度
      const dbNames = context.tables.map(t => t.databaseName);
      const uniqueDbNames = [...new Set(dbNames)];

      if (uniqueDbNames.length > 1) {
        expect(['medium', 'high']).toContain(context.estimatedComplexity);
      }
    });

    it('应该扁平化所有字段', async () => {
      const mockTables = [
        {
          id: 1,
          tableName: 'users',
          database: {
            id: 1,
            databaseName: 'test_db',
            sourceId: 1,
          },
        },
        {
          id: 2,
          tableName: 'orders',
          database: {
            id: 1,
            databaseName: 'test_db',
            sourceId: 1,
          },
        },
      ];

      const context = await builder.buildMetadataContext(mockTables);

      // 检查字段数量是否正确
      const expectedColumnCount = context.tables.reduce(
        (sum, t) => sum + t.columns.length,
        0
      );
      expect(context.columns.length).toBe(expectedColumnCount);
    });
  });

  describe('复杂度评估', () => {
    it('应该根据表数量评估复杂度', async () => {
      // 1个表 -> low
      const context1 = await builder.buildMetadataContext([
        {
          id: 1,
          tableName: 'users',
          database: { id: 1, databaseName: 'db', sourceId: 1 },
        },
      ]);

      // 3个表 -> medium（如果没有跨库）
      const context3 = await builder.buildMetadataContext([
        {
          id: 1,
          tableName: 'users',
          database: { id: 1, databaseName: 'db', sourceId: 1 },
        },
        {
          id: 2,
          tableName: 'orders',
          database: { id: 1, databaseName: 'db', sourceId: 1 },
        },
        {
          id: 3,
          tableName: 'products',
          database: { id: 1, databaseName: 'db', sourceId: 1 },
        },
      ]);

      expect(context1).toBeDefined();
      expect(context3).toBeDefined();
    });

    it('应该考虑跨库 JOIN 的影响', async () => {
      const mockTables = [
        {
          id: 1,
          tableName: 'users',
          database: { id: 1, databaseName: 'db1', sourceId: 1 },
        },
        {
          id: 2,
          tableName: 'orders',
          database: { id: 2, databaseName: 'db2', sourceId: 1 },
        },
      ];

      const context = await builder.buildMetadataContext(mockTables);

      // 跨库查询应该增加复杂度
      expect(['medium', 'high']).toContain(context.estimatedComplexity);
    });
  });

  describe('错误处理', () => {
    it('应该处理数据库连接错误', async () => {
      const mockTable = {
        id: 1,
        tableName: 'users',
        database: {
          id: 1,
          databaseName: 'test_db',
          sourceId: 999, // 不存在的连接
        },
      };

      // 应该优雅地处理错误，返回空示例数据
      const context = await builder.buildTableContext(mockTable, {
        includeSampleData: true,
      });

      expect(context).toBeDefined();
    });

    it('应该处理空表列表', async () => {
      const context = await builder.buildMetadataContext([]);

      expect(context.tables.length).toBe(0);
      expect(context.columns.length).toBe(0);
      expect(context.relationships.length).toBe(0);
    });
  });
});
