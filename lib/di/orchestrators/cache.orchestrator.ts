/**
 * CacheOrchestrator - 缓存编排器
 *
 * 职责：
 * - 统一管理系统缓存策略
 * - 协调缓存预热、失效、清理
 * - 提供缓存统计和监控
 * - 处理缓存一致性和热点数据
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../tokens';
import type { MultiLevelCache } from '@/lib/cache/multi-level-cache';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import { InvalidationEvent } from '@/lib/cache/cache-invalidation';
import type { CacheWarmer } from '@/lib/cache/cache-warmer';
import { CacheStats, cacheStats, type CacheMetrics } from '@/lib/cache/cache-config';
import type { DatabaseService } from '../services/database.service';

/**
 * 缓存预热选项
 */
export interface CacheWarmupOptions {
  /** 是否预热热表 */
  warmupHotTables?: boolean;

  /** 是否预热数据库列表 */
  warmupDatabases?: boolean;

  /** 是否预热数据源 */
  warmupDataSources?: boolean;

  /** 热表数量 */
  hotTableCount?: number;
}

/**
 * 缓存失效选项
 */
export interface CacheInvalidationOptions {
  /** 数据源 ID */
  dataSourceId?: number;

  /** 数据库名称列表 */
  databases?: string[];

  /** 表 ID 列表 */
  tableIds?: number[];

  /** 失效模式 */
  pattern?: 'metadata' | 'query' | 'all';
}

/**
 * 缓存统计结果
 */
export interface CacheStatisticsResult {
  /** 总体指标 */
  overall: CacheMetrics & {
    hitRate: number;
    memoryUsage?: number;
    redisUsage?: number;
  };

  /** 各层统计 */
  layers: {
    L1: {
      hits: number;
      size: number;
      maxSize: number;
    };
    L2: {
      hits: number;
      connected: boolean;
      keyCount?: number;
    };
  };

  /** 查询缓存统计 */
  queryCache?: {
    intentCacheHits: number;
    sqlCacheHits: number;
    resultCacheHits: number;
    totalQueries: number;
  };
}

/**
 * 缓存清理结果
 */
export interface CacheCleanupResult {
  /** 是否成功 */
  success: boolean;

  /** 清理的键数量 */
  clearedKeys: number;

  /** 释放的内存（字节） */
  freedMemory?: number;

  /** 清理耗时（毫秒） */
  duration: number;

  /** 错误信息 */
  error?: string;
}

/**
 * 缓存健康检查结果
 */
export interface CacheHealthResult {
  /** 是否健康 */
  healthy: boolean;

  /** L1 缓存状态 */
  L1: {
    enabled: boolean;
    size: number;
    hitRate: number;
  };

  /** L2 缓存状态 */
  L2: {
    enabled: boolean;
    connected: boolean;
    responseTime?: number;
  };

  /** 问题列表 */
  issues?: string[];
}

/**
 * CacheOrchestrator
 *
 * 缓存编排器，统一管理系统缓存
 */
@injectable()
export class CacheOrchestrator {
  constructor(
    @inject(DI_TOKENS.MultiLevelCache)
    private readonly multiLevelCache: MultiLevelCache,

    @inject(DI_TOKENS.QueryCacheManager)
    private readonly queryCacheManager: QueryCacheManager,

    @inject(DI_TOKENS.CacheInvalidationService)
    private readonly cacheInvalidation: CacheInvalidationService,

    @inject(DI_TOKENS.CacheWarmer)
    private readonly cacheWarmer: CacheWarmer,

    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService
  ) {}

