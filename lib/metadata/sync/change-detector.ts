/**
 * 变更检测器主控制器
 *
 * 功能：
 * - 整合所有检测器（DDL 哈希检测、降级检测、表差异检测）
 * - 协调变更检测流程
 * - 记录变更历史
 * - 提供统一的检测接口
 */

import { PrismaClient } from '@prisma/client';
import type { Connection } from 'mysql2/promise';
import { structureHashDetector, type ChangedTable } from './hash-based-detector';
import { fallbackDetector, type ColumnChange } from './fallback-detector';
import {
  tableDiffDetector,
  type NewTable,
  type DeletedTable,
  type TableDiffResult,
} from './table-diff-detector';

let prisma: PrismaClient;

function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * 检测模式
 */
export enum DetectionMode {
  /** 优先使用 DDL 哈希 */
  HASH_FIRST = 'hash_first',
  /** 仅使用降级方案 */
  FALLBACK_ONLY = 'fallback_only',
  /** 自动选择 */
  AUTO = 'auto',
}

/**
 * 变更检测选项
 */
export interface ChangeDetectionOptions {
  /** 检测模式 */
  mode?: DetectionMode;

  /** 是否检测表差异（新增/删除） */
  detectTableDiff?: boolean;

  /** 是否检测结构变更 */
  detectStructureChange?: boolean;

  /** 是否记录变更历史 */
  recordHistory?: boolean;

  /** 是否详细输出 */
  verbose?: boolean;
}

/**
 * 完整的变更检测结果
 */
export interface ChangeDetectionResult {
  /** 数据库 ID */
  databaseId: number;

  /** 数据库名称 */
  databaseName: string;

  /** 检测开始时间 */
  startedAt: Date;

  /** 检测结束时间 */
  completedAt: Date;

  /** 检测耗时（毫秒） */
  duration: number;

  /** 表差异结果 */
  tableDiff: TableDiffResult;

  /** 结构变更的表 */
  changedTables: ChangedTable[];

  /** 总变更数 */
  totalChanges: number;

  /** 使用的检测方法 */
  detectionMethod: 'hash' | 'fallback' | 'mixed';
}

/**
 * 变更检测器主控制器
 */
