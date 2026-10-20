/**
 * 问题推荐
 *
 * 查询页空白时推荐问题、输入时联想、查询失败时给出相似的可用问题。推荐来源按优先级：
 * 1. 已验证查询（管理员确认过 SQL）
 * 2. 近 30 天至少 2 个用户问过、且 80% 以上执行成功并返回数据的问题
 * 3. 查询模板示例（仅 ENABLE_BUSINESS_RULES=true 时，说明模板已按实际业务维护）
 *
 * 推荐列表由维护任务每天重建（POST /api/admin/maintenance/rebuild-suggestions），查询时只读一张小表；
 * 联想在前端按相似度过滤，不按输入逐字请求接口。
 *
 * 隐私：其他用户的提问会展示给所有人，因此要求至少 2 个不同用户问过，并排除包含长数字串
 * （手机号、证件号、订单号等）或邮箱的问题；管理员可在 /admin/feedback 隐藏个别问题，重建时保留隐藏状态。
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { ServiceError } from '@/lib/api/service-error';
import { parseJsonArray, questionHash } from '@/lib/feedback/question';

type SuggestionPrisma = Pick<
  PrismaClient,
  'questionSuggestion' | 'verifiedQuery' | 'queryAuditLog' | 'queryTemplate' | '$queryRaw' | '$transaction'
>;

export interface Suggestion {
  id: number;
  question: string;
  source: 'verified' | 'popular' | 'template';
  dataSourceIds: number[];
  userCount: number;
}

const POPULAR_WINDOW_DAYS = 30;
const POPULAR_MIN_USERS = 2;
const POPULAR_MIN_SUCCESS_RATE = 0.8;
const POPULAR_LIMIT = 500;
/** 每次返回给前端的推荐上限（前端在其中做联想过滤） */
const LIST_LIMIT = 200;

/** 连续 6 位以上数字（允许空格、短横线分隔）或邮箱 */
export function containsSensitive(question: string): boolean {
  return /(?:\d[\s-]?){6,}/.test(question) || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(question);
}

interface SuggestionRow {
  question: string;
  questionHash: string;
  dataSourceIds: string;
  source: Suggestion['source'];
  verifiedQueryId?: number;
  userCount: number;
  successRate: number;
  score: number;
}

interface PopularStat {
  questionHash: string;
  userCount: bigint | number;
  okCount: bigint | number;
  total: bigint | number;
}

async function collectPopular(prisma: SuggestionPrisma, now: Date): Promise<Map<string, SuggestionRow>> {
  const since = new Date(now.getTime() - POPULAR_WINDOW_DAYS * 24 * 3600 * 1000);
  const stats = await prisma.$queryRaw<PopularStat[]>(Prisma.sql`
    SELECT question_hash AS questionHash,
           COUNT(DISTINCT user_id) AS userCount,
           CAST(SUM(execution_success = 1 AND row_count > 0) AS SIGNED) AS okCount,
           COUNT(*) AS total
    FROM query_audit_logs
    WHERE timestamp >= ${since} AND question_hash IS NOT NULL AND user_id IS NOT NULL
    GROUP BY question_hash
    HAVING userCount >= ${POPULAR_MIN_USERS} AND okCount / total >= ${POPULAR_MIN_SUCCESS_RATE}
    ORDER BY userCount DESC, total DESC
    LIMIT ${POPULAR_LIMIT}
  `);
  if (stats.length === 0) return new Map();

  // 每个问题取最近一次成功执行的原文与数据源
  const latest = await prisma.queryAuditLog.findMany({
    where: { questionHash: { in: stats.map((s) => s.questionHash) }, executionSuccess: true },
    orderBy: { timestamp: 'desc' },
    distinct: ['questionHash'],
    select: { questionHash: true, naturalLanguageQuery: true, dataSourceIds: true },
  });
  const latestByHash = new Map(latest.map((l) => [l.questionHash, l]));

  const rows = new Map<string, SuggestionRow>();
  for (const stat of stats) {
    const log = latestByHash.get(stat.questionHash);
    if (!log || containsSensitive(log.naturalLanguageQuery)) continue;
    const userCount = Number(stat.userCount);
    const successRate = Number(stat.okCount) / Number(stat.total);
    rows.set(stat.questionHash, {
      question: log.naturalLanguageQuery,
      questionHash: stat.questionHash,
      dataSourceIds: log.dataSourceIds ?? '[]',
      source: 'popular',
      userCount,
      successRate,
      score: userCount * successRate,
    });
  }
  return rows;
}

