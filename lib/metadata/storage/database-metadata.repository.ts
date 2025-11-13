/**
 * 数据库元数据仓储
 * 负责数据库元数据的 CRUD 操作
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient, DatabaseMeta } from '@/app/generated/prisma';
import { DI_TOKENS } from '@/lib/di/tokens';
import { changeTracker } from './change-tracker';
import type {
  CreateDatabaseMetaInput,
  UpdateDatabaseMetaInput,
} from './types';

/**
 * 数据库元数据仓储类
 */
@injectable()
export class DatabaseMetadataRepository {
  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient
  ) {}

  /**
   * 创建数据库元数据
   */
  async createDatabase(input: CreateDatabaseMetaInput): Promise<DatabaseMeta> {
    return await this.prisma.databaseMeta.create({
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
    return await this.prisma.databaseMeta.findUnique({
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
    return await this.prisma.databaseMeta.findUnique({
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
    return await this.prisma.databaseMeta.findMany({
      where: { sourceId },
      orderBy: { databaseName: 'asc' },
    });
  }

  /**
   * 更新数据库元数据
   */
  async updateDatabase(id: number, input: UpdateDatabaseMetaInput): Promise<DatabaseMeta> {
    return await this.prisma.databaseMeta.update({
      where: { id },
      data: input,
    });
  }

  /**
   * 删除数据库元数据
   */
  async deleteDatabase(id: number): Promise<DatabaseMeta> {
    return await this.prisma.databaseMeta.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新数据库元数据
   */
  async upsertDatabase(input: CreateDatabaseMetaInput): Promise<DatabaseMeta> {
    // 查询是否已存在
    const existing = await this.getDatabaseByName(input.sourceId, input.databaseName);

    const result = await this.prisma.databaseMeta.upsert({
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
}
