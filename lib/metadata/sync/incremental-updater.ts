/**
 * 增量更新器
 *
 * 功能：
 * - 处理变更检测器发现的变更
 * - 仅更新变更的部分（而非全量同步）
 * - 处理新增表、删除表、表结构变更
 * - 记录变更历史
 * - 触发 AI 重新标注（仅对变更部分）
 *
 * 优势：
 * - 避免全量同步的性能开销
 * - 精准更新变更的数据
 * - 自动触发相关的后续处理
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import type { Connection } from 'mysql2/promise';
import type { ChangeDetectionResult } from './change-detector';
import type { NewTable, DeletedTable } from './table-diff-detector';
import type { ChangedTable } from './hash-based-detector';

function getPrismaClient() {
  return prisma;
}

/**
 * 更新选项
 */
export interface IncrementalUpdateOptions {
  /** 是否更新新增表 */
  updateNewTables?: boolean;

  /** 是否删除已删除的表 */
  deleteRemovedTables?: boolean;

  /** 是否更新变更的表结构 */
  updateChangedTables?: boolean;

  /** 是否触发 AI 标注 */
  triggerAIAnnotation?: boolean;

  /** 是否记录变更历史 */
  recordHistory?: boolean;

  /** 是否详细输出 */
  verbose?: boolean;

  /** 批量处理大小 */
  batchSize?: number;
}

/**
 * 更新结果
 */
export interface IncrementalUpdateResult {
  /** 数据库 ID */
  databaseId: number;

  /** 数据库名称 */
  databaseName: string;

  /** 开始时间 */
  startedAt: Date;

  /** 完成时间 */
  completedAt: Date;

  /** 耗时（毫秒） */
  duration: number;

  /** 新增表数量 */
  tablesAdded: number;

  /** 删除表数量 */
  tablesDeleted: number;

  /** 更新表数量 */
  tablesUpdated: number;

  /** 新增字段数量 */
  columnsAdded: number;

  /** 删除字段数量 */
  columnsDeleted: number;

  /** 更新字段数量 */
  columnsUpdated: number;

  /** 总变更数 */
  totalChanges: number;

  /** 错误列表 */
  errors: Array<{ table: string; error: string }>;
}

/**
 * 增量更新器
 */
