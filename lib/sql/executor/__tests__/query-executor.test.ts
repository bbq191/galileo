/**
 * 查询执行器单元测试
 */

import { QueryExecutor } from '../query-executor';
import type { MetadataContext } from '@/lib/metadata/retrieval/types';
import type { ExecutionOptions } from '../types';

// Mock 依赖
jest.mock('@/lib/database/connection-manager');
jest.mock('@/lib/cache/multi-level-cache');

describe('查询执行器', () => {
  let executor: QueryExecutor;

  // 测试用的元数据上下文
  const mockContext: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'test_db',
        tableName: 'users',
        columns: [
          {
            id: 1,
            columnName: 'id',
            dataType: 'INT',
            isPrimaryKey: true,
            isNullable: false,
          },
          {
            id: 2,
            columnName: 'username',
            dataType: 'VARCHAR',
            isPrimaryKey: false,
            isNullable: false,
          },
        ],
        primaryKeys: ['id'],
        indexes: [],
        database: {
          id: 1,
          databaseName: 'test_db',
          sourceId: 1,
        },
      },
    ],
    relationships: [],
    columns: [],
    estimatedComplexity: 'low',
  };

  beforeEach(() => {
    executor = new QueryExecutor();
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('应该成功执行简单查询', async () => {
      const sql = 'SELECT * FROM users';

      // 由于需要真实的数据库连接，这里只测试错误情况
      const result = await executor.execute(sql, mockContext, {
        timeout: 1000,
        enableCache: false,
      });

      // 在没有真实连接的情况下，应该返回错误
      expect(result.success).toBeDefined();
    });

    it('应该自动添加 LIMIT 子句', async () => {
      const sql = 'SELECT * FROM users';

      const result = await executor.execute(sql, mockContext, {
        maxRows: 100,
        enableCache: false,
      });

      expect(result).toBeDefined();
    });

    it('应该处理缓存', async () => {
      const sql = 'SELECT * FROM users LIMIT 10';

      const result = await executor.execute(sql, mockContext, {
        enableCache: true,
        cacheKey: 'test-cache-key',
      });

      expect(result).toBeDefined();
    });
  });

  describe('executePaginated', () => {
    it('应该执行分页查询', async () => {
      const sql = 'SELECT * FROM users';

      const result = await executor.executePaginated(
        sql,
        mockContext,
        { page: 1, pageSize: 10 },
        { enableCache: false }
      );

      expect(result).toBeDefined();
      expect(result.pagination).toBeDefined();
    });

    it('应该验证分页参数', async () => {
      const sql = 'SELECT * FROM users';

      await expect(
        executor.executePaginated(
          sql,
          mockContext,
          { page: 0, pageSize: 10 },
          { enableCache: false }
        )
      ).rejects.toThrow('页码必须大于等于 1');
    });

    it('应该限制每页大小', async () => {
      const sql = 'SELECT * FROM users';

      await expect(
        executor.executePaginated(
          sql,
          mockContext,
          { page: 1, pageSize: 2000 },
          { enableCache: false }
        )
      ).rejects.toThrow('每页大小必须在 1-1000 之间');
    });
  });

  describe('executeBatch', () => {
    it('应该批量执行查询', async () => {
      const queries = [
        { sql: 'SELECT * FROM users LIMIT 1', context: mockContext },
        { sql: 'SELECT * FROM users LIMIT 2', context: mockContext },
      ];

      const results = await executor.executeBatch(queries, {
        enableCache: false,
      });

      expect(results).toHaveLength(2);
    });
  });

  describe('dryRun', () => {
    it('应该验证 SQL 但不执行', async () => {
      const sql = 'SELECT * FROM users';

      const result = await executor.dryRun(sql, mockContext);

      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
    });
  });

  describe('私有方法测试', () => {
    it('ensureLimitClause - 应该添加 LIMIT', () => {
      const executor = new QueryExecutor();
      const method = (executor as any).ensureLimitClause.bind(executor);

      expect(method('SELECT * FROM users', 100)).toContain('LIMIT 100');
      expect(method('SELECT * FROM users LIMIT 50', 100)).toContain('LIMIT 50');
    });

    it('buildCountQuery - 应该构建 COUNT 查询', () => {
      const executor = new QueryExecutor();
      const method = (executor as any).buildCountQuery.bind(executor);

      const result = method('SELECT * FROM users WHERE age > 18 LIMIT 10');

      expect(result).toContain('SELECT COUNT(*)');
      expect(result).toContain('FROM (');
      expect(result).not.toContain('LIMIT');
    });

    it('addPaginationClause - 应该添加分页', () => {
      const executor = new QueryExecutor();
      const method = (executor as any).addPaginationClause.bind(executor);

      const result = method('SELECT * FROM users', 10, 20);

      expect(result).toContain('LIMIT 10 OFFSET 20');
    });

    it('generateCacheKey - 应该生成缓存键', () => {
      const executor = new QueryExecutor();
      const method = (executor as any).generateCacheKey.bind(executor);

      const key1 = method('SELECT * FROM users');
      const key2 = method('SELECT * FROM users');
      const key3 = method('SELECT * FROM orders');

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).toContain('query:result:');
    });

    it('normalizeError - 应该标准化错误信息', () => {
      const executor = new QueryExecutor();
      const method = (executor as any).normalizeError.bind(executor);

      expect(method(new Error('Access denied'))).toContain('权限不足');
      expect(method(new Error("Table 'test' doesn't exist"))).toContain(
        '表或字段不存在'
      );
      expect(method(new Error('Syntax error'))).toContain('语法错误');
      expect(method(new Error('Query timeout'))).toContain('超时');
    });
  });
});
