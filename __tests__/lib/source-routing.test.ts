/**
 * 多数据源路由：source-router 纯函数 + QueryExecutor 集成
 */
import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { collectSourceIds, planSources } from '@/lib/sql/executor/source-router';
import { QueryExecutor } from '@/lib/sql/executor/query-executor';
import { ExecutorError, ExecutorErrorType } from '@/lib/sql/executor/types';

function table(databaseName: string, tableName: string, sourceId?: number) {
  return { databaseName, tableName, database: sourceId ? { databaseName, sourceId } : undefined };
}

function contextOf(...tables: any[]): any {
  return { tables, relationships: [], columns: [], estimatedComplexity: 'low' };
}

describe('collectSourceIds', () => {
  it('按首次出现顺序去重', () => {
    const ctx = contextOf(table('a', 't1', 2), table('b', 't2', 1), table('a', 't3', 2));
    expect(collectSourceIds(ctx)).toEqual(['2', '1']);
  });

  it('没有表或缺少数据源 ID 时报错', () => {
    expect(() => collectSourceIds(contextOf())).toThrow('上下文中没有表信息');
    expect(() => collectSourceIds(contextOf(table('a', 't1')))).toThrow('无法获取表 t1 的数据源 ID');
  });
});

describe('planSources', () => {
  const ctx = contextOf(table('shop', 'orders', 1), table('crm', 'users', 2));

  it('同一实例（host 忽略大小写）：使用第一个数据源执行', () => {
    const plan = planSources(
      [
        { sourceId: '2', host: 'DB.internal', port: 3306 },
        { sourceId: '1', host: 'db.internal ', port: 3306 },
      ],
      ctx
    );
    expect(plan).toEqual({ sourceId: '2', sourceIds: ['1', '2'] });
  });

  it.each([
    ['host 不同', { host: 'db-b.internal', port: 3306 }],
    ['port 不同', { host: 'db.internal', port: 3307 }],
  ])('%s：抛出 CROSS_SOURCE_UNSUPPORTED，并列出各数据源涉及的库', (_label, other) => {
    const run = () =>
      planSources([{ sourceId: '1', host: 'db.internal', port: 3306 }, { sourceId: '2', ...other }], ctx);

    expect(run).toThrow(ExecutorError);
    try {
      run();
    } catch (error) {
      expect((error as ExecutorError).type).toBe(ExecutorErrorType.CROSS_SOURCE_UNSUPPORTED);
      expect((error as Error).message).toContain('数据源 1（shop）');
      expect((error as Error).message).toContain('数据源 2（crm）');
    }
  });
});

describe('QueryExecutor 多数据源', () => {
  function createExecutor(endpoints: Record<string, { host: string; port: number }>) {
    const query = jest.fn(async () => [[{ n: 1 }], [{ name: 'n' }]]);
    const connectionManager = {
      getConnection: jest.fn(async (id: string) => ({ getConfig: () => endpoints[id], query })),
    };
    const cache = new Map<string, any>();
    const queryCacheManager = {
      getResult: jest.fn(async (key: string) => cache.get(key) ?? null),
      setResult: jest.fn(async (key: string, value: any) => {
        cache.set(key, value);
      }),
    };
    const resultFormatter = {
      formatResultData: (rows: any[]) => rows,
      formatColumnMetadata: () => [{ name: 'n', type: 'number' }],
    };
    const statisticsTracker = {
      startTracking: jest.fn(),
      markCacheHit: jest.fn(),
      completeTracking: jest.fn(),
      failTracking: jest.fn(),
    };
    const executor = new QueryExecutor(
      connectionManager as any,
      queryCacheManager as any,
      resultFormatter as any,
      statisticsTracker as any
    );
    return { executor, connectionManager, queryCacheManager, query };
  }

  it('单一数据源：不需要比较连接地址', async () => {
    const { executor, connectionManager } = createExecutor({ '1': { host: 'a', port: 1 } });

    const plan = await executor.resolveSource(contextOf(table('shop', 'orders', 1), table('shop', 'users', 1)));

    expect(plan).toEqual({ sourceId: '1', sourceIds: ['1'] });
    expect(connectionManager.getConnection).not.toHaveBeenCalled();
  });

  it('同实例的多个数据源：在第一个数据源的连接上执行，缓存 key 包含全部数据源', async () => {
    const { executor, connectionManager, queryCacheManager } = createExecutor({
      '1': { host: 'db', port: 3306 },
      '2': { host: 'db', port: 3306 },
    });
    const ctx = contextOf(table('shop', 'orders', 2), table('crm', 'users', 1));

    const result = await executor.execute('SELECT 1 FROM `shop`.`orders` JOIN `crm`.`users`', ctx);

    expect(result.success).toBe(true);
    expect(connectionManager.getConnection).toHaveBeenLastCalledWith('2');
    expect(queryCacheManager.setResult).toHaveBeenCalledWith(
      expect.stringMatching(/^source:1,2:rows:/),
      expect.anything()
    );
  });

  it('跨实例：execute 返回 CROSS_SOURCE_UNSUPPORTED，不执行查询', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { executor, query } = createExecutor({
      '1': { host: 'db-a', port: 3306 },
      '2': { host: 'db-b', port: 3306 },
    });

    const result = await executor.execute('SELECT 1', contextOf(table('shop', 'orders', 1), table('crm', 'users', 2)));

    expect(result).toMatchObject({ success: false, errorType: ExecutorErrorType.CROSS_SOURCE_UNSUPPORTED });
    expect(result.error).toContain('暂不支持跨实例查询');
    expect(query).not.toHaveBeenCalled();
  });
});
