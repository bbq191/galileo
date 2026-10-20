/**
 * 性能监控 API
 * GET /api/performance - 获取性能指标
 * POST /api/performance?action=reset - 重置性能指标
 */


/**
 * 性能监控 API - 使用共享配置
 */
export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { performanceMonitor } from '@/lib/api/performance-monitor';
import { cacheStats, multiLevelCache } from '@/lib/cache';

/**
 * GET /api/performance
 * 获取系统性能指标
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // 重置会修改状态，不能用 GET（跨站链接即可触发），改用 POST
    if (action === 'reset') {
      return NextResponse.json(
        { status: 'error', message: '请使用 POST /api/performance?action=reset 重置性能指标' },
        { status: 405, headers: { Allow: 'POST' } }
      );
    }

    // 获取性能指标
    const apiMetrics = performanceMonitor.getMetrics();
    const cacheMetrics = cacheStats.getMetrics();
    const cacheHitRate = cacheStats.getHitRate();
    const cacheInfo = multiLevelCache.getStats();

    // 慢查询列表
    const slowQueries = performanceMonitor.getSlowQueries(20);

    return NextResponse.json({
      status: 'success',
      data: {
        // API 性能指标
        api: {
          p50: apiMetrics.query_p50,
          p95: apiMetrics.query_p95,
          p99: apiMetrics.query_p99,
          avg: apiMetrics.query_avg,
          count: apiMetrics.query_count,
        },

        // 缓存性能指标
        cache: {
          hitRate: Math.round(cacheHitRate * 100), // 百分比
          hits: cacheMetrics.hits,
          misses: cacheMetrics.misses,
          l1Hits: cacheMetrics.l1Hits,
          l2Hits: cacheMetrics.l2Hits,
          sets: cacheMetrics.sets,
          invalidations: cacheMetrics.invalidations,
          l1Size: cacheInfo.l1Size,
          l1MaxSize: cacheInfo.l1MaxSize,
        },

        // 慢查询
        slowQueries: slowQueries.map((q) => ({
          url: q.url,
          method: q.method,
          duration: q.duration,
          timestamp: q.timestamp,
          params: q.params,
        })),

        // 性能评估
        assessment: {
          apiPerformance: assessApiPerformance(apiMetrics.query_p95),
          cachePerformance: assessCachePerformance(cacheHitRate),
        },
      },
    });
  } catch (error) {
    console.error('获取性能指标失败:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get performance metrics',
      },
      { status: 500 }
    );
  }
}

/**
 * 评估 API 性能
 */
function assessApiPerformance(p95: number): string {
  if (p95 < 100) return '优秀';
  if (p95 < 200) return '良好';
  if (p95 < 500) return '一般';
  if (p95 < 1000) return '较差';
  return '差';
}

/**
 * 评估缓存性能
 */
function assessCachePerformance(hitRate: number): string {
  if (hitRate > 0.9) return '优秀';
  if (hitRate > 0.8) return '良好';
  if (hitRate > 0.6) return '一般';
  if (hitRate > 0.4) return '较差';
  return '差';
}

/**
 * POST /api/performance?action=reset
 * 重置性能指标
 */
export async function POST(request: NextRequest) {
  const action = new URL(request.url).searchParams.get('action');
  if (action !== 'reset') {
    return NextResponse.json({ status: 'error', message: `不支持的操作: ${action}` }, { status: 400 });
  }

  performanceMonitor.reset();
  cacheStats.reset();

  return NextResponse.json({
    status: 'success',
    message: '性能指标已重置',
  });
}
