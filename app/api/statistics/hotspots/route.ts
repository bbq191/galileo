/**
 * 热点数据分析 API
 * GET /api/statistics/hotspots
 *
 * 功能：
 * - 返回热点数据分析
 * - 包含热门查询、热门表、慢查询
 * - 用于缓存预热和性能优化
 */


/**
 * 显式声明 Node.js Runtime
 *
 * API Routes 运行在 Node.js Runtime 中，支持：
 * - Prisma ORM
 * - ioredis
 * - mysql2
 * - 其他 Node.js 专有 API
 */
export const runtime = 'nodejs';

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

    // 获取热点数据分析
    const hotspots = await statsService.getHotspotAnalysis();

    return NextResponse.json({
      success: true,
      data: hotspots,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] 获取热点数据分析失败:', error);

    return NextResponse.json(
      {
        success: false,
        error: '获取热点数据分析失败',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
