/**
 * SemanticSearch 的数据源过滤
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const tableFindMany = jest.fn<(args: any) => Promise<any[]>>();
const columnFindMany = jest.fn<(args: any) => Promise<any[]>>();

jest.mock('@/lib/prisma/client', () => ({
  __esModule: true,
  default: { tableMeta: { findMany: tableFindMany }, columnMeta: { findMany: columnFindMany } },
}));
jest.mock('@/lib/vector/vector-search-service', () => ({ VectorSearchService: class {} }));

import { SemanticSearch } from '@/lib/metadata/retrieval/semantic-search';

beforeEach(() => {
  tableFindMany.mockReset();
  columnFindMany.mockReset();
  tableFindMany.mockResolvedValue([]);
  columnFindMany.mockResolvedValue([]);
});

const search = () => new SemanticSearch({ enableVectorSearch: false });

describe('SemanticSearch - 数据源过滤', () => {
  it('searchTables：精确与模糊匹配都带上 sourceId 条件', async () => {
    await search().searchTables('orders', { dataSourceId: 3 });

    const [exact, fuzzy] = tableFindMany.mock.calls.map(([args]) => args.where);
    expect(exact.database).toEqual({ sourceId: 3 });
    expect(fuzzy.AND).toEqual([{ database: { sourceId: 3 } }]);
  });

  it('同时指定业务域与数据源时合并为同一个条件', async () => {
    await search().searchTables('orders', { dataSourceId: 3, domainIds: [7] });

    expect(tableFindMany.mock.calls[0][0].where.database).toEqual({ domainId: { in: [7] }, sourceId: 3 });
  });

  it('未指定数据源时不添加条件', async () => {
    await search().searchTables('orders');

    expect(tableFindMany.mock.calls[0][0].where.database).toBeUndefined();
  });

  it('searchTablesInBatch：精确与模糊查询都带上 sourceId 条件', async () => {
    await search().searchTablesInBatch(['orders', 'users'], { dataSourceId: 3 });

    for (const [args] of tableFindMany.mock.calls) {
      expect(args.where.database).toEqual({ sourceId: 3 });
    }
    expect(tableFindMany).toHaveBeenCalledTimes(2);
  });

  it('searchColumns：按字段所属表的数据源过滤', async () => {
    await search().searchColumns('amount', undefined, { dataSourceId: 3 });

    expect(columnFindMany.mock.calls[0][0].where.table).toEqual({ database: { sourceId: 3 } });
  });

  it('内存缓存按数据源区分', async () => {
    const s = search();
    await s.searchTables('orders', { dataSourceId: 1 });
    const callsAfterFirst = tableFindMany.mock.calls.length;

    await s.searchTables('orders', { dataSourceId: 2 });
    expect(tableFindMany.mock.calls.length).toBeGreaterThan(callsAfterFirst);

    const callsAfterSecond = tableFindMany.mock.calls.length;
    await s.searchTables('orders', { dataSourceId: 2 });
    expect(tableFindMany.mock.calls.length).toBe(callsAfterSecond);
  });
});
