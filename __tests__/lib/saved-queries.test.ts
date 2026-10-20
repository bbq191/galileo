/**
 * 保存的查询：刷新计划、保存、定时执行
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { computeNextRun, describeSchedule, spreadMinute } from '@/lib/saved-queries/schedule';
import {
  createSavedQuery,
  getSaveSuggestion,
  getSavedQuery,
  runDueSavedQueries,
  runSavedQueryNow,
  updateSavedQuery,
} from '@/lib/saved-queries/saved-query-service';
import { questionHash } from '@/lib/feedback/question';

type Mock = jest.Mock<(...args: any[]) => Promise<any>>;
const fn = (impl: (...args: any[]) => any = () => undefined): Mock => jest.fn(async (...args: any[]) => impl(...args));

// 2026-10-21 是周三
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute, 0, 0);

describe('computeNextRun', () => {
  const id = 3; // 错开 21 分钟
  it('每天：当天整点未到取当天，已过取次日', () => {
    expect(spreadMinute(id)).toBe(21);
    expect(computeNextRun({ schedule: 'daily', runAtHour: 9, runOnWeekday: 1 }, id, at(21, 8))).toEqual(at(21, 9, 21));
    expect(computeNextRun({ schedule: 'daily', runAtHour: 9, runOnWeekday: 1 }, id, at(21, 9, 21))).toEqual(at(22, 9, 21));
  });

  it('每周：取下一个指定星期；当天已过取下周；周日为 7', () => {
    const weekly = (runOnWeekday: number) => ({ schedule: 'weekly' as const, runAtHour: 9, runOnWeekday });
    expect(computeNextRun(weekly(1), id, at(21, 8))).toEqual(at(26, 9, 21)); // 周三 → 下周一
    expect(computeNextRun(weekly(3), id, at(21, 8))).toEqual(at(21, 9, 21)); // 当天未到
    expect(computeNextRun(weekly(3), id, at(21, 10))).toEqual(at(28, 9, 21)); // 当天已过
    expect(computeNextRun(weekly(7), id, at(21, 10))).toEqual(at(25, 9, 21)); // 周日
  });

  it('不自动刷新返回 null；描述文本', () => {
    expect(computeNextRun({ schedule: 'none', runAtHour: 9, runOnWeekday: 1 }, id)).toBeNull();
    expect(describeSchedule({ schedule: 'weekly', runAtHour: 8, runOnWeekday: 5 })).toBe('每周五 08:00');
    expect(describeSchedule({ schedule: 'daily', runAtHour: 18, runOnWeekday: 1 })).toBe('每天 18:00');
  });
});

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SQL = 'SELECT city, COUNT(*) AS n FROM shop.orders GROUP BY city';
const snapshot = (hash = 'h1') => JSON.stringify([{ tableId: 10, databaseName: 'shop', tableName: 'orders', structureHash: hash }]);

function savedRow(extra: Record<string, unknown> = {}) {
  return {
    id: 4,
    userId: '7',
    title: '各城市订单数',
    question: '各城市订单数',
    sql: SQL,
    dataSourceIds: '[1]',
    tableSnapshot: snapshot(),
    schedule: 'daily',
    runAtHour: 9,
    runOnWeekday: 1,
    nextRunAt: at(21, 9, 28),
    status: 'active',
    consecutiveFailures: 0,
    ...extra,
  };
}

function setup(options: { saved?: any[]; run?: any; user?: any; tableHash?: string; savedCount?: number } = {}) {
  const saved = options.saved ?? [savedRow()];
  const prisma: any = {
    queryAuditLog: {
      findUnique: fn(() => options.run ?? {
        runId: RUN_ID, userId: '7', naturalLanguageQuery: '各城市订单数', generatedSql: SQL,
        executionSuccess: true, dataSourceIds: '[1]', questionHash: questionHash('各城市订单数'),
      }),
      count: fn(() => 3),
    },
    savedQuery: {
      count: fn(() => options.savedCount ?? 0),
      create: fn(({ data }) => ({ id: 4, ...data })),
      update: fn(({ where, data }) => ({ ...saved.find((s) => s.id === where.id), ...data })),
      updateMany: fn(() => ({ count: 1 })),
      findUnique: fn(({ where }) => saved.find((s) => s.id === where.id) ?? null),
      findMany: fn(() => saved),
      findFirst: fn(() => null),
      delete: fn(),
    },
    savedQueryRun: {
      create: fn(({ data }) => ({ id: BigInt(1), ...data })),
      findMany: fn(() => [{ id: BigInt(1), status: 'success' }]),
      updateMany: fn(() => ({ count: 1 })),
    },
    tableMeta: {
      findMany: fn(() => [{ id: 10, tableName: 'orders', structureHash: options.tableHash ?? 'h1', database: { databaseName: 'shop' } }]),
    },
    user: { findUnique: fn(() => options.user ?? { isActive: true, role: 'user' }) },
  };
  const runner = {
    executeUserSQL: jest.fn(async (..._args: any[]): Promise<any> => ({
      success: true,
      data: Array.from({ length: 150 }, (_, i) => ({ city: `c${i}`, n: BigInt(i) })),
      metadata: { rowCount: 150, columns: [{ name: 'city', type: 'string' }, { name: 'n', type: 'number' }] },
    })),
  };
  const resolver = {
    retrieveContextForSQL: jest.fn(async (..._args: any[]): Promise<any> => ({ tables: [{ id: 10, database: { sourceId: 1 } }] })),
  };
  return { prisma, runner, resolver, deps: { prisma, runner, resolver } };
}

beforeEach(() => {
  delete process.env.SAVED_QUERY_LIMIT_PER_USER;
  delete process.env.SAVED_QUERY_PREVIEW_ROWS;
});

describe('createSavedQuery', () => {
  it('保存该次执行的 SQL、表结构快照与数据源，并计算下次执行时间', async () => {
    const { deps, prisma } = setup();

    const saved = await createSavedQuery(deps, { userId: '7', runId: RUN_ID, schedule: 'weekly', runAtHour: 8, runOnWeekday: 5 });

    expect(prisma.savedQuery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '各城市订单数',
        questionHash: questionHash('各城市订单数'),
        sql: SQL,
        dataSourceIds: '[1]',
        tableSnapshot: snapshot(),
        sourceRunId: RUN_ID,
        schedule: 'weekly',
        runAtHour: 8,
        runOnWeekday: 5,
      }),
    });
    expect(saved.nextRunAt).toBeInstanceOf(Date);
    expect((saved.nextRunAt as Date).getDay()).toBe(5);
  });

  it('不是自己的查询 404；执行失败的查询 422；超过数量上限 409', async () => {
    await expect(createSavedQuery(setup().deps, { userId: '8', runId: RUN_ID })).rejects.toMatchObject({ status: 404 });

    const failed = setup({ run: { userId: '7', executionSuccess: false, generatedSql: SQL } });
    await expect(createSavedQuery(failed.deps, { userId: '7', runId: RUN_ID })).rejects.toMatchObject({ status: 422 });

    process.env.SAVED_QUERY_LIMIT_PER_USER = '2';
    await expect(createSavedQuery(setup({ savedCount: 2 }).deps, { userId: '7', runId: RUN_ID })).rejects.toMatchObject({ status: 409 });
  });

  it('编辑 SQL 的执行记录：问题去掉前缀', async () => {
    const { deps, prisma } = setup({
      run: { userId: '7', naturalLanguageQuery: '[用户编辑 SQL] 各城市订单数', generatedSql: SQL, executionSuccess: true, dataSourceIds: null },
    });
    await createSavedQuery(deps, { userId: '7', runId: RUN_ID });
    expect(prisma.savedQuery.create.mock.calls[0][0].data.question).toBe('各城市订单数');
  });
});

describe('runDueSavedQueries', () => {
  it('执行到期查询：按保存人权限执行，保存前 100 行预览（BigInt 转字符串），更新下次时间', async () => {
    const { deps, prisma, runner } = setup();
    const now = at(21, 9, 30);

    const summary = await runDueSavedQueries(deps, now);

    expect(summary).toEqual({ due: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(prisma.savedQuery.updateMany).toHaveBeenCalledWith({
      where: { id: 4, status: 'active', nextRunAt: at(21, 9, 28) },
      data: { nextRunAt: at(22, 9, 28) },
    });
    expect(runner.executeUserSQL).toHaveBeenCalledWith(SQL, expect.objectContaining({
      dataSourceIds: [1], user: { id: '7', role: 'user' }, maxRows: 1000,
    }));
    const run = prisma.savedQueryRun.create.mock.calls[0][0].data;
    expect(run).toMatchObject({ trigger: 'schedule', status: 'success', rowCount: 150, readAt: null });
    const preview = JSON.parse(run.resultPreview);
    expect(preview).toHaveLength(100);
    expect(preview[5]).toEqual({ city: 'c5', n: '5' });
  });

  it('已被其他调度认领：跳过', async () => {
    const { deps, prisma, runner } = setup();
    prisma.savedQuery.updateMany.mockResolvedValue({ count: 0 });

    await runDueSavedQueries(deps, at(21, 9, 30));
    expect(runner.executeUserSQL).not.toHaveBeenCalled();
  });

  it('保存人已禁用：暂停并记录跳过', async () => {
    const { deps, prisma, runner } = setup({ user: { isActive: false, role: 'user' } });

    const summary = await runDueSavedQueries(deps, at(21, 9, 30));

    expect(summary.skipped).toBe(1);
    expect(runner.executeUserSQL).not.toHaveBeenCalled();
    expect(prisma.savedQuery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'paused' }) }));
  });

  it('表结构变化：不执行，标记为需要确认', async () => {
    const { deps, prisma, runner } = setup({ tableHash: 'h2' });

    await runDueSavedQueries(deps, at(21, 9, 30));

    expect(runner.executeUserSQL).not.toHaveBeenCalled();
    expect(prisma.savedQuery.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { status: 'needs_review', statusReason: '表结构已变化：shop.orders' },
    });
    expect(prisma.savedQueryRun.create.mock.calls[0][0].data.status).toBe('skipped');
  });

  it('连续第 3 次失败：暂停定时刷新', async () => {
    const { deps, prisma, runner } = setup({ saved: [savedRow({ consecutiveFailures: 2 })] });
    runner.executeUserSQL.mockResolvedValue({ success: false, error: 'Unknown column' });

    const summary = await runDueSavedQueries(deps, at(21, 9, 30));

    expect(summary.failed).toBe(1);
    const { data } = prisma.savedQuery.update.mock.calls.at(-1)[0];
    expect(data).toMatchObject({ consecutiveFailures: 3, status: 'paused', lastRunStatus: 'failed' });
    expect(data.statusReason).toContain('Unknown column');
  });
});

describe('runSavedQueryNow / updateSavedQuery', () => {
  it('手动执行：表结构变化时仍执行但提示，并把定时刷新标记为需要确认', async () => {
    const { deps, prisma } = setup({ tableHash: 'h2' });

    const { result } = await runSavedQueryNow(deps, { id: '7', role: 'user' as any }, 4);

    expect(result.success).toBe(true);
    expect(result.warnings?.[0]).toContain('shop.orders');
    expect(prisma.savedQuery.update.mock.calls[0][0].data.status).toBe('needs_review');
    expect(prisma.savedQueryRun.create.mock.calls[0][0].data).toMatchObject({ trigger: 'manual', readAt: expect.any(Date) });
  });

  it('不是自己的查询：404', async () => {
    await expect(runSavedQueryNow(setup().deps, { id: '8', role: 'user' as any }, 4)).rejects.toMatchObject({ status: 404 });
  });

  it('确认并恢复：刷新表结构快照、清零失败次数', async () => {
    const { deps, prisma } = setup({ saved: [savedRow({ status: 'needs_review', tableSnapshot: snapshot('old') })] });

    await updateSavedQuery(deps, '7', 4, { status: 'active' });

    const { data } = prisma.savedQuery.update.mock.calls[0][0];
    expect(data).toMatchObject({ status: 'active', statusReason: null, consecutiveFailures: 0, tableSnapshot: snapshot('h1') });
    expect(data.nextRunAt).toBeInstanceOf(Date);
  });

  it('改为不自动刷新：下次执行时间为空', async () => {
    const { deps, prisma } = setup();
    await updateSavedQuery(deps, '7', 4, { schedule: 'none', title: '  ' });
    const { data } = prisma.savedQuery.update.mock.calls[0][0];
    expect(data).toMatchObject({ schedule: 'none', nextRunAt: null, title: '各城市订单数' });
  });
});

describe('getSavedQuery / getSaveSuggestion', () => {
  it('查看详情：标记未读为已读', async () => {
    const { prisma } = setup();
    const detail = await getSavedQuery(prisma, '7', 4);
    expect(detail.runs[0].id).toBe('1');
    expect(prisma.savedQueryRun.updateMany).toHaveBeenCalledWith({ where: { savedQueryId: 4, readAt: null }, data: { readAt: expect.any(Date) } });
  });

  it('14 天内问过 3 次且未保存：提示；已保存：不提示', async () => {
    const { prisma } = setup();
    expect(await getSaveSuggestion(prisma, '7', RUN_ID)).toEqual({ suggest: true, count: 3, savedQueryId: undefined });

    prisma.savedQuery.findFirst.mockResolvedValue({ id: 4 });
    expect(await getSaveSuggestion(prisma, '7', RUN_ID)).toMatchObject({ suggest: false, savedQueryId: 4 });

    prisma.queryAuditLog.count.mockResolvedValue(2);
    prisma.savedQuery.findFirst.mockResolvedValue(null);
    expect((await getSaveSuggestion(prisma, '7', RUN_ID)).suggest).toBe(false);

    expect((await getSaveSuggestion(prisma, '8', RUN_ID)).suggest).toBe(false);
  });
});
