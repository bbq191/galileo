export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import type { StatisticsAggregationService } from '@/lib/statistics/statistics-aggregation.service';

// 延迟导入以避免循环依赖
function getService(): StatisticsAggregationService {
  const { getContainer } = require('@/lib/di/container');
  const { DI_TOKENS } = require('@/lib/di/tokens');
  // 确保 DI 容器已初始化
  require('@/lib/di/setup');

  const container = getContainer();
  return container.resolve(DI_TOKENS.StatisticsAggregationService) as StatisticsAggregationService;
}

export async function GET(request: NextRequest) {
  try {
    // 解析统计聚合服务
    const statsService = getService();

    // 获取系统统计概览
    const overview = await statsService.getSystemOverview();

    // 转换为前端期望的数据格式
    const response = {
      system: {
        healthScore: overview.overall.healthScore,
        performanceScore: overview.overall.performanceScore,
        reliabilityScore: overview.overall.reliabilityScore,
        status: overview.overall.healthScore >= 80 ? 'healthy' :
                overview.overall.healthScore >= 60 ? 'warning' : 'critical',
      },
      queries: {
        total: overview.realtime.totalQueries,
        success: overview.realtime.successfulQueries,
        failed: overview.realtime.failedQueries,
        successRate: overview.realtime.successRate,
        avgExecutionTime: overview.realtime.averageDuration,
        p95ExecutionTime: overview.realtime.p95Duration,
      },
      cache: {
        hitRate: overview.cache.totalHitRate,
        totalHits: overview.cache.totalHits,
        totalMisses: overview.cache.totalMisses,
      },
      audit: {
        totalRecords: overview.audit.totalQueriesLogged,
        avgRecordsPerDay: overview.audit.avgRecordsPerDay,
        recentErrors: overview.realtime.failedQueries,
      },
    };

    return NextResponse.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] 获取统计概览失败:', error);

    return NextResponse.json(
      {
        success: false,
        error: '获取统计概览失败',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
