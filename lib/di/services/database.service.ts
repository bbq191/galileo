/**
 * 数据库服务
 * 提供数据库连接和操作的统一接口
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@/app/generated/prisma';
import { DI_TOKENS } from '../tokens';
import type { IDatabaseService } from '../types';

@injectable()
export class DatabaseService implements IDatabaseService {
  constructor(@inject(DI_TOKENS.PrismaClient) public readonly prisma: PrismaClient) {}

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * 执行健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('[DatabaseService] Health check failed:', error);
      return false;
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStats() {
    const [dataSources, databases, tables, columns] = await Promise.all([
      this.prisma.dataSource.count(),
      this.prisma.databaseMeta.count(),
      this.prisma.tableMeta.count(),
      this.prisma.columnMeta.count(),
    ]);

    return {
      dataSources,
      databases,
      tables,
      columns,
    };
  }
}
