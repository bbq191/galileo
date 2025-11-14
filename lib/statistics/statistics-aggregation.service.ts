/**
 * 统计聚合服务
 * Phase 4 - 功能完善：查询统计跟踪
 *
 * 职责：
 * - 聚合多个来源的统计数据
 * - 提供统一的统计查询接口
 * - 计算系统级别的关键指标
 * - 支持多维度统计分析
 */

import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { QueryStatisticsTracker } from '@/lib/sql/executor/query-statistics-tracker';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import type { AuditOrchestrator } from '@/lib/di/orchestrators/audit.orchestrator';

/**
 * 系统统计概览
 */
export interface SystemStatisticsOverview {
  /** 实时查询统计 */
  realtime: {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    successRate: number;
    averageDuration: number;
    p95Duration: number;
    p99Duration: number;
  };

  /** 缓存统计 */
  cache: {
    intentCacheHitRate: number;
    sqlCacheHitRate: number;
    resultCacheHitRate: number;
    totalHitRate: number;
    totalHits: number;
    totalMisses: number;
  };

  /** 审计日志统计 */
  audit: {
    totalQueriesLogged: number;
    successRate: number;
    averageExecutionTime: number;
  };

  /** 综合指标 */
  overall: {
    /** 系统健康度（0-100） */
    healthScore: number;
    /** 性能评分（0-100） */
    performanceScore: number;
    /** 可靠性评分（0-100） */
    reliabilityScore: number;
  };
}

/**
 * 性能趋势数据
 */
export interface PerformanceTrend {
  /** 时间点 */
  timestamp: Date;
  /** 平均响应时间 */
  averageDuration: number;
  /** P95 响应时间 */
  p95Duration: number;
  /** 查询成功率 */
  successRate: number;
  /** 缓存命中率 */
  cacheHitRate: number;
}

/**
 * 热点数据分析
 */
export interface HotspotAnalysis {
  /** 热门查询 */
  hotQueries: Array<{
    query: string;
    count: number;
    avgDuration: number;
  }>;

  /** 热门表 */
  hotTables: Array<{
    database: string;
    table: string;
    accessCount: number;
  }>;

  /** 慢查询 */
  slowQueries: Array<{
    queryId: string;
    sql?: string;
    duration: number;
    databases?: string[];
    tables?: string[];
  }>;
}

/**
 * 统计聚合服务类
 */
@injectable()
export class StatisticsAggregationService {
  constructor(
    @inject(DI_TOKENS.QueryStatisticsTracker)
    private readonly queryStatsTracker: QueryStatisticsTracker,
    @inject(DI_TOKENS.QueryCacheManager)
    private readonly queryCacheManager: QueryCacheManager,
    @inject(DI_TOKENS.AuditOrchestrator)
    private readonly auditOrchestrator: AuditOrchestrator
  ) {}

  /**
   * 获取系统统计概览
   */
  async getSystemOverview(): Promise<SystemStatisticsOverview> {
    // 1. 获取实时查询统计
    const realtimeStats = this.queryStatsTracker.getAggregatedStats();

    // 2. 获取缓存统计
    const cacheStats = this.queryCacheManager.getStatistics();

    // 3. 获取审计日志统计
    const auditStats = await this.auditOrchestrator.getStatistics({});

    // 4. 计算综合指标
    const healthScore = this.calculateHealthScore(
      realtimeStats.successRate,
      cacheStats.hitRate,
      auditStats.successRate
    );

    const performanceScore = this.calculatePerformanceScore(
      realtimeStats.averageDuration,
      realtimeStats.p95Duration,
      cacheStats.hitRate
    );

    const reliabilityScore = this.calculateReliabilityScore(
      realtimeStats.successRate,
      realtimeStats.timedOutQueries,
      realtimeStats.totalQueries
    );

    return {
      realtime: {
        totalQueries: realtimeStats.totalQueries,
        successfulQueries: realtimeStats.successfulQueries,
        failedQueries: realtimeStats.failedQueries,
        successRate: realtimeStats.successRate,
        averageDuration: realtimeStats.averageDuration,
        p95Duration: realtimeStats.p95Duration,
        p99Duration: realtimeStats.p99Duration,
      },
      cache: {
        intentCacheHitRate:
          cacheStats.intentCacheHits /
            (cacheStats.intentCacheHits + cacheStats.intentCacheMisses) || 0,
        sqlCacheHitRate:
          cacheStats.sqlCacheHits / (cacheStats.sqlCacheHits + cacheStats.sqlCacheMisses) ||
          0,
        resultCacheHitRate:
          cacheStats.resultCacheHits /
            (cacheStats.resultCacheHits + cacheStats.resultCacheMisses) || 0,
        totalHitRate: cacheStats.hitRate,
        totalHits: cacheStats.totalHits,
        totalMisses: cacheStats.totalMisses,
      },
      audit: {
        totalQueriesLogged: auditStats.totalQueries,
        successRate: auditStats.successRate,
        averageExecutionTime: auditStats.avgExecutionTime,
      },
      overall: {
        healthScore,
        performanceScore,
        reliabilityScore,
      },
    };
  }

