/**
 * 保存的查询
 *
 * 用户把执行成功的查询保存下来，之后直接执行保存的 SQL（不调用 AI，结果口径固定），
 * 可选每天 / 每周定时刷新，结果预览保存在 SavedQueryRun 中，在「我的查询」页查看。
 *
 * - 执行走编辑 SQL 的路径（QueryOrchestrator.executeUserSQL，enforce 校验），权限按保存人计算
 * - 保存时记录涉及表的结构哈希；定时执行前发现表结构变化时不执行，标记为需要确认
 * - 定时执行由外部调度调用 POST /api/admin/maintenance/run-saved-queries 触发
 */

import type { PrismaClient, SavedQuery, SavedQuerySchedule } from '@prisma/client';
import { ServiceError } from '@/lib/api/service-error';
import type { QueryUser } from '@/lib/auth/data-permissions';
import { UserRole, isUserRole } from '@/lib/auth/permissions';
import type { QueryOptions, QueryResult } from '@/lib/di/orchestrators/query.orchestrator';
import { findChangedTables, snapshotTables, type TableSnapshotEntry } from '@/lib/metadata/table-snapshot';
import { stripEditedPrefix, type SqlContextResolver } from '@/lib/feedback/feedback-service';
import { parseJsonArray, questionHash } from '@/lib/feedback/question';
import { computeNextRun, type ScheduleSettings } from './schedule';

type SavedPrisma = Pick<PrismaClient, 'savedQuery' | 'savedQueryRun' | 'queryAuditLog' | 'tableMeta' | 'user'>;

/** 执行 SQL 的能力（QueryOrchestrator.executeUserSQL） */
export interface SqlRunner {
  executeUserSQL(sql: string, options?: QueryOptions & { dataSourceIds?: number[] }): Promise<QueryResult>;
}

export interface SavedQueryDeps {
  prisma: SavedPrisma;
  runner: SqlRunner;
  resolver: SqlContextResolver;
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** 每个用户最多保存的查询数 */
export const getSavedQueryLimit = () => envInt('SAVED_QUERY_LIMIT_PER_USER', 50);
/** 每次执行保存的结果预览行数 */
export const getPreviewRows = () => envInt('SAVED_QUERY_PREVIEW_ROWS', 100);
/** 单次调度最多执行的查询数 */
export const getMaxPerTick = () => envInt('SAVED_QUERY_MAX_PER_TICK', 8);

/** 定时执行的行数上限与超时（手动执行与查询页一致） */
const SCHEDULED_MAX_ROWS = 1000;
const MANUAL_MAX_ROWS = 10000;
const TIMEOUT_MS = 30000;
/** 连续失败次数达到上限后暂停定时刷新 */
const MAX_CONSECUTIVE_FAILURES = 3;
/** 重复提问提示：统计窗口与次数 */
const SUGGEST_WINDOW_DAYS = 14;
const SUGGEST_MIN_COUNT = 3;

export interface SavedQueryInput extends Partial<ScheduleSettings> {
  title?: string;
}

function scheduleOf(q: Pick<SavedQuery, 'schedule' | 'runAtHour' | 'runOnWeekday'>): ScheduleSettings {
  return { schedule: q.schedule, runAtHour: q.runAtHour, runOnWeekday: q.runOnWeekday };
}

/** BigInt 等无法直接 JSON 序列化的值转为字符串 */
function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}

async function findOwn(prisma: SavedPrisma, userId: string, id: number) {
  const saved = await prisma.savedQuery.findUnique({ where: { id } });
  // 不是自己的查询按不存在处理，避免泄露记录是否存在
  if (!saved || saved.userId !== userId) {
    throw new ServiceError('保存的查询不存在', 404);
  }
  return saved;
}

async function resolveTables(deps: SavedQueryDeps, sql: string, dataSourceIds: number[]) {
  try {
    const context = await deps.resolver.retrieveContextForSQL(sql, dataSourceIds.length > 0 ? dataSourceIds : undefined);
    const sourceIds = Array.from(
      new Set(context.tables.map((t) => t.database?.sourceId).filter((id): id is number => id !== undefined))
    );
    return { sourceIds, snapshot: await snapshotTables(deps.prisma, context.tables.map((t) => t.id)) };
  } catch (error) {
    throw new ServiceError(error instanceof Error ? error.message : '无法识别 SQL 涉及的表', 422);
  }
}

