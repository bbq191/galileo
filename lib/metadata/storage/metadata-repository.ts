/**
 * 元数据仓储（聚合类）
 * 负责组合所有元数据子仓储，提供统一的访问接口
 *
 * 此文件已重构为聚合模式，将原来的大文件（994行）拆分为 5 个职责单一的子仓储：
 * - DatabaseMetadataRepository: 数据库元数据 CRUD
 * - TableMetadataRepository: 表元数据 CRUD
 * - ColumnMetadataRepository: 字段元数据 CRUD
 * - RelationshipRepository: 关系管理
 * - MetadataSearchRepository: 搜索和变更历史
 */

import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '@/lib/di/tokens';
import { PrismaClient } from '@prisma/client';
import { DatabaseMetadataRepository } from './database-metadata.repository';
import { TableMetadataRepository } from './table-metadata.repository';
import { ColumnMetadataRepository } from './column-metadata.repository';
import { RelationshipRepository } from './relationship.repository';
import { MetadataSearchRepository } from './metadata-search.repository';
import type {
  CreateDatabaseMetaInput,
  UpdateDatabaseMetaInput,
  CreateTableMetaInput,
  UpdateTableMetaInput,
  CreateColumnMetaInput,
  UpdateColumnMetaInput,
  CreateExplicitRelationshipInput,
  CreateInferredRelationshipInput,
  VerifyInferredRelationshipInput,
  CreateMetadataChangeInput,
  BatchSaveResult,
  QueryOptions,
  PaginatedResult,
} from './types';
import type {
  DatabaseMeta,
  TableMeta,
  ColumnMeta,
  ExplicitRelationship,
  InferredRelationship,
  MetadataChange,
} from '@prisma/client';

/**
 * 元数据仓储聚合类
 * 组合所有子仓储，提供统一的访问接口，保持向后兼容
 */
@injectable()
export class MetadataRepository {
  constructor(
    @inject(DI_TOKENS.PrismaClient)
    private prisma: PrismaClient,

    @inject(DI_TOKENS.DatabaseMetadataRepository)
    private databaseRepo: DatabaseMetadataRepository,

    @inject(DI_TOKENS.TableMetadataRepository)
    private tableRepo: TableMetadataRepository,

    @inject(DI_TOKENS.ColumnMetadataRepository)
    private columnRepo: ColumnMetadataRepository,

    @inject(DI_TOKENS.RelationshipRepository)
    private relationshipRepo: RelationshipRepository,

    @inject(DI_TOKENS.MetadataSearchRepository)
    private searchRepo: MetadataSearchRepository
  ) {}

  // ==================== 数据库元数据（委托给 DatabaseMetadataRepository）====================

  async createDatabase(input: CreateDatabaseMetaInput): Promise<DatabaseMeta> {
    return this.databaseRepo.createDatabase(input);
  }

  async getDatabaseById(id: number): Promise<DatabaseMeta | null> {
    return this.databaseRepo.getDatabaseById(id);
  }

  async getDatabaseByName(sourceId: number, databaseName: string): Promise<DatabaseMeta | null> {
    return this.databaseRepo.getDatabaseByName(sourceId, databaseName);
  }

  async getDatabasesBySource(sourceId: number): Promise<DatabaseMeta[]> {
    return this.databaseRepo.getDatabasesBySource(sourceId);
  }

  async updateDatabase(id: number, input: UpdateDatabaseMetaInput): Promise<DatabaseMeta> {
    return this.databaseRepo.updateDatabase(id, input);
  }

  async deleteDatabase(id: number): Promise<DatabaseMeta> {
    return this.databaseRepo.deleteDatabase(id);
  }

  async upsertDatabase(input: CreateDatabaseMetaInput): Promise<DatabaseMeta> {
    return this.databaseRepo.upsertDatabase(input);
  }

  // ==================== 表元数据（委托给 TableMetadataRepository）====================

  async createTable(input: CreateTableMetaInput): Promise<TableMeta> {
    return this.tableRepo.createTable(input);
  }

