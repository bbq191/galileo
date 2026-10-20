/**
 * 业务规则引擎与 Prompt 构建
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Prisma } from '@prisma/client';

const db = {
  businessTermMapping: { findMany: jest.fn<(...a: any[]) => Promise<any[]>>(), updateMany: jest.fn(async (..._a: any[]) => ({})) },
  queryTemplate: { findMany: jest.fn<(...a: any[]) => Promise<any[]>>(), updateMany: jest.fn(async (..._a: any[]) => ({})) },
  commonFilter: { findMany: jest.fn<(...a: any[]) => Promise<any[]>>(), updateMany: jest.fn(async (..._a: any[]) => ({})) },
  aggregationRule: { findMany: jest.fn<(...a: any[]) => Promise<any[]>>(), updateMany: jest.fn(async (..._a: any[]) => ({})) },
};
const redis = { get: jest.fn<(...a: any[]) => Promise<any>>(), set: jest.fn<(...a: any[]) => Promise<any>>() };

jest.mock('@/lib/prisma/client', () => ({ __esModule: true, default: db }));
jest.mock('@/lib/cache/redis-client', () => ({ getRedisClient: () => redis }));

import { BusinessRulesEngine } from '@/lib/business-rules/business-rules-engine';
import { buildBusinessRulesContext, extractFilterColumns } from '@/lib/business-rules/rules-context';

const decimal = (n: number) => new Prisma.Decimal(n);

function table(tableName: string, columns: string[]) {
  return { databaseName: 'live', tableName, columns: columns.map((columnName) => ({ columnName })) };
}

const context: any = {
  tables: [
    table('tb_live_watch_detail', ['id', 'user_id', 'watch_time', 'created_at']),
    table('tb_live_all_room', ['live_id', 'orgId', 'is_deleted', 'status']),
  ],
  relationships: [],
  columns: [],
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  for (const model of Object.values(db)) {
    model.findMany.mockResolvedValue([]);
    model.updateMany.mockClear();
  }
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue('OK');
});

describe('BusinessRulesEngine', () => {
  it('业务术语：Redis 不可用时回退到数据库，而不是返回空结果', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    db.businessTermMapping.findMany.mockResolvedValue([
      { id: 1, term: '观看时长', category: 'metric', targetType: 'column', targetTable: 'tb_live_watch_detail', targetColumn: 'watch_time', targetValue: null, priority: 1, confidence: decimal(0.9) },
    ]);

    const terms = await new BusinessRulesEngine().matchBusinessTerms('统计本月观看时长');

    expect(terms).toMatchObject([{ id: 1, term: '观看时长' }]);
  });

  it.each([
    ['查询观看时长最高的10个主播', '查询{指标}最{高/低}的{N}个{维度}', true],
    ['查询观看时长最低的10个主播', '查询{指标}最{高/低}的{N}个{维度}', true],
    ['按地区和月份统计观看人数', '按{维度1}和{维度2}统计{指标}', true],
    ['观看人数的环比', '{指标}的{同比/环比}', true],
    ['统计观看人数', '{指标}的{同比/环比}', false],
    ['查询直播间列表', '查询{主题}的明细数据', false],
  ])('模板匹配：「%s」vs「%s」→ %s', async (query, pattern, expected) => {
    db.queryTemplate.findMany.mockResolvedValue([
      { id: 1, name: 't', category: 'c', naturalLanguagePattern: pattern, sqlTemplate: 'SELECT 1', parameters: null, examples: null },
    ]);

    const matches = await new BusinessRulesEngine().matchQueryTemplates(query, {} as any);

    expect(matches.length > 0).toBe(expected);
  });

  it('聚合规则：长指标名优先，不重复命中被包含的短指标', async () => {
    db.aggregationRule.findMany.mockResolvedValue([
      { id: 1, name: '观看时长汇总', metricName: '观看时长', sourceTable: 'tb_live_watch_detail', sourceColumn: 'watch_time', aggregationFunction: 'SUM', unit: null, semanticDescription: null },
      { id: 2, name: '平均观看时长', metricName: '平均观看时长', sourceTable: 'tb_live_watch_detail', sourceColumn: 'watch_time', aggregationFunction: 'AVG', unit: '秒', semanticDescription: null },
    ]);

    const rules = await new BusinessRulesEngine().matchAggregationRules('本月平均观看时长');

    expect(rules.map((r) => r.id)).toEqual([2]);
  });

  it('匹配阶段不写使用统计，recordUsage 只更新实际注入的规则', async () => {
    db.commonFilter.findMany.mockResolvedValue([
      { id: 5, name: 'f', targetTable: '*', filterCondition: 'x = 1', autoApply: true, priority: 1, semanticKeywords: null },
    ]);
    const engine = new BusinessRulesEngine();

    await engine.getApplicableFilters(['t']);
    expect(db.commonFilter.updateMany).not.toHaveBeenCalled();

    engine.recordUsage({ termIds: [], templateIds: [], filterIds: [5], aggregationIds: [] });
    await new Promise((r) => setImmediate(r));
    expect(db.commonFilter.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [5] } } })
    );
    expect(db.businessTermMapping.updateMany).not.toHaveBeenCalled();
  });
});

describe('extractFilterColumns', () => {
  it.each([
    ['is_deleted = 0 AND status = 1', ['is_deleted', 'status']],
    ['created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)', ['created_at']],
    ['bad ((', null],
  ])('%s', (condition, expected) => {
    expect(extractFilterColumns(condition)).toEqual(expected);
  });
});

describe('buildBusinessRulesContext', () => {
  const engine = () => new BusinessRulesEngine();

  it('没有可应用的规则时返回 null', async () => {
    expect(await buildBusinessRulesContext(engine(), '统计数量', context)).toBeNull();
  });

  it('全局过滤条件只对包含全部字段的表生效（不会给所有表加上不存在的字段）', async () => {
    db.commonFilter.findMany.mockResolvedValue([
      { id: 1, name: '有效数据过滤', targetTable: '*', filterCondition: 'is_deleted = 0 AND status = 1', autoApply: true, priority: 1, semanticKeywords: null },
      { id: 2, name: '最近30天数据', targetTable: '*', filterCondition: 'created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)', autoApply: false, priority: 2, semanticKeywords: null },
      { id: 3, name: '无字段可用', targetTable: '*', filterCondition: 'tenant_id = 9', autoApply: true, priority: 3, semanticKeywords: null },
    ]);

    const rules = await buildBusinessRulesContext(engine(), '统计数量', context);

    expect(rules!.applied.filters).toEqual(['有效数据过滤', '最近30天数据']);
    expect(rules!.promptSection).toContain('有效数据过滤（适用于 tb_live_all_room）');
    expect(rules!.promptSection).toContain('最近30天数据（适用于 tb_live_watch_detail）');
    expect(rules!.promptSection).not.toContain('tenant_id');
    expect(rules!.appliedIds.filterIds).toEqual([1, 2]);
  });

  it('指定表的过滤条件只在该表出现在元数据中时注入', async () => {
    db.commonFilter.findMany.mockResolvedValue([
      { id: 1, name: '寿险部门', targetTable: 'tb_other', filterCondition: 'x = 1', autoApply: false, priority: 1, semanticKeywords: null },
    ]);

    expect(await buildBusinessRulesContext(engine(), '统计数量', context)).toBeNull();
  });

  it('业务术语：目标表或字段不在元数据中的被丢弃；时间类术语保留', async () => {
    db.businessTermMapping.findMany.mockResolvedValue([
      { id: 1, term: '观看时长', category: 'metric', targetType: 'column', targetTable: 'tb_live_watch_detail', targetColumn: 'watch_time', targetValue: null, priority: 1, confidence: decimal(0.9) },
      { id: 2, term: '时长', category: 'metric', targetType: 'column', targetTable: 'tb_live_watch_detail', targetColumn: 'not_exists', targetValue: null, priority: 2, confidence: decimal(0.9) },
      { id: 3, term: '本月', category: 'time', targetType: 'expression', targetTable: null, targetColumn: null, targetValue: '{"sql":"MONTH(NOW())"}', priority: 3, confidence: decimal(1) },
      { id: 4, term: '统计', category: 'x', targetType: 'table', targetTable: 'tb_unknown', targetColumn: null, targetValue: null, priority: 4, confidence: decimal(1) },
    ]);

    const rules = await buildBusinessRulesContext(engine(), '统计本月观看时长', context);

    expect(rules!.applied.terms).toEqual(['观看时长', '本月']);
    expect(rules!.promptSection).toContain('MONTH(NOW())');
  });

  it('聚合规则渲染 COUNT_DISTINCT，并且来源表必须在元数据中', async () => {
    db.aggregationRule.findMany.mockResolvedValue([
      { id: 1, name: '观看人数', metricName: '观看人数', sourceTable: 'tb_live_watch_detail', sourceColumn: 'user_id', aggregationFunction: 'COUNT_DISTINCT', unit: '人', semanticDescription: null },
      { id: 2, name: '订单数', metricName: '订单数', sourceTable: 'tb_order', sourceColumn: 'id', aggregationFunction: 'COUNT', unit: null, semanticDescription: null },
    ]);

    const rules = await buildBusinessRulesContext(engine(), '本月观看人数和订单数', context);

    expect(rules!.applied.aggregations).toEqual(['观看人数']);
    expect(rules!.promptSection).toContain('COUNT(DISTINCT tb_live_watch_detail.user_id)（单位：人）');
  });

  it('规则内容不同则摘要不同（用于 SQL 缓存 key）', async () => {
    db.commonFilter.findMany.mockResolvedValue([
      { id: 1, name: 'a', targetTable: 'tb_live_all_room', filterCondition: 'status = 1', autoApply: true, priority: 1, semanticKeywords: null },
    ]);
    const first = await buildBusinessRulesContext(engine(), 'q', context);

    db.commonFilter.findMany.mockResolvedValue([
      { id: 1, name: 'a', targetTable: 'tb_live_all_room', filterCondition: 'status = 2', autoApply: true, priority: 1, semanticKeywords: null },
    ]);
    const second = await buildBusinessRulesContext(engine(), 'q', context);

    expect(first!.digest).not.toBe(second!.digest);
  });
});
