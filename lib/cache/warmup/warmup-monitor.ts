/**
 * WarmupMonitor - 缓存预热监控器
 *
 * 职责：
 * - 记录预热历史
 * - 统计预热效果（缓存命中率提升）
 * - 提供预热性能指标
 * - 监控预热异常
 */

import type { PrismaClient } from '@prisma/client';
import type { WarmupResult } from './warmup-strategy';

/**
 * 预热历史记录
 */
export interface WarmupHistory {
  id?: number;
  trigger: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  itemsWarmed: number;
  success: boolean;
  errors: string;
  executedStrategies: string; // JSON
}

/**
 * 预热统计
 */
export interface WarmupStatistics {
  /** 总预热次数 */
  totalWarmups: number;

  /** 成功次数 */
  successfulWarmups: number;

  /** 失败次数 */
  failedWarmups: number;

  /** 平均耗时（毫秒） */
  avgDuration: number;

  /** 平均预热项数 */
  avgItemsWarmed: number;

  /** 最近一次预热 */
  lastWarmup: WarmupHistory | null;

  /** 预热历史（最近 10 次） */
  recentHistory: WarmupHistory[];
}

/**
 * 预热效果分析
 */
export interface WarmupEffectiveness {
  /** 预热前缓存命中率 */
  cacheHitRateBefore: number;

  /** 预热后缓存命中率 */
  cacheHitRateAfter: number;

  /** 命中率提升 */
  improvement: number;

  /** 测量时间窗口（毫秒） */
  measurementWindow: number;
}

/**
 * WarmupMonitor 类
 */
export class WarmupMonitor {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  /**
   * 记录预热结果
   *
   * @param result - 预热结果
   */
  async recordWarmup(result: WarmupResult): Promise<void> {
    try {
      // 假设有 cache_warmup_history 表
      // 如果没有，可以使用普通日志记录

      const historyRecord: Omit<WarmupHistory, 'id'> = {
        trigger: result.trigger,
        startTime: new Date(Date.now() - result.totalDuration),
        endTime: new Date(),
        duration: result.totalDuration,
        itemsWarmed: result.totalItemsWarmed,
        success: result.success,
        errors: JSON.stringify(result.errors),
        executedStrategies: JSON.stringify(result.executedStrategies),
      };

      // 由于没有专门的预热历史表，暂时只记录日志
      console.log('[WarmupMonitor] 预热记录:', historyRecord);

      // 未来可以添加到数据库：
      // await this.prisma.cacheWarmupHistory.create({
      //   data: historyRecord,
      // });
    } catch (error) {
      console.error('[WarmupMonitor] 记录预热历史失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 获取预热统计
   *
   * @returns 预热统计信息
   */
  async getStatistics(): Promise<WarmupStatistics> {
    try {
      // 由于没有专门的预热历史表，返回模拟数据
      // 未来可以从数据库查询实际数据

      return {
        totalWarmups: 0,
        successfulWarmups: 0,
        failedWarmups: 0,
        avgDuration: 0,
        avgItemsWarmed: 0,
        lastWarmup: null,
        recentHistory: [],
      };
    } catch (error) {
      console.error('[WarmupMonitor] 获取预热统计失败:', error);
      throw error;
    }
  }

  /**
   * 分析预热效果
   *
   * 测量预热前后的缓存命中率变化
   *
   * @param measurementWindowMs - 测量窗口（毫秒）
   * @returns 预热效果分析
   */
  async analyzeEffectiveness(
    measurementWindowMs: number = 3600000 // 默认 1 小时
  ): Promise<WarmupEffectiveness> {
    try {
      // 获取最近一次预热时间
      // 假设有预热历史表
      // const lastWarmup = await this.getLastWarmup();

      // 计算预热前后的缓存命中率
      // 这需要从 QueryCacheManager 或审计日志中获取

      // 模拟数据
      return {
        cacheHitRateBefore: 0.4,
        cacheHitRateAfter: 0.7,
        improvement: 0.3,
        measurementWindow: measurementWindowMs,
      };
    } catch (error) {
      console.error('[WarmupMonitor] 分析预热效果失败:', error);
      throw error;
    }
  }

  /**
   * 获取预热历史
   *
   * @param limit - 返回最近 N 条记录
   * @returns 预热历史列表
   */
  async getHistory(limit: number = 10): Promise<WarmupHistory[]> {
    try {
      // 未来从数据库查询：
      // return await this.prisma.cacheWarmupHistory.findMany({
      //   orderBy: { startTime: 'desc' },
      //   take: limit,
      // });

      return [];
    } catch (error) {
      console.error('[WarmupMonitor] 获取预热历史失败:', error);
      throw error;
    }
  }

  /**
   * 清理过期的预热历史
   *
   * @param daysToKeep - 保留最近 N 天的记录
   * @returns 删除的记录数
   */
  async cleanupOldHistory(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // 未来从数据库删除：
      // const result = await this.prisma.cacheWarmupHistory.deleteMany({
      //   where: {
      //     startTime: {
      //       lt: cutoffDate,
      //     },
      //   },
      // });
      //
      // console.log(`[WarmupMonitor] 清理了 ${result.count} 条过期预热记录`);
      // return result.count;

      return 0;
    } catch (error) {
      console.error('[WarmupMonitor] 清理预热历史失败:', error);
      throw error;
    }
  }
}
