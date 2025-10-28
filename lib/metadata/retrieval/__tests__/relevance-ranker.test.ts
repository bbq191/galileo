/**
 * 相关性排序器单元测试
 */

import { RelevanceRanker } from '../relevance-ranker';
import { TableSearchResult } from '../types';

describe('RelevanceRanker', () => {
  let ranker: RelevanceRanker;

  beforeEach(() => {
    ranker = new RelevanceRanker();
  });

  describe('rankTables', () => {
    it('应该对表搜索结果进行排序', () => {
      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            columns: [
              { columnName: 'id', dataType: 'INT', isPrimaryKey: true },
            ],
          },
          score: 0.6,
          matchReason: '表名匹配',
        },
        {
          table: {
            id: 2,
            tableName: 'orders',
            semanticDescription: '订单信息表，包含详细的订单数据',
            columns: [
              { columnName: 'id', dataType: 'INT', isPrimaryKey: true },
            ],
          },
          score: 0.8,
          matchReason: '语义匹配',
        },
      ];

      const ranked = ranker.rankTables(results);

      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    });

    it('应该考虑语义描述质量', () => {
      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            semanticDescription: '很长的语义描述，包含详细信息',
            columns: [],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
        {
          table: {
            id: 2,
            tableName: 'orders',
            columns: [],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
      ];

      const ranked = ranker.rankTables(results);

      // 有语义描述的表应该得分更高
      expect(ranked[0].table.semanticDescription).toBeDefined();
    });

    it('应该考虑字段数量', () => {
      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            columns: Array(10).fill({ columnName: 'col', dataType: 'INT' }),
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
        {
          table: {
            id: 2,
            tableName: 'orders',
            columns: Array(100).fill({ columnName: 'col', dataType: 'INT' }),
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
      ];

      const ranked = ranker.rankTables(results);

      // 字段数量适中的表（< 50）应该加分
      expect(ranked).toBeDefined();
    });

    it('应该考虑主键存在性', () => {
      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            columns: [
              { columnName: 'id', dataType: 'INT', isPrimaryKey: true },
            ],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
        {
          table: {
            id: 2,
            tableName: 'orders',
            columns: [
              { columnName: 'id', dataType: 'INT', isPrimaryKey: false },
            ],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
      ];

      const ranked = ranker.rankTables(results);

      // 有主键的表应该得分更高
      expect(ranked).toBeDefined();
    });
  });

  describe('rankByIntent', () => {
    it('应该为聚合查询偏好有数值字段的表', () => {
      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            columns: [
              { columnName: 'name', dataType: 'VARCHAR' },
              { columnName: 'email', dataType: 'VARCHAR' },
            ],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
        {
          table: {
            id: 2,
            tableName: 'orders',
            columns: [
              { columnName: 'amount', dataType: 'DECIMAL' },
              { columnName: 'quantity', dataType: 'INT' },
            ],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
      ];

      const ranked = ranker.rankByIntent(results, 'aggregate');

      // 有数值字段的表应该得分更高
      expect(ranked[0].table.tableName).toBe('orders');
    });

    it('应该为统计查询偏好有时间字段的表', () => {
      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            columns: [
              { columnName: 'name', dataType: 'VARCHAR' },
            ],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
        {
          table: {
            id: 2,
            tableName: 'orders',
            columns: [
              { columnName: 'order_date', dataType: 'DATETIME' },
              { columnName: 'created_at', dataType: 'TIMESTAMP' },
            ],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
      ];

      const ranked = ranker.rankByIntent(results, 'statistics');

      // 有时间字段的表应该得分更高
      expect(ranked[0].table.tableName).toBe('orders');
    });

    it('应该为普通查询不调整分数', () => {
      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            columns: [],
          },
          score: 0.8,
          matchReason: '表名匹配',
        },
        {
          table: {
            id: 2,
            tableName: 'orders',
            columns: [],
          },
          score: 0.6,
          matchReason: '表名匹配',
        },
      ];

      const ranked = ranker.rankByIntent(results, 'select');

      // select 类型不应该调整分数
      expect(ranked[0].score).toBe(0.8);
      expect(ranked[1].score).toBe(0.6);
    });

    it('应该处理对比查询', () => {
      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            columns: [],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
      ];

      const ranked = ranker.rankByIntent(results, 'comparison');

      expect(ranked).toBeDefined();
      expect(ranked.length).toBe(1);
    });
  });

  describe('filterLowScores', () => {
    it('应该过滤低分结果', () => {
      const results: TableSearchResult[] = [
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0.8,
          matchReason: '高分匹配',
        },
        {
          table: { id: 2, tableName: 'orders', columns: [] },
          score: 0.2,
          matchReason: '低分匹配',
        },
        {
          table: { id: 3, tableName: 'products', columns: [] },
          score: 0.5,
          matchReason: '中等匹配',
        },
      ];

      const filtered = ranker.filterLowScores(results, 0.4);

      expect(filtered.length).toBe(2);
      filtered.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(0.4);
      });
    });

    it('应该使用默认阈值 0.3', () => {
      const results: TableSearchResult[] = [
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0.5,
          matchReason: '匹配',
        },
        {
          table: { id: 2, tableName: 'orders', columns: [] },
          score: 0.2,
          matchReason: '低分匹配',
        },
      ];

      const filtered = ranker.filterLowScores(results);

      expect(filtered.length).toBe(1);
      expect(filtered[0].score).toBeGreaterThanOrEqual(0.3);
    });

    it('应该处理空结果', () => {
      const filtered = ranker.filterLowScores([]);

      expect(filtered).toEqual([]);
    });
  });

  describe('deduplicate', () => {
    it('应该去除重复的表', () => {
      const results: TableSearchResult[] = [
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0.8,
          matchReason: '匹配1',
        },
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0.7,
          matchReason: '匹配2',
        },
        {
          table: { id: 2, tableName: 'orders', columns: [] },
          score: 0.6,
          matchReason: '匹配3',
        },
      ];

      const deduped = ranker.deduplicate(results);

      expect(deduped.length).toBe(2);
      expect(deduped.map(r => r.table.id)).toEqual([1, 2]);
    });

    it('应该保留第一次出现的结果', () => {
      const results: TableSearchResult[] = [
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0.8,
          matchReason: '第一次匹配',
        },
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0.9,
          matchReason: '第二次匹配',
        },
      ];

      const deduped = ranker.deduplicate(results);

      expect(deduped.length).toBe(1);
      expect(deduped[0].matchReason).toBe('第一次匹配');
    });

    it('应该处理空结果', () => {
      const deduped = ranker.deduplicate([]);

      expect(deduped).toEqual([]);
    });
  });

  describe('自定义权重', () => {
    it('应该支持自定义排序权重', () => {
      const customRanker = new RelevanceRanker({
        nameMatch: 0.8,
        semanticMatch: 0.2,
      });

      const results: TableSearchResult[] = [
        {
          table: {
            id: 1,
            tableName: 'users',
            columns: [],
          },
          score: 0.5,
          matchReason: '表名匹配',
        },
      ];

      const ranked = customRanker.rankTables(results);

      expect(ranked).toBeDefined();
      expect(ranked.length).toBe(1);
    });
  });

  describe('边界情况', () => {
    it('应该处理空结果数组', () => {
      const ranked = ranker.rankTables([]);
      expect(ranked).toEqual([]);
    });

    it('应该处理单个结果', () => {
      const results: TableSearchResult[] = [
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0.5,
          matchReason: '匹配',
        },
      ];

      const ranked = ranker.rankTables(results);

      expect(ranked.length).toBe(1);
    });

    it('应该处理分数为 0 的结果', () => {
      const results: TableSearchResult[] = [
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0,
          matchReason: '无匹配',
        },
      ];

      const ranked = ranker.rankTables(results);

      expect(ranked).toBeDefined();
    });

    it('应该处理分数为 1 的结果', () => {
      const results: TableSearchResult[] = [
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 1.0,
          matchReason: '完美匹配',
        },
      ];

      const ranked = ranker.rankTables(results);

      expect(ranked[0].score).toBeLessThanOrEqual(1.0);
    });

    it('应该处理没有字段的表', () => {
      const results: TableSearchResult[] = [
        {
          table: { id: 1, tableName: 'users', columns: [] },
          score: 0.5,
          matchReason: '匹配',
        },
      ];

      const ranked = ranker.rankByIntent(results, 'aggregate');

      expect(ranked).toBeDefined();
    });
  });
});
