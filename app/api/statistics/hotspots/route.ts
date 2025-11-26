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

    // 获取热点数据分析
    const hotspots = await statsService.getHotspotAnalysis();

    // 转换为前端期望的数据格式
    const response = {
      hotQueries: hotspots.hotQueries.map(q => ({
        query: q.query,
        count: q.count,
        avgTime: q.avgDuration,
      })),
      hotTables: hotspots.hotTables.map(t => ({
        table: t.database ? `${t.database}.${t.table}` : t.table,
        accessCount: t.accessCount,
      })),
      slowQueries: hotspots.slowQueries.map(q => ({
        query: q.sql || q.queryId,
        avgTime: q.duration,
        count: 1, // 慢查询统计中没有计数信息
      })),
    };

    return NextResponse.json({
      success: true,
      data: response,
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
