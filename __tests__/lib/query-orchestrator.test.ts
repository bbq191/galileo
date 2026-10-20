import 'reflect-metadata';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const resolvePipeline = jest.fn<(token: symbol) => any>();
jest.mock('@/lib/di/container', () => ({
  getContainer: () => ({ resolve: resolvePipeline }),
}));

const buildBusinessRulesContext = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock('@/lib/business-rules/rules-context', () => ({
  buildBusinessRulesContext: (...args: any[]) => buildBusinessRulesContext(...args),
}));
const recordUsage = jest.fn();
jest.mock('@/lib/business-rules/business-rules-engine', () => ({
  BusinessRulesEngine: class {
    recordUsage = recordUsage;
  },
}));

import { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';
import { UserRole } from '@/lib/auth/permissions';
import { ExecutorError, ExecutorErrorType } from '@/lib/sql/executor/types';

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
      generate: jest.fn(async (..._args: any[]) => ({ sql: SQL, explanation: '统计总数', warnings: ['跨库 JOIN 可能影响性能'] })),
    },
    crossDbHandler: {},
    queryExecutor: {
      resolveSource: jest.fn(async (..._args: any[]): Promise<any> => ({ sourceId: '1', sourceIds: ['1'] })),
      execute: jest.fn(async (..._args: any[]): Promise<any> => ({
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
    metadataRetriever: { retrieveContext: jest.fn(async (..._args: any[]) => context) },
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
  it('缓存 key 包含数据可见范围与指定的数据源', async () => {
    const { orchestrator, deps } = createOrchestrator();

    await orchestrator.processNaturalLanguageQuery('统计总数');
    expect(deps.cacheManager.setResult).toHaveBeenLastCalledWith('nlq:all:src=any:br=off:统计总数', expect.anything());

    await orchestrator.processNaturalLanguageQuery('统计总数', { dataSourceId: 1 });
    expect(deps.cacheManager.setResult).toHaveBeenLastCalledWith('nlq:all:src=1:br=off:统计总数', expect.anything());
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
    cache.set('nlq:all:src=any:br=off:统计总数', { success: true, data: [], rowCount: 0, executionTime: 0, fromCache: false, metadata: { columns: [] } });

    const result = await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(result.metadata?.fromCache).toBe(false);
    expect(deps.sqlGenerator.generate).toHaveBeenCalled();
  });
});

describe('QueryOrchestrator - 多数据源', () => {
  it('把指定的数据源传给元数据检索，并在结果中返回涉及的数据源', async () => {
    const { orchestrator, deps } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { dataSourceId: 1, enableCache: false });

    expect(deps.metadataRetriever.retrieveContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dataSourceId: 1 })
    );
    expect(result.metadata?.dataSourceIds).toEqual([1]);
  });

  it('跨实例：在生成 SQL 之前返回 cross_source_unsupported，不调用 AI', async () => {
    const { orchestrator, deps } = createOrchestrator();
    deps.queryExecutor.resolveSource.mockRejectedValue(
      new ExecutorError(ExecutorErrorType.CROSS_SOURCE_UNSUPPORTED, '查询涉及位于不同数据库实例的多个数据源')
    );

    const result = await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(result).toMatchObject({
      success: false,
      errorCode: 'cross_source_unsupported',
      error: '查询涉及位于不同数据库实例的多个数据源',
    });
    expect(result.intent).toBeDefined();
    expect(deps.sqlGenerator.generate).not.toHaveBeenCalled();
    expect(deps.queryExecutor.execute).not.toHaveBeenCalled();
  });

  it('执行阶段返回 CROSS_SOURCE_UNSUPPORTED 时同样映射错误码', async () => {
    const { orchestrator, deps } = createOrchestrator();
    deps.queryExecutor.execute.mockResolvedValue({
      success: false,
      error: '跨实例',
      errorType: ExecutorErrorType.CROSS_SOURCE_UNSUPPORTED,
      executionTime: 0,
      rowCount: 0,
      fromCache: false,
      metadata: { columns: [] },
    });

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { enableCache: false });

    expect(result.errorCode).toBe('cross_source_unsupported');
  });

  it('其他数据源检查错误（如连接不可用）不吞掉', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { orchestrator, deps } = createOrchestrator();
    deps.queryExecutor.resolveSource.mockRejectedValue(new Error('Connection 2 is unhealthy'));

    const result = await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(result).toMatchObject({ success: false, error: 'Connection 2 is unhealthy' });
    expect(result.errorCode).toBeUndefined();
  });
});

