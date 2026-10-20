import 'reflect-metadata';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const resolvePipeline = jest.fn<(token: symbol) => any>();
jest.mock('@/lib/di/container', () => ({
  getContainer: () => ({ resolve: resolvePipeline }),
}));

import { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';
import { UserRole } from '@/lib/auth/permissions';

const SQL = 'SELECT COUNT(*) FROM `db`.`t`';

function validationResult(overrides: Record<string, unknown> = {}) {
  return {
    isValid: true,
    errors: [],
    warnings: [{ type: 'performance', message: '缺少索引' }],
    securityIssues: [],
    optimizationSuggestions: [{ type: 'index', message: '为 t.id 添加索引', impact: 'medium', suggestion: 'x' }],
    estimatedCost: { complexity: 'low' },
    ...overrides,
  };
}

function createOrchestrator() {
  const context = {
    tables: [{ databaseName: 'db', tableName: 't', database: { sourceId: 1 } }],
    relationships: [],
    columns: [],
  };
  const cache = new Map<string, any>();

  const deps = {
    intentRecognizer: { recognize: jest.fn(async () => ({ type: 'aggregate', conditions: {} })) },
    entityResolver: {},
    timeParser: { parse: jest.fn() },
    queryDomainInferencer: { inferDomain: jest.fn(async () => null) },
    sqlGenerator: {
      generate: jest.fn(async () => ({ sql: SQL, explanation: '统计总数', warnings: ['跨库 JOIN 可能影响性能'] })),
    },
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
    cacheManager: {
      getResult: jest.fn(async (key: string) => cache.get(key) ?? null),
      setResult: jest.fn(async (key: string, value: any) => {
        cache.set(key, value);
      }),
    },
    metadataRetriever: { retrieveContext: jest.fn(async () => context) },
    sqlValidator: { validate: jest.fn(async (..._args: any[]): Promise<any> => validationResult()) },
  };

  const orchestrator = new QueryOrchestrator(
    ...(Object.values(deps) as ConstructorParameters<typeof QueryOrchestrator>)
  );
  return { orchestrator, deps, cache };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.restoreAllMocks();
});

describe('QueryOrchestrator - SQL 校验', () => {
  it('默认 shadow：校验通过时合并 warnings 与优化建议', async () => {
    delete process.env.SQL_VALIDATOR_MODE;
    const { orchestrator, deps } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', {
      enableCache: false,
      user: { id: '7', role: UserRole.USER },
    });

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual(['跨库 JOIN 可能影响性能', '缺少索引']);
    expect(result.suggestions).toEqual([{ type: 'index', message: '为 t.id 添加索引', impact: 'medium' }]);
    expect(result.performance?.validationTime).toEqual(expect.any(Number));
    expect(deps.sqlValidator.validate).toHaveBeenCalledWith(
      SQL,
      expect.anything(),
      expect.objectContaining({ userId: '7', unrestricted: true })
    );
  });

  it('shadow：校验不通过时仍执行，记录 wouldBlock 日志，且不写缓存', async () => {
    process.env.SQL_VALIDATOR_MODE = 'shadow';
    const { orchestrator, deps } = createOrchestrator();
    deps.sqlValidator.validate.mockResolvedValue(
      validationResult({ isValid: false, errors: [{ type: 'semantic', message: '表 u.name 不存在' }] })
    );

    const result = await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(result.success).toBe(true);
    expect(deps.queryExecutor.execute).toHaveBeenCalled();
    expect(deps.cacheManager.setResult).not.toHaveBeenCalled();
    const logged = (console.info as jest.Mock).mock.calls.find(([tag]) => tag === '[SQLValidator]');
    expect(JSON.parse(logged![1] as string)).toMatchObject({ mode: 'shadow', wouldBlock: true, errors: ['表 u.name 不存在'] });
  });

  it('enforce：校验不通过时拒绝执行，返回 validation_failed 与被拦截的 SQL', async () => {
    process.env.SQL_VALIDATOR_MODE = 'enforce';
    const { orchestrator, deps } = createOrchestrator();
    deps.sqlValidator.validate.mockResolvedValue(
      validationResult({ isValid: false, errors: [{ type: 'security', message: '检测到严重安全问题' }] })
    );

    const result = await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(result).toMatchObject({
      success: false,
      errorCode: 'validation_failed',
      error: '查询未通过安全校验：检测到严重安全问题',
      metadata: { generatedSQL: SQL },
    });
    expect(result.intent).toBeDefined(); // 审计日志需要
    expect(deps.queryExecutor.execute).not.toHaveBeenCalled();
  });

  it('enforce：预览（explainOnly）同样拦截', async () => {
    process.env.SQL_VALIDATOR_MODE = 'enforce';
    const { orchestrator, deps } = createOrchestrator();
    deps.sqlValidator.validate.mockResolvedValue(validationResult({ isValid: false, errors: [{ type: 'permission', message: 'x' }] }));

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { explainOnly: true });

    expect(result.errorCode).toBe('validation_failed');
  });

  it.each([
    ['shadow', true],
    ['enforce', false],
  ])('校验器抛异常：%s 模式下 success=%s', async (mode, expectedSuccess) => {
    process.env.SQL_VALIDATOR_MODE = mode;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { orchestrator, deps } = createOrchestrator();
    deps.sqlValidator.validate.mockRejectedValue(new Error('parser crashed'));

    const result = await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(result.success).toBe(expectedSuccess);
    expect(deps.cacheManager.setResult).not.toHaveBeenCalled();
  });

  it('off：不调用校验器', async () => {
    process.env.SQL_VALIDATOR_MODE = 'off';
    const { orchestrator, deps } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { enableCache: false });

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual(['跨库 JOIN 可能影响性能']);
    expect(deps.sqlValidator.validate).not.toHaveBeenCalled();
  });
});

