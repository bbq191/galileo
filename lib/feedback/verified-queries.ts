/**
 * 已验证查询（VerifiedQuery）
 *
 * 管理员从反馈中采纳的「问题 → SQL」，在 ENABLE_VERIFIED_QUERIES=true 时用于：
 * - 完全相同的问题（归一化后）：直接执行已验证的 SQL，不调用 AI
 * - 相似问题：作为 few-shot 示例注入 SQL 生成 Prompt
 *
 * 使用前比较采纳时的表结构快照，表被删除或结构变化时自动停用，避免沿用过期 SQL。
 */

import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { MetadataContext } from '@/lib/metadata/types';
import { findChangedTables, type TableSnapshotEntry } from '@/lib/metadata/table-snapshot';
import { parseJsonArray, questionHash, questionSimilarity } from './question';

export interface UsableVerifiedQuery {
  id: number;
  question: string;
  sql: string;
  dataSourceIds: number[];
}

export interface VerifiedExamplesSection {
  promptSection: string;
  digest: string;
  ids: number[];
}

type VerifiedPrisma = Pick<PrismaClient, 'verifiedQuery' | 'tableMeta'>;

interface VerifiedRow {
  id: number;
  question: string;
  sql: string;
  dataSourceIds: string;
  tableSnapshot: string;
}

/** 相似问题的最低相似度（字符二元组 Dice 系数） */
const SIMILARITY_THRESHOLD = 0.5;
/** 参与相似度计算的候选上限（按命中次数取前 N 条） */
const CANDIDATE_LIMIT = 2000;
const EXAMPLE_LIMIT = 2;

const SELECT = { id: true, question: true, sql: true, dataSourceIds: true, tableSnapshot: true } as const;

export class VerifiedQueryStore {
  constructor(private readonly prisma: VerifiedPrisma) {}

  /**
   * 完全相同的问题；指定数据源时要求已验证查询属于该数据源
   */
  async findExact(question: string, dataSourceId?: number): Promise<UsableVerifiedQuery | null> {
    const candidates = await this.prisma.verifiedQuery.findMany({
      where: { questionHash: questionHash(question), isActive: true },
      select: SELECT,
      orderBy: { updatedAt: 'desc' },
    });

    for (const candidate of candidates) {
      const usable = toUsable(candidate);
      if (dataSourceId !== undefined && !usable.dataSourceIds.includes(dataSourceId)) continue;
      if (await this.ensureUsable(candidate)) return usable;
    }
    return null;
  }

  /**
   * 相似问题：只选涉及的表全部在本次元数据上下文中的示例
   */
  async findSimilar(question: string, context: MetadataContext, limit = EXAMPLE_LIMIT): Promise<UsableVerifiedQuery[]> {
    const tableIds = new Set(context.tables.map((t) => t.id));
    if (tableIds.size === 0) return [];

    const candidates = await this.prisma.verifiedQuery.findMany({
      where: { isActive: true },
      select: SELECT,
      orderBy: { hitCount: 'desc' },
      take: CANDIDATE_LIMIT,
    });

    const ranked = candidates
      .map((row) => ({ row, snapshot: parseSnapshot(row), score: questionSimilarity(question, row.question) }))
      .filter(({ snapshot, score }) =>
        score >= SIMILARITY_THRESHOLD && snapshot.length > 0 && snapshot.every((s) => tableIds.has(s.tableId))
      )
      .sort((a, b) => b.score - a.score);

    const result: UsableVerifiedQuery[] = [];
    for (const { row } of ranked) {
      if (result.length >= limit) break;
      if (await this.ensureUsable(row)) result.push(toUsable(row));
    }
    return result;
  }

  /** 记录命中（直接执行或作为示例），失败不影响查询 */
  async recordHit(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.prisma.verifiedQuery.updateMany({
        where: { id: { in: ids } },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      });
    } catch (error) {
      console.error('[VerifiedQuery] 记录命中失败:', error);
    }
  }

  private async ensureUsable(row: VerifiedRow): Promise<boolean> {
    const changed = await findChangedTables(this.prisma, parseSnapshot(row));
    if (changed.length === 0) return true;

    const reason = `表结构已变化：${changed.join('、')}`.slice(0, 255);
    console.warn(`[VerifiedQuery] 停用 #${row.id}，${reason}`);
    await this.prisma.verifiedQuery.update({ where: { id: row.id }, data: { isActive: false, invalidReason: reason } });
    return false;
  }
}

function parseSnapshot(row: Pick<VerifiedRow, 'tableSnapshot'>): TableSnapshotEntry[] {
  return parseJsonArray<TableSnapshotEntry>(row.tableSnapshot);
}

function toUsable(row: VerifiedRow): UsableVerifiedQuery {
  return {
    id: row.id,
    question: row.question,
    sql: row.sql,
    dataSourceIds: parseJsonArray<number>(row.dataSourceIds),
  };
}

/**
 * 渲染为 SQL 生成 Prompt 片段
 */
export function renderVerifiedExamples(examples: UsableVerifiedQuery[]): VerifiedExamplesSection | null {
  if (examples.length === 0) return null;

  const promptSection =
    '\n## 已验证的查询示例\n\n' +
    '以下问题与 SQL 已由管理员确认正确。当前问题与示例口径一致时，参考其表、字段、过滤条件与聚合方式；' +
    '不要照搬与当前问题无关的条件：\n\n' +
    examples.map((e) => `- 问题：${e.question}\n\n\`\`\`sql\n${e.sql}\n\`\`\``).join('\n\n') +
    '\n';

  return {
    promptSection,
    digest: crypto.createHash('md5').update(promptSection).digest('hex'),
    ids: examples.map((e) => e.id),
  };
}
