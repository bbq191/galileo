/**
 * 元数据搜索仓储
 * 负责元数据的搜索和查询功能
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient, MetadataChange } from '@prisma/client';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { CreateMetadataChangeInput } from './types';

/**
 * 元数据搜索仓储类
 */
@injectable()
export class MetadataSearchRepository {
  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient
  ) {}

  // ==================== 搜索方法 ====================

  /**
   * 搜索数据库
   */
  async searchDatabases(
    query: string,
    options: {
      sourceId?: number;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<any[]> {
    const { sourceId, limit = 10, skip = 0 } = options;

    const where: any = {
      OR: [
        { databaseName: { contains: query } },
        { semanticDescription: { contains: query } },
      ],
    };

    if (sourceId) {
      where.sourceId = sourceId;
    }

    return await this.prisma.databaseMeta.findMany({
      where,
      take: limit,
      skip,
      select: {
        id: true,
        databaseName: true,
        semanticDescription: true,
        sourceId: true,
        source: {
          select: {
            name: true,
            type: true,
          },
        },
        _count: {
          select: { tables: true },
        },
      },
      orderBy: { databaseName: 'asc' },
    });
  }

  /**
   * 搜索表
   */
  async searchTables(
    query: string,
    options: {
      sourceId?: number;
      databaseId?: number;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<any[]> {
    const { sourceId, databaseId, limit = 10, skip = 0 } = options;

    const where: any = {
      OR: [
        { tableName: { contains: query } },
        { tableComment: { contains: query } },
        { semanticDescription: { contains: query } },
      ],
    };

    if (databaseId) {
      where.databaseId = databaseId;
    } else if (sourceId) {
      where.database = {
        sourceId,
      };
    }

    return await this.prisma.tableMeta.findMany({
      where,
      take: limit,
      skip,
      select: {
        id: true,
        tableName: true,
        tableComment: true,
        semanticDescription: true,
        rowCount: true,
        databaseId: true,
        database: {
          select: {
            databaseName: true,
            source: {
              select: {
                name: true,
              },
            },
          },
        },
        _count: {
          select: { columns: true },
        },
      },
      orderBy: { tableName: 'asc' },
    });
  }

  /**
   * 搜索列
   */
  async searchColumns(
    query: string,
    options: {
      sourceId?: number;
      databaseId?: number;
      limit?: number;
      skip?: number;
    } = {}
  ): Promise<any[]> {
    const { sourceId, databaseId, limit = 10, skip = 0 } = options;

    const where: any = {
      OR: [
        { columnName: { contains: query } },
        { columnComment: { contains: query } },
        { semanticDescription: { contains: query } },
      ],
    };

    if (databaseId) {
      where.table = {
        databaseId,
      };
    } else if (sourceId) {
      where.table = {
        database: {
          sourceId,
        },
      };
    }

    return await this.prisma.columnMeta.findMany({
      where,
      take: limit,
      skip,
      select: {
        id: true,
        columnName: true,
        dataType: true,
        columnComment: true,
        semanticDescription: true,
        isPrimaryKey: true,
        isUnique: true,
        tableId: true,
        table: {
          select: {
            tableName: true,
            databaseId: true,
            database: {
              select: {
                databaseName: true,
                source: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { columnName: 'asc' },
    });
  }

  // ==================== 元数据变更记录 ====================

  /**
   * 创建元数据变更记录
   */
  async createMetadataChange(input: CreateMetadataChangeInput): Promise<MetadataChange> {
    return await this.prisma.metadataChange.create({
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
    return await this.prisma.metadataChange.findMany({
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
    return await this.prisma.metadataChange.findMany({
      orderBy: { changedAt: 'desc' },
      take: limit,
    });
  }
}