export async function createSavedQuery(
  deps: SavedQueryDeps,
  input: SavedQueryInput & { userId: string; runId: string }
) {
  const { prisma } = deps;
  const run = await prisma.queryAuditLog.findUnique({ where: { runId: input.runId } });
  if (!run || run.userId !== input.userId) {
    throw new ServiceError('查询记录不存在或已过期', 404);
  }
  if (!run.executionSuccess || !run.generatedSql) {
    throw new ServiceError('只能保存执行成功的查询', 422);
  }
  if ((await prisma.savedQuery.count({ where: { userId: input.userId } })) >= getSavedQueryLimit()) {
    throw new ServiceError(`最多保存 ${getSavedQueryLimit()} 个查询，请先删除不再需要的`, 409);
  }

  const question = stripEditedPrefix(run.naturalLanguageQuery);
  const { sourceIds, snapshot } = await resolveTables(deps, run.generatedSql, parseJsonArray<number>(run.dataSourceIds));
  const settings: ScheduleSettings = {
    schedule: input.schedule ?? 'none',
    runAtHour: input.runAtHour ?? 9,
    runOnWeekday: input.runOnWeekday ?? 1,
  };

  const created = await prisma.savedQuery.create({
    data: {
      userId: input.userId,
      title: input.title?.trim() || question.slice(0, 100) || '未命名查询',
      question,
      questionHash: questionHash(question),
      sql: run.generatedSql,
      dataSourceIds: JSON.stringify(sourceIds),
      tableSnapshot: JSON.stringify(snapshot),
      sourceRunId: input.runId,
      ...settings,
    },
  });
  // 错开分钟依赖 ID，创建后再计算下次执行时间
  return prisma.savedQuery.update({
    where: { id: created.id },
    data: { nextRunAt: computeNextRun(settings, created.id) },
  });
}

export async function listSavedQueries(prisma: SavedPrisma, userId: string) {
  const items = await prisma.savedQuery.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { runs: { where: { readAt: null } } } } },
  });
  return items.map(({ _count, tableSnapshot, ...q }) => ({
    ...q,
    dataSourceIds: parseJsonArray<number>(q.dataSourceIds),
    tables: parseJsonArray<TableSnapshotEntry>(tableSnapshot).map((t) => `${t.databaseName}.${t.tableName}`),
    unreadRuns: _count.runs,
  }));
}

export async function countUnreadRuns(prisma: SavedPrisma, userId: string): Promise<number> {
  return prisma.savedQueryRun.count({ where: { readAt: null, savedQuery: { userId } } });
}

/**
 * 详情与最近的执行记录（不含结果预览）；查看即标记为已读
 */
export async function getSavedQuery(prisma: SavedPrisma, userId: string, id: number) {
  const saved = await findOwn(prisma, userId, id);
  const runs = await prisma.savedQueryRun.findMany({
    where: { savedQueryId: id },
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: { id: true, trigger: true, status: true, rowCount: true, durationMs: true, error: true, readAt: true, startedAt: true },
  });
  await prisma.savedQueryRun.updateMany({ where: { savedQueryId: id, readAt: null }, data: { readAt: new Date() } });
  return {
    ...saved,
    dataSourceIds: parseJsonArray<number>(saved.dataSourceIds),
    tableSnapshot: undefined,
    runs: runs.map((r) => ({ ...r, id: r.id.toString() })),
  };
}

export async function getSavedQueryRun(prisma: SavedPrisma, userId: string, id: number, runId: bigint) {
  await findOwn(prisma, userId, id);
  const run = await prisma.savedQueryRun.findUnique({ where: { id: runId } });
  if (!run || run.savedQueryId !== id) {
    throw new ServiceError('执行记录不存在', 404);
  }
  return {
    ...run,
    id: run.id.toString(),
    columns: parseJsonArray<{ name: string; type: string }>(run.columns),
    resultPreview: parseJsonArray<Record<string, unknown>>(run.resultPreview),
  };
}

