/**
 * 字段元数据仓储
 * 负责字段元数据的 CRUD 操作
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient, ColumnMeta } from '@prisma/client';
import { DI_TOKENS } from '@/lib/di/tokens';
import type {
  CreateColumnMetaInput,
  UpdateColumnMetaInput,
  BatchSaveResult,
} from './types';

/**
 * 字段元数据仓储类
 */
@injectable()
export class ColumnMetadataRepository {
  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient
  ) {}

  /**
   * 创建字段元数据
   */
  async createColumn(input: CreateColumnMetaInput): Promise<ColumnMeta> {
    return await this.prisma.columnMeta.create({
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
    return await this.prisma.columnMeta.findUnique({
      where: { id },
    });
  }

  /**
   * 通过表和字段名获取字段元数据
   */
  async getColumnByName(tableId: number, columnName: string): Promise<ColumnMeta | null> {
    return await this.prisma.columnMeta.findUnique({
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
    return await this.prisma.columnMeta.findMany({
      where: { tableId },
      orderBy: { ordinalPosition: 'asc' },
    });
  }

  /**
   * 更新字段元数据
   */
  async updateColumn(id: number, input: UpdateColumnMetaInput): Promise<ColumnMeta> {
    return await this.prisma.columnMeta.update({
      where: { id },
      data: input,
    });
  }

  /**
   * 删除字段元数据
   */
  async deleteColumn(id: number): Promise<ColumnMeta> {
    return await this.prisma.columnMeta.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新字段元数据
   */
  async upsertColumn(input: CreateColumnMetaInput): Promise<ColumnMeta> {
    // 变更记录由调用方（MetadataSyncService）负责，避免重复记录

    // 确保布尔值字段类型正确（数据库可能返回 0/1）
    const isNullable = input.isNullable !== undefined ? Boolean(input.isNullable) : true;
    const isPrimaryKey = input.isPrimaryKey !== undefined ? Boolean(input.isPrimaryKey) : false;
    const isUnique = input.isUnique !== undefined ? Boolean(input.isUnique) : false;

    const result = await this.prisma.columnMeta.upsert({
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
        isNullable,
        isPrimaryKey,
        isUnique,
        defaultValue: input.defaultValue,
        ordinalPosition: input.ordinalPosition,
      },
      update: {
        dataType: input.dataType,
        columnType: input.columnType,
        columnComment: input.columnComment,
        semanticDescription: input.semanticDescription,
        semanticSource: input.semanticSource,
        isNullable,
        isPrimaryKey,
        isUnique,
        defaultValue: input.defaultValue,
        ordinalPosition: input.ordinalPosition,
      },
    });

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
}
