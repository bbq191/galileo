/**
 * 降级变更检测器（字段级别对比）
 *
 * 功能：
 * - 当数据库不支持 SHOW CREATE TABLE 时的降级方案
 * - 通过逐个对比字段属性来检测表结构变更
 * - 虽然不如 DDL 哈希精准，但可作为兼容性方案
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import type { Connection } from 'mysql2/promise';

function getPrismaClient() {
  return prisma;
}

/**
 * 当前列信息
 */
interface CurrentColumnInfo {
  columnName: string;
  dataType: string;
  columnType: string;
  isNullable: boolean;
  columnDefault: string | null;
  isPrimaryKey: boolean;
  columnComment: string | null;
  ordinalPosition: number;
}

/**
 * 列变更信息
 */
export interface ColumnChange {
  type: 'added' | 'removed' | 'modified';
  columnName: string;
  oldValue?: any;
  newValue?: any;
}

/**
 * 降级检测器
 */
export class FallbackDetector {
  /**
   * 通过字段对比检测表结构变更
   */
  async detectByColumns(
    connection: Connection,
    tableId: number,
    databaseName: string,
    tableName: string
  ): Promise<boolean> {
    const client = getPrismaClient();

    // 获取当前表的字段信息
    const currentColumns = await this.fetchCurrentColumns(
      connection,
      databaseName,
      tableName
    );

    // 获取存储的字段信息
    const storedColumns = await client.columnMeta.findMany({
      where: { tableId },
      orderBy: { ordinalPosition: 'asc' },
    });

    // 对比字段
    return !this.columnsEqual(currentColumns, storedColumns);
  }

  /**
   * 检测表的字段变更详情
   */
  async detectColumnChanges(
    connection: Connection,
    tableId: number,
    databaseName: string,
    tableName: string
  ): Promise<ColumnChange[]> {
    const client = getPrismaClient();

    const currentColumns = await this.fetchCurrentColumns(
      connection,
      databaseName,
      tableName
    );

    const storedColumns = await client.columnMeta.findMany({
      where: { tableId },
      orderBy: { ordinalPosition: 'asc' },
    });

    const changes: ColumnChange[] = [];

    // 构建字段名到字段信息的映射
    const currentMap = new Map(
      currentColumns.map((col) => [col.columnName, col])
    );
    const storedMap = new Map(
      storedColumns.map((col) => [col.columnName, col])
    );

    // 检测新增和修改的字段
    for (const [columnName, currentCol] of currentMap) {
      const storedCol = storedMap.get(columnName);

      if (!storedCol) {
        // 新增字段
        changes.push({
          type: 'added',
          columnName,
          newValue: currentCol,
        });
      } else {
        // 检查字段是否被修改
        if (!this.columnEqual(currentCol, storedCol)) {
          changes.push({
            type: 'modified',
            columnName,
            oldValue: storedCol,
            newValue: currentCol,
          });
        }
      }
    }

    // 检测删除的字段
    for (const [columnName, storedCol] of storedMap) {
      if (!currentMap.has(columnName)) {
        changes.push({
          type: 'removed',
          columnName,
          oldValue: storedCol,
        });
      }
    }

    return changes;
  }

  /**
   * 从数据库获取当前表的字段信息
   */
  private async fetchCurrentColumns(
    connection: Connection,
    databaseName: string,
    tableName: string
  ): Promise<CurrentColumnInfo[]> {
    const [rows] = await connection.query<any[]>(
      `
      SELECT
        COLUMN_NAME as columnName,
        DATA_TYPE as dataType,
        COLUMN_TYPE as columnType,
        IS_NULLABLE as isNullable,
        COLUMN_DEFAULT as columnDefault,
        COLUMN_KEY as columnKey,
        COLUMN_COMMENT as columnComment,
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
      isNullable: row.isNullable === 'YES',
      columnDefault: row.columnDefault,
      isPrimaryKey: row.columnKey === 'PRI',
      columnComment: row.columnComment || null,
      ordinalPosition: row.ordinalPosition,
    }));
  }

  /**
   * 对比两个字段列表是否相等
   */
  private columnsEqual(
    currentColumns: CurrentColumnInfo[],
    storedColumns: Array<{
      columnName: string;
      dataType: string;
      columnType: string;
      isNullable: boolean;
      defaultValue: string | null;
      isPrimaryKey: boolean;
      columnComment: string | null;
      ordinalPosition: number;
    }>
  ): boolean {
    // 数量不同
    if (currentColumns.length !== storedColumns.length) {
      return false;
    }

    // 逐个对比
    for (let i = 0; i < currentColumns.length; i++) {
      if (!this.columnEqual(currentColumns[i], storedColumns[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 对比单个字段是否相等
   */
  private columnEqual(
    current: CurrentColumnInfo,
    stored: {
      columnName: string;
      dataType: string;
      columnType: string;
      isNullable: boolean;
      defaultValue: string | null;
      isPrimaryKey: boolean;
      columnComment: string | null;
      ordinalPosition: number;
    }
  ): boolean {
    return (
      current.columnName === stored.columnName &&
      current.dataType === stored.dataType &&
      current.columnType === stored.columnType &&
      current.isNullable === stored.isNullable &&
      this.defaultValueEqual(current.columnDefault, stored.defaultValue) &&
      current.isPrimaryKey === stored.isPrimaryKey &&
      current.ordinalPosition === stored.ordinalPosition
      // 注意：不对比 columnComment，因为注释变更不算结构变更
    );
  }

  /**
   * 对比默认值是否相等（处理 NULL 的特殊情况）
   */
  private defaultValueEqual(
    value1: string | null,
    value2: string | null
  ): boolean {
    // 都为 null
    if (value1 === null && value2 === null) {
      return true;
    }

    // 一个为 null，一个不为 null
    if (value1 === null || value2 === null) {
      return false;
    }

    // 都不为 null，比较字符串（忽略大小写）
    return value1.toLowerCase() === value2.toLowerCase();
  }

  /**
   * 检测表是否存在
   */
  async tableExists(
    connection: Connection,
    databaseName: string,
    tableName: string
  ): Promise<boolean> {
    try {
      const [rows] = await connection.query<any[]>(
        `
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `,
        [databaseName, tableName]
      );

      return rows[0].count > 0;
    } catch (error) {
      console.error('检查表是否存在时发生错误:', error);
      return false;
    }
  }

  /**
   * 获取表的字段数量
   */
  async getColumnCount(
    connection: Connection,
    databaseName: string,
    tableName: string
  ): Promise<number> {
    const [rows] = await connection.query<any[]>(
      `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    `,
      [databaseName, tableName]
    );

    return rows[0].count;
  }

  /**
   * 快速检测（仅对比字段数量）
   */
  async quickDetect(
    connection: Connection,
    tableId: number,
    databaseName: string,
    tableName: string
  ): Promise<boolean> {
    const client = getPrismaClient();

    // 获取当前字段数量
    const currentCount = await this.getColumnCount(
      connection,
      databaseName,
      tableName
    );

    // 获取存储的字段数量
    const storedCount = await client.columnMeta.count({
      where: { tableId },
    });

    // 如果数量不同，说明有变更
    return currentCount !== storedCount;
  }
}

/**
 * 导出默认实例
 */
export const fallbackDetector = new FallbackDetector();