  /**
   * 获取缓存详细统计
   */
  getCacheStatistics() {
    return this.queryCacheManager.getStatistics();
  }

  /**
   * 获取实时查询统计
   */
  getRealtimeQueryStatistics() {
    return this.queryStatsTracker.getAggregatedStats();
  }

  /**
   * 获取热点数据分析
   */
  async getHotspotAnalysis(): Promise<HotspotAnalysis> {
    // 1. 获取慢查询（从实时统计）
    const slowQueries = this.queryStatsTracker.getSlowestQueries(10).map((q) => ({
      queryId: q.queryId,
      sql: q.sql,
      duration: q.duration || 0,
      databases: q.databases,
      tables: q.tables,
    }));

    // 2. 获取热门查询（从审计日志）
    const hotQueries = await this.auditOrchestrator.getHotQueries({
      limit: 10,
    });

    // 3. 获取热门表（从审计日志）
    const hotTables = await this.auditOrchestrator.getHotTables({
      limit: 10,
    });

    return {
      hotQueries,
      hotTables,
      slowQueries,
    };
  }

  /**
   * 获取失败查询分析
   */
  getFailedQueriesAnalysis() {
    const failedQueries = this.queryStatsTracker.getFailedQueries(20);

    return {
      total: failedQueries.length,
      queries: failedQueries.map((q) => ({
        queryId: q.queryId,
        sql: q.sql,
        error: q.error,
        duration: q.duration,
        timedOut: q.timedOut,
        timestamp: q.startTime,
        databases: q.databases,
        tables: q.tables,
      })),
    };
  }

  /**
   * 获取审计日志统计
   */
  async getAuditStatistics(filters: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    return this.auditOrchestrator.getStatistics(filters);
  }

  /**
   * 计算系统健康度评分（0-100）
   */
  private calculateHealthScore(
    realtimeSuccessRate: number,
    cacheHitRate: number,
    auditSuccessRate: number
  ): number {
    // 加权平均：实时成功率 40%，缓存命中率 30%，审计成功率 30%
    const score =
      realtimeSuccessRate * 0.4 + cacheHitRate * 0.3 + auditSuccessRate * 0.3;

    return Math.round(score);
  }

  /**
   * 计算性能评分（0-100）
   */
  private calculatePerformanceScore(
    avgDuration: number,
    p95Duration: number,
    cacheHitRate: number
  ): number {
    // 性能目标：平均 < 500ms, P95 < 2000ms
    const avgScore = Math.max(0, 100 - (avgDuration / 500) * 50);
    const p95Score = Math.max(0, 100 - (p95Duration / 2000) * 50);
    const cacheScore = cacheHitRate;

    // 加权平均：平均耗时 30%，P95 耗时 40%，缓存命中率 30%
    const score = avgScore * 0.3 + p95Score * 0.4 + cacheScore * 0.3;

    return Math.round(score);
  }

