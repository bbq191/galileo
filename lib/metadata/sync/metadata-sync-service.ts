/**
 * 元数据同步服务
 * 整合采集器和仓储，实现完整的元数据同步流程
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@/app/generated/prisma';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { ConnectionManager } from "@/lib/database/connection-manager";
import type { MetadataRepository } from "../storage/metadata-repository";
import { CollectorFactory } from "../collectors";
import { RelationshipInferencer } from "../inference";
import { changeTracker } from "../storage";
import type { ColumnInfo } from "../types";

/**
 * 同步选项
 */
export interface SyncOptions {
  /** 数据源 ID */
  dataSourceId: number;

  /** 要同步的数据库列表（空则同步所有） */
  databases?: string[];

  /** 是否推断关系 */
  inferRelationships?: boolean;

  /** 关系推断最小置信度 */
  minConfidence?: number;

  /** 是否记录变更历史 */
  trackChanges?: boolean;
}

/**
 * 同步结果
 */
export interface SyncResult {
  /** 同步的数据库数量 */
  databaseCount: number;

  /** 同步的表数量 */
  tableCount: number;

  /** 同步的字段数量 */
  columnCount: number;

  /** 同步的显式关系数量 */
  explicitRelationshipCount: number;

  /** 推断的关系数量 */
  inferredRelationshipCount: number;

  /** 变更统计 */
  changes?: {
    tablesAdded: number;
    tablesRemoved: number;
    tablesModified: number;
    columnsAdded: number;
    columnsRemoved: number;
    columnsModified: number;
  };

  /** 错误列表 */
  errors: Array<{
    database: string;
    table?: string;
    error: string;
  }>;

  /** 耗时（毫秒） */
  duration: number;
}

/**
 * 元数据同步服务类
 */
