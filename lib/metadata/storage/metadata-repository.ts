/**
 * 元数据仓储
 * 负责元数据的 CRUD 操作
 */

import prisma from '@/lib/prisma/client';
import { changeTracker } from './change-tracker';
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
 * 元数据仓储类
 */
export class MetadataRepository {
  // ==================== 数据库元数据 ====================

  /**
   * 创建数据库元数据
   */
  async createDatabase(input: CreateDatabaseMetaInput): Promise<DatabaseMeta> {
    return await prisma.databaseMeta.create({
      data: {
        sourceId: input.sourceId,
        databaseName: input.databaseName,
        domainId: input.domainId,
        semanticDescription: input.semanticDescription,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * 获取数据库元数据
   */
  async getDatabaseById(id: number): Promise<DatabaseMeta | null> {
    return await prisma.databaseMeta.findUnique({
      where: { id },
    });
  }

  /**
   * 通过数据源和数据库名获取数据库元数据
   */
  async getDatabaseByName(
    sourceId: number,
    databaseName: string
  ): Promise<DatabaseMeta | null> {
    return await prisma.databaseMeta.findUnique({
      where: {
        sourceId_databaseName: {
          sourceId,
          databaseName,
        },
      },
    });
  }

  /**
   * 获取数据源的所有数据库
   */
  async getDatabasesBySource(sourceId: number): Promise<DatabaseMeta[]> {
    return await prisma.databaseMeta.findMany({
      where: { sourceId },
      orderBy: { databaseName: 'asc' },
    });
  }

  /**
   * 更新数据库元数据
   */
  async updateDatabase(id: number, input: UpdateDatabaseMetaInput): Promise<DatabaseMeta> {
    return await prisma.databaseMeta.update({
      where: { id },
      data: input,
    });
  }

  /**
   * 删除数据库元数据
   */
  async deleteDatabase(id: number): Promise<DatabaseMeta> {
    return await prisma.databaseMeta.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新数据库元数据
   */
  async upsertDatabase(input: CreateDatabaseMetaInput): Promise<DatabaseMeta> {
    // 查询是否已存在
    const existing = await this.getDatabaseByName(input.sourceId, input.databaseName);

    const result = await prisma.databaseMeta.upsert({
      where: {
        sourceId_databaseName: {
          sourceId: input.sourceId,
          databaseName: input.databaseName,
        },
      },
      create: {
        sourceId: input.sourceId,
        databaseName: input.databaseName,
        domainId: input.domainId,
        semanticDescription: input.semanticDescription,
        lastSyncedAt: new Date(),
      },
      update: {
        domainId: input.domainId,
        semanticDescription: input.semanticDescription,
        lastSyncedAt: new Date(),
      },
    });

    // 记录变更
    try {
      if (!existing) {
        await changeTracker.trackDatabaseChange('database_added', result);
      }
    } catch (error) {
      console.error('记录数据库变更失败:', error);
      // 不影响主流程
    }

    return result;
  }

  // ==================== 表元数据 ====================

  /**
   * 创建表元数据
   */
  async createTable(input: CreateTableMetaInput): Promise<TableMeta> {
    return await prisma.tableMeta.create({
      data: {
        databaseId: input.databaseId,
        tableName: input.tableName,
        tableComment: input.tableComment,
        semanticDescription: input.semanticDescription,
        semanticPriority: input.semanticPriority ?? 3,
        rowCount: input.rowCount ?? BigInt(0),
        structureHash: input.structureHash,
        createdTime: input.createdTime,
        updatedTime: input.updatedTime,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * 获取表元数据
   */
  async getTableById(id: number): Promise<TableMeta | null> {
    return await prisma.tableMeta.findUnique({
      where: { id },
    });
  }

  /**
   * 通过数据库和表名获取表元数据
   */
  async getTableByName(databaseId: number, tableName: string): Promise<TableMeta | null> {
    return await prisma.tableMeta.findUnique({
      where: {
        databaseId_tableName: {
          databaseId,
          tableName,
        },
      },
    });
  }

  /**
   * 获取数据库的所有表
   */
  async getTablesByDatabase(databaseId: number): Promise<TableMeta[]> {
    return await prisma.tableMeta.findMany({
      where: { databaseId },
      orderBy: { tableName: 'asc' },
    });
  }

  /**
   * 分页查询表元数据
   */
  async getTablesPaginated(
    databaseId: number,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<TableMeta>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { databaseId };

    if (options.search) {
      where.OR = [
        { tableName: { contains: options.search } },
        { tableComment: { contains: options.search } },
        { semanticDescription: { contains: options.search } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.tableMeta.findMany({
        where,
        skip,
        take: limit,
        orderBy: options.orderBy
          ? { [options.orderBy]: options.orderDirection ?? 'asc' }
          : { tableName: 'asc' },
      }),
      prisma.tableMeta.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * 更新表元数据
   */
  async updateTable(id: number, input: UpdateTableMetaInput): Promise<TableMeta> {
    return await prisma.tableMeta.update({
      where: { id },
      data: input,
    });
  }

  /**
   * 删除表元数据
   */
  async deleteTable(id: number): Promise<TableMeta> {
    return await prisma.tableMeta.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新表元数据
   */
  async upsertTable(input: CreateTableMetaInput): Promise<TableMeta> {
    // 查询是否已存在
    const existing = await this.getTableByName(input.databaseId, input.tableName);

    const result = await prisma.tableMeta.upsert({
      where: {
        databaseId_tableName: {
          databaseId: input.databaseId,
          tableName: input.tableName,
        },
      },
      create: {
        databaseId: input.databaseId,
        tableName: input.tableName,
        tableComment: input.tableComment,
        semanticDescription: input.semanticDescription,
        semanticPriority: input.semanticPriority ?? 3,
        rowCount: input.rowCount ?? BigInt(0),
        structureHash: input.structureHash,
        createdTime: input.createdTime,
        updatedTime: input.updatedTime,
        lastSyncedAt: new Date(),
      },
      update: {
        tableComment: input.tableComment,
        semanticDescription: input.semanticDescription,
        semanticPriority: input.semanticPriority,
        rowCount: input.rowCount,
        structureHash: input.structureHash,
        createdTime: input.createdTime,
        updatedTime: input.updatedTime,
        lastSyncedAt: new Date(),
      },
    });

    // 记录变更
    try {
      if (!existing) {
        await changeTracker.trackTableChange('table_added', result);
      } else {
        await changeTracker.detectTableChanges(existing, result);
      }
    } catch (error) {
      console.error('记录表变更失败:', error);
      // 不影响主流程
    }

    return result;
  }

  // ==================== 字段元数据 ====================

  /**
   * 创建字段元数据
   */
  async createColumn(input: CreateColumnMetaInput): Promise<ColumnMeta> {
    return await prisma.columnMeta.create({
      data: {
        tableId: input.tableId,
        columnName: input.columnName,
        dataType: input.dataType,
        columnType: input.columnType,
        columnComment: input.columnComment,
        semanticDescription: input.semanticDescription,
        semanticSource: input.semanticSource ?? 'rule',
        isNullable: input.isNullable ?? true,
        isPrimaryKey: input.isPrimaryKey ?? false,
        isUnique: input.isUnique ?? false,
        defaultValue: input.defaultValue,
        ordinalPosition: input.ordinalPosition,
      },
    });
  }

  /**
   * 获取字段元数据
   */
  async getColumnById(id: number): Promise<ColumnMeta | null> {
    return await prisma.columnMeta.findUnique({
      where: { id },
    });
  }

  /**
   * 通过表和字段名获取字段元数据
   */
  async getColumnByName(tableId: number, columnName: string): Promise<ColumnMeta | null> {
    return await prisma.columnMeta.findUnique({
      where: {
        tableId_columnName: {
          tableId,
          columnName,
        },
      },
    });
  }

  /**
   * 获取表的所有字段
   */
  async getColumnsByTable(tableId: number): Promise<ColumnMeta[]> {
    return await prisma.columnMeta.findMany({
      where: { tableId },
      orderBy: { ordinalPosition: 'asc' },
    });
  }

  /**
   * 更新字段元数据
   */
  async updateColumn(id: number, input: UpdateColumnMetaInput): Promise<ColumnMeta> {
    return await prisma.columnMeta.update({
      where: { id },
      data: input,
    });
  }

  /**
   * 删除字段元数据
   */
  async deleteColumn(id: number): Promise<ColumnMeta> {
    return await prisma.columnMeta.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新字段元数据
   */
  async upsertColumn(input: CreateColumnMetaInput): Promise<ColumnMeta> {
    // 查询是否已存在
    const existing = await this.getColumnByName(input.tableId, input.columnName);

    const result = await prisma.columnMeta.upsert({
      where: {
        tableId_columnName: {
          tableId: input.tableId,
          columnName: input.columnName,
        },
      },
      create: {
        tableId: input.tableId,
        columnName: input.columnName,
        dataType: input.dataType,
        columnType: input.columnType,
        columnComment: input.columnComment,
        semanticDescription: input.semanticDescription,
        semanticSource: input.semanticSource ?? 'rule',
        isNullable: input.isNullable ?? true,
        isPrimaryKey: input.isPrimaryKey ?? false,
        isUnique: input.isUnique ?? false,
        defaultValue: input.defaultValue,
        ordinalPosition: input.ordinalPosition,
      },
      update: {
        dataType: input.dataType,
        columnType: input.columnType,
        columnComment: input.columnComment,
        semanticDescription: input.semanticDescription,
        semanticSource: input.semanticSource,
        isNullable: input.isNullable,
        isPrimaryKey: input.isPrimaryKey,
        isUnique: input.isUnique,
        defaultValue: input.defaultValue,
        ordinalPosition: input.ordinalPosition,
      },
    });

    // 记录变更
    try {
      if (!existing) {
        await changeTracker.trackColumnChange('column_added', result);
      } else {
        await changeTracker.detectColumnChanges(existing, result);
      }
    } catch (error) {
      console.error('记录字段变更失败:', error);
      // 不影响主流程
    }

    return result;
  }

  /**
   * 批量创建或更新字段
   */
  async batchUpsertColumns(inputs: CreateColumnMetaInput[]): Promise<BatchSaveResult> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    const errors: Array<{ entity: string; error: string }> = [];

    for (const input of inputs) {
      try {
        await this.upsertColumn(input);
        successCount++;
      } catch (error) {
        failureCount++;
        errors.push({
          entity: `${input.tableId}.${input.columnName}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duration = Date.now() - startTime;

    return {
      successCount,
      failureCount,
      skippedCount,
      errors,
      duration,
    };
  }

  // ==================== 显式关系 ====================

  /**
   * 创建显式关系
   */
  async createExplicitRelationship(
    input: CreateExplicitRelationshipInput
  ): Promise<ExplicitRelationship> {
    return await prisma.explicitRelationship.create({
      data: {
        sourceTableId: input.sourceTableId,
        sourceColumnId: input.sourceColumnId,
        targetTableId: input.targetTableId,
        targetColumnId: input.targetColumnId,
        constraintName: input.constraintName,
        relationshipType: input.relationshipType ?? 'ONE_TO_MANY',
      },
    });
  }

  /**
   * 获取表的所有显式关系（作为源表）
   */
  async getExplicitRelationshipsBySourceTable(
    tableId: number
  ): Promise<ExplicitRelationship[]> {
    return await prisma.explicitRelationship.findMany({
      where: { sourceTableId: tableId },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });
  }

  /**
   * 获取表的所有显式关系（作为目标表）
   */
  async getExplicitRelationshipsByTargetTable(
    tableId: number
  ): Promise<ExplicitRelationship[]> {
    return await prisma.explicitRelationship.findMany({
      where: { targetTableId: tableId },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });
  }

  /**
   * 删除显式关系
   */
  async deleteExplicitRelationship(id: number): Promise<ExplicitRelationship> {
    return await prisma.explicitRelationship.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新显式关系
   */
  async upsertExplicitRelationship(
    input: CreateExplicitRelationshipInput
  ): Promise<ExplicitRelationship> {
    return await prisma.explicitRelationship.upsert({
      where: {
        sourceTableId_sourceColumnId_targetTableId_targetColumnId: {
          sourceTableId: input.sourceTableId,
          sourceColumnId: input.sourceColumnId,
          targetTableId: input.targetTableId,
          targetColumnId: input.targetColumnId,
        },
      },
      create: {
        sourceTableId: input.sourceTableId,
        sourceColumnId: input.sourceColumnId,
        targetTableId: input.targetTableId,
        targetColumnId: input.targetColumnId,
        constraintName: input.constraintName,
        relationshipType: input.relationshipType ?? 'ONE_TO_MANY',
      },
      update: {
        constraintName: input.constraintName,
        relationshipType: input.relationshipType,
      },
    });
  }

  // ==================== 推断关系 ====================

  /**
   * 创建推断关系
   */
  async createInferredRelationship(
    input: CreateInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return await prisma.inferredRelationship.create({
      data: {
        sourceTableId: input.sourceTableId,
        sourceColumnId: input.sourceColumnId,
        targetTableId: input.targetTableId,
        targetColumnId: input.targetColumnId,
        confidenceScore: input.confidenceScore,
        relationshipType: input.relationshipType ?? 'ONE_TO_MANY',
        inferenceMethod: input.inferenceMethod ?? 'rule',
        reasoning: input.reasoning,
        isVerified: input.isVerified ?? false,
        verifiedBy: input.verifiedBy,
        verifiedAt: input.verifiedAt,
      },
    });
  }

  /**
   * 获取表的所有推断关系（作为源表）
   */
  async getInferredRelationshipsBySourceTable(
    tableId: number
  ): Promise<InferredRelationship[]> {
    return await prisma.inferredRelationship.findMany({
      where: { sourceTableId: tableId },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });
  }

  /**
   * 获取未验证的推断关系
   */
  async getUnverifiedInferredRelationships(): Promise<InferredRelationship[]> {
    return await prisma.inferredRelationship.findMany({
      where: { isVerified: false },
      orderBy: { confidenceScore: 'desc' },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });
  }

  /**
   * 验证推断关系
   */
  async verifyInferredRelationship(
    id: number,
    input: VerifyInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return await prisma.inferredRelationship.update({
      where: { id },
      data: {
        isVerified: input.isVerified,
        verifiedBy: input.verifiedBy,
        verifiedAt: input.verifiedAt ?? new Date(),
      },
    });
  }

  /**
   * 删除推断关系
   */
  async deleteInferredRelationship(id: number): Promise<InferredRelationship> {
    return await prisma.inferredRelationship.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新推断关系
   */
  async upsertInferredRelationship(
    input: CreateInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return await prisma.inferredRelationship.upsert({
      where: {
        sourceTableId_sourceColumnId_targetTableId_targetColumnId: {
          sourceTableId: input.sourceTableId,
          sourceColumnId: input.sourceColumnId,
          targetTableId: input.targetTableId,
          targetColumnId: input.targetColumnId,
        },
      },
      create: {
        sourceTableId: input.sourceTableId,
        sourceColumnId: input.sourceColumnId,
        targetTableId: input.targetTableId,
        targetColumnId: input.targetColumnId,
        confidenceScore: input.confidenceScore,
        relationshipType: input.relationshipType ?? 'ONE_TO_MANY',
        inferenceMethod: input.inferenceMethod ?? 'rule',
        reasoning: input.reasoning,
        isVerified: input.isVerified ?? false,
        verifiedBy: input.verifiedBy,
        verifiedAt: input.verifiedAt,
      },
      update: {
        confidenceScore: input.confidenceScore,
        relationshipType: input.relationshipType,
        inferenceMethod: input.inferenceMethod,
        reasoning: input.reasoning,
      },
    });
  }

  /**
   * 批量保存推断关系
   */
  async batchSaveInferredRelationships(
    inputs: CreateInferredRelationshipInput[]
  ): Promise<BatchSaveResult> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    const errors: Array<{ entity: string; error: string }> = [];

    console.log(`开始批量保存 ${inputs.length} 个推断关系...`);

    for (const input of inputs) {
      try {
        await this.upsertInferredRelationship(input);
        successCount++;
      } catch (error) {
        failureCount++;
        const entity = `${input.sourceTableId}.${input.sourceColumnId} -> ${input.targetTableId}.${input.targetColumnId}`;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ entity, error: errorMessage });
        console.error(`保存推断关系失败 [${entity}]:`, errorMessage);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`批量保存完成: 成功 ${successCount}, 失败 ${failureCount}, 耗时 ${duration}ms`);

    return {
      successCount,
      failureCount,
      skippedCount: 0,
      errors,
      duration,
    };
  }

  // ==================== 元数据变更记录 ====================

  /**
   * 创建元数据变更记录
   */
  async createMetadataChange(input: CreateMetadataChangeInput): Promise<MetadataChange> {
    return await prisma.metadataChange.create({
      data: {
        changeType: input.changeType,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValue: input.oldValue as any,
        newValue: input.newValue as any,
      },
    });
  }

  /**
   * 获取实体的变更历史
   */
  async getMetadataChanges(
    entityType: 'database' | 'table' | 'column',
    entityId: number,
    limit: number = 50
  ): Promise<MetadataChange[]> {
    return await prisma.metadataChange.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: { changedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * 获取最近的变更记录
   */
  async getRecentChanges(limit: number = 100): Promise<MetadataChange[]> {
    return await prisma.metadataChange.findMany({
      orderBy: { changedAt: 'desc' },
      take: limit,
    });
  }
}

/**
 * 默认导出单例
 */
export const metadataRepository = new MetadataRepository();
