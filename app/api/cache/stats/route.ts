/**
 * 缓存统计 API
 * GET /api/cache/stats
 *
 * 提供详细的缓存统计信息，包括防击穿守卫指标
 */

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/helpers/app-router';

export async function GET(request: NextRequest) {
  try {
    const multiLevelCache = getService.multiLevelCache();
    const queryCacheManager = getService.queryCacheManager();

    // 获取 MultiLevelCache 统计
    const mlcStats = multiLevelCache.getStats();

    // 获取 QueryCacheManager 统计
    const qcmStats = queryCacheManager.getStatistics();

    // 获取防击穿守卫
    const guard = multiLevelCache.getBreakthroughGuard();
    const guardMetrics = guard ? guard.getMetrics() : null;
    const guardStrategy = guard ? guard.getWaitStrategy() : null;

    // 计算防护效果
    let protectionRate = 0;
    if (guardMetrics) {
      const totalRequests =
        guardMetrics.singleFlightMisses +
        guardMetrics.singleFlightHits +
        guardMetrics.lockWaited;

      if (totalRequests > 0) {
        const protectedRequests = guardMetrics.singleFlightHits + guardMetrics.lockWaited;
        protectionRate = (protectedRequests / totalRequests) * 100;
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      cacheStats: {
        // 多级缓存统计
        multiLevelCache: {
          l1: {
            size: mlcStats.l1Size,
            maxSize: mlcStats.l1MaxSize,
            utilization: ((mlcStats.l1Size / mlcStats.l1MaxSize) * 100).toFixed(2) + '%',
          },
          metrics: mlcStats.metrics,
          hitRate: (mlcStats.hitRate * 100).toFixed(2) + '%',
        },

        // 查询缓存统计
        queryCache: {
          intent: {
            hits: qcmStats.intentCacheHits,
            misses: qcmStats.intentCacheMisses,
            hitRate:
              qcmStats.intentCacheHits + qcmStats.intentCacheMisses > 0
                ? (
                    (qcmStats.intentCacheHits /
                      (qcmStats.intentCacheHits + qcmStats.intentCacheMisses)) *
                    100
                  ).toFixed(2) + '%'
                : '0%',
          },
          sql: {
            hits: qcmStats.sqlCacheHits,
            misses: qcmStats.sqlCacheMisses,
            hitRate:
              qcmStats.sqlCacheHits + qcmStats.sqlCacheMisses > 0
                ? (
                    (qcmStats.sqlCacheHits / (qcmStats.sqlCacheHits + qcmStats.sqlCacheMisses)) *
                    100
                  ).toFixed(2) + '%'
                : '0%',
          },
          result: {
            hits: qcmStats.resultCacheHits,
            misses: qcmStats.resultCacheMisses,
            hitRate:
              qcmStats.resultCacheHits + qcmStats.resultCacheMisses > 0
                ? (
                    (qcmStats.resultCacheHits /
                      (qcmStats.resultCacheHits + qcmStats.resultCacheMisses)) *
                    100
                  ).toFixed(2) + '%'
                : '0%',
          },
          overall: {
            totalHits: qcmStats.totalHits,
            totalMisses: qcmStats.totalMisses,
            hitRate: (qcmStats.hitRate * 100).toFixed(2) + '%',
          },
        },

        // 防击穿守卫统计
        breakthroughGuard: guardMetrics
          ? {
              enabled: true,
              metrics: {
                // 进程内防抖
                singleFlight: {
                  hits: guardMetrics.singleFlightHits,
                  misses: guardMetrics.singleFlightMisses,
                  hitRate:
                    guardMetrics.singleFlightMisses > 0
                      ? (
                          (guardMetrics.singleFlightHits /
                            (guardMetrics.singleFlightHits + guardMetrics.singleFlightMisses)) *
                          100
                        ).toFixed(2) + '%'
                      : '0%',
                  description:
                    '进程内并发请求去重，命中表示等待了其他请求的结果',
                },

                // 分布式锁
                distributedLock: {
                  acquired: guardMetrics.lockAcquired,
                  waited: guardMetrics.lockWaited,
                  timeout: guardMetrics.lockTimeout,
                  acquisitionRate:
                    guardMetrics.lockAcquired + guardMetrics.lockWaited > 0
                      ? (
                          (guardMetrics.lockAcquired /
                            (guardMetrics.lockAcquired + guardMetrics.lockWaited)) *
                          100
                        ).toFixed(2) + '%'
                      : '0%',
                  description:
                    '跨进程锁协调，获取锁的进程执行数据获取，其他进程等待',
                },

                // 性能指标
                performance: {
                  totalWaitTime: guardMetrics.totalWaitTime,
                  avgWaitTime: guardMetrics.avgWaitTime.toFixed(2) + ' ms',
                  description: '平均等待时间（包括 SingleFlight 和分布式锁等待）',
                },

                // 防护效果
                protection: {
                  totalRequests:
                    guardMetrics.singleFlightMisses +
                    guardMetrics.singleFlightHits +
                    guardMetrics.lockWaited,
                  protectedRequests: guardMetrics.singleFlightHits + guardMetrics.lockWaited,
                  protectionRate: protectionRate.toFixed(2) + '%',
                  description:
                    '防护率 = 被保护的请求数 / 总请求数（被保护的请求无需访问数据库）',
                },
              },

              // 策略配置
              strategy: guardStrategy,

              // 实时状态
              status: {
                currentFlights: guard ? guard.getFlightCount() : 0,
                description: '当前正在飞行的请求数（正在等待数据获取的并发请求组）',
              },
            }
          : {
              enabled: false,
              message: '防击穿守卫未启用（向后兼容模式）',
            },
      },

      // 性能分析
      performance: {
        overallCacheEfficiency: {
          description: '整体缓存效率分析',
          l1HitRate: (mlcStats.hitRate * 100).toFixed(2) + '%',
          queryCacheHitRate: (qcmStats.hitRate * 100).toFixed(2) + '%',
          breakthroughProtectionRate: guardMetrics ? protectionRate.toFixed(2) + '%' : 'N/A',
          recommendation:
            mlcStats.hitRate < 0.5
              ? '缓存命中率较低，建议检查缓存配置或增加缓存预热'
              : mlcStats.hitRate < 0.7
                ? '缓存命中率中等，建议优化缓存策略'
                : '缓存命中率良好',
        },

        breakthroughRisk: guardMetrics
          ? {
              description: '缓存击穿风险评估',
              timeoutCount: guardMetrics.lockTimeout,
              riskLevel:
                guardMetrics.lockTimeout > 10
                  ? 'high'
                  : guardMetrics.lockTimeout > 0
                    ? 'medium'
                    : 'low',
              message:
                guardMetrics.lockTimeout > 10
                  ? '⚠️ 检测到较多锁超时，可能存在缓存击穿风险或数据获取过慢'
                  : guardMetrics.lockTimeout > 0
                    ? '⚡ 检测到少量锁超时，系统正常但有优化空间'
                    : '✅ 未检测到锁超时，防护机制运行良好',
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('[Cache Stats API] 获取缓存统计失败:', error);
    return NextResponse.json(
      {
        error: 'Failed to retrieve cache statistics',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
