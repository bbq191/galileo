/**
 * 表元数据仓储
 * 负责表元数据的 CRUD 操作
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient, TableMeta } from '@prisma/client';
import { DI_TOKENS } from '@/lib/di/tokens';
import { changeTracker } from './change-tracker';
import type {
  CreateTableMetaInput,
  UpdateTableMetaInput,
  QueryOptions,
  PaginatedResult,
} from './types';

/**
 * 表元数据仓储类
 */
@injectable()
export class TableMetadataRepository {
  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient
  ) {}

  /**
   * 创建表元数据
   */
  async createTable(input: CreateTableMetaInput): Promise<TableMeta> {
    return await this.prisma.tableMeta.create({
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
    return await this.prisma.tableMeta.findUnique({
      where: { id },
    });
  }

  /**
   * 通过数据库和表名获取表元数据
   */
  async getTableByName(databaseId: number, tableName: string): Promise<TableMeta | null> {
    return await this.prisma.tableMeta.findUnique({
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
    return await this.prisma.tableMeta.findMany({
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
      this.prisma.tableMeta.findMany({
        where,
        skip,
        take: limit,
        orderBy: options.orderBy
          ? { [options.orderBy]: options.orderDirection ?? 'asc' }
          : { tableName: 'asc' },
      }),
      this.prisma.tableMeta.count({ where }),
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
    return await this.prisma.tableMeta.update({
      where: { id },
      data: input,
    });
  }

  /**
   * 删除表元数据
   */
  async deleteTable(id: number): Promise<TableMeta> {
    return await this.prisma.tableMeta.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新表元数据
   */
  async upsertTable(input: CreateTableMetaInput): Promise<TableMeta> {
    // 查询是否已存在
    const existing = await this.getTableByName(input.databaseId, input.tableName);

    const result = await this.prisma.tableMeta.upsert({
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
}