export class IncrementalUpdater {
  /**
   * 执行增量更新
   */
  async update(
    connection: Connection,
    databaseId: number,
    databaseName: string,
    changeResult: ChangeDetectionResult,
    options: IncrementalUpdateOptions = {}
  ): Promise<IncrementalUpdateResult> {
    const startedAt = new Date();
    const {
      updateNewTables = true,
      deleteRemovedTables = true,
      updateChangedTables = true,
      triggerAIAnnotation = false,
      recordHistory = true,
      verbose = false,
      batchSize = 10,
    } = options;

    if (verbose) {
      console.log(`\n开始增量更新: ${databaseName}`);
      console.log(`新增表: ${changeResult.tableDiff.newTables.length}`);
      console.log(`删除表: ${changeResult.tableDiff.deletedTables.length}`);
      console.log(`变更表: ${changeResult.changedTables.length}`);
    }

    const result: IncrementalUpdateResult = {
      databaseId,
      databaseName,
      startedAt,
      completedAt: new Date(),
      duration: 0,
      tablesAdded: 0,
      tablesDeleted: 0,
      tablesUpdated: 0,
      columnsAdded: 0,
      columnsDeleted: 0,
      columnsUpdated: 0,
      totalChanges: 0,
      errors: [],
    };

    try {
      // 1. 处理新增的表
      if (updateNewTables && changeResult.tableDiff.newTables.length > 0) {
        if (verbose) console.log('\n处理新增表...');
        const addResult = await this.handleNewTables(
          connection,
          databaseId,
          databaseName,
          changeResult.tableDiff.newTables,
          { triggerAIAnnotation, verbose, batchSize }
        );
        result.tablesAdded = addResult.tablesAdded;
        result.columnsAdded = addResult.columnsAdded;
        result.errors.push(...addResult.errors);
      }

      // 2. 处理删除的表
      if (deleteRemovedTables && changeResult.tableDiff.deletedTables.length > 0) {
        if (verbose) console.log('\n处理删除表...');
        const deleteResult = await this.handleDeletedTables(
          changeResult.tableDiff.deletedTables,
          { verbose }
        );
        result.tablesDeleted = deleteResult.tablesDeleted;
        result.errors.push(...deleteResult.errors);
      }

      // 3. 处理结构变更的表
      if (updateChangedTables && changeResult.changedTables.length > 0) {
        if (verbose) console.log('\n处理结构变更表...');
        const updateResult = await this.handleChangedTables(
          connection,
          databaseId,
          databaseName,
          changeResult.changedTables,
          { triggerAIAnnotation, verbose, batchSize }
        );
        result.tablesUpdated = updateResult.tablesUpdated;
        result.columnsAdded = updateResult.columnsAdded;
        result.columnsDeleted = updateResult.columnsDeleted;
        result.columnsUpdated = updateResult.columnsUpdated;
        result.errors.push(...updateResult.errors);
      }

      const completedAt = new Date();
      result.completedAt = completedAt;
      result.duration = completedAt.getTime() - startedAt.getTime();
      result.totalChanges =
        result.tablesAdded +
        result.tablesDeleted +
        result.tablesUpdated +
        result.columnsAdded +
        result.columnsDeleted +
        result.columnsUpdated;

      if (verbose) {
        console.log(`\n增量更新完成`);
        console.log(`总变更数: ${result.totalChanges}`);
        console.log(`耗时: ${result.duration}ms`);
        if (result.errors.length > 0) {
          console.log(`错误数: ${result.errors.length}`);
        }
      }

      // 4. 记录更新历史
      if (recordHistory) {
        await this.recordUpdateHistory(result);
      }

      // 5. 更新数据库的最后同步时间
      await this.updateLastSyncTime(databaseId);

      return result;
    } catch (error) {
      console.error('增量更新失败:', error);
      throw error;
    }
  }

  /**
   * 处理新增的表
   */
  private async handleNewTables(
    connection: Connection,
    databaseId: number,
    databaseName: string,
    newTables: NewTable[],
    options: {
      triggerAIAnnotation?: boolean;
      verbose?: boolean;
      batchSize?: number;
    }
  ): Promise<{
    tablesAdded: number;
    columnsAdded: number;
    errors: Array<{ table: string; error: string }>;
  }> {
    const { triggerAIAnnotation = false, verbose = false, batchSize = 10 } = options;
    const client = getPrismaClient();
    const result = {
      tablesAdded: 0,
      columnsAdded: 0,
      errors: [] as Array<{ table: string; error: string }>,
    };

    // 分批处理
    for (let i = 0; i < newTables.length; i += batchSize) {
      const batch = newTables.slice(i, i + batchSize);

      for (const table of batch) {
        try {
          if (verbose) {
            console.log(`  添加表: ${table.tableName}`);
          }

          // 1. 获取表的完整字段信息
          const columns = await this.fetchTableColumns(
            connection,
            databaseName,
            table.tableName
          );

          // 2. 创建表元数据记录
          const tableMeta = await client.tableMeta.create({
            data: {
              databaseId,
              tableName: table.tableName,
              tableComment: table.tableComment,
              rowCount: table.tableRows,
              createdTime: table.createdTime,
              updatedTime: table.updatedTime,
              lastSyncedAt: new Date(),
              // 语义化优先级默认为普通
              semanticPriority: 3,
            },
          });

          // 3. 批量创建字段记录
          if (columns.length > 0) {
            await client.columnMeta.createMany({
              data: columns.map((col) => ({
                tableId: tableMeta.id,
                columnName: col.columnName,
                dataType: col.dataType,
                columnType: col.columnType,
                columnComment: col.columnComment,
                isNullable: col.isNullable,
                isPrimaryKey: col.isPrimaryKey,
                isUnique: col.isUnique,
                defaultValue: col.defaultValue,
                ordinalPosition: col.ordinalPosition,
                // 语义来源默认为规则
                semanticSource: 'rule',
              })),
            });

            result.columnsAdded += columns.length;
          }

          result.tablesAdded++;

          // 4. 触发 AI 标注（如果启用）
          if (triggerAIAnnotation) {
            // TODO: 集成语义标注器
            // await semanticAnnotator.annotateTable(tableMeta.id);
          }
        } catch (error: any) {
          console.error(`处理新增表 ${table.tableName} 失败:`, error);
          result.errors.push({
            table: table.tableName,
            error: error.message,
          });
        }
      }
    }

    return result;
  }