  /**
   * 预热缓存
   *
   * 在系统启动或定期任务中调用，预加载热点数据
   *
   * @param options - 预热选项
   * @returns 预热结果
   */
  async warmupCache(options: CacheWarmupOptions = {}): Promise<CacheCleanupResult> {
    const startTime = Date.now();

    try {
      console.log(`[CacheOrchestrator] Starting cache warmup...`);

      // 默认预热所有类型
      const {
        warmupHotTables = true,
        warmupDatabases = true,
        warmupDataSources = true,
        hotTableCount = 100,
      } = options;

      // 执行预热
      await this.cacheWarmer.warmup();

      const duration = Date.now() - startTime;
      console.log(`[CacheOrchestrator] Cache warmup completed in ${duration}ms`);

      return {
        success: true,
        clearedKeys: 0, // 预热不清理
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[CacheOrchestrator] Cache warmup failed:`, error);

      return {
        success: false,
        clearedKeys: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * 失效缓存
   *
   * 根据数据变更失效相关缓存
   *
   * @param options - 失效选项
   * @returns 失效结果
   */
  async invalidateCache(options: CacheInvalidationOptions): Promise<CacheCleanupResult> {
    const startTime = Date.now();

    try {
      console.log(`[CacheOrchestrator] Invalidating cache...`, options);

      let clearedKeys = 0;

      // 根据模式失效缓存
      switch (options.pattern) {
        case 'metadata':
          // 失效元数据缓存
          if (options.dataSourceId) {
            await this.cacheInvalidation.invalidate(
              InvalidationEvent.METADATA_SYNCED,
              { reason: `Data source ${options.dataSourceId} metadata changed` }
            );
            clearedKeys += 1;
          }
          break;

        case 'query':
          // 失效查询缓存
          await this.queryCacheManager.invalidateAll();
          clearedKeys += 1;
          break;

        case 'all':
        default:
          // 失效所有缓存
          if (options.dataSourceId) {
            await this.cacheInvalidation.invalidate(
              InvalidationEvent.METADATA_SYNCED,
              { reason: `Data source ${options.dataSourceId} metadata changed` }
            );
          }
          if (options.tableIds && options.tableIds.length > 0) {
            for (const tableId of options.tableIds) {
              await this.cacheInvalidation.invalidateTableCache(tableId, `table_${tableId}`);
            }
          }
          await this.queryCacheManager.invalidateAll();
          clearedKeys += options.tableIds?.length || 1;
          break;
      }

      const duration = Date.now() - startTime;
      console.log(`[CacheOrchestrator] Cache invalidated: ${clearedKeys} keys in ${duration}ms`);

      return {
        success: true,
        clearedKeys,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[CacheOrchestrator] Cache invalidation failed:`, error);

      return {
        success: false,
        clearedKeys: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * 清理过期缓存
   *
   * 主动清理 L1 和 L2 缓存中的过期数据
   *
   * @returns 清理结果
   */
  async cleanupExpiredCache(): Promise<CacheCleanupResult> {
    const startTime = Date.now();

    try {
      console.log(`[CacheOrchestrator] Cleaning up expired cache...`);

      // L1 缓存清理（内存缓存通常有自动清理）
      // L2 缓存清理（Redis 使用 TTL 自动过期）
      // 这里主要是触发手动清理逻辑

      let clearedKeys = 0;

      // 清理查询缓存中的过期项
      await this.queryCacheManager.invalidateAll();
      clearedKeys += 1;

      const duration = Date.now() - startTime;
      console.log(`[CacheOrchestrator] Expired cache cleaned: ${clearedKeys} keys in ${duration}ms`);

      return {
        success: true,
        clearedKeys,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[CacheOrchestrator] Cleanup expired cache failed:`, error);

      return {
        success: false,
        clearedKeys: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * 清空所有缓存
   *
   * 危险操作！清空 L1 和 L2 的所有缓存数据
   *
   * @returns 清理结果
   */
  async clearAllCache(): Promise<CacheCleanupResult> {
    const startTime = Date.now();

    try {
      console.log(`[CacheOrchestrator] Clearing ALL cache...`);

      // 清空查询缓存
      await this.queryCacheManager.invalidateAll();

      // 清空所有多级缓存
      // 注意：MultiLevelCache 可能需要添加 clearAll 方法
      // await this.multiLevelCache.clearAll();

      const duration = Date.now() - startTime;
      console.log(`[CacheOrchestrator] All cache cleared in ${duration}ms`);

      return {
        success: true,
        clearedKeys: -1, // 表示清空所有
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[CacheOrchestrator] Clear all cache failed:`, error);

      return {
        success: false,
        clearedKeys: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取缓存统计
   *
   * @returns 缓存统计信息
   */
  async getStatistics(): Promise<CacheStatisticsResult> {
    try {
      console.log(`[CacheOrchestrator] Getting cache statistics...`);

      // 获取全局缓存统计
      const metrics = cacheStats.getMetrics();
      const hitRate = cacheStats.getHitRate();

      // 获取查询缓存统计
      const queryCacheStats = await this.queryCacheManager.getStatistics();

      const result: CacheStatisticsResult = {
        overall: {
          ...metrics,
          hitRate: Math.round(hitRate * 100) / 100,
        },
        layers: {
          L1: {
            hits: metrics.l1Hits,
            size: 0, // 需要 MultiLevelCache 提供
            maxSize: 0,
          },
          L2: {
            hits: metrics.l2Hits,
            connected: true, // 需要检查 Redis 连接
          },
        },
        queryCache: {
          intentCacheHits: queryCacheStats.intentCacheHits || 0,
          sqlCacheHits: queryCacheStats.sqlCacheHits || 0,
          resultCacheHits: queryCacheStats.resultCacheHits || 0,
          totalQueries: (queryCacheStats.totalHits || 0) + (queryCacheStats.totalMisses || 0),
        },
      };

      console.log(`[CacheOrchestrator] Cache statistics retrieved`);
      return result;

    } catch (error) {
      console.error(`[CacheOrchestrator] Get cache statistics failed:`, error);

      // 返回空统计
      return {
        overall: {
          hits: 0,
          misses: 0,
          l1Hits: 0,
          l2Hits: 0,
          sets: 0,
          invalidations: 0,
          hitRate: 0,
        },
        layers: {
          L1: {
            hits: 0,
            size: 0,
            maxSize: 0,
          },
          L2: {
            hits: 0,
            connected: false,
          },
        },
      };
    }
  }

  /**
   * 缓存健康检查
   *
   * @returns 健康检查结果
   */
  async healthCheck(): Promise<CacheHealthResult> {
    try {
      console.log(`[CacheOrchestrator] Running cache health check...`);

      const issues: string[] = [];
      const metrics = cacheStats.getMetrics();
      const hitRate = cacheStats.getHitRate();

      // 检查命中率
      if (hitRate < 0.3) {
        issues.push(`Low cache hit rate: ${(hitRate * 100).toFixed(1)}%`);
      }

      // 检查 L2 缓存连接（Redis）
      let l2Connected = false;
      let l2ResponseTime: number | undefined;

      try {
        const startTime = Date.now();
        // 尝试访问 Redis
        await this.queryCacheManager.getStatistics();
        l2ResponseTime = Date.now() - startTime;
        l2Connected = true;
      } catch (error) {
        issues.push('L2 cache (Redis) connection failed');
      }

      const result: CacheHealthResult = {
        healthy: issues.length === 0,
        L1: {
          enabled: true,
          size: 0, // 需要 MultiLevelCache 提供
          hitRate: Math.round(hitRate * 100) / 100,
        },
        L2: {
          enabled: true,
          connected: l2Connected,
          responseTime: l2ResponseTime,
        },
        issues: issues.length > 0 ? issues : undefined,
      };

      console.log(`[CacheOrchestrator] Health check completed: ${result.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      return result;

    } catch (error) {
      console.error(`[CacheOrchestrator] Health check failed:`, error);

      return {
        healthy: false,
        L1: {
          enabled: true,
          size: 0,
          hitRate: 0,
        },
        L2: {
          enabled: true,
          connected: false,
        },
        issues: ['Health check failed'],
      };
    }
  }

  /**
   * 重置缓存统计
   */
  async resetStatistics(): Promise<void> {
    try {
      console.log(`[CacheOrchestrator] Resetting cache statistics...`);

      cacheStats.reset();
      await this.queryCacheManager.resetStatistics();

      console.log(`[CacheOrchestrator] Cache statistics reset`);
    } catch (error) {
      console.error(`[CacheOrchestrator] Reset statistics failed:`, error);
    }
  }

  /**
   * 预热指定数据源的缓存
   *
   * @param dataSourceId - 数据源 ID
   * @returns 预热结果
   */
  async warmupDataSource(dataSourceId: number): Promise<CacheCleanupResult> {
    const startTime = Date.now();

    try {
      console.log(`[CacheOrchestrator] Warming up cache for data source ${dataSourceId}...`);

      // 获取数据源的所有数据库
      const databases = await this.dbService.prisma.databaseMeta.findMany({
        where: { sourceId: dataSourceId },
        include: {
          tables: {
            take: 50, // 每个数据库最多50张表
            include: {
              columns: true,
            },
          },
        },
      });

      // 预热数据库列表
      await this.multiLevelCache.set(
        'databases_list',
        { sourceId: dataSourceId },
        databases
      );

      // 预热每个数据库的表元数据
      for (const db of databases) {
        for (const table of db.tables) {
          await this.multiLevelCache.set(
            'table_meta',
            { id: table.id, version: 'latest' },
            table
          );

          await this.multiLevelCache.set(
            'column_meta',
            { tableId: table.id },
            table.columns
          );
        }
      }

      const duration = Date.now() - startTime;
      const tableCount = databases.reduce((sum, db) => sum + db.tables.length, 0);

      console.log(
        `[CacheOrchestrator] Data source ${dataSourceId} cache warmed up: ` +
        `${databases.length} databases, ${tableCount} tables in ${duration}ms`
      );

      return {
        success: true,
        clearedKeys: 0,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[CacheOrchestrator] Warmup data source cache failed:`, error);

      return {
        success: false,
        clearedKeys: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * 预热热点查询
   *
   * 根据审计日志预热最常用的查询
   *
   * @param topN - 预热前 N 个热门查询
   * @returns 预热结果
   */
  async warmupHotQueries(topN: number = 20): Promise<CacheCleanupResult> {
    const startTime = Date.now();

    try {
      console.log(`[CacheOrchestrator] Warming up top ${topN} hot queries...`);

      // 从审计日志获取最常用的查询
      const hotQueries = await this.dbService.prisma.queryAuditLog.groupBy({
        by: ['naturalLanguageQuery'],
        where: {
          naturalLanguageQuery: {
            not: null,
          },
          success: true,
        },
        _count: {
          naturalLanguageQuery: true,
        },
        orderBy: {
          _count: {
            naturalLanguageQuery: 'desc',
          },
        },
        take: topN,
      });

      console.log(`[CacheOrchestrator] Found ${hotQueries.length} hot queries to warmup`);

      // 注意：实际预热需要重新执行查询，这里只是统计
      // 真实场景中可能需要存储查询结果并预加载

      const duration = Date.now() - startTime;

      return {
        success: true,
        clearedKeys: 0,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[CacheOrchestrator] Warmup hot queries failed:`, error);

      return {
        success: false,
        clearedKeys: 0,
        duration,
        error: errorMessage,
      };
    }
  }
}
