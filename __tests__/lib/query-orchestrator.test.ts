import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';

function createOrchestrator() {
  const sqlResult = {
    sql: 'SELECT COUNT(*) FROM `db`.`t`',
    explanation: '统计总数',
    warnings: ['跨库 JOIN 可能影响性能'],
  };
  const context = {
    tables: [{ databaseName: 'db', tableName: 't', database: { sourceId: 1 } }],
    relationships: [],
    columns: [],
  };

  const deps = {
    intentRecognizer: { recognize: jest.fn(async () => ({ type: 'aggregate', conditions: {} })) },
    entityResolver: {},
    timeParser: { parse: jest.fn() },
    queryDomainInferencer: { inferDomain: jest.fn(async () => null) },
    sqlGenerator: { generate: jest.fn(async () => sqlResult) },
    crossDbHandler: {},
    queryExecutor: {
      execute: jest.fn(async () => ({
        success: true,
        data: [{ total: 1 }],
        rowCount: 1,
        executionTime: 1,
        metadata: { columns: [{ name: 'total', type: 'number' }] },
      })),
    },
    resultFormatter: {},
    cacheManager: { getResult: jest.fn(async () => null), setResult: jest.fn(async () => undefined) },
    metadataRetriever: { retrieveContext: jest.fn(async () => context) },
  };

  const orchestrator = new QueryOrchestrator(
    ...(Object.values(deps) as ConstructorParameters<typeof QueryOrchestrator>)
  );
  return { orchestrator, deps };
}

describe('QueryOrchestrator.processNaturalLanguageQuery', () => {
  it('explainOnly：透传 SQL 生成的 warnings，且不执行查询', async () => {
    const { orchestrator, deps } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { explainOnly: true });

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual(['跨库 JOIN 可能影响性能']);
    expect(deps.queryExecutor.execute).not.toHaveBeenCalled();
  });

  it('执行成功：透传 SQL 生成的 warnings', async () => {
    const { orchestrator } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { enableCache: false });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ total: 1 }]);
    expect(result.warnings).toEqual(['跨库 JOIN 可能影响性能']);
  });
});
