/**
 * 表更新处理器
 *
 * 功能：
 * - 处理新增表（添加表及其字段到元数据）
 * - 处理删除表（从元数据中删除表记录）
 * - 处理变更表（更新表结构）
 *
 * 职责：
 * - 与数据库交互，执行 CRUD 操作
 * - 协调字段差异分析器进行结构对比
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import type { Connection } from 'mysql2/promise';
import type { NewTable, DeletedTable } from '../table-diff-detector';
import type { ChangedTable } from '../hash-based-detector';
import { ColumnDiffAnalyzer } from './column-diff-analyzer';

function getPrismaClient() {
  return prisma;
}

/**
 * 字段信息类型
 */
export interface ColumnInfo {
  columnName: string;
  dataType: string;
  columnType: string;
  columnComment: string | null;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
}

/**
 * 新增表结果
 */
export interface HandleNewTablesResult {
  tablesAdded: number;
  columnsAdded: number;
  errors: Array<{ table: string; error: string }>;
}

/**
 * 删除表结果
 */
export interface HandleDeletedTablesResult {
  tablesDeleted: number;
  errors: Array<{ table: string; error: string }>;
}

/**
 * 变更表结果
 */
export interface HandleChangedTablesResult {
  tablesUpdated: number;
  columnsAdded: number;
  columnsDeleted: number;
  columnsUpdated: number;
  errors: Array<{ table: string; error: string }>;
}

/**
 * 表更新处理选项
 */
export interface TableUpdateOptions {
  triggerAIAnnotation?: boolean;
  verbose?: boolean;
  batchSize?: number;
}

/**
 * 表更新处理器
 */
export class TableUpdateHandler {
  private columnAnalyzer: ColumnDiffAnalyzer;

  constructor() {
    this.columnAnalyzer = new ColumnDiffAnalyzer();
  }

  /**
   * 处理新增的表
   */
  async handleNewTables(
    connection: Connection,
    databaseId: number,
    databaseName: string,
    newTables: NewTable[],
    options: TableUpdateOptions = {}
  ): Promise<HandleNewTablesResult> {
    const { triggerAIAnnotation = false, verbose = false, batchSize = 10 } = options;
    const client = getPrismaClient();
    const result: HandleNewTablesResult = {
      tablesAdded: 0,
      columnsAdded: 0,
      errors: [],
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
  async handleDeletedTables(
    deletedTables: DeletedTable[],
    options: { verbose?: boolean } = {}
  ): Promise<HandleDeletedTablesResult> {
    const { verbose = false } = options;
    const client = getPrismaClient();
    const result: HandleDeletedTablesResult = {
      tablesDeleted: 0,
      errors: [],
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
  async handleChangedTables(
    connection: Connection,
    databaseId: number,
    databaseName: string,
    changedTables: ChangedTable[],
    options: TableUpdateOptions = {}
  ): Promise<HandleChangedTablesResult> {
    const { triggerAIAnnotation = false, verbose = false, batchSize = 10 } = options;
    const client = getPrismaClient();
    const result: HandleChangedTablesResult = {
      tablesUpdated: 0,
      columnsAdded: 0,
      columnsDeleted: 0,
      columnsUpdated: 0,
      errors: [],
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

          // 3. 对比字段差异（使用 ColumnDiffAnalyzer）
          const columnDiff = this.columnAnalyzer.compareColumns(
            currentColumns,
            storedColumns
          );

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
  ): Promise<ColumnInfo[]> {
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
   * 更新数据库的最后同步时间
   */
  async updateLastSyncTime(databaseId: number): Promise<void> {
    const client = getPrismaClient();

    await client.databaseMeta.update({
      where: { id: databaseId },
      data: {
        lastSyncedAt: new Date(),
      },
    });
  }
}
