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
} from '@/app/generated/prisma';

/**
 * 元数据仓储聚合类
 * 组合所有子仓储，提供统一的访问接口，保持向后兼容
 */
@injectable()
export class MetadataRepository {
  constructor(
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
}

/**
 * 导出默认实例（向后兼容）
 */
let _metadataRepository: MetadataRepository | null = null;

export function getMetadataRepository(): MetadataRepository {
  if (!_metadataRepository) {
    const { getService } = require('@/lib/di/setup');
    try {
      _metadataRepository = getService<MetadataRepository>(DI_TOKENS.MetadataRepository);
    } catch {
      // 回退方案：创建不使用 DI 的实例
      const prisma = require('@/lib/prisma/client').default;
      _metadataRepository = new MetadataRepository(prisma);
    }
  }
  return _metadataRepository;
}

export const metadataRepository = new Proxy({} as MetadataRepository, {
  get(_target, prop) {
    return getMetadataRepository()[prop as keyof MetadataRepository];
  }
});
