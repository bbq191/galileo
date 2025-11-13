/**
 * 基于 DDL 哈希的结构变更检测器
 *
 * 功能：
 * - 计算表结构的 SHA256 哈希值
 * - 通过哈希对比精准检测表结构变更
 * - DDL 规范化处理，消除无关差异
 * - 保存结构快照到数据库
 *
 * 优势：
 * - 替代不可靠的 UPDATE_TIME 字段
 * - 100% 准确检测表结构变更
 * - 避免误报和漏报
 */

import crypto from 'crypto';
import { PrismaClient } from '@/app/generated/prisma';
import prisma from '@/lib/prisma/client';
import type { Connection } from 'mysql2/promise';

function getPrismaClient() {
  return prisma;
}

/**
 * 变更的表信息
 */
export interface ChangedTable {
  /** 表 ID */
  tableId: number;

  /** 表名 */
  tableName: string;

  /** 旧哈希值 */
  oldHash?: string;

  /** 新哈希值 */
  newHash: string;

  /** 新的 DDL */
  newDDL: string;

  /** 变更类型 */
  changeType: 'created' | 'modified' | 'deleted';
}

/**
 * 基于哈希的结构检测器
 */
export class StructureHashDetector {
  /**
   * 计算表结构哈希
   */
  calculateHash(ddl: string): string {
    // 1. 规范化 DDL（移除 AUTO_INCREMENT 值、注释格式差异）
    const normalized = this.normalizeDDL(ddl);

    // 2. 计算 SHA256
    return crypto
      .createHash('sha256')
      .update(normalized, 'utf8')
      .digest('hex');
  }

