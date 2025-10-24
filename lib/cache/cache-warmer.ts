/**
 * 缓存预热器
 * 系统启动时预热热点数据
 */

import { multiLevelCache } from './multi-level-cache';
import prisma from '@/lib/prisma/client';

/**
 * 缓存预热器类
 */
export class CacheWarmer {
  /**
   * 预热所有热点数据
   */
  async warmup(): Promise<void> {
    console.log('[CacheWarmer] 开始缓存预热...');
    const startTime = Date.now();

    try {
      // 并行执行所有预热任务
      await Promise.all([
        this.warmupHotTables(),
        this.warmupDatabases(),
        this.warmupDataSources(),
      ]);

      const duration = Date.now() - startTime;
      console.log(`[CacheWarmer] 缓存预热完成，耗时: ${duration}ms`);
    } catch (error) {
      console.error('[CacheWarmer] 缓存预热失败:', error);
    }
  }

  /**
   * 预热热表（Top 100）
   */
  private async warmupHotTables(): Promise<void> {
    try {
      // 获取最近访问的前100张表
      // 注意: 需要在 tables_meta 表中添加 last_accessed_at 字段来跟踪访问
      // 目前使用 updated_at 作为替代
      const hotTables = await prisma.tableMeta.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: {
          columns: true,
          database: {
            select: {
              id: true,
              databaseName: true,
              sourceId: true,
            },
          },
        },
      });

      // 预热每张表的元数据
      for (const table of hotTables) {
        // 预热表元数据
        await multiLevelCache.set(
          'table_meta',
          { id: table.id, version: 'latest' },
          table
        );

        // 预热列元数据
        await multiLevelCache.set('column_meta', { tableId: table.id }, table.columns);
      }

      console.log(`[CacheWarmer] 预热了 ${hotTables.length} 张热表`);
    } catch (error) {
      console.error('[CacheWarmer] 预热热表失败:', error);
    }
  }

  /**
   * 预热数据库列表
   */
  private async warmupDatabases(): Promise<void> {
    try {
      // 获取所有活跃数据源
      const dataSources = await prisma.dataSource.findMany({
        where: { status: 'active' },
        select: { id: true },
      });

      // 预热每个数据源的数据库列表
      for (const source of dataSources) {
        const databases = await prisma.databaseMeta.findMany({
          where: { sourceId: source.id },
          orderBy: { databaseName: 'asc' },
        });

        await multiLevelCache.set('databases_list', { sourceId: source.id }, databases);
      }

      console.log(`[CacheWarmer] 预热了 ${dataSources.length} 个数据源的数据库列表`);
    } catch (error) {
      console.error('[CacheWarmer] 预热数据库列表失败:', error);
    }
  }

  /**
   * 预热数据源列表
   */
  private async warmupDataSources(): Promise<void> {
    try {
      const dataSources = await prisma.dataSource.findMany({
        where: { status: 'active' },
      });

      // 注意: 这里可以添加自定义的数据源缓存逻辑
      // 目前只是作为示例

      console.log(`[CacheWarmer] 预热了 ${dataSources.length} 个数据源`);
    } catch (error) {
      console.error('[CacheWarmer] 预热数据源失败:', error);
    }
  }

  /**
   * 预热特定表的关系图谱
   */
  async warmupRelationshipGraph(tableId: number, depth: number = 2): Promise<void> {
    try {
      // 这里需要调用关系图谱查询逻辑
      // 由于关系图谱查询较复杂，建议在实际使用时按需预热
      console.log(`[CacheWarmer] 预热表 ${tableId} 的关系图谱 (深度: ${depth})`);
    } catch (error) {
      console.error('[CacheWarmer] 预热关系图谱失败:', error);
    }
  }
}

// 导出单例
export const cacheWarmer = new CacheWarmer();
