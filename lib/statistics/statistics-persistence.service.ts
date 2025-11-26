/**
 * 统计持久化服务
 * Phase 4 - 功能完善：查询统计跟踪
 *
 * 职责：
 * - 定期将内存中的统计数据持久化到 Redis
 * - 避免服务重启后统计数据丢失
 * - 提供统计数据恢复功能
 * - 支持统计数据归档
 */

import { injectable, inject } from 'tsyringe';
import type Redis from 'ioredis';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { QueryStatisticsTracker } from '@/lib/sql/executor/query-statistics-tracker';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';

/**
 * 持久化配置
 */
export interface PersistenceConfig {
  /** 持久化间隔（毫秒，默认 5 分钟） */
  persistIntervalMs?: number;
  /** Redis 键前缀 */
  redisKeyPrefix?: string;
  /** 统计数据保留天数 */
  retentionDays?: number;
}

/**
 * 持久化的统计数据
 */
export interface PersistedStatistics {
  /** 时间戳 */
  timestamp: Date;
  /** 查询统计追踪器数据 */
  queryStats: {
    aggregated: ReturnType<QueryStatisticsTracker['getAggregatedStats']>;
    slowestQueries: ReturnType<QueryStatisticsTracker['getSlowestQueries']>;
    failedQueries: ReturnType<QueryStatisticsTracker['getFailedQueries']>;
  };
  /** 缓存统计数据 */
  cacheStats: ReturnType<QueryCacheManager['getStatistics']>;
}

/**
 * 统计持久化服务类
 */
