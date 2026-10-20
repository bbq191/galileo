/**
 * 查询反馈与已验证查询
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { normalizeQuestion, questionHash, questionSimilarity } from '@/lib/feedback/question';
import { findChangedTables } from '@/lib/metadata/table-snapshot';
import {
  FeedbackError,
  recordCorrection,
  reviewFeedback,
  sameSql,
  setVerifiedQueryActive,
  submitFeedback,
} from '@/lib/feedback/feedback-service';
import { VerifiedQueryStore, renderVerifiedExamples } from '@/lib/feedback/verified-queries';

type Mock = jest.Mock<(...args: any[]) => Promise<any>>;
const fn = (impl: (...args: any[]) => any = () => undefined): Mock => jest.fn(async (...args: any[]) => impl(...args));

const RUN = {
  runId: '11111111-1111-4111-8111-111111111111',
  userId: '7',
  naturalLanguageQuery: '上个月订单数',
  generatedSql: 'SELECT COUNT(*) FROM shop.orders',
  dataSourceIds: '[1]',
};

function fakePrisma(overrides: { run?: any; feedback?: any; verified?: any; tables?: any[] } = {}) {
  const tables = overrides.tables ?? [
    { id: 10, tableName: 'orders', structureHash: 'h1', database: { databaseName: 'shop' } },
  ];
  const prisma: any = {
    queryAuditLog: { findUnique: fn(() => overrides.run ?? RUN) },
    queryFeedback: {
      findUnique: fn(() => overrides.feedback ?? null),
      create: fn(({ data }) => ({ id: 1, status: 'pending', ...data })),
      update: fn(({ data }) => ({ id: 1, ...overrides.feedback, ...data })),
    },
    verifiedQuery: {
      findUnique: fn(() => overrides.verified ?? null),
      findMany: fn(() => []),
      create: fn(({ data }) => ({ id: 99, ...data })),
      update: fn(({ data }) => ({ id: 99, ...data })),
      updateMany: fn(() => ({ count: 0 })),
    },
    tableMeta: {
      findMany: fn(({ where }) => tables.filter((t) => where.id.in.includes(t.id))),
    },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  return prisma;
}

const resolver = (tableIds = [10], sourceId = 1) => ({
  retrieveContextForSQL: jest.fn(async (..._args: any[]): Promise<any> => ({
    tables: tableIds.map((id) => ({ id, database: { sourceId } })),
  })),
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('问题归一化', () => {
  it('忽略空白、标点与大小写', () => {
    expect(normalizeQuestion(' 上个月 GMV 是多少？')).toBe('上个月gmv是多少');
    expect(questionHash('上个月 GMV 是多少？')).toBe(questionHash('上个月gmv是多少'));
  });

  it('相似度：相同为 1，相近较高，无关较低', () => {
    expect(questionSimilarity('上个月订单数', '上个月 订单数！')).toBe(1);
    expect(questionSimilarity('上个月订单数', '上个月的订单数量')).toBeGreaterThan(0.5);
    expect(questionSimilarity('上个月订单数', '各城市用户分布')).toBeLessThan(0.2);
    expect(questionSimilarity('', 'x')).toBe(0);
  });

  it('sameSql 只忽略空白与末尾分号', () => {
    expect(sameSql('SELECT  1\nFROM t;', 'SELECT 1 FROM t')).toBe(true);
    expect(sameSql('SELECT 1 FROM t', 'SELECT 2 FROM t')).toBe(false);
  });
});

describe('findChangedTables', () => {
  it('表被删除或结构哈希变化时返回；哈希为空时只检查存在性', async () => {
    const prisma = fakePrisma({
      tables: [
        { id: 1, structureHash: 'a' },
        { id: 2, structureHash: 'b2' },
        { id: 4, structureHash: null },
      ],
    });
    const changed = await findChangedTables(prisma, [
      { tableId: 1, databaseName: 'd', tableName: 'same', structureHash: 'a' },
      { tableId: 2, databaseName: 'd', tableName: 'modified', structureHash: 'b1' },
      { tableId: 3, databaseName: 'd', tableName: 'dropped', structureHash: 'c' },
      { tableId: 4, databaseName: 'd', tableName: 'unknown', structureHash: 'x' },
    ]);
    expect(changed).toEqual(['d.modified', 'd.dropped']);
  });
});

describe('submitFeedback', () => {
  it('新反馈：冗余保存问题、SQL 与数据源', async () => {
    const prisma = fakePrisma();
    await submitFeedback(prisma, { runId: RUN.runId, userId: '7', rating: 'down', reason: 'wrong_filter', comment: ' 只算已支付 ' });

    expect(prisma.queryFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rating: 'down',
        reason: 'wrong_filter',
        comment: '只算已支付',
        question: '上个月订单数',
        generatedSql: RUN.generatedSql,
        dataSourceIds: '[1]',
      }),
    });
  });

  it('查询不存在 404，不是自己的查询 403，已审核 409', async () => {
    const missing = fakePrisma();
    missing.queryAuditLog.findUnique.mockResolvedValue(null);
    await expect(submitFeedback(missing, { runId: RUN.runId, userId: '7', rating: 'up' })).rejects.toMatchObject({ status: 404 });

    await expect(submitFeedback(fakePrisma(), { runId: RUN.runId, userId: '8', rating: 'up' })).rejects.toMatchObject({ status: 403 });

    const reviewed = fakePrisma({ feedback: { rating: 'down', status: 'accepted' } });
    await expect(submitFeedback(reviewed, { runId: RUN.runId, userId: '7', rating: 'up' })).rejects.toBeInstanceOf(FeedbackError);
  });

  it('已纠正的反馈不被点赞 / 点踩覆盖类型，只补充原因', async () => {
    const prisma = fakePrisma({ feedback: { rating: 'corrected', status: 'pending', correctedSql: 'x' } });
    await submitFeedback(prisma, { runId: RUN.runId, userId: '7', rating: 'down', reason: 'wrong_table' });

    const { data } = prisma.queryFeedback.update.mock.calls[0][0];
    expect(data).toEqual({ reason: 'wrong_table', comment: null });
  });

  it('编辑 SQL 的执行记录：问题去掉前缀', async () => {
    const prisma = fakePrisma({ run: { ...RUN, naturalLanguageQuery: '[用户编辑 SQL] 上个月订单数' } });
    await submitFeedback(prisma, { runId: RUN.runId, userId: '7', rating: 'up' });
    expect(prisma.queryFeedback.create.mock.calls[0][0].data.question).toBe('上个月订单数');
  });
});

describe('recordCorrection', () => {
  const sql = "SELECT COUNT(*) FROM shop.orders WHERE status = 'paid'";

  it('SQL 有改动：记为纠正，数据源取实际执行的', async () => {
    const prisma = fakePrisma();
    expect(await recordCorrection(prisma, { sourceRunId: RUN.runId, userId: '7', sql, dataSourceIds: [2] })).toBe(true);
    expect(prisma.queryFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rating: 'corrected', correctedSql: sql, dataSourceIds: '[2]' }),
    });
  });

  it('已有点踩：升级为纠正，保留原因', async () => {
    const prisma = fakePrisma({ feedback: { rating: 'down', reason: 'wrong_filter', status: 'pending' } });
    await recordCorrection(prisma, { sourceRunId: RUN.runId, userId: '7', sql });
    expect(prisma.queryFeedback.update.mock.calls[0][0].data).toEqual({ rating: 'corrected', correctedSql: sql, dataSourceIds: '[1]' });
  });

  it('SQL 未改动、不是自己的查询、已审核：不记录', async () => {
    expect(await recordCorrection(fakePrisma(), { sourceRunId: RUN.runId, userId: '7', sql: RUN.generatedSql + ';' })).toBe(false);
    expect(await recordCorrection(fakePrisma(), { sourceRunId: RUN.runId, userId: '8', sql })).toBe(false);
    const reviewed = fakePrisma({ feedback: { status: 'rejected' } });
    expect(await recordCorrection(reviewed, { sourceRunId: RUN.runId, userId: '7', sql })).toBe(false);
    expect(reviewed.queryFeedback.update).not.toHaveBeenCalled();
  });
});

describe('reviewFeedback', () => {
  const pending = { id: 5, status: 'pending', question: '上个月订单数', generatedSql: RUN.generatedSql, correctedSql: 'SELECT 2 FROM shop.orders', dataSourceIds: '[1]' };

  it('采纳：默认使用纠正后的 SQL，记录表结构快照，替换同一问题的旧版本', async () => {
    const prisma = fakePrisma({ feedback: pending });
    const sqlResolver = resolver();

    const { verifiedQuery } = await reviewFeedback(prisma, sqlResolver, { id: 5, action: 'accept', reviewer: 'admin' });

    expect(sqlResolver.retrieveContextForSQL).toHaveBeenCalledWith('SELECT 2 FROM shop.orders', [1]);
    expect(verifiedQuery).toMatchObject({
      question: '上个月订单数',
      questionHash: questionHash('上个月订单数'),
      sql: 'SELECT 2 FROM shop.orders',
      dataSourceIds: '[1]',
      sourceFeedbackId: 5,
    });
    expect(JSON.parse(verifiedQuery.tableSnapshot)).toEqual([
      { tableId: 10, databaseName: 'shop', tableName: 'orders', structureHash: 'h1' },
    ]);
    expect(prisma.verifiedQuery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { questionHash: questionHash('上个月订单数'), dataSourceIds: '[1]', isActive: true },
    }));
    expect(prisma.queryFeedback.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'accepted', verifiedQueryId: 99, reviewedBy: 'admin' }),
    }));
  });

  it('采纳时管理员可修改问题与 SQL；SQL 中的表无法识别时返回 400', async () => {
    const prisma = fakePrisma({ feedback: pending });
    const bad = { retrieveContextForSQL: jest.fn(async () => { throw new Error('表 x 不在已同步的元数据中'); }) };

    await expect(reviewFeedback(prisma, bad, { id: 5, action: 'accept', reviewer: 'a', sql: 'SELECT 1 FROM x' }))
      .rejects.toMatchObject({ status: 400, message: '表 x 不在已同步的元数据中' });
    expect(prisma.verifiedQuery.create).not.toHaveBeenCalled();
  });

  it('驳回；已审核的不能再审核', async () => {
    const prisma = fakePrisma({ feedback: pending });
    await reviewFeedback(prisma, resolver(), { id: 5, action: 'reject', reviewer: 'a' });
    expect(prisma.queryFeedback.update.mock.calls[0][0].data.status).toBe('rejected');

    const done = fakePrisma({ feedback: { ...pending, status: 'accepted' } });
    await expect(reviewFeedback(done, resolver(), { id: 5, action: 'reject', reviewer: 'a' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('setVerifiedQueryActive', () => {
  it('重新启用时刷新表结构快照', async () => {
    const prisma = fakePrisma({
      verified: { id: 3, sql: 'SELECT 1 FROM shop.orders', dataSourceIds: '[1]' },
      tables: [{ id: 10, tableName: 'orders', structureHash: 'h2', database: { databaseName: 'shop' } }],
    });
    await setVerifiedQueryActive(prisma, resolver(), 3, true);

    const { data } = prisma.verifiedQuery.update.mock.calls[0][0];
    expect(data).toMatchObject({ isActive: true, invalidReason: null });
    expect(JSON.parse(data.tableSnapshot)[0].structureHash).toBe('h2');
  });
});

describe('VerifiedQueryStore', () => {
  const snapshot = (hash = 'h1') => JSON.stringify([{ tableId: 10, databaseName: 'shop', tableName: 'orders', structureHash: hash }]);
  const row = (id: number, question: string, extra: Record<string, unknown> = {}) => ({
    id, question, sql: `SELECT ${id} FROM shop.orders`, dataSourceIds: '[1]', tableSnapshot: snapshot(), ...extra,
  });

  it('findExact：按数据源过滤；表结构变化时停用并跳过', async () => {
    const prisma = fakePrisma();
    prisma.verifiedQuery.findMany.mockResolvedValue([
      row(1, '上个月订单数', { tableSnapshot: snapshot('old') }),
      row(2, '上个月订单数', { dataSourceIds: '[2]' }),
      row(3, '上个月订单数'),
    ]);
    const store = new VerifiedQueryStore(prisma);

    expect(await store.findExact('上个月 订单数', 1)).toMatchObject({ id: 3, dataSourceIds: [1] });
    expect(prisma.verifiedQuery.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isActive: false, invalidReason: '表结构已变化：shop.orders' },
    });
    expect(prisma.verifiedQuery.findMany.mock.calls[0][0].where).toEqual({
      questionHash: questionHash('上个月订单数'),
      isActive: true,
    });
  });

  it('findSimilar：只选相似度达标且涉及的表都在上下文中的示例，按相似度排序', async () => {
    const prisma = fakePrisma();
    prisma.verifiedQuery.findMany.mockResolvedValue([
      row(1, '上个月的订单数量'),
      row(2, '上个月订单数'),
      row(3, '各城市用户分布'),
      row(4, '上个月订单数', { tableSnapshot: JSON.stringify([{ tableId: 77, databaseName: 'x', tableName: 'y', structureHash: null }]) }),
    ]);
    const store = new VerifiedQueryStore(prisma);

    const examples = await store.findSimilar('上个月订单数是多少', { tables: [{ id: 10 }] } as any);

    expect(examples.map((e) => e.id)).toEqual([2, 1]);
  });

  it('renderVerifiedExamples：包含问题与 SQL；无示例时返回 null', () => {
    const section = renderVerifiedExamples([{ id: 1, question: '订单数', sql: 'SELECT 1', dataSourceIds: [] }])!;
    expect(section.promptSection).toContain('已验证的查询示例');
    expect(section.promptSection).toContain('- 问题：订单数');
    expect(section.promptSection).toContain('SELECT 1');
    expect(section.ids).toEqual([1]);
    expect(renderVerifiedExamples([])).toBeNull();
  });
});
