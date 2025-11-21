/**
 * 缓存失效策略
 * 当元数据变更时，自动失效相关的查询缓存
 */

import { injectable, inject } from 'tsyringe';
import { queryCacheManager, QueryCacheManager } from './query-cache-manager';
import { multiLevelCache, MultiLevelCache } from './multi-level-cache';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * 失效事件类型
 */
export enum InvalidationEvent {
  // 元数据相关
  METADATA_SYNCED = 'metadata_synced',
  TABLE_STRUCTURE_CHANGED = 'table_structure_changed',
  RELATIONSHIP_CHANGED = 'relationship_changed',
  DATABASE_SYNCED = 'database_synced',

  // 数据相关
  DATA_UPDATED = 'data_updated',

  // 手动触发
  MANUAL_SYNC = 'manual_sync',
  MANUAL_CLEAR_ALL = 'manual_clear_all',
}

/**
 * 失效选项
 */
export interface InvalidationOptions {
  /** 是否同时失效查询缓存 */
  invalidateQueries?: boolean;
  /** 是否同时失效元数据缓存 */
  invalidateMetadata?: boolean;
  /** 特定的缓存键模式（如 'metadata:table:*'） */
  pattern?: string;
  /** 原因说明 */
  reason?: string;
}

/**
 * 缓存失效服务
 */
@injectable()
export class CacheInvalidationService {
  // 依赖注入的服务
  private queryCacheManager: QueryCacheManager;
  private multiLevelCache: MultiLevelCache;

  constructor(
    @inject(DI_TOKENS.QueryCacheManager) injectedQueryCacheManager?: QueryCacheManager,
    @inject(DI_TOKENS.MultiLevelCache) injectedMultiLevelCache?: MultiLevelCache
  ) {
    // 如果通过 DI 注入，使用注入的实例
    if (injectedQueryCacheManager) {
      this.queryCacheManager = injectedQueryCacheManager;
    } else {
      // 向后兼容：使用全局单例
      this.queryCacheManager = queryCacheManager;
    }

    if (injectedMultiLevelCache) {
      this.multiLevelCache = injectedMultiLevelCache;
    } else {
      // 向后兼容：使用全局单例
      this.multiLevelCache = multiLevelCache;
    }
  }
  /**
   * 触发缓存失效
   * @param event 失效事件
   * @param options 失效选项
   */
  async invalidate(
    event: InvalidationEvent,
    options: InvalidationOptions = {}
  ): Promise<void> {
    const {
      invalidateQueries = true,
      invalidateMetadata = true,
      pattern,
      reason = '未提供原因',
    } = options;

    console.log(`[CacheInvalidation] 触发缓存失效: ${event}, 原因: ${reason}`);

    const startTime = Date.now();

    try {
      // 根据事件类型执行不同的失效策略
      switch (event) {
        case InvalidationEvent.METADATA_SYNCED:
          // 元数据同步：失效所有查询缓存（意图和SQL）
          if (invalidateQueries) {
            console.log('[CacheInvalidation] 开始失效查询缓存...');
            await Promise.all([
              this.queryCacheManager.invalidateIntents(),
              this.queryCacheManager.invalidateSQL(),
            ]);
            console.log('[CacheInvalidation] 查询缓存失效完成');
          }
          // 失效元数据缓存
          if (invalidateMetadata) {
            console.log('[CacheInvalidation] 开始失效元数据缓存...');
            await this.multiLevelCache.invalidate('metadata_synced');
            console.log('[CacheInvalidation] 元数据缓存失效完成');
          }
          break;

        case InvalidationEvent.TABLE_STRUCTURE_CHANGED:
          // 表结构变更：失效所有查询缓存和相关元数据缓存
          if (invalidateQueries) {
            await this.queryCacheManager.invalidateAll();
          }
          if (invalidateMetadata) {
            await this.multiLevelCache.invalidate('table_structure_changed');
          }
          break;

        case InvalidationEvent.RELATIONSHIP_CHANGED:
          // 关系变更：失效 SQL 缓存（因为 JOIN 条件可能改变）
          if (invalidateQueries) {
            await this.queryCacheManager.invalidateSQL();
          }
          if (invalidateMetadata) {
            await this.multiLevelCache.invalidate('relationship_changed');
          }
          break;

        case InvalidationEvent.DATABASE_SYNCED:
          // 数据库同步：失效所有相关缓存
          if (invalidateQueries) {
            await this.queryCacheManager.invalidateAll();
          }
          if (invalidateMetadata) {
            await this.multiLevelCache.invalidate('database_synced');
          }
          break;

        case InvalidationEvent.DATA_UPDATED:
          // 数据更新：只失效结果缓存
          if (invalidateQueries) {
            await this.queryCacheManager.invalidateResults();
          }
          break;

        case InvalidationEvent.MANUAL_SYNC:
          // 手动同步：失效所有查询缓存
          if (invalidateQueries) {
            await this.queryCacheManager.invalidateAll();
          }
          if (invalidateMetadata) {
            await this.multiLevelCache.invalidate('manual_sync');
          }
          break;

        case InvalidationEvent.MANUAL_CLEAR_ALL:
          // 手动清空所有缓存
          await this.clearAllCaches();
          break;

        default:
          console.warn(`[CacheInvalidation] 未知的失效事件: ${event}`);
      }

      const duration = Date.now() - startTime;
      console.log(`[CacheInvalidation] 缓存失效完成，耗时: ${duration}ms`);
    } catch (error) {
      console.error(`[CacheInvalidation] 缓存失效失败:`, error);
      throw error;
    }
  }

