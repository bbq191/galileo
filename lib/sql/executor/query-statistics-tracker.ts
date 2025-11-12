/**
 * 查询统计追踪器
 * Phase 4 - 功能完善：查询统计跟踪
 *
 * 职责：
 * - 实时跟踪每个查询的执行统计
 * - 维护内存中的查询统计 Map
 * - 提供查询统计的 CRUD 操作
 * - 支持统计数据清理（避免内存泄漏）
 */

import { injectable } from 'tsyringe';
import type { QueryStatistics } from './types';

/**
 * 扩展的查询统计信息（包含 SQL 和数据库信息）
 */
export interface ExtendedQueryStatistics extends QueryStatistics {
  /** 执行的 SQL 语句 */
  sql?: string;
  /** 涉及的数据库 */
  databases?: string[];
  /** 涉及的表 */
  tables?: string[];
  /** 错误信息 */
  error?: string;
}

/**
 * 查询统计追踪器配置
 */
export interface QueryStatisticsTrackerConfig {
  /** 最大保留查询数量（默认 1000） */
  maxQueries?: number;
  /** 统计数据过期时间（毫秒，默认 1 小时） */
  expirationMs?: number;
  /** 自动清理间隔（毫秒，默认 5 分钟） */
  cleanupIntervalMs?: number;
}

/**
 * 查询统计追踪器类
 */
@injectable()
export class QueryStatisticsTracker {
  /** 查询统计 Map（queryId → ExtendedQueryStatistics） */
  private statistics = new Map<string, ExtendedQueryStatistics>();

  /** 配置 */
  private config: Required<QueryStatisticsTrackerConfig>;

