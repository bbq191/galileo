/**
 * 查询反馈
 *
 * - 用户：对自己的查询结果点赞 / 点踩；编辑 SQL 后执行成功自动记为「已纠正」
 * - 管理员：审核反馈，采纳后生成已验证查询（VerifiedQuery）
 *
 * 反馈通过 runId 关联审计日志（QueryAuditLog.runId），问题与 SQL 冗余保存，
 * 审计日志过期清理后仍可审核。
 */

import type { FeedbackRating, FeedbackReason, Prisma, PrismaClient, ReviewStatus } from '@prisma/client';
import type { MetadataContext } from '@/lib/metadata/types';
import { snapshotTables } from '@/lib/metadata/table-snapshot';
import { ServiceError } from '@/lib/api/service-error';
import { parseJsonArray, questionHash } from './question';

export class FeedbackError extends ServiceError {
  name = 'FeedbackError';
}

type FeedbackPrisma = Pick<PrismaClient, 'queryAuditLog' | 'queryFeedback' | 'verifiedQuery' | 'tableMeta' | '$transaction'>;

/** 只需要按 SQL 定位表的能力（MetadataRetriever.retrieveContextForSQL） */
export interface SqlContextResolver {
  retrieveContextForSQL(sql: string, dataSourceIds?: number[]): Promise<MetadataContext>;
}

/** 编辑 SQL 执行时审计日志中的问题前缀，见 app/api/query/execute-sql/route.ts */
export const EDITED_SQL_PREFIX = '[用户编辑 SQL]';

export function stripEditedPrefix(question: string): string {
  return question.startsWith(EDITED_SQL_PREFIX) ? question.slice(EDITED_SQL_PREFIX.length).trim() : question;
}

/** 仅忽略空白与末尾分号的差异 */
export function sameSql(a: string, b: string): boolean {
  const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '').trim();
  return normalize(a) === normalize(b);
}

async function findOwnRun(prisma: FeedbackPrisma, runId: string, userId: string) {
  const run = await prisma.queryAuditLog.findUnique({ where: { runId } });
  if (!run) {
    throw new FeedbackError('查询记录不存在或已过期', 404);
  }
  if (run.userId !== userId) {
    throw new FeedbackError('只能反馈自己的查询', 403);
  }
  return run;
}

export async function submitFeedback(
  prisma: FeedbackPrisma,
  input: { runId: string; userId: string; rating: 'up' | 'down'; reason?: FeedbackReason; comment?: string }
) {
  const run = await findOwnRun(prisma, input.runId, input.userId);
  const key = { runId_userId: { runId: input.runId, userId: input.userId } };
  const existing = await prisma.queryFeedback.findUnique({ where: key });

  if (existing && existing.status !== 'pending') {
    throw new FeedbackError('该反馈已审核，不能修改', 409);
  }

  const fields = {
    reason: input.rating === 'down' ? input.reason ?? null : null,
    comment: input.comment?.trim() || null,
  };

  if (existing) {
    // 已纠正的反馈保留纠正记录，只补充原因与说明
    return prisma.queryFeedback.update({
      where: key,
      data: existing.rating === 'corrected' ? fields : { ...fields, rating: input.rating },
    });
  }

  return prisma.queryFeedback.create({
    data: {
      runId: input.runId,
      userId: input.userId,
      rating: input.rating,
      ...fields,
      question: stripEditedPrefix(run.naturalLanguageQuery),
      generatedSql: run.generatedSql,
      dataSourceIds: run.dataSourceIds,
    },
  });
}

/**
 * 编辑 SQL 后执行成功：记为对原查询的纠正
 *
 * 原查询不存在、不属于当前用户、SQL 未改动或反馈已审核时不记录，返回 false。
 */
export async function recordCorrection(
  prisma: FeedbackPrisma,
  input: { sourceRunId: string; userId: string; sql: string; dataSourceIds?: number[] }
): Promise<boolean> {
  const run = await prisma.queryAuditLog.findUnique({ where: { runId: input.sourceRunId } });
  if (!run || run.userId !== input.userId || sameSql(run.generatedSql, input.sql)) {
    return false;
  }

  const key = { runId_userId: { runId: input.sourceRunId, userId: input.userId } };
  const existing = await prisma.queryFeedback.findUnique({ where: key });
  if (existing && existing.status !== 'pending') {
    return false;
  }

  const dataSourceIds = input.dataSourceIds?.length ? JSON.stringify(input.dataSourceIds) : run.dataSourceIds;
  if (existing) {
    await prisma.queryFeedback.update({
      where: key,
      data: { rating: 'corrected', correctedSql: input.sql, dataSourceIds },
    });
  } else {
    await prisma.queryFeedback.create({
      data: {
        runId: input.sourceRunId,
        userId: input.userId,
        rating: 'corrected',
        question: stripEditedPrefix(run.naturalLanguageQuery),
        generatedSql: run.generatedSql,
        correctedSql: input.sql,
        dataSourceIds,
      },
    });
  }
  return true;
}