@injectable()
export class MetadataSyncService {
  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient,
    @inject(DI_TOKENS.ConnectionManager) private connectionManager: ConnectionManager,
    @inject(DI_TOKENS.MetadataRepository) private metadataRepository: MetadataRepository
  ) {}

  /**
   * 同步数据源的元数据
   */
  async syncDataSource(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      databaseCount: 0,
      tableCount: 0,
      columnCount: 0,
      explicitRelationshipCount: 0,
      inferredRelationshipCount: 0,
      errors: [],
      duration: 0,
    };

    if (options.trackChanges) {
      result.changes = {
        tablesAdded: 0,
        tablesRemoved: 0,
        tablesModified: 0,
        columnsAdded: 0,
        columnsRemoved: 0,
        columnsModified: 0,
      };
    }

    try {
      console.log(`\n========================================`);
      console.log(`开始同步数据源: ${options.dataSourceId}`);
      console.log(`========================================\n`);

      // 获取数据源信息
      const dataSource = await this.prisma.dataSource.findUnique({
        where: { id: options.dataSourceId },
      });

      if (!dataSource) {
        throw new Error(`Data source not found: ${options.dataSourceId}`);
      }

      // 获取连接
      const pool = await this.connectionManager.getConnection(
        String(options.dataSourceId)
      );
      const collector = CollectorFactory.createCollector(
        pool,
        dataSource.type as any
      );

      // 获取要同步的数据库列表
      let databasesToSync: string[] = [];

      if (options.databases && options.databases.length > 0) {
        databasesToSync = options.databases;
      } else {
        const databases = await collector.collectDatabases(
          String(options.dataSourceId)
        );
        databasesToSync = databases.map((db) => db.name);
      }

      console.log(`发现 ${databasesToSync.length} 个数据库需要同步\n`);

      // 同步每个数据库
      for (const databaseName of databasesToSync) {
        try {
          await this.syncDatabase(
            options.dataSourceId,
            databaseName,
            collector,
            options,
            result
          );
        } catch (error) {
          console.error(`同步数据库失败: ${databaseName}`, error);
          result.errors.push({
            database: databaseName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // 更新数据源的最后同步时间
      await this.prisma.dataSource.update({
        where: { id: options.dataSourceId },
        data: { lastSyncAt: new Date() },
      });

      result.duration = Date.now() - startTime;

      console.log(`\n========================================`);
      console.log(`同步完成`);
      console.log(`========================================`);
      console.log(`数据库: ${result.databaseCount}`);
      console.log(`表: ${result.tableCount}`);
      console.log(`字段: ${result.columnCount}`);
      console.log(`显式关系: ${result.explicitRelationshipCount}`);
      console.log(`推断关系: ${result.inferredRelationshipCount}`);
      if (result.changes) {
        console.log(`变更:`);
        console.log(`  - 新增表: ${result.changes.tablesAdded}`);
        console.log(`  - 修改表: ${result.changes.tablesModified}`);
        console.log(`  - 删除表: ${result.changes.tablesRemoved}`);
        console.log(`  - 新增字段: ${result.changes.columnsAdded}`);
        console.log(`  - 修改字段: ${result.changes.columnsModified}`);
        console.log(`  - 删除字段: ${result.changes.columnsRemoved}`);
      }
      console.log(`错误: ${result.errors.length}`);
      console.log(`耗时: ${result.duration}ms`);
      console.log(`========================================\n`);
    } catch (error) {
      console.error("同步失败:", error);
      result.errors.push({
        database: "ALL",
        error: error instanceof Error ? error.message : String(error),
      });
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 同步单个数据库
   */
  private async syncDatabase(
    dataSourceId: number,
    databaseName: string,
    collector: any,
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    console.log(`\n同步数据库: ${databaseName}`);
    console.log(`-`.repeat(40));

    // 创建或更新数据库元数据
    const database = await this.metadataRepository.upsertDatabase({
      sourceId: dataSourceId,
      databaseName,
    });

    result.databaseCount++;

    // 获取数据库的所有表
    const tables = await collector.collectTables(
      String(dataSourceId),
      databaseName
    );
    console.log(`发现 ${tables.length} 个表`);

    // 获取已存在的表
    const existingTables = await this.metadataRepository.getTablesByDatabase(
      database.id
    );
    const existingTableMap = new Map(
      existingTables.map((t) => [t.tableName, t])
    );

    // 同步每个表
    for (const tableInfo of tables) {
      try {
        await this.syncTable(
          database.id,
          databaseName,
          tableInfo.tableName,
          collector,
          String(dataSourceId),
          existingTableMap.get(tableInfo.tableName),
          options,
          result
        );
      } catch (error) {
        console.error(`同步表失败: ${tableInfo.tableName}`, error);
        result.errors.push({
          database: databaseName,
          table: tableInfo.tableName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 检测删除的表
    if (options.trackChanges) {
      const currentTableNames = new Set(tables.map((t: any) => t.tableName));
      for (const existingTable of existingTables) {
        if (!currentTableNames.has(existingTable.tableName)) {
          await changeTracker.trackTableChange("table_removed", existingTable);
          await this.metadataRepository.deleteTable(existingTable.id);
          result.changes!.tablesRemoved++;
          console.log(`删除表: ${existingTable.tableName}`);
        }
      }
    }

    // 同步外键关系
    await this.syncForeignKeys(
      database.id,
      databaseName,
      collector,
      String(dataSourceId),
      result
    );

    // 推断关系
    if (options.inferRelationships) {
      await this.inferRelationships(database.id, databaseName, options, result);
    }
  }

  /**
   * 同步单个表
   */
  private async syncTable(
    databaseId: number,
    databaseName: string,
    tableName: string,
    collector: any,
    dataSourceId: string,
    existingTable: any,
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    // 采集表结构
    const columns = await collector.collectColumns(
      dataSourceId,
      databaseName,
      tableName
    );

    // 获取表的 DDL（用于结构哈希）
    let structureHash: string | null = null;
    try {
      const ddl = await collector.getTableDDL(databaseName, tableName);
      const crypto = require("crypto");
      structureHash = crypto.createHash("sha256").update(ddl).digest("hex");
    } catch (error) {
      console.log(`获取 DDL 失败: ${tableName}`);
    }

    // 创建或更新表元数据
    const table = await this.metadataRepository.upsertTable({
      databaseId,
      tableName,
      rowCount: BigInt(0),
      structureHash,
    });

    result.tableCount++;

    // 检测表变更
    if (options.trackChanges && existingTable) {
      if (existingTable.structureHash !== structureHash) {
        await changeTracker.trackTableChange(
          "table_modified",
          table,
          existingTable
        );
        result.changes!.tablesModified++;
      }
    } else if (!existingTable && options.trackChanges) {
      await changeTracker.trackTableChange("table_added", table);
      result.changes!.tablesAdded++;
    }

    // 获取已存在的字段
    const existingColumns = await this.metadataRepository.getColumnsByTable(
      table.id
    );
    const existingColumnMap = new Map(
      existingColumns.map((c) => [c.columnName, c])
    );

    // 同步字段
    for (const columnInfo of columns) {
      const column = await this.metadataRepository.upsertColumn({
        tableId: table.id,
        columnName: columnInfo.columnName,
        dataType: columnInfo.dataType,
        columnType: columnInfo.columnType,
        columnComment: columnInfo.columnComment,
        isNullable: columnInfo.isNullable,
        isPrimaryKey: columnInfo.columnKey === "PRI",
        isUnique: columnInfo.columnKey === "UNI",
        defaultValue: columnInfo.defaultValue,
        ordinalPosition: columnInfo.ordinalPosition,
      });

      result.columnCount++;

      // 检测字段变更
      if (options.trackChanges) {
        const existingColumn = existingColumnMap.get(columnInfo.columnName);
        if (existingColumn) {
          // 检查是否有变更
          if (
            existingColumn.dataType !== columnInfo.dataType ||
            existingColumn.columnType !== columnInfo.columnType ||
            existingColumn.isNullable !== columnInfo.isNullable
          ) {
            await changeTracker.trackColumnChange(
              "column_modified",
              column,
              existingColumn
            );
            result.changes!.columnsModified++;
          }
        } else {
          await changeTracker.trackColumnChange("column_added", column);
          result.changes!.columnsAdded++;
        }
      }
    }

    // 检测删除的字段
    if (options.trackChanges) {
      const currentColumnNames = new Set(columns.map((c: any) => c.columnName));
      for (const existingColumn of existingColumns) {
        if (!currentColumnNames.has(existingColumn.columnName)) {
          await changeTracker.trackColumnChange(
            "column_removed",
            existingColumn
          );
          await this.metadataRepository.deleteColumn(existingColumn.id);
          result.changes!.columnsRemoved++;
        }
      }
    }

    console.log(`  ✓ ${tableName} (${columns.length} 字段)`);
  }

  /**
   * 同步外键关系
   */
  private async syncForeignKeys(
    databaseId: number,
    databaseName: string,
    collector: any,
    dataSourceId: string,
    result: SyncResult
  ): Promise<void> {
    try {
      const foreignKeys = await collector.collectForeignKeys(
        dataSourceId,
        databaseName
      );

      for (const fk of foreignKeys) {
        // 获取源表和目标表
        const sourceTable = await this.metadataRepository.getTableByName(
          databaseId,
          fk.tableName
        );
        const targetTable = await this.metadataRepository.getTableByName(
          databaseId,
          fk.referencedTableName
        );

        if (!sourceTable || !targetTable) {
          continue;
        }

        // 获取源字段和目标字段
        const sourceColumn = await this.metadataRepository.getColumnByName(
          sourceTable.id,
          fk.columnName
        );
        const targetColumn = await this.metadataRepository.getColumnByName(
          targetTable.id,
          fk.referencedColumnName
        );

        if (!sourceColumn || !targetColumn) {
          continue;
        }

        // 创建显式关系
        await this.metadataRepository.upsertExplicitRelationship({
          sourceTableId: sourceTable.id,
          sourceColumnId: sourceColumn.id,
          targetTableId: targetTable.id,
          targetColumnId: targetColumn.id,
          constraintName: fk.constraintName,
        });

        result.explicitRelationshipCount++;
      }

      console.log(`  同步外键: ${foreignKeys.length} 个`);
    } catch (error) {
      console.log(`  同步外键失败:`, error);
    }
  }

  /**
   * 推断关系
   */
  private async inferRelationships(
    databaseId: number,
    databaseName: string,
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    try {
      // 获取数据库的所有表和字段
      const tables = await this.metadataRepository.getTablesByDatabase(databaseId);
      const allColumns: ColumnInfo[] = [];

      for (const table of tables) {
        const columns = await this.metadataRepository.getColumnsByTable(table.id);
        allColumns.push(
          ...columns.map((c) => ({
            columnName: c.columnName,
            tableName: table.tableName,
            databaseName,
            dataType: c.dataType,
            columnType: c.columnType,
            columnComment: c.columnComment || undefined,
            isNullable: c.isNullable,
            columnKey: (c.isPrimaryKey ? "PRI" : c.isUnique ? "UNI" : "") as 'PRI' | 'UNI' | 'MUL' | '',
            defaultValue: c.defaultValue || undefined,
            ordinalPosition: c.ordinalPosition,
          } as any))
        );
      }

      // 使用关系推断器
      const inferencer = new RelationshipInferencer({
        minConfidence: options.minConfidence ?? 0.7,
      });

      const inferenceResult = await inferencer.inferRelationships(
        databaseName,
        allColumns
      );

      // 保存推断的关系
      for (const rel of inferenceResult.relationships) {
        // 获取源表和目标表
        const sourceTable = await this.metadataRepository.getTableByName(
          databaseId,
          rel.sourceTable
        );
        const targetTable = await this.metadataRepository.getTableByName(
          databaseId,
          rel.targetTable
        );

        if (!sourceTable || !targetTable) {
          continue;
        }

        // 获取源字段和目标字段
        const sourceColumn = await this.metadataRepository.getColumnByName(
          sourceTable.id,
          rel.sourceColumn
        );
        const targetColumn = await this.metadataRepository.getColumnByName(
          targetTable.id,
          rel.targetColumn
        );

        if (!sourceColumn || !targetColumn) {
          continue;
        }

        // 创建推断关系
        await this.metadataRepository.upsertInferredRelationship({
          sourceTableId: sourceTable.id,
          sourceColumnId: sourceColumn.id,
          targetTableId: targetTable.id,
          targetColumnId: targetColumn.id,
          confidenceScore: rel.confidenceScore,
          relationshipType:
            rel.relationshipType === "one-to-one"
              ? "ONE_TO_ONE"
              : rel.relationshipType === "many-to-many"
              ? "MANY_TO_MANY"
              : "ONE_TO_MANY",
          inferenceMethod:
            rel.inferenceMethod === "ai"
              ? "ai"
              : rel.inferenceMethod === "hybrid"
              ? "hybrid"
              : "rule",
          reasoning: rel.reasoning,
        });

        result.inferredRelationshipCount++;
      }

      console.log(`  推断关系: ${inferenceResult.relationships.length} 个`);
    } catch (error) {
      console.log(`  推断关系失败:`, error);
    }
  }
}

/**
 * 导出默认实例（向后兼容）
 */
let _metadataSyncService: MetadataSyncService | null = null;

export function getMetadataSyncService(): MetadataSyncService {
  if (!_metadataSyncService) {
    const { getService } = require('@/lib/di/setup');
    try {
      _metadataSyncService = getService<MetadataSyncService>(DI_TOKENS.MetadataSyncService);
    } catch {
      // 回退方案：创建不使用 DI 的实例
      const prisma = require('@/lib/prisma/client').default;
      const connectionManager = require('@/lib/database/connection-manager').default;
      const { getMetadataRepository } = require('../storage/metadata-repository');
      _metadataSyncService = new MetadataSyncService(
        prisma,
        connectionManager,
        getMetadataRepository()
      );
    }
  }
  return _metadataSyncService;
}

export const metadataSyncService = new Proxy({} as MetadataSyncService, {
  get(_target, prop) {
    return getMetadataSyncService()[prop as keyof MetadataSyncService];
  }
});