  /**
   * 处理删除的表
   */
  private async handleDeletedTables(
    deletedTables: DeletedTable[],
    options: { verbose?: boolean }
  ): Promise<{
    tablesDeleted: number;
    errors: Array<{ table: string; error: string }>;
  }> {
    const { verbose = false } = options;
    const client = getPrismaClient();
    const result = {
      tablesDeleted: 0,
      errors: [] as Array<{ table: string; error: string }>,
    };

    for (const table of deletedTables) {
      try {
        if (verbose) {
          console.log(`  删除表: ${table.tableName}`);
        }

        // 删除表元数据（级联删除字段、关系等）
        await client.tableMeta.delete({
          where: { id: table.tableId },
        });

        result.tablesDeleted++;
      } catch (error: any) {
        console.error(`处理删除表 ${table.tableName} 失败:`, error);
        result.errors.push({
          table: table.tableName,
          error: error.message,
        });
      }
    }

    return result;
  }

  /**
   * 处理结构变更的表
   */
  private async handleChangedTables(
    connection: Connection,
    databaseId: number,
    databaseName: string,
    changedTables: ChangedTable[],
    options: {
      triggerAIAnnotation?: boolean;
      verbose?: boolean;
      batchSize?: number;
    }
  ): Promise<{
    tablesUpdated: number;
    columnsAdded: number;
    columnsDeleted: number;
    columnsUpdated: number;
    errors: Array<{ table: string; error: string }>;
  }> {
    const { triggerAIAnnotation = false, verbose = false, batchSize = 10 } = options;
    const client = getPrismaClient();
    const result = {
      tablesUpdated: 0,
      columnsAdded: 0,
      columnsDeleted: 0,
      columnsUpdated: 0,
      errors: [] as Array<{ table: string; error: string }>,
    };

    // 分批处理
    for (let i = 0; i < changedTables.length; i += batchSize) {
      const batch = changedTables.slice(i, i + batchSize);

      for (const table of batch) {
        try {
          if (verbose) {
            console.log(`  更新表: ${table.tableName}`);
          }

          // 1. 获取当前数据库中的字段
          const currentColumns = await this.fetchTableColumns(
            connection,
            databaseName,
            table.tableName
          );

          // 2. 获取元数据中的字段
          const storedColumns = await client.columnMeta.findMany({
            where: { tableId: table.tableId },
          });

          // 3. 对比字段差异
          const columnDiff = this.compareColumns(currentColumns, storedColumns);

          // 4. 处理新增字段
          if (columnDiff.added.length > 0) {
            await client.columnMeta.createMany({
              data: columnDiff.added.map((col) => ({
                tableId: table.tableId,
                columnName: col.columnName,
                dataType: col.dataType,
                columnType: col.columnType,
                columnComment: col.columnComment,
                isNullable: col.isNullable,
                isPrimaryKey: col.isPrimaryKey,
                isUnique: col.isUnique,
                defaultValue: col.defaultValue,
                ordinalPosition: col.ordinalPosition,
                semanticSource: 'rule',
              })),
            });
            result.columnsAdded += columnDiff.added.length;
          }

          // 5. 处理删除字段
          if (columnDiff.deleted.length > 0) {
            await client.columnMeta.deleteMany({
              where: {
                tableId: table.tableId,
                columnName: { in: columnDiff.deleted },
              },
            });
            result.columnsDeleted += columnDiff.deleted.length;
          }

          // 6. 处理修改字段
          for (const modifiedCol of columnDiff.modified) {
            await client.columnMeta.updateMany({
              where: {
                tableId: table.tableId,
                columnName: modifiedCol.columnName,
              },
              data: {
                dataType: modifiedCol.dataType,
                columnType: modifiedCol.columnType,
                columnComment: modifiedCol.columnComment,
                isNullable: modifiedCol.isNullable,
                isPrimaryKey: modifiedCol.isPrimaryKey,
                isUnique: modifiedCol.isUnique,
                defaultValue: modifiedCol.defaultValue,
                ordinalPosition: modifiedCol.ordinalPosition,
              },
            });
          }
          result.columnsUpdated += columnDiff.modified.length;

          // 7. 更新表的最后同步时间
          await client.tableMeta.update({
            where: { id: table.tableId },
            data: {
              lastSyncedAt: new Date(),
              structureHash: table.newHash,
            },
          });

          result.tablesUpdated++;

          // 8. 触发 AI 标注（如果启用，且有新增或修改的字段）
          if (
            triggerAIAnnotation &&
            (columnDiff.added.length > 0 || columnDiff.modified.length > 0)
          ) {
            // TODO: 集成语义标注器
            // await semanticAnnotator.annotateColumns(table.tableId);
          }
        } catch (error: any) {
          console.error(`处理变更表 ${table.tableName} 失败:`, error);
          result.errors.push({
            table: table.tableName,
            error: error.message,
          });
        }
      }
    }

    return result;
  }

