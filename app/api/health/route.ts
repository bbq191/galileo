/**
 * 健康检查 API
 * GET /api/health
 *
 * 综合健康检查，包括所有 DI 服务状态
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
import { getService } from '@/lib/di/helpers/app-router';
import { checkRedisHealth } from '@/lib/cache/redis-client';
import { getRedisRateLimiterInfo } from '@/lib/security/redis-rate-limiter';
import { getRateLimiterInfo } from '@/lib/security/distributed-rate-limiter';

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

    // 6. 检查 Redis 服务
    try {
      const redisHealthy = await checkRedisHealth();
      const rateLimiterInfo = getRedisRateLimiterInfo();

      checks.redis = {
        status: redisHealthy ? 'ok' : 'degraded',
        connected: redisHealthy,
        rateLimiterType: rateLimiterInfo.type,
        message: redisHealthy
          ? `Redis connected, rate limiter using ${rateLimiterInfo.type}`
          : `Redis not available, rate limiter using ${rateLimiterInfo.type}`
      };

      if (!redisHealthy && rateLimiterInfo.type === 'memory') {
        // 内存模式在开发环境是可接受的
        if (process.env.NODE_ENV === 'production') {
          overallStatus = 'degraded';
        }
      }
    } catch (error: any) {
      checks.redis = { status: 'error', message: error.message };
      overallStatus = 'degraded';
    }

    // 7. 检查速率限制配置
    try {
      const middlewareRateLimiterInfo = getRateLimiterInfo();
      const apiRateLimiterInfo = getRedisRateLimiterInfo();

      checks.rateLimiter = {
        status: 'ok',
        middlewareType: middlewareRateLimiterInfo.type,
        apiRoutesType: apiRateLimiterInfo.type,
        distributed: apiRateLimiterInfo.type === 'redis' || middlewareRateLimiterInfo.type === 'distributed',
        message: `Middleware: ${middlewareRateLimiterInfo.type}, API Routes: ${apiRateLimiterInfo.type}`
      };

      if (!checks.rateLimiter.distributed && process.env.NODE_ENV === 'production') {
        checks.rateLimiter.status = 'degraded';
        checks.rateLimiter.message += ' (Warning: Not distributed)';
        overallStatus = 'degraded';
      }
    } catch (error: any) {
      checks.rateLimiter = { status: 'error', message: error.message };
    }

    // 8. 检查 AI 服务配置
    try {
      const aiConfigured = !!(
        process.env.DEEPSEEK_API_KEY &&
        process.env.DEEPSEEK_API_URL &&
        process.env.DEEPSEEK_MODEL
      );

      checks.aiService = {
        status: aiConfigured ? 'ok' : 'degraded',
        configured: aiConfigured,
        model: process.env.DEEPSEEK_MODEL || 'not configured',
        apiUrl: process.env.DEEPSEEK_API_URL ? 'configured' : 'not configured',
        message: aiConfigured
          ? `AI service configured with ${process.env.DEEPSEEK_MODEL}`
          : 'AI service not fully configured'
      };

      if (!aiConfigured) {
        overallStatus = 'degraded';
      }
    } catch (error: any) {
      checks.aiService = { status: 'error', message: error.message };
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
