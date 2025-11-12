/**
 * 统计概览 API
 * GET /api/statistics/overview
 *
 * 功能：
 * - 返回系统统计概览
 * - 包含实时查询统计、缓存统计、审计统计
 * - 计算系统健康度、性能评分、可靠性评分
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

    // 获取系统统计概览
    const overview = await statsService.getSystemOverview();

    return NextResponse.json({
      success: true,
      data: overview,
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