describe('QueryOrchestrator - 业务规则', () => {
  const rules = {
    promptSection: '## 业务规则和约定',
    digest: 'd1',
    applied: { terms: ['观看时长'], filters: [], aggregations: [], templates: [] },
    appliedIds: { termIds: [1], templateIds: [], filterIds: [], aggregationIds: [] },
  };

  beforeEach(() => {
    buildBusinessRulesContext.mockReset();
    recordUsage.mockClear();
  });

  it('默认关闭：不构建规则，生成时不追加 Prompt', async () => {
    delete process.env.ENABLE_BUSINESS_RULES;
    const { orchestrator, deps } = createOrchestrator();

    await orchestrator.processNaturalLanguageQuery('统计总数', { explainOnly: true });

    expect(buildBusinessRulesContext).not.toHaveBeenCalled();
    expect(deps.sqlGenerator.generate).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      promptAppendix: undefined,
      promptAppendixDigest: undefined,
    });
  });

  it('开启：规则追加到 Prompt，结果中返回已应用的规则并记录使用统计', async () => {
    process.env.ENABLE_BUSINESS_RULES = 'true';
    buildBusinessRulesContext.mockResolvedValue(rules);
    const { orchestrator, deps } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计观看时长', { explainOnly: true });

    expect(buildBusinessRulesContext).toHaveBeenCalledWith(expect.anything(), '统计观看时长', expect.anything());
    expect(deps.sqlGenerator.generate).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      promptAppendix: '## 业务规则和约定',
      promptAppendixDigest: 'd1',
    });
    expect(result.metadata?.appliedBusinessRules).toEqual(rules.applied);
    expect(recordUsage).toHaveBeenCalledWith(rules.appliedIds);
  });

  it('开启但同时启用管道：跳过规则并告警', async () => {
    process.env.ENABLE_BUSINESS_RULES = 'true';
    process.env.ENABLE_SQL_PIPELINE = 'true';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resolvePipeline.mockReturnValue({
      generate: async () => ({ result: { sql: 'SELECT 2', explanation: '', confidence: 1, usedTables: [], usedColumns: [] } }),
    });
    const { orchestrator } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { explainOnly: true });

    expect(result.success).toBe(true);
    expect(buildBusinessRulesContext).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[BusinessRules]'));
  });

  it('构建规则失败：按无规则继续生成', async () => {
    process.env.ENABLE_BUSINESS_RULES = 'true';
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    buildBusinessRulesContext.mockRejectedValue(new Error('db down'));
    const { orchestrator, deps } = createOrchestrator();

    const result = await orchestrator.processNaturalLanguageQuery('统计总数', { explainOnly: true });

    expect(result.success).toBe(true);
    expect(deps.sqlGenerator.generate).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      promptAppendix: undefined,
      promptAppendixDigest: undefined,
    });
  });

  it('结果缓存 key 区分规则开关', async () => {
    process.env.ENABLE_BUSINESS_RULES = 'true';
    buildBusinessRulesContext.mockResolvedValue(null);
    const { orchestrator, deps } = createOrchestrator();

    await orchestrator.processNaturalLanguageQuery('统计总数');

    expect(deps.cacheManager.setResult).toHaveBeenCalledWith('nlq:all:src=any:br=on:统计总数', expect.anything());
  });
});