describe('QueryOrchestrator - SQL 生成路径', () => {
  it('默认使用 SQLGenerator，不解析管道', async () => {
    delete process.env.ENABLE_SQL_PIPELINE;
    const { orchestrator, deps } = createOrchestrator();

    await orchestrator.processNaturalLanguageQuery('统计总数', { explainOnly: true });

    expect(deps.sqlGenerator.generate).toHaveBeenCalled();
    expect(resolvePipeline).not.toHaveBeenCalled();
  });

  it('ENABLE_SQL_PIPELINE=true：使用管道并禁用其内置 Validator 阶段', async () => {
    process.env.ENABLE_SQL_PIPELINE = 'true';
    const generate = jest.fn(async (..._args: any[]) => ({
      result: { sql: 'SELECT 2', explanation: '模板命中', confidence: 1, usedTables: [], usedColumns: [] },
      executedStages: [],
      skippedStages: ['Validator'],
      totalDuration: 1,
      cached: true,
    }));
    resolvePipeline.mockReturnValue({ generate });
    const { orchestrator, deps } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { explainOnly: true });

    expect(result.metadata?.generatedSQL).toBe('SELECT 2');
    expect(generate).toHaveBeenCalledWith(expect.anything(), expect.anything(), {}, { disabledStages: ['Validator'] });
    expect(deps.sqlGenerator.generate).not.toHaveBeenCalled();
    // 管道结果同样经过统一校验
    expect(deps.sqlValidator.validate).toHaveBeenCalledWith('SELECT 2', expect.anything(), expect.anything());
  });
});

describe('QueryOrchestrator - 结果缓存', () => {
  it('缓存 key 包含数据可见范围', async () => {
    const { orchestrator, deps } = createOrchestrator();

    await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(deps.cacheManager.setResult).toHaveBeenCalledWith('nlq:all:统计总数', expect.anything());
  });

  it('缓存命中时返回真实的 SQL、意图与建议，而不是自然语言原文', async () => {
    const { orchestrator, deps } = createOrchestrator();
    await orchestrator.processNaturalLanguageQuery('统计总数');
    deps.sqlGenerator.generate.mockClear();

    const hit = await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(hit.metadata).toMatchObject({ generatedSQL: SQL, explanation: '统计总数', fromCache: true });
    expect(hit.intent).toEqual({ type: 'aggregate', conditions: {} });
    expect(hit.suggestions).toHaveLength(1);
    expect(deps.sqlGenerator.generate).not.toHaveBeenCalled();
  });

  it('旧格式缓存条目（缺少 nlq）按未命中处理', async () => {
    const { orchestrator, deps, cache } = createOrchestrator();
    cache.set('nlq:all:统计总数', { success: true, data: [], rowCount: 0, executionTime: 0, fromCache: false, metadata: { columns: [] } });

    const result = await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(result.metadata?.fromCache).toBe(false);
    expect(deps.sqlGenerator.generate).toHaveBeenCalled();
  });
});