export async function listFeedback(
  prisma: FeedbackPrisma,
  filters: { status?: ReviewStatus; rating?: FeedbackRating; page: number; limit: number }
) {
  const where: Prisma.QueryFeedbackWhereInput = {
    ...(filters.status && { status: filters.status }),
    ...(filters.rating && { rating: filters.rating }),
  };
  const [items, total] = await Promise.all([
    prisma.queryFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.queryFeedback.count({ where }),
  ]);
  return {
    items: items.map((f) => ({ ...f, dataSourceIds: parseJsonArray<number>(f.dataSourceIds) })),
    total,
  };
}

/**
 * 按 SQL 定位涉及的表，生成数据源列表与结构快照
 */
async function resolveSqlTables(
  prisma: FeedbackPrisma,
  resolver: SqlContextResolver,
  sql: string,
  dataSourceIds: number[]
) {
  let context: MetadataContext;
  try {
    context = await resolver.retrieveContextForSQL(sql, dataSourceIds.length > 0 ? dataSourceIds : undefined);
  } catch (error) {
    throw new FeedbackError(error instanceof Error ? error.message : '无法识别 SQL 涉及的表', 400);
  }
  const sourceIds = Array.from(
    new Set(context.tables.map((t) => t.database?.sourceId).filter((id): id is number => id !== undefined))
  );
  const snapshot = await snapshotTables(prisma, context.tables.map((t) => t.id));
  return { sourceIds, snapshot };
}

export async function reviewFeedback(
  prisma: FeedbackPrisma,
  resolver: SqlContextResolver,
  input: { id: number; action: 'accept' | 'reject'; reviewer: string; question?: string; sql?: string }
) {
  const feedback = await prisma.queryFeedback.findUnique({ where: { id: input.id } });
  if (!feedback) {
    throw new FeedbackError('反馈不存在', 404);
  }
  if (feedback.status !== 'pending') {
    throw new FeedbackError('该反馈已审核', 409);
  }

  const reviewed = { reviewedBy: input.reviewer, reviewedAt: new Date() };

  if (input.action === 'reject') {
    return { feedback: await prisma.queryFeedback.update({ where: { id: input.id }, data: { ...reviewed, status: 'rejected' } }) };
  }

  const question = input.question?.trim() || feedback.question;
  const sql = input.sql?.trim() || feedback.correctedSql || feedback.generatedSql;
  if (!question || !sql) {
    throw new FeedbackError('问题与 SQL 不能为空', 400);
  }

  const { sourceIds, snapshot } = await resolveSqlTables(
    prisma, resolver, sql, parseJsonArray<number>(feedback.dataSourceIds)
  );
  const hash = questionHash(question);
  const dataSourceIds = JSON.stringify(sourceIds);

  const [verifiedQuery, updated] = await prisma.$transaction(async (tx) => {
    // 同一问题、同一数据源只保留最新的已验证 SQL
    await tx.verifiedQuery.updateMany({
      where: { questionHash: hash, dataSourceIds, isActive: true },
      data: { isActive: false, invalidReason: '已被新的已验证查询替换' },
    });
    const created = await tx.verifiedQuery.create({
      data: {
        question,
        questionHash: hash,
        sql,
        dataSourceIds,
        tableSnapshot: JSON.stringify(snapshot),
        sourceFeedbackId: feedback.id,
        createdBy: input.reviewer,
      },
    });
    const updated = await tx.queryFeedback.update({
      where: { id: feedback.id },
      data: { ...reviewed, status: 'accepted', verifiedQueryId: created.id },
    });
    return [created, updated] as const;
  });

  return { feedback: updated, verifiedQuery };
}

export async function listVerifiedQueries(
  prisma: FeedbackPrisma,
  filters: { isActive?: boolean; page: number; limit: number }
) {
  const where = filters.isActive === undefined ? {} : { isActive: filters.isActive };
  const [items, total] = await Promise.all([
    prisma.verifiedQuery.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { hitCount: 'desc' }, { createdAt: 'desc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.verifiedQuery.count({ where }),
  ]);
  return {
    items: items.map(({ tableSnapshot, ...v }) => ({
      ...v,
      dataSourceIds: parseJsonArray<number>(v.dataSourceIds),
      tables: parseJsonArray<{ databaseName: string; tableName: string }>(tableSnapshot)
        .map((t) => `${t.databaseName}.${t.tableName}`),
    })),
    total,
  };
}

/**
 * 启用 / 停用；重新启用时按当前元数据刷新表结构快照（管理员确认 SQL 仍然正确）
 */
export async function setVerifiedQueryActive(
  prisma: FeedbackPrisma,
  resolver: SqlContextResolver,
  id: number,
  isActive: boolean
) {
  const verified = await prisma.verifiedQuery.findUnique({ where: { id } });
  if (!verified) {
    throw new FeedbackError('已验证查询不存在', 404);
  }
  if (!isActive) {
    return prisma.verifiedQuery.update({ where: { id }, data: { isActive: false, invalidReason: '管理员停用' } });
  }

  const { sourceIds, snapshot } = await resolveSqlTables(
    prisma, resolver, verified.sql, parseJsonArray<number>(verified.dataSourceIds)
  );
  return prisma.verifiedQuery.update({
    where: { id },
    data: {
      isActive: true,
      invalidReason: null,
      dataSourceIds: JSON.stringify(sourceIds),
      tableSnapshot: JSON.stringify(snapshot),
    },
  });
}
