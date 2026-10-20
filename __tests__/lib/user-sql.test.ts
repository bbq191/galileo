/**
 * 执行用户编辑后的 SQL：表引用解析、上下文加载、强制 enforce 校验
 */
import 'reflect-metadata';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { extractTableReferences } from '@/lib/metadata/retrieval/sql-table-references';

jest.mock('@/lib/di/container', () => ({ getContainer: () => ({ resolve: jest.fn() }) }));
jest.mock('@/lib/metadata/retrieval/semantic-search', () => ({ SemanticSearch: class {} }));
const buildMetadataContext = jest.fn(async (tables: any[]) => ({
  tables: tables.map((t) => ({ ...t, databaseName: t.database.databaseName, database: { sourceId: t.database.sourceId }, columns: [] })),
  relationships: [],
  columns: [],
  estimatedComplexity: 'low',
}));
jest.mock('@/lib/metadata/retrieval/context-builder', () => ({
  ContextBuilder: class {
    buildMetadataContext = buildMetadataContext;
  },
}));

import { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';

describe('extractTableReferences', () => {
  it.each([
    ['SELECT * FROM `shop`.`orders`', [{ database: 'shop', table: 'orders' }]],
    ['SELECT * FROM shop.orders o JOIN shop.users u ON o.uid = u.id', [
      { database: 'shop', table: 'orders' },
      { database: 'shop', table: 'users' },
    ]],
    ['SELECT * FROM orders', [{ table: 'orders' }]],
    ['select * from `orders` left join `users` on 1=1', [{ table: 'orders' }, { table: 'users' }]],
    ['SELECT * FROM (SELECT id FROM shop.orders) t', [{ database: 'shop', table: 'orders' }]],
    ['SELECT 1', []],
  ])('%s', (sql, expected) => {
    expect(extractTableReferences(sql)).toEqual(expected);
  });
});

describe('MetadataRetriever.retrieveContextForSQL', () => {
  const findMany = jest.fn<(args: any) => Promise<any[]>>();
  const retriever = () => new MetadataRetriever({ tableMeta: { findMany } } as any, {} as any);

  beforeEach(() => {
    findMany.mockReset();
  });

  it('按库名与数据源精确定位表', async () => {
    findMany.mockResolvedValue([{ id: 1, tableName: 'orders', database: { databaseName: 'shop', sourceId: 2 } }]);

    await retriever().retrieveContextForSQL('SELECT * FROM `shop`.`orders`', [2]);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tableName: 'orders', database: { sourceId: { in: [2] }, databaseName: 'shop' } },
    }));
    expect(buildMetadataContext).toHaveBeenCalled();
  });

  it.each([
    ['表不存在', [], '表 shop.orders 不在已同步的元数据中', 'SELECT * FROM shop.orders'],
    ['未写库名且同名表在多个库', [{ id: 1 }, { id: 2 }], '表 orders 在多个库中存在，请使用「库名.表名」指定', 'SELECT * FROM orders'],
  ])('%s：报错', async (_label, rows, message, sql) => {
    findMany.mockResolvedValue(rows);

    await expect(retriever().retrieveContextForSQL(sql)).rejects.toThrow(message);
  });

  it('识别不出表时报错', async () => {
    await expect(retriever().retrieveContextForSQL('SELECT 1')).rejects.toThrow('未能从 SQL 中识别出查询的表');
  });
});

describe('QueryOrchestrator.executeUserSQL', () => {
  const originalEnv = { ...process.env };
  const context = {
    tables: [{ databaseName: 'shop', tableName: 'orders', database: { sourceId: 2 }, columns: [] }],
    relationships: [],
    columns: [],
  };

  function createOrchestrator() {
    const deps = {
      intentRecognizer: {},
      entityResolver: {},
      timeParser: {},
      queryDomainInferencer: {},
      sqlGenerator: {},
      crossDbHandler: {},
      queryExecutor: {
        execute: jest.fn(async (..._args: any[]): Promise<any> => ({
          success: true, data: [{ n: 1 }], rowCount: 1, executionTime: 1, fromCache: false, metadata: { columns: [] },
        })),
      },
      resultFormatter: {},
      cacheManager: { getResult: jest.fn(), setResult: jest.fn() },
      metadataRetriever: { retrieveContextForSQL: jest.fn(async (..._args: any[]): Promise<any> => context) },
      sqlValidator: {
        validate: jest.fn(async (..._args: any[]): Promise<any> => ({
          isValid: true, errors: [], warnings: [], securityIssues: [], optimizationSuggestions: [], estimatedCost: { complexity: 'low' },
        })),
      },
    };
    const orchestrator = new QueryOrchestrator(...(Object.values(deps) as ConstructorParameters<typeof QueryOrchestrator>));
    return { orchestrator, deps };
  }

  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('成功：返回数据与涉及的数据源，不读写自然语言缓存', async () => {
    const { orchestrator, deps } = createOrchestrator();

    const result = await orchestrator.executeUserSQL('SELECT * FROM shop.orders', { dataSourceIds: [2] });

    expect(result).toMatchObject({ success: true, data: [{ n: 1 }], metadata: { generatedSQL: 'SELECT * FROM shop.orders', dataSourceIds: [2] } });
    expect(deps.metadataRetriever.retrieveContextForSQL).toHaveBeenCalledWith('SELECT * FROM shop.orders', [2]);
    expect(deps.cacheManager.getResult).not.toHaveBeenCalled();
    expect(deps.cacheManager.setResult).not.toHaveBeenCalled();
  });

  it('即使 SQL_VALIDATOR_MODE=shadow，用户 SQL 校验不通过也会被拦截', async () => {
    process.env.SQL_VALIDATOR_MODE = 'shadow';
    const { orchestrator, deps } = createOrchestrator();
    deps.sqlValidator.validate.mockResolvedValue({
      isValid: false, errors: [{ type: 'security', message: '检测到严重安全问题' }], warnings: [], securityIssues: [], optimizationSuggestions: [], estimatedCost: { complexity: 'low' },
    });

    const result = await orchestrator.executeUserSQL('SELECT SLEEP(10) FROM shop.orders');

    expect(result).toMatchObject({ success: false, errorCode: 'validation_failed' });
    expect(deps.queryExecutor.execute).not.toHaveBeenCalled();
  });

  it('SQL_VALIDATOR_MODE=off 时同样执行校验', async () => {
    process.env.SQL_VALIDATOR_MODE = 'off';
    const { orchestrator, deps } = createOrchestrator();

    await orchestrator.executeUserSQL('SELECT * FROM shop.orders');

    expect(deps.sqlValidator.validate).toHaveBeenCalled();
  });

  it('元数据加载失败：返回 validation_failed 与原因', async () => {
    const { orchestrator, deps } = createOrchestrator();
    deps.metadataRetriever.retrieveContextForSQL.mockRejectedValue(new Error('表 shop.secrets 不在已同步的元数据中'));

    const result = await orchestrator.executeUserSQL('SELECT * FROM shop.secrets');

    expect(result).toMatchObject({
      success: false,
      errorCode: 'validation_failed',
      error: '表 shop.secrets 不在已同步的元数据中',
    });
    expect(deps.sqlValidator.validate).not.toHaveBeenCalled();
  });
});