  async getTableById(id: number): Promise<TableMeta | null> {
    return this.tableRepo.getTableById(id);
  }

  async getTableByName(databaseId: number, tableName: string): Promise<TableMeta | null> {
    return this.tableRepo.getTableByName(databaseId, tableName);
  }

  async getTablesByDatabase(databaseId: number): Promise<TableMeta[]> {
    return this.tableRepo.getTablesByDatabase(databaseId);
  }

  async getTablesPaginated(
    databaseId: number,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<TableMeta>> {
    return this.tableRepo.getTablesPaginated(databaseId, options);
  }

  async updateTable(id: number, input: UpdateTableMetaInput): Promise<TableMeta> {
    return this.tableRepo.updateTable(id, input);
  }

  async deleteTable(id: number): Promise<TableMeta> {
    return this.tableRepo.deleteTable(id);
  }

  async upsertTable(input: CreateTableMetaInput): Promise<TableMeta> {
    return this.tableRepo.upsertTable(input);
  }

  // ==================== 字段元数据（委托给 ColumnMetadataRepository）====================

  async createColumn(input: CreateColumnMetaInput): Promise<ColumnMeta> {
    return this.columnRepo.createColumn(input);
  }

  async getColumnById(id: number): Promise<ColumnMeta | null> {
    return this.columnRepo.getColumnById(id);
  }

  async getColumnByName(tableId: number, columnName: string): Promise<ColumnMeta | null> {
    return this.columnRepo.getColumnByName(tableId, columnName);
  }

  async getColumnsByTable(tableId: number): Promise<ColumnMeta[]> {
    return this.columnRepo.getColumnsByTable(tableId);
  }

  async updateColumn(id: number, input: UpdateColumnMetaInput): Promise<ColumnMeta> {
    return this.columnRepo.updateColumn(id, input);
  }

  async deleteColumn(id: number): Promise<ColumnMeta> {
    return this.columnRepo.deleteColumn(id);
  }

  async upsertColumn(input: CreateColumnMetaInput): Promise<ColumnMeta> {
    return this.columnRepo.upsertColumn(input);
  }

  async batchUpsertColumns(inputs: CreateColumnMetaInput[]): Promise<BatchSaveResult> {
    return this.columnRepo.batchUpsertColumns(inputs);
  }

  // ==================== 关系（委托给 RelationshipRepository）====================

  async createExplicitRelationship(
    input: CreateExplicitRelationshipInput
  ): Promise<ExplicitRelationship> {
    return this.relationshipRepo.createExplicitRelationship(input);
  }

  async getExplicitRelationshipsBySourceTable(tableId: number): Promise<ExplicitRelationship[]> {
    return this.relationshipRepo.getExplicitRelationshipsBySourceTable(tableId);
  }

  async getExplicitRelationshipsByTargetTable(tableId: number): Promise<ExplicitRelationship[]> {
    return this.relationshipRepo.getExplicitRelationshipsByTargetTable(tableId);
  }

  async deleteExplicitRelationship(id: number): Promise<ExplicitRelationship> {
    return this.relationshipRepo.deleteExplicitRelationship(id);
  }

  async upsertExplicitRelationship(
    input: CreateExplicitRelationshipInput
  ): Promise<ExplicitRelationship> {
    return this.relationshipRepo.upsertExplicitRelationship(input);
  }

  async createInferredRelationship(
    input: CreateInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return this.relationshipRepo.createInferredRelationship(input);
  }

  async getInferredRelationshipsBySourceTable(tableId: number): Promise<InferredRelationship[]> {
    return this.relationshipRepo.getInferredRelationshipsBySourceTable(tableId);
  }

  async getUnverifiedInferredRelationships(): Promise<InferredRelationship[]> {
    return this.relationshipRepo.getUnverifiedInferredRelationships();
  }

  async verifyInferredRelationship(
    id: number,
    input: VerifyInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return this.relationshipRepo.verifyInferredRelationship(id, input);
  }

  async deleteInferredRelationship(id: number): Promise<InferredRelationship> {
    return this.relationshipRepo.deleteInferredRelationship(id);
  }

  async upsertInferredRelationship(
    input: CreateInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return this.relationshipRepo.upsertInferredRelationship(input);
  }

  async batchSaveInferredRelationships(
    inputs: CreateInferredRelationshipInput[]
  ): Promise<BatchSaveResult> {
    return this.relationshipRepo.batchSaveInferredRelationships(inputs);
  }

  // ==================== 搜索和变更历史（委托给 MetadataSearchRepository）====================

  async createMetadataChange(input: CreateMetadataChangeInput): Promise<MetadataChange> {
    return this.searchRepo.createMetadataChange(input);
  }

  async getMetadataChanges(
    entityType: 'database' | 'table' | 'column',
    entityId: number,
    limit: number = 50
  ): Promise<MetadataChange[]> {
    return this.searchRepo.getMetadataChanges(entityType, entityId, limit);
  }

  async getRecentChanges(limit: number = 100): Promise<MetadataChange[]> {
    return this.searchRepo.getRecentChanges(limit);
  }

  async searchDatabases(
    query: string,
    options: {
      sourceId?: number;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<any[]> {
    return this.searchRepo.searchDatabases(query, options);
  }

  async searchTables(
    query: string,
    options: {
      sourceId?: number;
      databaseId?: number;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<any[]> {
    return this.searchRepo.searchTables(query, options);
  }

  async searchColumns(
    query: string,
    options: {
      sourceId?: number;
      databaseId?: number;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<any[]> {
    return this.searchRepo.searchColumns(query, options);
  }

  // ==================== 额外的辅助方法 ====================

  /**
   * 获取数据源的最后同步时间
   * 返回该数据源下所有数据库中最新的同步时间
   */
  async getLastSyncTime(dataSourceId: number): Promise<Date | undefined> {
    const result = await this.prisma.databaseMeta.findFirst({
      where: {
        sourceId: dataSourceId,
        lastSyncedAt: { not: null },
      },
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });

    return result?.lastSyncedAt || undefined;
  }

  /**
   * 检测元数据变更
   * 返回与指定数据源相关的最近元数据变更记录
   */
  async detectChanges(dataSourceId: number): Promise<MetadataChange[]> {
    // 获取该数据源下的所有数据库 ID
    const databases = await this.prisma.databaseMeta.findMany({
      where: { sourceId: dataSourceId },
      select: { id: true },
    });
    const databaseIds = databases.map((db) => db.id);

    if (databaseIds.length === 0) {
      return [];
    }

    // 获取数据库级别的变更
    const databaseChanges = await this.prisma.metadataChange.findMany({
      where: {
        entityType: 'database',
        entityId: { in: databaseIds },
      },
    });

    // 获取该数据源下的所有表 ID
    const tables = await this.prisma.tableMeta.findMany({
      where: { databaseId: { in: databaseIds } },
      select: { id: true },
    });
    const tableIds = tables.map((t) => t.id);

    // 获取表级别的变更
    const tableChanges =
      tableIds.length > 0
        ? await this.prisma.metadataChange.findMany({
            where: {
              entityType: 'table',
              entityId: { in: tableIds },
            },
          })
        : [];

    // 获取该数据源下的所有列 ID
    const columns =
      tableIds.length > 0
        ? await this.prisma.columnMeta.findMany({
            where: { tableId: { in: tableIds } },
            select: { id: true },
          })
        : [];
    const columnIds = columns.map((c) => c.id);

    // 获取列级别的变更
    const columnChanges =
      columnIds.length > 0
        ? await this.prisma.metadataChange.findMany({
            where: {
              entityType: 'column',
              entityId: { in: columnIds },
            },
          })
        : [];

    // 合并所有变更并按时间倒序排序
    const allChanges = [...databaseChanges, ...tableChanges, ...columnChanges];
    return allChanges.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
  }

  /**
   * 获取元数据
   * 返回完整的元数据层级结构（数据库 -> 表 -> 字段）
   */
  async getMetadata(dataSourceId: number, databases?: string[]): Promise<any[]> {
    // 构建查询条件
    const where: any = { sourceId: dataSourceId };
    if (databases && databases.length > 0) {
      where.databaseName = { in: databases };
    }

    // 查询数据库及其关联的表和字段
    const dbList = await this.prisma.databaseMeta.findMany({
      where,
      include: {
        tables: {
          include: {
            columns: {
              orderBy: { ordinalPosition: 'asc' },
            },
          },
          orderBy: { tableName: 'asc' },
        },
      },
      orderBy: { databaseName: 'asc' },
    });

    return dbList;
  }

  /**
   * 获取最常查询的表
   * 从查询审计日志中统计使用频率最高的表
   */
  async getTopQueriedTables(dataSourceId: number, limit: number): Promise<any[]> {
    // 获取该数据源下的所有数据库
    const databases = await this.prisma.databaseMeta.findMany({
      where: { sourceId: dataSourceId },
      select: { databaseName: true },
    });
    const databaseNames = databases.map((db) => db.databaseName);

    if (databaseNames.length === 0) {
      return [];
    }

    // 获取查询审计日志，解析 usedTables 字段并统计
    const logs = await this.prisma.queryAuditLog.findMany({
      where: {
        executionSuccess: true,
      },
      select: {
        usedTables: true,
        usedDatabases: true,
      },
    });

    // 统计表的使用频率
    const tableCountMap = new Map<string, number>();

    for (const log of logs) {
      try {
        const usedDatabases = JSON.parse(log.usedDatabases);
        const usedTables = JSON.parse(log.usedTables);

        // 检查是否使用了当前数据源的数据库
        const hasTargetDatabase = usedDatabases.some((db: string) =>
          databaseNames.includes(db)
        );

        if (hasTargetDatabase && Array.isArray(usedTables)) {
          for (const table of usedTables) {
            const tableKey = typeof table === 'string' ? table : JSON.stringify(table);
            tableCountMap.set(tableKey, (tableCountMap.get(tableKey) || 0) + 1);
          }
        }
      } catch (error) {
        // 忽略 JSON 解析错误
        continue;
      }
    }

    // 转换为数组并排序
    const sortedTables = Array.from(tableCountMap.entries())
      .map(([table, count]) => ({ table, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return sortedTables;
  }

  /**
   * 获取统计信息
   * 返回数据源的数据库、表、字段数量统计
   */
  async getStatistics(dataSourceId: number): Promise<any> {
    // 获取数据库数量
    const databaseCount = await this.prisma.databaseMeta.count({
      where: { sourceId: dataSourceId },
    });

    // 获取表数量
    const tableCount = await this.prisma.tableMeta.count({
      where: {
        database: {
          sourceId: dataSourceId,
        },
      },
    });

    // 获取字段数量
    const columnCount = await this.prisma.columnMeta.count({
      where: {
        table: {
          database: {
            sourceId: dataSourceId,
          },
        },
      },
    });

    return {
      databaseCount,
      tableCount,
      columnCount,
    };
  }
}

/**
 * 导出默认实例（向后兼容）
 */
let _metadataRepository: MetadataRepository | null = null;

export function getMetadataRepository(): MetadataRepository {
  if (!_metadataRepository) {
    const { getService } = require('@/lib/di/setup');
    try {
      _metadataRepository = getService(DI_TOKENS.MetadataRepository);
    } catch (error) {
      // 回退方案：无法创建不使用 DI 的实例，因为需要多个依赖
      throw new Error(`无法获取 MetadataRepository 实例: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return _metadataRepository!;
}

export const metadataRepository = new Proxy({} as MetadataRepository, {
  get(_target, prop) {
    return getMetadataRepository()[prop as keyof MetadataRepository];
  }
});
