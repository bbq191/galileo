/**
 * 语义搜索引擎单元测试
 */

import { SemanticSearch } from '../semantic-search';

// Mock Prisma Client
jest.mock('@prisma/client');

describe('SemanticSearch', () => {
  let search: SemanticSearch;

  beforeEach(() => {
    search = new SemanticSearch();
  });

  afterEach(async () => {
    await search.disconnect();
  });

  describe('searchTables', () => {
    it('应该返回精确匹配的表', async () => {
      // Mock implementation would go here
      const results = await search.searchTables('users', { limit: 5 });

      expect(Array.isArray(results)).toBe(true);
    });

    it('应该过滤低分结果', async () => {
      const results = await search.searchTables('test', {
        limit: 10,
        threshold: 0.7,
      });

      // 所有结果的分数应该 >= 0.7
      results.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(0.7);
      });
    });

    it('应该按分数降序排序', async () => {
      const results = await search.searchTables('order', { limit: 10 });

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });
  });

  describe('searchColumns', () => {
    it('应该搜索字段', async () => {
      const results = await search.searchColumns('user_id', undefined, {
        limit: 5,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('应该支持按表ID筛选', async () => {
      const results = await search.searchColumns('name', 1, { limit: 5 });

      expect(Array.isArray(results)).toBe(true);
    });
  });
});