  /**
   * 当表结构变更时失效相关缓存
   * @param tableId 表 ID
   * @param tableName 表名
   */
  async invalidateTableCache(tableId: number, tableName: string): Promise<void> {
    console.log(`[CacheInvalidation] 失效表缓存: ${tableName} (ID: ${tableId})`);

    try {
      // 失效查询缓存（因为表结构可能影响查询）
      await this.queryCacheManager.invalidateAll();

      // 失效特定表的元数据缓存
      await this.multiLevelCache.delete('table_meta', { id: tableId, version: '*' });

      // 失效该表的字段缓存
      await this.multiLevelCache.delete('column_meta', { tableId });

      // 失效关系缓存
      await this.multiLevelCache.invalidate(
        'table_structure_changed',
        `relationships:*:table:${tableId}*`
      );

      console.log(`[CacheInvalidation] 表缓存失效完成: ${tableName}`);
    } catch (error) {
      console.error(`[CacheInvalidation] 失效表缓存失败:`, error);
      throw error;
    }
  }

  /**
   * 当数据库同步完成时失效相关缓存
   * @param databaseId 数据库 ID
   * @param databaseName 数据库名
   */
  async invalidateDatabaseCache(
    databaseId: number,
    databaseName: string
  ): Promise<void> {
    console.log(
      `[CacheInvalidation] 失效数据库缓存: ${databaseName} (ID: ${databaseId})`
    );

    try {
      // 失效所有查询缓存
      await this.queryCacheManager.invalidateAll();

      // 失效数据库元数据缓存
      await this.multiLevelCache.delete('database_meta', { id: databaseId });

      // 失效该数据库的表列表缓存
      await this.multiLevelCache.invalidate(
        'database_synced',
        `tables:list:db:${databaseId}*`
      );

      console.log(`[CacheInvalidation] 数据库缓存失效完成: ${databaseName}`);
    } catch (error) {
      console.error(`[CacheInvalidation] 失效数据库缓存失败:`, error);
      throw error;
    }
  }

  /**
   * 当关系验证或新增时失效相关缓存
   */
  async invalidateRelationshipCache(): Promise<void> {
    console.log('[CacheInvalidation] 失效关系缓存');

    try {
      // 失效 SQL 缓存（因为 JOIN 条件可能改变）
      await this.queryCacheManager.invalidateSQL();

      // 失效关系图谱缓存
      await this.multiLevelCache.invalidate('relationship_changed', 'graph:*');
      await this.multiLevelCache.invalidate('relationship_changed', 'relationships:*');

      console.log('[CacheInvalidation] 关系缓存失效完成');
    } catch (error) {
      console.error('[CacheInvalidation] 失效关系缓存失败:', error);
      throw error;
    }
  }

  /**
   * 清空所有缓存
   */
  async clearAllCaches(): Promise<void> {
    console.log('[CacheInvalidation] 清空所有缓存...');

    try {
      // 清空查询缓存
      await this.queryCacheManager.invalidateAll();

      // 清空元数据缓存
      await this.multiLevelCache.clear();

      console.log('[CacheInvalidation] 所有缓存已清空');
    } catch (error) {
      console.error('[CacheInvalidation] 清空缓存失败:', error);
      throw error;
    }
  }

  /**
   * 获取缓存状态报告
   */
  getCacheStatus(): {
    queryCacheStats: any;
    cacheStats: any;
  } {
    return {
      queryCacheStats: this.queryCacheManager.getStatistics(),
      cacheStats: this.multiLevelCache.getStats(),
    };
  }
}

// 导出单例（向后兼容）
// 注意：通过 DI 使用时，应该注入 CacheInvalidationService 类而不是使用此单例
export const cacheInvalidationService = new CacheInvalidationService();

/**
 * 便捷函数：当元数据同步完成时调用
 */
export async function onMetadataSynced(reason?: string): Promise<void> {
  await cacheInvalidationService.invalidate(InvalidationEvent.METADATA_SYNCED, {
    reason: reason || '元数据同步完成',
  });
}

/**
 * 便捷函数：当表结构变更时调用
 */
export async function onTableStructureChanged(
  tableId: number,
  tableName: string
): Promise<void> {
  await cacheInvalidationService.invalidateTableCache(tableId, tableName);
}

/**
 * 便捷函数：当数据库同步完成时调用
 */
export async function onDatabaseSynced(
  databaseId: number,
  databaseName: string
): Promise<void> {
  await cacheInvalidationService.invalidateDatabaseCache(databaseId, databaseName);
}

/**
 * 便捷函数：当关系变更时调用
 */
export async function onRelationshipChanged(): Promise<void> {
  await cacheInvalidationService.invalidateRelationshipCache();
}

/**
 * 便捷函数：手动清空所有缓存
 */
export async function clearAllCaches(): Promise<void> {
  await cacheInvalidationService.clearAllCaches();
}
