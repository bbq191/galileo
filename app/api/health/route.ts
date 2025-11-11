/**
 * 健康检查 API
 * GET /api/health
 *
 * 综合健康检查，包括所有 DI 服务状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/helpers/app-router';

export async function GET(request: NextRequest) {
  const timestamp = new Date().toISOString();
  const checks: Record<string, any> = {};
  let overallStatus = 'ok';

  try {
    // 1. 检查 Prisma 数据库连接
    try {
      const prisma = getService.prisma();
      await prisma.$queryRaw`SELECT 1`;
      checks.prisma = { status: 'ok', message: 'Database connected' };
    } catch (error: any) {
      checks.prisma = { status: 'error', message: error.message };
      overallStatus = 'degraded';
    }

    // 2. 检查 ConnectionManager
    try {
      const connectionManager = getService.connectionManager();
      const connectionCount = connectionManager.getConnectionCount();
      const healthResults = await connectionManager.getAllHealthStatus();

      const healthyConnections = Array.from(healthResults.values()).filter((h: any) => h.healthy).length;

      checks.connectionManager = {
        status: healthyConnections === connectionCount ? 'ok' : 'degraded',
        totalConnections: connectionCount,
        healthyConnections,
        message: `${healthyConnections}/${connectionCount} connections healthy`
      };

      if (healthyConnections < connectionCount) {
        overallStatus = 'degraded';
      }
    } catch (error: any) {
      checks.connectionManager = { status: 'error', message: error.message };
      overallStatus = 'degraded';
    }

    // 3. 检查 MultiLevelCache
    try {
      const multiLevelCache = getService.multiLevelCache();
      const stats = multiLevelCache.getStats();

      checks.multiLevelCache = {
        status: 'ok',
        l1Size: stats.l1Size,
        l1MaxSize: stats.l1MaxSize,
        hitRate: stats.hitRate,
        breakthroughGuard: stats.breakthroughGuard,
        message: `Cache operational, hit rate: ${(stats.hitRate * 100).toFixed(2)}%`
      };

      // 如果防击穿守卫启用，添加额外信息
      if (stats.breakthroughGuard) {
        const guard = stats.breakthroughGuard;
        checks.multiLevelCache.guardMessage =
          `Breakthrough guard active: ${guard.singleFlightHits + guard.lockWaited} requests protected`;
      }
    } catch (error: any) {
      checks.multiLevelCache = { status: 'error', message: error.message };
      overallStatus = 'degraded';
    }

    // 4. 检查 QueryCacheManager
    try {
      const queryCacheManager = getService.queryCacheManager();
      const stats = queryCacheManager.getStatistics();

      checks.queryCacheManager = {
        status: 'ok',
        totalHits: stats.totalHits,
        totalMisses: stats.totalMisses,
        hitRate: stats.hitRate,
        message: `Query cache operational, hit rate: ${(stats.hitRate * 100).toFixed(2)}%`
      };
    } catch (error: any) {
      checks.queryCacheManager = { status: 'error', message: error.message };
      overallStatus = 'degraded';
    }

    // 5. 检查 CacheInvalidationService
    try {
      const cacheInvalidationService = getService.cacheInvalidationService();
      const cacheStatus = cacheInvalidationService.getCacheStatus();

      checks.cacheInvalidationService = {
        status: 'ok',
        message: 'Cache invalidation service operational'
      };
    } catch (error: any) {
      checks.cacheInvalidationService = { status: 'error', message: error.message };
      overallStatus = 'degraded';
    }

    return NextResponse.json({
      status: overallStatus,
      timestamp,
      checks,
      phase: '2.1 - Extended Services Migration',
      message: overallStatus === 'ok'
        ? 'All systems operational'
        : 'Some services are degraded'
    }, { status: overallStatus === 'ok' ? 200 : 503 });

  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      timestamp,
      checks,
      error: error.message,
    }, { status: 503 });
  }
}
