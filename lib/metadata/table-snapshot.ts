/**
 * 表结构快照
 *
 * 保存 SQL 时记录所涉及表的结构哈希（增量同步写入的 TableMeta.structureHash），
 * 之后复用该 SQL 前比较快照，表被删除或结构变化时不再直接使用。
 *
 * 结构哈希为空（如 PostgreSQL 采集器不支持 DDL）时无法判断，只检查表是否仍存在。
 */

import type { PrismaClient } from '@prisma/client';

export interface TableSnapshotEntry {
  tableId: number;
  databaseName: string;
  tableName: string;
  structureHash: string | null;
}

type SnapshotPrisma = Pick<PrismaClient, 'tableMeta'>;

export async function snapshotTables(prisma: SnapshotPrisma, tableIds: number[]): Promise<TableSnapshotEntry[]> {
  const ids = Array.from(new Set(tableIds));
  if (ids.length === 0) return [];
  const tables = await prisma.tableMeta.findMany({
    where: { id: { in: ids } },
    select: { id: true, tableName: true, structureHash: true, database: { select: { databaseName: true } } },
  });
  return tables.map((t) => ({
    tableId: t.id,
    databaseName: t.database.databaseName,
    tableName: t.tableName,
    structureHash: t.structureHash,
  }));
}

/**
 * 返回已删除或结构变化的表（`库.表`），全部未变化时返回空数组
 */
export async function findChangedTables(
  prisma: SnapshotPrisma,
  snapshot: TableSnapshotEntry[]
): Promise<string[]> {
  if (snapshot.length === 0) return [];
  const current = await prisma.tableMeta.findMany({
    where: { id: { in: snapshot.map((s) => s.tableId) } },
    select: { id: true, structureHash: true },
  });
  const currentHash = new Map(current.map((t) => [t.id, t.structureHash]));

  return snapshot
    .filter((s) => {
      if (!currentHash.has(s.tableId)) return true;
      const hash = currentHash.get(s.tableId);
      return !!s.structureHash && !!hash && s.structureHash !== hash;
    })
    .map((s) => `${s.databaseName}.${s.tableName}`);
}