  /**
   * 获取表的字段信息
   */
  private async fetchTableColumns(
    connection: Connection,
    databaseName: string,
    tableName: string
  ): Promise<
    Array<{
      columnName: string;
      dataType: string;
      columnType: string;
      columnComment: string | null;
      isNullable: boolean;
      isPrimaryKey: boolean;
      isUnique: boolean;
      defaultValue: string | null;
      ordinalPosition: number;
    }>
  > {
    const [rows] = await connection.query<any[]>(
      `
      SELECT
        COLUMN_NAME as columnName,
        DATA_TYPE as dataType,
        COLUMN_TYPE as columnType,
        COLUMN_COMMENT as columnComment,
        IS_NULLABLE as isNullable,
        COLUMN_KEY as columnKey,
        COLUMN_DEFAULT as columnDefault,
        ORDINAL_POSITION as ordinalPosition
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
      [databaseName, tableName]
    );

    return rows.map((row) => ({
      columnName: row.columnName,
      dataType: row.dataType,
      columnType: row.columnType,
      columnComment: row.columnComment || null,
      isNullable: row.isNullable === 'YES',
      isPrimaryKey: row.columnKey === 'PRI',
      isUnique: row.columnKey === 'UNI' || row.columnKey === 'PRI',
      defaultValue: row.columnDefault,
      ordinalPosition: row.ordinalPosition,
    }));
  }

  /**
   * 对比字段差异
   */
  private compareColumns(
    currentColumns: Array<{
      columnName: string;
      dataType: string;
      columnType: string;
      columnComment: string | null;
      isNullable: boolean;
      isPrimaryKey: boolean;
      isUnique: boolean;
      defaultValue: string | null;
      ordinalPosition: number;
    }>,
    storedColumns: Array<{
      columnName: string;
      dataType: string;
      columnType: string;
      columnComment: string | null;
      isNullable: boolean;
      isPrimaryKey: boolean;
      isUnique: boolean;
      defaultValue: string | null;
      ordinalPosition: number;
    }>
  ): {
    added: typeof currentColumns;
    deleted: string[];
    modified: typeof currentColumns;
  } {
    const currentMap = new Map(currentColumns.map((col) => [col.columnName, col]));
    const storedMap = new Map(storedColumns.map((col) => [col.columnName, col]));

    const added: typeof currentColumns = [];
    const deleted: string[] = [];
    const modified: typeof currentColumns = [];

    // 检测新增和修改的字段
    for (const [columnName, currentCol] of currentMap) {
      const storedCol = storedMap.get(columnName);

      if (!storedCol) {
        // 新增字段
        added.push(currentCol);
      } else if (!this.columnsEqual(currentCol, storedCol)) {
        // 修改字段
        modified.push(currentCol);
      }
    }

    // 检测删除的字段
    for (const [columnName] of storedMap) {
      if (!currentMap.has(columnName)) {
        deleted.push(columnName);
      }
    }

    return { added, deleted, modified };
  }

  /**
   * 判断两个字段是否相等
   */
  private columnsEqual(
    col1: {
      dataType: string;
      columnType: string;
      isNullable: boolean;
      isPrimaryKey: boolean;
      isUnique: boolean;
      defaultValue: string | null;
      ordinalPosition: number;
    },
    col2: {
      dataType: string;
      columnType: string;
      isNullable: boolean;
      isPrimaryKey: boolean;
      isUnique: boolean;
      defaultValue: string | null;
      ordinalPosition: number;
    }
  ): boolean {
    return (
      col1.dataType === col2.dataType &&
      col1.columnType === col2.columnType &&
      col1.isNullable === col2.isNullable &&
      col1.isPrimaryKey === col2.isPrimaryKey &&
      col1.isUnique === col2.isUnique &&
      this.defaultValuesEqual(col1.defaultValue, col2.defaultValue) &&
      col1.ordinalPosition === col2.ordinalPosition
    );
  }

  /**
   * 判断两个默认值是否相等
   */
  private defaultValuesEqual(
    val1: string | null,
    val2: string | null
  ): boolean {
    if (val1 === null && val2 === null) return true;
    if (val1 === null || val2 === null) return false;
    return val1.toLowerCase() === val2.toLowerCase();
  }

  /**
   * 记录更新历史
   */
  private async recordUpdateHistory(
    result: IncrementalUpdateResult
  ): Promise<void> {
    const client = getPrismaClient();

    try {
      // 这里可以创建一个更新历史记录表
      // 暂时记录到日志
      console.log(`增量更新历史已记录: ${result.databaseName}`);
      console.log(`  新增表: ${result.tablesAdded}`);
      console.log(`  删除表: ${result.tablesDeleted}`);
      console.log(`  更新表: ${result.tablesUpdated}`);
      console.log(`  新增字段: ${result.columnsAdded}`);
      console.log(`  删除字段: ${result.columnsDeleted}`);
      console.log(`  更新字段: ${result.columnsUpdated}`);
    } catch (error) {
      console.error('记录更新历史失败:', error);
    }
  }

  /**
   * 更新数据库的最后同步时间
   */
  private async updateLastSyncTime(databaseId: number): Promise<void> {
    const client = getPrismaClient();

    await client.databaseMeta.update({
      where: { id: databaseId },
      data: {
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * 批量更新多个数据库
   */
  async batchUpdate(
    updates: Array<{
      connection: Connection;
      databaseId: number;
      databaseName: string;
      changeResult: ChangeDetectionResult;
    }>,
    options: IncrementalUpdateOptions = {}
  ): Promise<IncrementalUpdateResult[]> {
    const results: IncrementalUpdateResult[] = [];

    for (const update of updates) {
      try {
        const result = await this.update(
          update.connection,
          update.databaseId,
          update.databaseName,
          update.changeResult,
          options
        );
        results.push(result);
      } catch (error) {
        console.error(
          `批量更新数据库 ${update.databaseName} 失败:`,
          error
        );
      }
    }

    return results;
  }
}

/**
 * 导出默认实例
 */
export const incrementalUpdater = new IncrementalUpdater();
