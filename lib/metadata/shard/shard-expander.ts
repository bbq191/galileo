/**
 * 分表组展开
 *
 * 检索命中分表组（TableShardGroup，同步时按命名与结构哈希自动识别）中的任意一张表时，
 * 把同组的其他分表加入元数据上下文，使生成的 SQL 可以覆盖全部分表（UNION ALL）。
 *
 * - 成员表名来自元数据库中真实同步的表；组内结构已由结构哈希验证一致，字段信息复用代表表
 * - 成员表标记 shardOf，Prompt 中只描述一次结构并列出分表清单，避免按分表数量膨胀
 * - 分表数量超过上限时不展开，只保留检索到的表，并在 context.warnings 中提示
 */

import type { PrismaClient } from '@prisma/client';
import type { MetadataContext, TableContext } from '@/lib/metadata/retrieval/types';

/** 单个分表组最多展开的表数（SHARD_EXPAND_LIMIT 可调整） */
export function getShardExpandLimit(): number {
  const limit = Number(process.env.SHARD_EXPAND_LIMIT);
  return Number.isInteger(limit) && limit > 0 ? limit : 32;
}

type ShardPrisma = Pick<PrismaClient, 'tableMeta'>;

export async function expandShardGroups(
  prisma: ShardPrisma,
  context: MetadataContext
): Promise<MetadataContext> {
  if (context.tables.length === 0) {
    return context;
  }

  const grouped = await prisma.tableMeta.findMany({
    where: { id: { in: context.tables.map((t) => t.id) }, shardGroupId: { not: null } },
    select: {
      id: true,
      shardGroupId: true,
      shardGroup: { select: { id: true, groupName: true, baseTablePattern: true } },
    },
  });
  if (grouped.length === 0) {
    return context;
  }

  const limit = getShardExpandLimit();
  const warnings = [...(context.warnings ?? [])];
  const tables: TableContext[] = [...context.tables];
  const groupOfTable = new Map(grouped.map((g) => [g.id, g]));
  const handledGroups = new Set<number>();

  for (const table of context.tables) {
    const info = groupOfTable.get(table.id);
    if (!info?.shardGroup || handledGroups.has(info.shardGroup.id)) continue;
    handledGroups.add(info.shardGroup.id);

    const members = await prisma.tableMeta.findMany({
      where: { shardGroupId: info.shardGroup.id },
      select: { id: true, tableName: true, rowCount: true },
      orderBy: { tableName: 'asc' },
    });

    if (members.length > limit) {
      warnings.push(
        `表 ${table.tableName} 属于分表组 ${info.shardGroup.groupName}（共 ${members.length} 张分表，` +
          `超过展开上限 ${limit}），本次只查询了检索到的分表；如需全量统计请缩小范围或调大 SHARD_EXPAND_LIMIT`
      );
      continue;
    }

    // 代表表携带分表组信息
    const representative: TableContext = {
      ...table,
      shardGroup: {
        id: info.shardGroup.id,
        groupName: info.shardGroup.groupName,
        baseTablePattern: info.shardGroup.baseTablePattern,
        tableNames: members.map((m) => m.tableName),
      },
    };
    tables[tables.indexOf(table)] = representative;

    for (const member of members) {
      if (member.id === table.id) continue;

      const existingIndex = tables.findIndex((t) => t.id === member.id);
      if (existingIndex >= 0) {
        // 检索时已命中的同组分表，同样作为成员处理
        tables[existingIndex] = { ...tables[existingIndex], shardOf: table.tableName, shardGroup: undefined };
        continue;
      }

      tables.push({
        ...table,
        id: member.id,
        tableName: member.tableName,
        rowCount: member.rowCount === null ? undefined : Number(member.rowCount),
        shardOf: table.tableName,
        shardGroup: undefined,
      });
    }
  }

  return {
    ...context,
    tables,
    // 成员表复用代表表的字段，不重复加入扁平字段列表
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