export class ChangeDetector {
  /**
   * 检测数据库的所有变更
   */
  async detectChanges(
    connection: Connection,
    databaseId: number,
    databaseName: string,
    options: ChangeDetectionOptions = {}
  ): Promise<ChangeDetectionResult> {
    const startedAt = new Date();
    const {
      mode = DetectionMode.AUTO,
      detectTableDiff = true,
      detectStructureChange = true,
      recordHistory = true,
      verbose = false,
    } = options;

    if (verbose) {
      console.log(`\n开始检测数据库变更: ${databaseName}`);
      console.log(`检测模式: ${mode}`);
    }

    // 1. 检测表差异（新增/删除）
    let tableDiff: TableDiffResult = {
      newTables: [],
      deletedTables: [],
      totalChanges: 0,
    };

    if (detectTableDiff) {
      if (verbose) console.log('正在检测表差异...');
      tableDiff = await tableDiffDetector.detectTableDiff(
        connection,
        databaseId,
        databaseName
      );
      if (verbose) {
        console.log(`  新增表: ${tableDiff.newTables.length}`);
        console.log(`  删除表: ${tableDiff.deletedTables.length}`);
      }
    }

    // 2. 检测表结构变更
    let changedTables: ChangedTable[] = [];
    let detectionMethod: 'hash' | 'fallback' | 'mixed' = 'hash';

    if (detectStructureChange) {
      if (verbose) console.log('正在检测表结构变更...');

      // 根据模式选择检测方法
      if (mode === DetectionMode.HASH_FIRST || mode === DetectionMode.AUTO) {
        try {
          changedTables = await structureHashDetector.detectDatabaseChanges(
            connection,
            databaseId,
            databaseName
          );
          detectionMethod = 'hash';
        } catch (error) {
          console.error('DDL 哈希检测失败，切换到降级方案:', error);

          if (mode === DetectionMode.AUTO) {
            // 自动切换到降级方案
            changedTables = await this.detectByFallback(
              connection,
              databaseId,
              databaseName
            );
            detectionMethod = 'fallback';
          } else {
            throw error;
          }
        }
      } else if (mode === DetectionMode.FALLBACK_ONLY) {
        changedTables = await this.detectByFallback(
          connection,
          databaseId,
          databaseName
        );
        detectionMethod = 'fallback';
      }

      if (verbose) {
        console.log(`  结构变更表: ${changedTables.length}`);
      }
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    const result: ChangeDetectionResult = {
      databaseId,
      databaseName,
      startedAt,
      completedAt,
      duration,
      tableDiff,
      changedTables,
      totalChanges:
        tableDiff.totalChanges + changedTables.length,
      detectionMethod,
    };

    // 3. 记录变更历史
    if (recordHistory && result.totalChanges > 0) {
      await this.recordChanges(result);
    }

    if (verbose) {
      console.log(`\n检测完成，总变更数: ${result.totalChanges}`);
      console.log(`耗时: ${duration}ms`);
    }

    return result;
  }

  /**
   * 使用降级方案检测变更
   */
  private async detectByFallback(
    connection: Connection,
    databaseId: number,
    databaseName: string
  ): Promise<ChangedTable[]> {
    const client = getPrismaClient();

    const tables = await client.tableMeta.findMany({
      where: { databaseId },
      select: { id: true, tableName: true },
    });

    const changedTables: ChangedTable[] = [];

    for (const table of tables) {
      try {
        const hasChanged = await fallbackDetector.detectByColumns(
          connection,
          table.id,
          databaseName,
          table.tableName
        );

        if (hasChanged) {
          changedTables.push({
            tableId: table.id,
            tableName: table.tableName,
            oldHash: undefined,
            newHash: '',
            newDDL: '',
            changeType: 'modified',
          });
        }
      } catch (error) {
        console.error(`检测表 ${table.tableName} 时发生错误:`, error);
      }
    }

    return changedTables;
  }

  /**
   * 记录变更历史
   */
  private async recordChanges(
    result: ChangeDetectionResult
  ): Promise<void> {
    const client = getPrismaClient();

    try {
      // 记录新增表
      for (const newTable of result.tableDiff.newTables) {
        await client.metadataChange.create({
          data: {
            changeType: 'table_added',
            entityType: 'table',
            entityId: 0, // 新增表还没有 ID
            oldValue: null,
            newValue: {
              tableName: newTable.tableName,
              tableComment: newTable.tableComment,
            },
          },
        });
      }

      // 记录删除表
      for (const deletedTable of result.tableDiff.deletedTables) {
        await client.metadataChange.create({
          data: {
            changeType: 'table_removed',
            entityType: 'table',
            entityId: deletedTable.tableId,
            oldValue: {
              tableName: deletedTable.tableName,
            },
            newValue: null,
          },
        });
      }

      // 记录表结构变更
      for (const changedTable of result.changedTables) {
        if (changedTable.changeType === 'modified') {
          await client.metadataChange.create({
            data: {
              changeType: 'table_modified',
              entityType: 'table',
              entityId: changedTable.tableId,
              oldValue: {
                hash: changedTable.oldHash,
              },
              newValue: {
                hash: changedTable.newHash,
              },
            },
          });
        }
      }

      console.log(`已记录 ${result.totalChanges} 条变更历史`);
    } catch (error) {
      console.error('记录变更历史失败:', error);
    }
  }

  /**
   * 快速检测（仅检查是否有变更，不返回详情）
   */
  async quickDetect(
    connection: Connection,
    databaseId: number,
    databaseName: string
  ): Promise<boolean> {
    // 快速检测表数量是否变化
    const hasTableDiff = await tableDiffDetector.quickDetect(
      connection,
      databaseId,
      databaseName
    );

    return hasTableDiff;
  }

  /**
   * 检测单个表的变更
   */
  async detectTableChange(
    connection: Connection,
    tableId: number,
    databaseName: string,
    tableName: string,
    mode: DetectionMode = DetectionMode.AUTO
  ): Promise<ChangedTable | ColumnChange[] | null> {
    try {
      if (mode === DetectionMode.HASH_FIRST || mode === DetectionMode.AUTO) {
        return await structureHashDetector.detectTableChange(
          connection,
          tableId,
          databaseName,
          tableName
        );
      } else {
        const changes = await fallbackDetector.detectColumnChanges(
          connection,
          tableId,
          databaseName,
          tableName
        );
        return changes.length > 0 ? changes : null;
      }
    } catch (error) {
      if (mode === DetectionMode.AUTO) {
        // 降级到字段对比
        const changes = await fallbackDetector.detectColumnChanges(
          connection,
          tableId,
          databaseName,
          tableName
        );
        return changes.length > 0 ? changes : null;
      }
      throw error;
    }
  }

  /**
   * 获取变更历史
   */
  async getChangeHistory(
    databaseId: number,
    limit: number = 100
  ): Promise<
    Array<{
      id: bigint;
      changeType: string;
      entityType: string;
      entityId: number;
      oldValue: any;
      newValue: any;
      changedAt: Date;
    }>
  > {
    const client = getPrismaClient();

    // 获取该数据库相关的变更历史
    const tables = await client.tableMeta.findMany({
      where: { databaseId },
      select: { id: true },
    });

    const tableIds = tables.map((t) => t.id);

    return await client.metadataChange.findMany({
      where: {
        OR: [
          { entityType: 'database', entityId: databaseId },
          { entityType: 'table', entityId: { in: tableIds } },
        ],
      },
      orderBy: { changedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * 获取变更统计
   */
  async getChangeStatistics(
    databaseId: number,
    days: number = 7
  ): Promise<{
    total: number;
    tableAdded: number;
    tableRemoved: number;
    tableModified: number;
    columnAdded: number;
    columnRemoved: number;
    columnModified: number;
  }> {
    const client = getPrismaClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const tables = await client.tableMeta.findMany({
      where: { databaseId },
      select: { id: true },
    });

    const tableIds = tables.map((t) => t.id);

    const changes = await client.metadataChange.findMany({
      where: {
        OR: [
          { entityType: 'database', entityId: databaseId },
          { entityType: 'table', entityId: { in: tableIds } },
        ],
        changedAt: { gte: cutoffDate },
      },
      select: { changeType: true },
    });

    const stats = {
      total: changes.length,
      tableAdded: 0,
      tableRemoved: 0,
      tableModified: 0,
      columnAdded: 0,
      columnRemoved: 0,
      columnModified: 0,
    };

    for (const change of changes) {
      switch (change.changeType) {
        case 'table_added':
          stats.tableAdded++;
          break;
        case 'table_removed':
          stats.tableRemoved++;
          break;
        case 'table_modified':
          stats.tableModified++;
          break;
        case 'column_added':
          stats.columnAdded++;
          break;
        case 'column_removed':
          stats.columnRemoved++;
          break;
        case 'column_modified':
          stats.columnModified++;
          break;
      }
    }

    return stats;
  }
}

/**
 * 导出默认实例
 */
export const changeDetector = new ChangeDetector();