async function collectVerified(prisma: SuggestionPrisma): Promise<SuggestionRow[]> {
  const verified = await prisma.verifiedQuery.findMany({
    where: { isActive: true },
    select: { id: true, question: true, questionHash: true, dataSourceIds: true, hitCount: true },
    orderBy: { hitCount: 'desc' },
  });
  return verified.map((v) => ({
    question: v.question,
    questionHash: v.questionHash,
    dataSourceIds: v.dataSourceIds,
    source: 'verified',
    verifiedQueryId: v.id,
    userCount: 0,
    successRate: 1,
    // 已验证的始终排在前面
    score: 1000 + Math.log1p(v.hitCount),
  }));
}

async function collectTemplates(prisma: SuggestionPrisma): Promise<SuggestionRow[]> {
  const templates = await prisma.queryTemplate.findMany({ where: { isEnabled: true }, select: { examples: true } });
  return templates
    .flatMap((t) => parseJsonArray<unknown>(t.examples))
    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0 && !/[{}]/.test(e))
    .map((question) => ({
      question: question.trim(),
      questionHash: questionHash(question),
      dataSourceIds: '[]',
      source: 'template' as const,
      userCount: 0,
      successRate: 0,
      score: 0.1,
    }));
}

export interface RebuildSummary {
  verified: number;
  popular: number;
  template: number;
  hidden: number;
}

export async function rebuildSuggestions(prisma: SuggestionPrisma, now: Date = new Date()): Promise<RebuildSummary> {
  const [verified, popular, templates, hiddenRows] = await Promise.all([
    collectVerified(prisma),
    collectPopular(prisma, now),
    isFeatureEnabled('businessRules') ? collectTemplates(prisma) : Promise.resolve([]),
    prisma.questionSuggestion.findMany({ where: { isHidden: true }, select: { questionHash: true } }),
  ]);
  const hidden = new Set(hiddenRows.map((h) => h.questionHash));

  // 同一问题按 已验证 > 热门 > 模板 去重；已验证的问题沿用热门统计中的提问人数
  const rows = new Map<string, SuggestionRow>();
  for (const row of [...verified, ...popular.values(), ...templates]) {
    if (hidden.has(row.questionHash) || rows.has(row.questionHash)) continue;
    const stat = popular.get(row.questionHash);
    rows.set(row.questionHash, stat && row.source === 'verified'
      ? { ...row, userCount: stat.userCount, successRate: stat.successRate }
      : row);
  }

  const data = Array.from(rows.values());
  await prisma.$transaction(async (tx) => {
    await tx.questionSuggestion.deleteMany({ where: { isHidden: false } });
    if (data.length > 0) {
      await tx.questionSuggestion.createMany({ data, skipDuplicates: true });
    }
  });

  const count = (source: Suggestion['source']) => data.filter((d) => d.source === source).length;
  return { verified: count('verified'), popular: count('popular'), template: count('template'), hidden: hidden.size };
}

/**
 * 推荐列表（按分数倒序）；指定数据源时只返回该数据源或不限数据源的问题
 */
export async function listSuggestions(prisma: SuggestionPrisma, dataSourceId?: number): Promise<Suggestion[]> {
  const rows = await prisma.questionSuggestion.findMany({
    where: { isHidden: false },
    orderBy: { score: 'desc' },
    take: LIST_LIMIT * 2,
    select: { id: true, question: true, source: true, dataSourceIds: true, userCount: true },
  });
  return rows
    .map((r) => ({ ...r, source: r.source as Suggestion['source'], dataSourceIds: parseJsonArray<number>(r.dataSourceIds) }))
    .filter((r) => dataSourceId === undefined || r.dataSourceIds.length === 0 || r.dataSourceIds.includes(dataSourceId))
    .slice(0, LIST_LIMIT);
}

export async function listSuggestionsForAdmin(prisma: SuggestionPrisma, filters: { page: number; limit: number }) {
  const [items, total] = await Promise.all([
    prisma.questionSuggestion.findMany({
      orderBy: [{ isHidden: 'desc' }, { score: 'desc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.questionSuggestion.count(),
  ]);
  return { items: items.map((i) => ({ ...i, dataSourceIds: parseJsonArray<number>(i.dataSourceIds) })), total };
}

export async function setSuggestionHidden(prisma: SuggestionPrisma, id: number, isHidden: boolean) {
  const existing = await prisma.questionSuggestion.findUnique({ where: { id } });
  if (!existing) {
    throw new ServiceError('推荐问题不存在', 404);
  }
  return prisma.questionSuggestion.update({ where: { id }, data: { isHidden } });
}
