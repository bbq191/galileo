/**
 * 查询统计 API
 * GET /api/statistics/queries
 *
 * 功能：
 * - 返回实时查询统计
 * - 包含查询总数、成功率、平均耗时、百分位数
 * - 支持查询参数：type (aggregated | slowest | failed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolve } from '@/lib/di/container';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { StatisticsAggregationService } from '@/lib/statistics/statistics-aggregation.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'aggregated';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // 解析统计聚合服务
    const statsService = resolve<StatisticsAggregationService>(
      DI_TOKENS.StatisticsAggregationService
    );

    let data: any;

    switch (type) {
      case 'aggregated':
        // 聚合统计
        data = statsService.getRealtimeQueryStatistics();
        break;

      case 'slowest':
        // 最慢查询
        const { QueryStatisticsTracker } = require('@/lib/sql/executor/query-statistics-tracker');
        const tracker = resolve<InstanceType<typeof QueryStatisticsTracker>>(
          DI_TOKENS.QueryStatisticsTracker
        );
        data = tracker.getSlowestQueries(limit);
        break;

      case 'failed':
        // 失败查询
        data = statsService.getFailedQueriesAnalysis();
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: '无效的查询类型',
            message: '支持的类型：aggregated, slowest, failed',
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data,
      type,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] 获取查询统计失败:', error);

    return NextResponse.json(
      {
        success: false,
        error: '获取查询统计失败',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