export async function updateSavedQuery(
  deps: SavedQueryDeps,
  userId: string,
  id: number,
  patch: SavedQueryInput & { status?: 'active' | 'paused' }
) {
  const saved = await findOwn(deps.prisma, userId, id);
  const settings: ScheduleSettings = {
    schedule: patch.schedule ?? saved.schedule,
    runAtHour: patch.runAtHour ?? saved.runAtHour,
    runOnWeekday: patch.runOnWeekday ?? saved.runOnWeekday,
  };
  const data: Record<string, unknown> = { ...settings };
  if (patch.title !== undefined) {
    data.title = patch.title.trim() || saved.title;
  }

  if (patch.status === 'paused') {
    Object.assign(data, { status: 'paused', statusReason: null });
  } else if (patch.status === 'active') {
    Object.assign(data, { status: 'active', statusReason: null, consecutiveFailures: 0 });
    if (saved.status === 'needs_review') {
      // 用户确认 SQL 在新的表结构下仍然正确：刷新快照
      const { sourceIds, snapshot } = await resolveTables(deps, saved.sql, parseJsonArray<number>(saved.dataSourceIds));
      Object.assign(data, { dataSourceIds: JSON.stringify(sourceIds), tableSnapshot: JSON.stringify(snapshot) });
    }
  }
  data.nextRunAt = computeNextRun(settings, id);

  return deps.prisma.savedQuery.update({ where: { id }, data });
}

export async function deleteSavedQuery(prisma: SavedPrisma, userId: string, id: number) {
  await findOwn(prisma, userId, id);
  await prisma.savedQuery.delete({ where: { id } });
}

/**
 * 执行并记录结果；返回执行结果（手动执行时直接展示）
 */
async function executeAndRecord(
  deps: SavedQueryDeps,
  saved: SavedQuery,
  options: { trigger: 'manual' | 'schedule'; user: QueryUser; maxRows: number }
) {
  const started = Date.now();
  let result: QueryResult;
  try {
    result = await deps.runner.executeUserSQL(saved.sql, {
      dataSourceIds: parseJsonArray<number>(saved.dataSourceIds),
      user: options.user,
      maxRows: options.maxRows,
      timeout: TIMEOUT_MS,
    });
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : '执行失败' };
  }

  const success = result.success;
  const run = await deps.prisma.savedQueryRun.create({
    data: {
      savedQueryId: saved.id,
      trigger: options.trigger,
      status: success ? 'success' : 'failed',
      rowCount: success ? result.metadata?.rowCount ?? result.data?.length ?? 0 : null,
      durationMs: Date.now() - started,
      columns: success ? toJson(result.metadata?.columns ?? []) : null,
      resultPreview: success ? toJson((result.data ?? []).slice(0, getPreviewRows())) : null,
      error: success ? null : result.error ?? '执行失败',
      // 手动执行的结果用户当场就看到了
      readAt: options.trigger === 'manual' ? new Date() : null,
    },
  });

  const failures = success ? 0 : saved.consecutiveFailures + 1;
  const pause = options.trigger === 'schedule' && failures >= MAX_CONSECUTIVE_FAILURES;
  await deps.prisma.savedQuery.update({
    where: { id: saved.id },
    data: {
      lastRunAt: new Date(),
      lastRunStatus: success ? 'success' : 'failed',
      consecutiveFailures: failures,
      ...(pause && { status: 'paused', statusReason: `连续 ${failures} 次执行失败，已暂停定时刷新：${result.error ?? ''}`.slice(0, 255) }),
    },
  });

  return { run, result };
}

async function recordSkipped(prisma: SavedPrisma, savedQueryId: number, reason: string) {
  await prisma.savedQueryRun.create({
    data: { savedQueryId, trigger: 'schedule', status: 'skipped', error: reason },
  });
}

/**
 * 手动执行：表结构变化时仍执行（用户在场），但提示并把定时刷新标记为需要确认
 */
export async function runSavedQueryNow(deps: SavedQueryDeps, user: QueryUser & { id: string }, id: number) {
  const saved = await findOwn(deps.prisma, user.id, id);
  const changed = await findChangedTables(deps.prisma, parseJsonArray<TableSnapshotEntry>(saved.tableSnapshot));
  const warnings: string[] = [];
  if (changed.length > 0) {
    warnings.push(`保存后以下表的结构已变化，结果可能不正确：${changed.join('、')}`);
    if (saved.schedule !== 'none' && saved.status === 'active') {
      await deps.prisma.savedQuery.update({
        where: { id },
        data: { status: 'needs_review', statusReason: `表结构已变化：${changed.join('、')}`.slice(0, 255) },
      });
    }
  }

  const { run, result } = await executeAndRecord(deps, saved, { trigger: 'manual', user, maxRows: MANUAL_MAX_ROWS });
  return { runId: run.id.toString(), result: { ...result, warnings: [...warnings, ...(result.warnings ?? [])] } };
}