  /**
   * 计算可靠性评分（0-100）
   */
  private calculateReliabilityScore(
    successRate: number,
    timedOutQueries: number,
    totalQueries: number
  ): number {
    // 超时率惩罚
    const timeoutRate = totalQueries > 0 ? (timedOutQueries / totalQueries) * 100 : 0;
    const timeoutPenalty = Math.min(20, timeoutRate * 2); // 最多扣 20 分

    // 可靠性评分 = 成功率 - 超时惩罚
    const score = Math.max(0, successRate - timeoutPenalty);

    return Math.round(score);
  }

  /**
   * 获取性能趋势数据（从审计日志聚合）
   */
  async getPerformanceTrend(
    startDate: Date,
    endDate: Date
  ): Promise<PerformanceTrend[]> {
    try {
      // 从审计日志中查询指定时间范围的数据
      const logs = await this.auditOrchestrator.getQueryHistory({
        startDate,
        endDate,
        page: 1,
        limit: 10000, // 获取足够多的数据用于聚合
      });

      // 按天分组聚合数据
      const dailyStats = new Map<string, {
        totalTime: number[];
        successCount: number;
        totalCount: number;
      }>();

      logs.data.forEach((log) => {
        const dateKey = new Date(log.timestamp).toISOString().split('T')[0];

        if (!dailyStats.has(dateKey)) {
          dailyStats.set(dateKey, {
            totalTime: [],
            successCount: 0,
            totalCount: 0,
          });
        }

        const stats = dailyStats.get(dateKey)!;

        // 收集执行时间
        if (log.performance.totalTime !== null) {
          stats.totalTime.push(log.performance.totalTime);
        }

        // 统计成功率
        stats.totalCount++;
        if (log.executionResult.success) {
          stats.successCount++;
        }
      });

      // 获取当前缓存统计（用于最近的数据）
      const currentCacheStats = this.queryCacheManager.getStatistics();

      // 转换为 PerformanceTrend 数组
      const trends: PerformanceTrend[] = [];

      dailyStats.forEach((stats, dateKey) => {
        // 计算平均响应时间
        const averageDuration = stats.totalTime.length > 0
          ? stats.totalTime.reduce((a, b) => a + b, 0) / stats.totalTime.length
          : 0;

        // 计算 P95 响应时间
        const sortedTimes = stats.totalTime.sort((a, b) => a - b);
        const p95Index = Math.floor(sortedTimes.length * 0.95);
        const p95Duration = sortedTimes.length > 0 ? sortedTimes[p95Index] || 0 : 0;

        // 计算成功率
        const successRate = stats.totalCount > 0
          ? (stats.successCount / stats.totalCount) * 100
          : 0;

        trends.push({
          timestamp: new Date(dateKey),
          averageDuration,
          p95Duration,
          successRate,
          // 使用当前缓存命中率作为近似值（理想情况应该存储历史缓存数据）
          cacheHitRate: currentCacheStats.hitRate,
        });
      });

      // 按时间排序
      trends.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // 如果没有历史数据，返回当前数据点
      if (trends.length === 0) {
        const currentStats = this.queryStatsTracker.getAggregatedStats();

        return [
          {
            timestamp: new Date(),
            averageDuration: currentStats.averageDuration,
            p95Duration: currentStats.p95Duration,
            successRate: currentStats.successRate,
            cacheHitRate: currentCacheStats.hitRate,
          },
        ];
      }

      return trends;
    } catch (error) {
      console.error('[Performance Trend] 获取性能趋势失败:', error);

      // 失败时返回当前数据
      const currentStats = this.queryStatsTracker.getAggregatedStats();
      const cacheStats = this.queryCacheManager.getStatistics();

      return [
        {
          timestamp: new Date(),
          averageDuration: currentStats.averageDuration,
          p95Duration: currentStats.p95Duration,
          successRate: currentStats.successRate,
          cacheHitRate: cacheStats.hitRate,
        },
      ];
    }
  }
}