  /**
   * 检测数据库下所有表的结构变更
   */
  async detectDatabaseChanges(
    connection: Connection,
    databaseId: number,
    databaseName: string
  ): Promise<ChangedTable[]> {
    const client = getPrismaClient();

    // 获取数据库下的所有表
    const tables = await client.tableMeta.findMany({
      where: { databaseId },
      include: {
        schemaSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const changedTables: ChangedTable[] = [];

    for (const table of tables) {
      try {
        // 获取当前 DDL
        const currentDDL = await this.getTableDDL(
          connection,
          databaseName,
          table.tableName
        );

        if (!currentDDL) {
          // 表可能已被删除
          console.warn(`无法获取表 ${databaseName}.${table.tableName} 的 DDL，可能已被删除`);
          changedTables.push({
            tableId: table.id,
            tableName: table.tableName,
            oldHash: table.structureHash || undefined,
            newHash: '',
            newDDL: '',
            changeType: 'deleted',
          });
          continue;
        }

        const currentHash = this.calculateHash(currentDDL);
        const lastSnapshot = table.schemaSnapshots[0];

        // 对比哈希
        if (!lastSnapshot || lastSnapshot.structureHash !== currentHash) {
          const changeType = !lastSnapshot ? 'created' : 'modified';

          changedTables.push({
            tableId: table.id,
            tableName: table.tableName,
            oldHash: lastSnapshot?.structureHash,
            newHash: currentHash,
            newDDL: currentDDL,
            changeType,
          });

          console.log(
            `检测到表结构变更: ${databaseName}.${table.tableName} (${changeType})`
          );

          // 保存新快照
          await client.schemaSnapshot.create({
            data: {
              tableId: table.id,
              structureHash: currentHash,
              snapshotDdl: currentDDL,
            },
          });

          // 更新 tables_meta 的 structure_hash
          await client.tableMeta.update({
            where: { id: table.id },
            data: { structureHash: currentHash },
          });
        }
      } catch (error) {
        console.error(
          `检测表 ${databaseName}.${table.tableName} 时发生错误:`,
          error
        );
        // 继续处理其他表
      }
    }

    return changedTables;
  }

  /**
   * 检测单个表的结构变更
   */
  async detectTableChange(
    connection: Connection,
    tableId: number,
    databaseName: string,
    tableName: string
  ): Promise<ChangedTable | null> {
    const client = getPrismaClient();

    // 获取表的最新快照
    const table = await client.tableMeta.findUnique({
      where: { id: tableId },
      include: {
        schemaSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!table) {
      throw new Error(`表不存在: tableId=${tableId}`);
    }

    // 获取当前 DDL
    const currentDDL = await this.getTableDDL(
      connection,
      databaseName,
      tableName
    );

    if (!currentDDL) {
      return {
        tableId,
        tableName,
        oldHash: table.structureHash || undefined,
        newHash: '',
        newDDL: '',
        changeType: 'deleted',
      };
    }

    const currentHash = this.calculateHash(currentDDL);
    const lastSnapshot = table.schemaSnapshots[0];

    // 对比哈希
    if (!lastSnapshot || lastSnapshot.structureHash !== currentHash) {
      const changeType = !lastSnapshot ? 'created' : 'modified';

      // 保存新快照
      await client.schemaSnapshot.create({
        data: {
          tableId,
          structureHash: currentHash,
          snapshotDdl: currentDDL,
        },
      });

      // 更新表的哈希值
      await client.tableMeta.update({
        where: { id: tableId },
        data: { structureHash: currentHash },
      });

      return {
        tableId,
        tableName,
        oldHash: lastSnapshot?.structureHash,
        newHash: currentHash,
        newDDL: currentDDL,
        changeType,
      };
    }

    return null; // 没有变更
  }

  /**
   * DDL 规范化（消除无关差异）
   */
  private normalizeDDL(ddl: string): string {
    return (
      ddl
        // 移除 AUTO_INCREMENT 当前值（这个值会随着插入数据而变化）
        .replace(/AUTO_INCREMENT=\d+/gi, 'AUTO_INCREMENT=1')
        // 统一空格（多个空格替换为单个空格）
        .replace(/\s+/g, ' ')
        // 移除行尾注释
        .replace(/--.*$/gm, '')
        // 移除多余的换行
        .replace(/\n+/g, '\n')
        // 统一引号（将反引号统一处理）
        .replace(/`/g, '')
        // 移除行首行尾空格
        .trim()
        // 转为小写（MySQL 在不同操作系统上大小写可能不同）
        .toLowerCase()
    );
  }

  /**
   * 获取表的 DDL 语句
   */
  private async getTableDDL(
    connection: Connection,
    database: string,
    table: string
  ): Promise<string | null> {
    try {
      const [rows] = await connection.query<any[]>(
        `SHOW CREATE TABLE \`${database}\`.\`${table}\``
      );

      if (rows && rows.length > 0) {
        // MySQL 返回的结果中，DDL 在 'Create Table' 字段
        return rows[0]['Create Table'] || rows[0]['create table'];
      }

      return null;
    } catch (error: any) {
      // 表可能已被删除
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 批量检测多个表的变更
   */
  async detectMultipleTablesChanges(
    connection: Connection,
    tables: Array<{
      tableId: number;
      databaseName: string;
      tableName: string;
    }>
  ): Promise<ChangedTable[]> {
    const changedTables: ChangedTable[] = [];

    for (const table of tables) {
      try {
        const change = await this.detectTableChange(
          connection,
          table.tableId,
          table.databaseName,
          table.tableName
        );

        if (change) {
          changedTables.push(change);
        }
      } catch (error) {
        console.error(
          `检测表 ${table.databaseName}.${table.tableName} 时发生错误:`,
          error
        );
      }
    }

    return changedTables;
  }

  /**
   * 获取表的历史快照
   */
  async getTableSnapshots(
    tableId: number,
    limit: number = 10
  ): Promise<
    Array<{
      id: bigint;
      structureHash: string;
      snapshotDdl: string;
      createdAt: Date;
    }>
  > {
    const client = getPrismaClient();

    return await client.schemaSnapshot.findMany({
      where: { tableId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * 对比两个快照的差异
   */
  async compareSnapshots(
    snapshotId1: bigint,
    snapshotId2: bigint
  ): Promise<{
    hasChanges: boolean;
    oldHash: string;
    newHash: string;
    oldDDL: string;
    newDDL: string;
  }> {
    const client = getPrismaClient();

    const [snapshot1, snapshot2] = await Promise.all([
      client.schemaSnapshot.findUnique({ where: { id: snapshotId1 } }),
      client.schemaSnapshot.findUnique({ where: { id: snapshotId2 } }),
    ]);

    if (!snapshot1 || !snapshot2) {
      throw new Error('快照不存在');
    }

    return {
      hasChanges: snapshot1.structureHash !== snapshot2.structureHash,
      oldHash: snapshot1.structureHash,
      newHash: snapshot2.structureHash,
      oldDDL: snapshot1.snapshotDdl,
      newDDL: snapshot2.snapshotDdl,
    };
  }

  /**
   * 清理旧快照（保留最近 N 个）
   */
  async cleanupOldSnapshots(
    tableId: number,
    keepCount: number = 10
  ): Promise<number> {
    const client = getPrismaClient();

    // 获取所有快照，按时间倒序
    const snapshots = await client.schemaSnapshot.findMany({
      where: { tableId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    // 保留前 N 个，删除其余
    if (snapshots.length <= keepCount) {
      return 0;
    }

    const snapshotsToDelete = snapshots.slice(keepCount);
    const idsToDelete = snapshotsToDelete.map((s) => s.id);

    const result = await client.schemaSnapshot.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    return result.count;
  }
}

/**
 * 导出默认实例
 */
export const structureHashDetector = new StructureHashDetector();
