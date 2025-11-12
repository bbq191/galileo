/**
 * 缓存统计 API
 * GET /api/statistics/cache
 *
 * 功能：
 * - 返回三级缓存详细统计
 * - 包含意图缓存、SQL 缓存、结果缓存的命中率
 * - 提供总体缓存命中率
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolve } from '@/lib/di/container';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { StatisticsAggregationService } from '@/lib/statistics/statistics-aggregation.service';

export async function GET(request: NextRequest) {
  try {
    // 解析统计聚合服务
    const statsService = resolve<StatisticsAggregationService>(
      DI_TOKENS.StatisticsAggregationService
    );

    // 获取缓存统计
    const cacheStats = statsService.getCacheStatistics();

    return NextResponse.json({
      success: true,
      data: {
        intent: {
          hits: cacheStats.intentCacheHits,
          misses: cacheStats.intentCacheMisses,
          hitRate:
            (cacheStats.intentCacheHits /
              (cacheStats.intentCacheHits + cacheStats.intentCacheMisses)) *
              100 || 0,
        },
        sql: {
          hits: cacheStats.sqlCacheHits,
          misses: cacheStats.sqlCacheMisses,
          hitRate:
            (cacheStats.sqlCacheHits /
              (cacheStats.sqlCacheHits + cacheStats.sqlCacheMisses)) *
              100 || 0,
        },
        result: {
          hits: cacheStats.resultCacheHits,
          misses: cacheStats.resultCacheMisses,
          hitRate:
            (cacheStats.resultCacheHits /
              (cacheStats.resultCacheHits + cacheStats.resultCacheMisses)) *
              100 || 0,
        },
        overall: {
          totalHits: cacheStats.totalHits,
          totalMisses: cacheStats.totalMisses,
          hitRate: cacheStats.hitRate,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] 获取缓存统计失败:', error);

    return NextResponse.json(
      {
        success: false,
        error: '获取缓存统计失败',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