export interface ScheduledRunSummary {
  due: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * 执行到期的定时查询（外部调度调用）
 *
 * 先用 nextRunAt 做乐观锁「认领」再执行，多实例或调度重叠时同一查询不会重复执行。
 */
export async function runDueSavedQueries(deps: SavedQueryDeps, now: Date = new Date()): Promise<ScheduledRunSummary> {
  const { prisma } = deps;
  const due = await prisma.savedQuery.findMany({
    where: { status: 'active', schedule: { not: 'none' as SavedQuerySchedule }, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: 'asc' },
    take: getMaxPerTick(),
  });
  const summary: ScheduledRunSummary = { due: due.length, succeeded: 0, failed: 0, skipped: 0 };

  for (const saved of due) {
    const claimed = await prisma.savedQuery.updateMany({
      where: { id: saved.id, status: 'active', nextRunAt: saved.nextRunAt },
      data: { nextRunAt: computeNextRun(scheduleOf(saved), saved.id, now) },
    });
    if (claimed.count === 0) continue;

    const owner = /^\d+$/.test(saved.userId)
      ? await prisma.user.findUnique({ where: { id: Number(saved.userId) }, select: { isActive: true, role: true } })
      : null;
    if (!owner?.isActive) {
      await prisma.savedQuery.update({ where: { id: saved.id }, data: { status: 'paused', statusReason: '保存人已被禁用或删除' } });
      await recordSkipped(prisma, saved.id, '保存人已被禁用或删除');
      summary.skipped++;
      continue;
    }

    const changed = await findChangedTables(prisma, parseJsonArray<TableSnapshotEntry>(saved.tableSnapshot));
    if (changed.length > 0) {
      const reason = `表结构已变化：${changed.join('、')}`.slice(0, 255);
      await prisma.savedQuery.update({ where: { id: saved.id }, data: { status: 'needs_review', statusReason: reason } });
      await recordSkipped(prisma, saved.id, `${reason}，请确认 SQL 后重新启用`);
      summary.skipped++;
      continue;
    }

    const role = isUserRole(owner.role) ? owner.role : UserRole.USER;
    const { result } = await executeAndRecord(deps, saved, {
      trigger: 'schedule',
      user: { id: saved.userId, role },
      maxRows: SCHEDULED_MAX_ROWS,
    });
    if (result.success) summary.succeeded++;
    else summary.failed++;
  }

  return summary;
}

/**
 * 是否提示保存：同一用户 14 天内问过至少 3 次相同的问题（归一化后），且尚未保存
 */
export async function getSaveSuggestion(prisma: SavedPrisma, userId: string, runId: string) {
  const run = await prisma.queryAuditLog.findUnique({
    where: { runId },
    select: { userId: true, questionHash: true, executionSuccess: true },
  });
  if (!run || run.userId !== userId || !run.questionHash || !run.executionSuccess) {
    return { suggest: false, count: 0 };
  }

  const since = new Date(Date.now() - SUGGEST_WINDOW_DAYS * 24 * 3600 * 1000);
  const [count, existing] = await Promise.all([
    prisma.queryAuditLog.count({
      where: { userId, questionHash: run.questionHash, executionSuccess: true, timestamp: { gte: since } },
    }),
    prisma.savedQuery.findFirst({ where: { userId, questionHash: run.questionHash }, select: { id: true } }),
  ]);
  return { suggest: count >= SUGGEST_MIN_COUNT && !existing, count, savedQueryId: existing?.id };
}

/** 删除超过保留期的执行记录（随查询历史清理任务执行） */
export async function cleanupSavedQueryRuns(prisma: SavedPrisma, daysToKeep: number): Promise<number> {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 3600 * 1000);
  const { count } = await prisma.savedQueryRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
  return count;
}
