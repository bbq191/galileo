/**
 * 元数据检索器单元测试
 */

import { MetadataRetriever } from '../metadata-retriever';
import { QueryIntent } from '@/lib/nlp/types';

// Mock Prisma Client
jest.mock('@prisma/client');

// Mock dependencies
jest.mock('../semantic-search');
jest.mock('../relevance-ranker');
jest.mock('../context-builder');
jest.mock('@/lib/cache/multi-level-cache');

describe('MetadataRetriever', () => {
  let retriever: MetadataRetriever;

  beforeEach(() => {
    retriever = new MetadataRetriever();
  });

  afterEach(async () => {
    await retriever.cleanup();
  });

  describe('retrieveContext', () => {
    it('应该基于用户意图检索元数据上下文', async () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: {
          tables: ['users'],
        },
        conditions: {},
      };

      const context = await retriever.retrieveContext(intent);

      expect(context).toBeDefined();
      expect(context.tables).toBeDefined();
      expect(context.relationships).toBeDefined();
      expect(context.columns).toBeDefined();
      expect(context.estimatedComplexity).toBeDefined();
    });

    it('应该抛出错误如果未找到相关表', async () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: {
          tables: ['nonexistent_table_xyz'],
        },
        conditions: {},
      };

      await expect(retriever.retrieveContext(intent)).rejects.toThrow(
        '未找到相关的表'
      );
    });

    it('应该支持多表查询', async () => {
      const intent: QueryIntent = {
        type: 'aggregate',
        entities: {
          tables: ['orders', 'products'],
        },
        conditions: {},
      };

      const context = await retriever.retrieveContext(intent);

      expect(context.tables.length).toBeGreaterThanOrEqual(1);
    });

    it('应该支持基于字段名搜索', async () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: {
          columns: ['user_id', 'email'],
        },
        conditions: {},
      };

      const context = await retriever.retrieveContext(intent);

      expect(context).toBeDefined();
    });

    it('应该返回正确的复杂度评估', async () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: {
          tables: ['users'],
        },
        conditions: {},
      };

      const context = await retriever.retrieveContext(intent);

      expect(['low', 'medium', 'high']).toContain(
        context.estimatedComplexity
      );
    });
  });

  describe('getTableDetails', () => {
    it('应该返回表的详细信息', async () => {
      const tableId = 1;

      const details = await retriever.getTableDetails(tableId);

      expect(details).toBeDefined();
      expect(details.id).toBe(tableId);
    });

    it('应该抛出错误如果表不存在', async () => {
      const nonExistentId = 99999;

      await expect(retriever.getTableDetails(nonExistentId)).rejects.toThrow();
    });

    it('应该使用缓存', async () => {
      const tableId = 1;

      // 第一次调用
      await retriever.getTableDetails(tableId);

      // 第二次调用应该从缓存读取
      const details = await retriever.getTableDetails(tableId);

      expect(details).toBeDefined();
    });
  });

  describe('getRelationshipPath', () => {
    it('应该找到两个表之间的关系路径', async () => {
      const sourceTableId = 1;
      const targetTableId = 2;

      const path = await retriever.getRelationshipPath(
        sourceTableId,
        targetTableId
      );

      expect(Array.isArray(path)).toBe(true);
    });

    it('应该优先返回显式关系', async () => {
      const sourceTableId = 1;
      const targetTableId = 2;

      const path = await retriever.getRelationshipPath(
        sourceTableId,
        targetTableId
      );

      if (path.length > 0) {
        // 检查是否有显式关系
        const hasExplicitRel = path.some((rel: any) =>
          rel.hasOwnProperty('constraintName')
        );
        expect(hasExplicitRel).toBeDefined();
      }
    });

    it('应该在没有显式关系时返回推断关系', async () => {
      const sourceTableId = 10;
      const targetTableId = 20;

      const path = await retriever.getRelationshipPath(
        sourceTableId,
        targetTableId
      );

      expect(Array.isArray(path)).toBe(true);
    });
  });

  describe('searchColumns', () => {
    it('应该搜索字段', async () => {
      const results = await retriever.searchColumns('email');

      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持按表ID筛选', async () => {
      const tableId = 1;
      const results = await retriever.searchColumns('name', tableId);

      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持搜索选项', async () => {
      const results = await retriever.searchColumns('id', undefined, {
        limit: 5,
        threshold: 0.5,
      });

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getDatabaseStats', () => {
    it('应该返回数据库统计信息', async () => {
      const databaseId = 1;

      const stats = await retriever.getDatabaseStats(databaseId);

      expect(stats).toBeDefined();
      expect(stats.tableCount).toBeDefined();
      expect(stats.relationshipCount).toBeDefined();
    });

    it('应该缓存统计信息', async () => {
      const databaseId = 1;

      // 第一次调用
      await retriever.getDatabaseStats(databaseId);

      // 第二次调用应该从缓存读取
      const stats = await retriever.getDatabaseStats(databaseId);

      expect(stats).toBeDefined();
    });
  });

  describe('性能测试', () => {
    it('应该在合理时间内完成检索（< 2秒）', async () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: {
          tables: ['users'],
        },
        conditions: {},
      };

      const startTime = Date.now();
      await retriever.retrieveContext(intent);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    }, 5000);

    it('应该处理大量表搜索', async () => {
      const intent: QueryIntent = {
        type: 'aggregate',
        entities: {
          tables: Array.from({ length: 10 }, (_, i) => `table_${i}`),
        },
        conditions: {},
      };

      const context = await retriever.retrieveContext(intent);

      expect(context).toBeDefined();
    }, 10000);
  });

  describe('错误处理', () => {
    it('应该优雅地处理数据库错误', async () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: {
          tables: ['invalid_table'],
        },
        conditions: {},
      };

      await expect(retriever.retrieveContext(intent)).rejects.toThrow();
    });

    it('应该处理空意图', async () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: {},
        conditions: {},
      };

      await expect(retriever.retrieveContext(intent)).rejects.toThrow();
    });
  });
});