@injectable()
export class StatisticsPersistenceService {
  private config: Required<PersistenceConfig>;
  private persistTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    @inject(DI_TOKENS.RedisClient) private readonly redis: Redis,
    @inject(DI_TOKENS.QueryStatisticsTracker)
    private readonly queryStatsTracker: QueryStatisticsTracker,
    @inject(DI_TOKENS.QueryCacheManager)
    private readonly queryCacheManager: QueryCacheManager,
    config?: PersistenceConfig
  ) {
    this.config = {
      persistIntervalMs: config?.persistIntervalMs ?? 5 * 60 * 1000, // 5 分钟
      redisKeyPrefix: config?.redisKeyPrefix ?? 'galileo:stats',
      retentionDays: config?.retentionDays ?? 7, // 保留 7 天
    };
  }

  /**
   * 启动持久化服务
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[StatisticsPersistenceService] 服务已在运行中');
      return;
    }

    this.isRunning = true;
    console.log('[StatisticsPersistenceService] 启动持久化服务');

    // 立即执行一次持久化
    this.persistStatistics().catch((error) => {
      console.error('[StatisticsPersistenceService] 初始持久化失败:', error);
    });

    // 启动定时持久化
    this.persistTimer = setInterval(() => {
      this.persistStatistics().catch((error) => {
        console.error('[StatisticsPersistenceService] 定时持久化失败:', error);
      });
    }, this.config.persistIntervalMs);

    // 防止定时器阻止进程退出
    this.persistTimer.unref();
  }

  /**
   * 停止持久化服务
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }

    this.isRunning = false;
    console.log('[StatisticsPersistenceService] 停止持久化服务');
  }

  /**
   * 持久化统计数据到 Redis
   * @author xusy
   */
  async persistStatistics(): Promise<void> {
    try {
      // 检查 Redis 连接状态
      if (this.redis.status !== 'ready' && this.redis.status !== 'connect') {
        // Redis 未就绪，跳过持久化
        return;
      }

      const stats: PersistedStatistics = {
        timestamp: new Date(),
        queryStats: {
          aggregated: this.queryStatsTracker.getAggregatedStats(),
          slowestQueries: this.queryStatsTracker.getSlowestQueries(20),
          failedQueries: this.queryStatsTracker.getFailedQueries(20),
        },
        cacheStats: this.queryCacheManager.getStatistics(),
      };

      const key = this.getCurrentStatsKey();
      const ttl = this.config.retentionDays * 24 * 60 * 60; // 转换为秒

      await this.redis.setex(key, ttl, JSON.stringify(stats));

      console.log(`[StatisticsPersistenceService] 统计数据已持久化: ${key}`);
    } catch (error) {
      console.error('[StatisticsPersistenceService] 持久化失败:', error instanceof Error ? error.message : error);
      // 不抛出错误，允许服务继续运行
    }
  }

  /**
   * 从 Redis 恢复统计数据
   * @author xusy
   */
  async restoreStatistics(date?: Date): Promise<PersistedStatistics | null> {
    try {
      // 检查 Redis 连接状态
      if (this.redis.status !== 'ready' && this.redis.status !== 'connect') {
        console.warn('[StatisticsPersistenceService] Redis 未就绪，无法恢复统计数据');
        return null;
      }

      const key = date ? this.getStatsKeyForDate(date) : this.getCurrentStatsKey();
      const data = await this.redis.get(key);

      if (!data) {
        console.log(`[StatisticsPersistenceService] 未找到统计数据: ${key}`);
        return null;
      }

      const stats = JSON.parse(data) as PersistedStatistics;
      console.log(`[StatisticsPersistenceService] 统计数据已恢复: ${key}`);
      return stats;
    } catch (error) {
      console.error('[StatisticsPersistenceService] 恢复失败:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * 获取历史统计数据
   * @author xusy
   */
  async getHistoricalStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<PersistedStatistics[]> {
    const results: PersistedStatistics[] = [];

    try {
      // 检查 Redis 连接状态
      if (this.redis.status !== 'ready' && this.redis.status !== 'connect') {
        console.warn('[StatisticsPersistenceService] Redis 未就绪，无法获取历史统计数据');
        return results;
      }

      const pattern = `${this.config.redisKeyPrefix}:*`;
      const keys = await this.redis.keys(pattern);

      // 过滤出时间范围内的键
      const targetKeys = keys.filter((key) => {
        const dateStr = key.split(':').pop();
        if (!dateStr) return false;

        const date = new Date(dateStr);
        return date >= startDate && date <= endDate;
      });

      // 批量获取数据
      const pipeline = this.redis.pipeline();
      targetKeys.forEach((key) => pipeline.get(key));
      const dataList = await pipeline.exec();

      if (!dataList) return results;

      // 解析数据
      for (const [error, data] of dataList) {
        if (error || !data) continue;
        try {
          const stats = JSON.parse(data as string) as PersistedStatistics;
          results.push(stats);
        } catch (parseError) {
          console.error(
            '[StatisticsPersistenceService] 解析统计数据失败:',
            parseError
          );
        }
      }

      // 按时间排序
      results.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      console.log(
        `[StatisticsPersistenceService] 获取历史统计数据: ${results.length} 条`
      );
      return results;
    } catch (error) {
      console.error('[StatisticsPersistenceService] 获取历史数据失败:', error instanceof Error ? error.message : error);
      return results;
    }
  }

  /**
   * 清理过期的统计数据
   * @author xusy
   */
  async cleanupOldStatistics(): Promise<number> {
    try {
      // 检查 Redis 连接状态
      if (this.redis.status !== 'ready' && this.redis.status !== 'connect') {
        console.warn('[StatisticsPersistenceService] Redis 未就绪，无法清理过期数据');
        return 0;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const pattern = `${this.config.redisKeyPrefix}:*`;
      const keys = await this.redis.keys(pattern);

      // 找出需要删除的键
      const keysToDelete = keys.filter((key) => {
        const dateStr = key.split(':').pop();
        if (!dateStr) return false;

        const date = new Date(dateStr);
        return date < cutoffDate;
      });

      if (keysToDelete.length === 0) {
        console.log('[StatisticsPersistenceService] 没有需要清理的过期数据');
        return 0;
      }

      // 批量删除
      await this.redis.del(...keysToDelete);

      console.log(
        `[StatisticsPersistenceService] 已清理 ${keysToDelete.length} 条过期数据`
      );
      return keysToDelete.length;
    } catch (error) {
      console.error('[StatisticsPersistenceService] 清理失败:', error instanceof Error ? error.message : error);
      return 0;
    }
  }

  /**
   * 获取当前统计数据的 Redis 键
   */
  private getCurrentStatsKey(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return `${this.config.redisKeyPrefix}:${dateStr}`;
  }

  /**
   * 获取指定日期的统计数据 Redis 键
   */
  private getStatsKeyForDate(date: Date): string {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return `${this.config.redisKeyPrefix}:${dateStr}`;
  }

  /**
   * 获取配置
   */
  getConfig(): Required<PersistenceConfig> {
    return { ...this.config };
  }

  /**
   * 获取服务状态
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }
}
