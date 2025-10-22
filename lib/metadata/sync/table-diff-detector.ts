/**
 * 表差异检测器（新增/删除表检测）
 *
 * 功能：
 * - 检测数据库中新增的表
 * - 检测已删除的表
 * - 对比数据库实际表与元数据存储的表
 */

import { PrismaClient } from '@prisma/client';
import type { Connection } from 'mysql2/promise';

let prisma: PrismaClient;

function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * 新增的表信息
 */
export interface NewTable {
  tableName: string;
  tableComment: string | null;
  tableRows: bigint;
  createdTime: Date | null;
  updatedTime: Date | null;
}

/**
 * 删除的表信息
 */
export interface DeletedTable {
  tableId: number;
  tableName: string;
}

/**
 * 表差异检测结果
 */
export interface TableDiffResult {
  /** 新增的表 */
  newTables: NewTable[];

  /** 删除的表 */
  deletedTables: DeletedTable[];

  /** 总变更数 */
  totalChanges: number;
}

/**
 * 表差异检测器
 */
export class TableDiffDetector {
  /**
   * 检测数据库的表差异（新增和删除）
   */
  async detectTableDiff(
    connection: Connection,
    databaseId: number,
    databaseName: string
  ): Promise<TableDiffResult> {
    // 并行执行新增和删除检测
    const [newTables, deletedTables] = await Promise.all([
      this.detectNewTables(connection, databaseId, databaseName),
      this.detectDeletedTables(connection, databaseId, databaseName),
    ]);

    return {
      newTables,
      deletedTables,
      totalChanges: newTables.length + deletedTables.length,
    };
  }

  /**
   * 检测新增的表
   */
  async detectNewTables(
    connection: Connection,
    databaseId: number,
    databaseName: string
  ): Promise<NewTable[]> {
    const client = getPrismaClient();

    // 获取数据库中所有表
    const currentTables = await this.fetchCurrentTables(
      connection,
      databaseName
    );

    // 获取元数据中已存储的表
    const storedTables = await client.tableMeta.findMany({
      where: { databaseId },
      select: { tableName: true },
    });

    const storedTableNames = new Set(
      storedTables.map((table) => table.tableName)
    );

    // 找出新增的表（在当前数据库中存在，但元数据中不存在）
    const newTables = currentTables.filter(
      (table) => !storedTableNames.has(table.tableName)
    );

    if (newTables.length > 0) {
      console.log(
        `检测到 ${newTables.length} 个新增表: ${databaseName}.${newTables.map((t) => t.tableName).join(', ')}`
      );
    }

    return newTables;
  }

  /**
   * 检测删除的表
   */
  async detectDeletedTables(
    connection: Connection,
    databaseId: number,
    databaseName: string
  ): Promise<DeletedTable[]> {
    const client = getPrismaClient();

    // 获取数据库中所有表
    const currentTables = await this.fetchCurrentTables(
      connection,
      databaseName
    );

    const currentTableNames = new Set(
      currentTables.map((table) => table.tableName)
    );

    // 获取元数据中存储的表
    const storedTables = await client.tableMeta.findMany({
      where: { databaseId },
      select: { id: true, tableName: true },
    });

    // 找出已删除的表（在元数据中存在，但当前数据库中不存在）
    const deletedTables = storedTables
      .filter((table) => !currentTableNames.has(table.tableName))
      .map((table) => ({
        tableId: table.id,
        tableName: table.tableName,
      }));

    if (deletedTables.length > 0) {
      console.log(
        `检测到 ${deletedTables.length} 个已删除表: ${databaseName}.${deletedTables.map((t) => t.tableName).join(', ')}`
      );
    }

    return deletedTables;
  }

  /**
   * 从数据库获取当前所有表
   */
  private async fetchCurrentTables(
    connection: Connection,
    databaseName: string
  ): Promise<NewTable[]> {
    const [rows] = await connection.query<any[]>(
      `
      SELECT
        TABLE_NAME as tableName,
        TABLE_COMMENT as tableComment,
        TABLE_ROWS as tableRows,
        CREATE_TIME as createdTime,
        UPDATE_TIME as updatedTime
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
      [databaseName]
    );

    return rows.map((row) => ({
      tableName: row.tableName,
      tableComment: row.tableComment || null,
      tableRows: BigInt(row.tableRows || 0),
      createdTime: row.createdTime ? new Date(row.createdTime) : null,
      updatedTime: row.updatedTime ? new Date(row.updatedTime) : null,
    }));
  }

  /**
   * 获取数据库中的表数量
   */
  async getCurrentTableCount(
    connection: Connection,
    databaseName: string
  ): Promise<number> {
    const [rows] = await connection.query<any[]>(
      `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
    `,
      [databaseName]
    );

    return rows[0].count;
  }

  /**
   * 获取元数据中存储的表数量
   */
  async getStoredTableCount(databaseId: number): Promise<number> {
    const client = getPrismaClient();

    return await client.tableMeta.count({
      where: { databaseId },
    });
  }

  /**
   * 快速检测（仅对比表数量）
   */
  async quickDetect(
    connection: Connection,
    databaseId: number,
    databaseName: string
  ): Promise<boolean> {
    const [currentCount, storedCount] = await Promise.all([
      this.getCurrentTableCount(connection, databaseName),
      this.getStoredTableCount(databaseId),
    ]);

    // 如果数量不同，说明有新增或删除
    return currentCount !== storedCount;
  }

  /**
   * 检测指定表是否存在于数据库中
   */
  async tableExists(
    connection: Connection,
    databaseName: string,
    tableName: string
  ): Promise<boolean> {
    const [rows] = await connection.query<any[]>(
      `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND TABLE_TYPE = 'BASE TABLE'
    `,
      [databaseName, tableName]
    );

    return rows[0].count > 0;
  }

  /**
   * 批量检测多个表是否存在
   */
  async batchCheckTableExists(
    connection: Connection,
    databaseName: string,
    tableNames: string[]
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();

    if (tableNames.length === 0) {
      return result;
    }

    // 构建 IN 查询的占位符
    const placeholders = tableNames.map(() => '?').join(',');

    const [rows] = await connection.query<any[]>(
      `
      SELECT TABLE_NAME as tableName
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME IN (${placeholders})
        AND TABLE_TYPE = 'BASE TABLE'
    `,
      [databaseName, ...tableNames]
    );

    const existingTables = new Set(rows.map((row) => row.tableName));

    // 构建结果映射
    for (const tableName of tableNames) {
      result.set(tableName, existingTables.has(tableName));
    }

    return result;
  }

  /**
   * 获取数据库中的所有表名
   */
  async getAllTableNames(
    connection: Connection,
    databaseName: string
  ): Promise<string[]> {
    const [rows] = await connection.query<any[]>(
      `
      SELECT TABLE_NAME as tableName
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
      [databaseName]
    );

    return rows.map((row) => row.tableName);
  }

  /**
   * 对比两个表名列表，找出差异
   */
  compareTables(
    currentTables: string[],
    storedTables: string[]
  ): {
    added: string[];
    removed: string[];
    unchanged: string[];
  } {
    const currentSet = new Set(currentTables);
    const storedSet = new Set(storedTables);

    const added = currentTables.filter((name) => !storedSet.has(name));
    const removed = storedTables.filter((name) => !currentSet.has(name));
    const unchanged = currentTables.filter((name) => storedSet.has(name));

    return { added, removed, unchanged };
  }
}

/**
 * 导出默认实例
 */
export const tableDiffDetector = new TableDiffDetector();