  /** 清理定时器 */
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config?: QueryStatisticsTrackerConfig) {
    this.config = {
      maxQueries: config?.maxQueries ?? 1000,
      expirationMs: config?.expirationMs ?? 60 * 60 * 1000, // 1 小时
      cleanupIntervalMs: config?.cleanupIntervalMs ?? 5 * 60 * 1000, // 5 分钟
    };

    // 启动自动清理
    this.startAutoCleanup();
  }

  /**
   * 开始跟踪新查询
   */
  startTracking(queryId: string, sql?: string, databases?: string[], tables?: string[]): void {
    const stats: ExtendedQueryStatistics = {
      queryId,
      startTime: new Date(),
      success: false,
      timedOut: false,
      fromCache: false,
      sql,
      databases,
      tables,
    };

    this.statistics.set(queryId, stats);

    // 检查是否超过最大数量限制
    if (this.statistics.size > this.config.maxQueries) {
      this.cleanup();
    }
  }

  /**
   * 标记查询为缓存命中
   */
  markCacheHit(queryId: string): void {
    const stats = this.statistics.get(queryId);
    if (stats) {
      stats.fromCache = true;
    }
  }

  /**
   * 完成查询跟踪（成功）
   */
  completeTracking(
    queryId: string,
    rowCount?: number,
    timedOut: boolean = false
  ): void {
    const stats = this.statistics.get(queryId);
    if (!stats) {
      console.warn(`[QueryStatisticsTracker] 查询统计未找到: ${queryId}`);
      return;
    }

    stats.endTime = new Date();
    stats.duration = stats.endTime.getTime() - stats.startTime.getTime();
    stats.rowCount = rowCount;
    stats.success = true;
    stats.timedOut = timedOut;
  }

  /**
   * 完成查询跟踪（失败）
   */
  failTracking(queryId: string, error: string, timedOut: boolean = false): void {
    const stats = this.statistics.get(queryId);
    if (!stats) {
      console.warn(`[QueryStatisticsTracker] 查询统计未找到: ${queryId}`);
      return;
    }

    stats.endTime = new Date();
    stats.duration = stats.endTime.getTime() - stats.startTime.getTime();
    stats.success = false;
    stats.timedOut = timedOut;
    stats.error = error;
  }

  /**
   * 获取查询统计
   */
  getStatistics(queryId: string): QueryStatistics | null {
    return this.statistics.get(queryId) || null;
  }

  /**
   * 获取扩展的查询统计
   */
  getExtendedStatistics(queryId: string): ExtendedQueryStatistics | null {
    return this.statistics.get(queryId) || null;
  }

  /**
   * 获取所有查询统计
   */
  getAllStatistics(): ExtendedQueryStatistics[] {
    return Array.from(this.statistics.values());
  }

  /**
   * 获取聚合统计
   */
  getAggregatedStats(): {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    timedOutQueries: number;
    cacheHits: number;
    cacheMisses: number;
    successRate: number;
    cacheHitRate: number;
    averageDuration: number;
    p95Duration: number;
    p99Duration: number;
  } {
    const allStats = this.getAllStatistics();

    if (allStats.length === 0) {
      return {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        timedOutQueries: 0,
        cacheHits: 0,
        cacheMisses: 0,
        successRate: 0,
        cacheHitRate: 0,
        averageDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
      };
    }

    const totalQueries = allStats.length;
    const successfulQueries = allStats.filter((s) => s.success).length;
    const failedQueries = allStats.filter((s) => !s.success).length;
    const timedOutQueries = allStats.filter((s) => s.timedOut).length;
    const cacheHits = allStats.filter((s) => s.fromCache).length;
    const cacheMisses = totalQueries - cacheHits;

    const successRate = (successfulQueries / totalQueries) * 100;
    const cacheHitRate = (cacheHits / totalQueries) * 100;

    // 计算平均耗时
    const durations = allStats.filter((s) => s.duration !== undefined).map((s) => s.duration!);
    const averageDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // 计算百分位数
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p95Duration =
      sortedDurations.length > 0
        ? sortedDurations[Math.floor(sortedDurations.length * 0.95)]
        : 0;
    const p99Duration =
      sortedDurations.length > 0
        ? sortedDurations[Math.floor(sortedDurations.length * 0.99)]
        : 0;

    return {
      totalQueries,
      successfulQueries,
      failedQueries,
      timedOutQueries,
      cacheHits,
      cacheMisses,
      successRate,
      cacheHitRate,
      averageDuration,
      p95Duration,
      p99Duration,
    };
  }

  /**
   * 获取最慢的查询
   */
  getSlowestQueries(limit: number = 10): ExtendedQueryStatistics[] {
    return this.getAllStatistics()
      .filter((s) => s.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, limit);
  }

  /**
   * 获取失败的查询
   */
  getFailedQueries(limit: number = 10): ExtendedQueryStatistics[] {
    return this.getAllStatistics()
      .filter((s) => !s.success)
      .slice(0, limit);
  }

  /**
   * 清理过期的统计数据
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // 找出过期的查询
    this.statistics.forEach((stats, queryId) => {
      const age = now - stats.startTime.getTime();
      if (age > this.config.expirationMs) {
        expiredKeys.push(queryId);
      }
    });

    // 删除过期的查询
    for (const key of expiredKeys) {
      this.statistics.delete(key);
    }

    // 如果仍然超过限制，删除最旧的查询
    if (this.statistics.size > this.config.maxQueries) {
      const sortedStats = this.getAllStatistics().sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      );

      const deleteCount = this.statistics.size - this.config.maxQueries;
      for (let i = 0; i < deleteCount; i++) {
        this.statistics.delete(sortedStats[i].queryId);
      }
    }

    if (expiredKeys.length > 0) {
      console.log(`[QueryStatisticsTracker] 已清理 ${expiredKeys.length} 条过期统计`);
    }
  }

  /**
   * 清空所有统计数据
   */
  clear(): void {
    this.statistics.clear();
  }

  /**
   * 启动自动清理
   */
  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // 防止定时器阻止进程退出
    this.cleanupTimer.unref();
  }

  /**
   * 停止自动清理
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 获取配置
   */
  getConfig(): Required<QueryStatisticsTrackerConfig> {
    return { ...this.config };
  }

  /**
   * 销毁追踪器
   */
  destroy(): void {
    this.stopAutoCleanup();
    this.clear();
  }
}
