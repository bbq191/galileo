'use client';

import { useState, useEffect } from 'react';

/**
 * 性能指标数据类型
 */
interface PerformanceData {
  api: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  };
  cache: {
    hitRate: number;
    hits: number;
    misses: number;
    l1Hits: number;
    l2Hits: number;
    sets: number;
    invalidations: number;
    l1Size: number;
    l1MaxSize: number;
  };
  slowQueries: Array<{
    url: string;
    method: string;
    duration: number;
    timestamp: number;
    params?: any;
  }>;
  assessment: {
    apiPerformance: string;
    cachePerformance: string;
  };
}

/**
 * 缓存统计数据类型
 */
interface CacheStats {
  cacheStats: {
    multiLevelCache: {
      l1: {
        size: number;
        maxSize: number;
        utilization: string;
      };
      metrics: any;
      hitRate: string;
    };
    queryCache: {
      intent: {
        hits: number;
        misses: number;
        hitRate: string;
      };
      sql: {
        hits: number;
        misses: number;
        hitRate: string;
      };
      result: {
        hits: number;
        misses: number;
        hitRate: string;
      };
      overall: {
        totalHits: number;
        totalMisses: number;
        hitRate: string;
      };
    };
    breakthroughGuard: any;
  };
  performance: any;
}

/**
 * 系统健康检查数据类型
 */
interface HealthData {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: {
    prisma?: {
      status: string;
      message: string;
    };
    connectionManager?: {
      status: string;
      totalConnections: number;
      healthyConnections: number;
      message: string;
    };
    multiLevelCache?: {
      status: string;
      l1Size: number;
      l1MaxSize: number;
      hitRate: number;
      message: string;
      guardMessage?: string;
    };
    queryCacheManager?: {
      status: string;
      totalHits: number;
      totalMisses: number;
      hitRate: number;
      message: string;
    };
    cacheInvalidationService?: {
      status: string;
      message: string;
    };
  };
  phase: string;
  message: string;
}

/**
 * 性能监控页面
 * 提供系统性能监控和缓存统计功能
 */
export default function PerformancePage() {
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  /**
   * 获取性能数据
   */
  const fetchPerformanceData = async () => {
    try {
      const response = await fetch('/api/performance');
      const data = await response.json();

      if (data.status === 'success') {
        setPerformanceData(data.data);
      } else {
        throw new Error(data.message || '获取性能数据失败');
      }
    } catch (err) {
      console.error('获取性能数据失败:', err);
      setError(err instanceof Error ? err.message : '获取性能数据失败');
    }
  };

  /**
   * 获取缓存统计
   */
  const fetchCacheStats = async () => {
    try {
      const response = await fetch('/api/cache/stats');
      const data = await response.json();

      if (data.cacheStats) {
        setCacheStats(data);
      } else {
        throw new Error(data.error || '获取缓存统计失败');
      }
    } catch (err) {
      console.error('获取缓存统计失败:', err);
      setError(err instanceof Error ? err.message : '获取缓存统计失败');
    }
  };

  /**
   * 获取系统健康检查数据
   */
  const fetchHealthData = async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();

      if (data.status) {
        setHealthData(data);
      } else {
        throw new Error('获取健康检查数据失败');
      }
    } catch (err) {
      console.error('获取健康检查数据失败:', err);
      setError(err instanceof Error ? err.message : '获取健康检查数据失败');
    }
  };

  /**
   * 刷新所有数据
   */
  const refreshData = async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchPerformanceData(),
        fetchCacheStats(),
        fetchHealthData()
      ]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 重置性能指标
   */
  const resetMetrics = async () => {
    if (!confirm('确定要重置性能指标吗？')) {
      return;
    }

    try {
      const response = await fetch('/api/performance?action=reset');
      const data = await response.json();

      if (data.status === 'success') {
        alert('性能指标已重置');
        await refreshData();
      } else {
        throw new Error(data.message || '重置失败');
      }
    } catch (err) {
      console.error('重置性能指标失败:', err);
      alert(err instanceof Error ? err.message : '重置性能指标失败');
    }
  };

  // 初始化加载
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshData();
    }, 5000); // 每5秒刷新一次

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  /**
   * 获取性能等级样式
   */
  const getPerformanceBadge = (level: string) => {
    switch (level) {
      case '优秀':
        return 'badge-success';
      case '良好':
        return 'badge-info';
      case '一般':
        return 'badge-warning';
      default:
        return 'badge-error';
    }
  };

  /**
   * 获取健康状态样式
   */
  const getHealthStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
        return 'badge-success';
      case 'degraded':
        return 'badge-warning';
      case 'error':
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  };

  /**
   * 获取健康状态文本
   */
  const getHealthStatusText = (status: string) => {
    switch (status) {
      case 'ok':
        return '正常';
      case 'degraded':
        return '降级';
      case 'error':
        return '错误';
      default:
        return '未知';
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* 页面头部 */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <a href="/" className="btn btn-ghost normal-case text-xl">
            Galileo
          </a>
          <div className="breadcrumbs text-sm ml-4">
            <ul>
              <li><a href="/">首页</a></li>
              <li><a href="/admin/statistics">管理中心</a></li>
              <li>性能监控</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <a href="/admin/audit" className="btn btn-ghost btn-sm">审计日志</a>
          <a href="/admin/ai-cost" className="btn btn-ghost btn-sm">AI成本</a>
          <a href="/admin/statistics" className="btn btn-ghost btn-sm">统计分析</a>
          <a href="/admin/health" className="btn btn-ghost btn-sm">系统健康</a>
        </div>
      </div>

      <div className="container mx-auto p-6 space-y-6">
        {/* 控制面板 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={refreshData}
                  disabled={loading}
                >
                  {loading ? '刷新中...' : '刷新数据'}
                </button>

                <button
                  className="btn btn-outline btn-error btn-sm"
                  onClick={resetMetrics}
                >
                  重置指标
                </button>

                <label className="label cursor-pointer gap-2">
                  <span className="label-text">自动刷新</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                </label>
              </div>

              {autoRefresh && (
                <div className="badge badge-success">每5秒自动刷新</div>
              )}
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="alert alert-error shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 系统健康检查 */}
        {healthData && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">
                系统健康检查
                <span className={`badge ${getHealthStatusBadge(healthData.status)}`}>
                  {getHealthStatusText(healthData.status)}
                </span>
              </h2>

              <div className="alert alert-info mt-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <div className="font-bold">{healthData.message}</div>
                  <div className="text-xs">更新时间: {new Date(healthData.timestamp).toLocaleString('zh-CN')}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {/* Prisma 数据库连接 */}
                {healthData.checks.prisma && (
                  <div className="card bg-base-200">
                    <div className="card-body p-4">
                      <h3 className="font-bold flex items-center justify-between">
                        <span>数据库连接</span>
                        <span className={`badge ${getHealthStatusBadge(healthData.checks.prisma.status)}`}>
                          {getHealthStatusText(healthData.checks.prisma.status)}
                        </span>
                      </h3>
                      <p className="text-sm text-base-content/70">{healthData.checks.prisma.message}</p>
                    </div>
                  </div>
                )}

                {/* ConnectionManager */}
                {healthData.checks.connectionManager && (
                  <div className="card bg-base-200">
                    <div className="card-body p-4">
                      <h3 className="font-bold flex items-center justify-between">
                        <span>连接管理器</span>
                        <span className={`badge ${getHealthStatusBadge(healthData.checks.connectionManager.status)}`}>
                          {getHealthStatusText(healthData.checks.connectionManager.status)}
                        </span>
                      </h3>
                      <p className="text-sm text-base-content/70">{healthData.checks.connectionManager.message}</p>
                      <div className="text-xs mt-2">
                        <span className="font-semibold">健康连接:</span> {healthData.checks.connectionManager.healthyConnections} / {healthData.checks.connectionManager.totalConnections}
                      </div>
                    </div>
                  </div>
                )}

                {/* MultiLevelCache */}
                {healthData.checks.multiLevelCache && (
                  <div className="card bg-base-200">
                    <div className="card-body p-4">
                      <h3 className="font-bold flex items-center justify-between">
                        <span>多级缓存</span>
                        <span className={`badge ${getHealthStatusBadge(healthData.checks.multiLevelCache.status)}`}>
                          {getHealthStatusText(healthData.checks.multiLevelCache.status)}
                        </span>
                      </h3>
                      <p className="text-sm text-base-content/70">{healthData.checks.multiLevelCache.message}</p>
                      <div className="text-xs mt-2 space-y-1">
                        <div>
                          <span className="font-semibold">L1缓存:</span> {healthData.checks.multiLevelCache.l1Size} / {healthData.checks.multiLevelCache.l1MaxSize}
                        </div>
                        <div>
                          <span className="font-semibold">命中率:</span> {(healthData.checks.multiLevelCache.hitRate * 100).toFixed(2)}%
                        </div>
                        {healthData.checks.multiLevelCache.guardMessage && (
                          <div className="text-success">{healthData.checks.multiLevelCache.guardMessage}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* QueryCacheManager */}
                {healthData.checks.queryCacheManager && (
                  <div className="card bg-base-200">
                    <div className="card-body p-4">
                      <h3 className="font-bold flex items-center justify-between">
                        <span>查询缓存</span>
                        <span className={`badge ${getHealthStatusBadge(healthData.checks.queryCacheManager.status)}`}>
                          {getHealthStatusText(healthData.checks.queryCacheManager.status)}
                        </span>
                      </h3>
                      <p className="text-sm text-base-content/70">{healthData.checks.queryCacheManager.message}</p>
                      <div className="text-xs mt-2 space-y-1">
                        <div>
                          <span className="font-semibold">总命中:</span> {healthData.checks.queryCacheManager.totalHits}
                        </div>
                        <div>
                          <span className="font-semibold">总未命中:</span> {healthData.checks.queryCacheManager.totalMisses}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CacheInvalidationService */}
                {healthData.checks.cacheInvalidationService && (
                  <div className="card bg-base-200">
                    <div className="card-body p-4">
                      <h3 className="font-bold flex items-center justify-between">
                        <span>缓存失效服务</span>
                        <span className={`badge ${getHealthStatusBadge(healthData.checks.cacheInvalidationService.status)}`}>
                          {getHealthStatusText(healthData.checks.cacheInvalidationService.status)}
                        </span>
                      </h3>
                      <p className="text-sm text-base-content/70">{healthData.checks.cacheInvalidationService.message}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="divider text-xs text-base-content/50">
                {healthData.phase}
              </div>
            </div>
          </div>
        )}

        {/* API 性能指标 */}
        {performanceData && (
          <>
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">
                  API 性能指标
                  <span className={`badge ${getPerformanceBadge(performanceData.assessment.apiPerformance)}`}>
                    {performanceData.assessment.apiPerformance}
                  </span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">请求总数</div>
                    <div className="stat-value text-primary text-2xl">{performanceData.api.count}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">平均响应</div>
                    <div className="stat-value text-2xl">{performanceData.api.avg.toFixed(0)}ms</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">P50</div>
                    <div className="stat-value text-2xl">{performanceData.api.p50.toFixed(0)}ms</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">P95</div>
                    <div className="stat-value text-2xl">{performanceData.api.p95.toFixed(0)}ms</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">P99</div>
                    <div className="stat-value text-2xl">{performanceData.api.p99.toFixed(0)}ms</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 缓存性能 */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">
                  缓存性能
                  <span className={`badge ${getPerformanceBadge(performanceData.assessment.cachePerformance)}`}>
                    {performanceData.assessment.cachePerformance}
                  </span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">缓存命中率</div>
                    <div className="stat-value text-success text-2xl">{performanceData.cache.hitRate}%</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">缓存命中</div>
                    <div className="stat-value text-2xl">{performanceData.cache.hits}</div>
                    <div className="stat-desc">L1: {performanceData.cache.l1Hits} / L2: {performanceData.cache.l2Hits}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">缓存未命中</div>
                    <div className="stat-value text-2xl">{performanceData.cache.misses}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">L1 使用率</div>
                    <div className="stat-value text-2xl">
                      {((performanceData.cache.l1Size / performanceData.cache.l1MaxSize) * 100).toFixed(0)}%
                    </div>
                    <div className="stat-desc">{performanceData.cache.l1Size}/{performanceData.cache.l1MaxSize}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 慢查询 */}
            {performanceData.slowQueries.length > 0 && (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">慢查询列表</h2>

                  <div className="overflow-x-auto mt-4">
                    <table className="table table-zebra">
                      <thead>
                        <tr>
                          <th>方法</th>
                          <th>URL</th>
                          <th>耗时</th>
                          <th>时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {performanceData.slowQueries.map((query, index) => (
                          <tr key={index}>
                            <td>
                              <span className="badge badge-sm">{query.method}</span>
                            </td>
                            <td className="font-mono text-xs">{query.url}</td>
                            <td>
                              <span className={`badge ${query.duration > 1000 ? 'badge-error' : query.duration > 500 ? 'badge-warning' : 'badge-info'}`}>
                                {query.duration.toFixed(0)}ms
                              </span>
                            </td>
                            <td className="text-xs">
                              {new Date(query.timestamp).toLocaleString('zh-CN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* 详细缓存统计 */}
        {cacheStats && (
          <>
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">查询缓存详情</h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">总体命中率</div>
                    <div className="stat-value text-primary text-2xl">
                      {cacheStats.cacheStats.queryCache.overall.hitRate}
                    </div>
                    <div className="stat-desc">
                      命中: {cacheStats.cacheStats.queryCache.overall.totalHits} /
                      未命中: {cacheStats.cacheStats.queryCache.overall.totalMisses}
                    </div>
                  </div>

                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">意图缓存</div>
                    <div className="stat-value text-2xl">
                      {cacheStats.cacheStats.queryCache.intent.hitRate}
                    </div>
                    <div className="stat-desc">
                      命中: {cacheStats.cacheStats.queryCache.intent.hits} /
                      未命中: {cacheStats.cacheStats.queryCache.intent.misses}
                    </div>
                  </div>

                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">SQL缓存</div>
                    <div className="stat-value text-2xl">
                      {cacheStats.cacheStats.queryCache.sql.hitRate}
                    </div>
                    <div className="stat-desc">
                      命中: {cacheStats.cacheStats.queryCache.sql.hits} /
                      未命中: {cacheStats.cacheStats.queryCache.sql.misses}
                    </div>
                  </div>

                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">结果缓存</div>
                    <div className="stat-value text-2xl">
                      {cacheStats.cacheStats.queryCache.result.hitRate}
                    </div>
                    <div className="stat-desc">
                      命中: {cacheStats.cacheStats.queryCache.result.hits} /
                      未命中: {cacheStats.cacheStats.queryCache.result.misses}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 防击穿守卫 */}
            {cacheStats.cacheStats.breakthroughGuard?.enabled && (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">防击穿守卫</h2>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="stat bg-base-200 rounded-lg">
                      <div className="stat-title">防护率</div>
                      <div className="stat-value text-success text-2xl">
                        {cacheStats.cacheStats.breakthroughGuard.metrics.protection.protectionRate}
                      </div>
                      <div className="stat-desc">
                        保护请求: {cacheStats.cacheStats.breakthroughGuard.metrics.protection.protectedRequests} /
                        总请求: {cacheStats.cacheStats.breakthroughGuard.metrics.protection.totalRequests}
                      </div>
                    </div>

                    <div className="stat bg-base-200 rounded-lg">
                      <div className="stat-title">SingleFlight</div>
                      <div className="stat-value text-2xl">
                        {cacheStats.cacheStats.breakthroughGuard.metrics.singleFlight.hitRate}
                      </div>
                      <div className="stat-desc">
                        命中: {cacheStats.cacheStats.breakthroughGuard.metrics.singleFlight.hits}
                      </div>
                    </div>

                    <div className="stat bg-base-200 rounded-lg">
                      <div className="stat-title">平均等待时间</div>
                      <div className="stat-value text-2xl">
                        {cacheStats.cacheStats.breakthroughGuard.metrics.performance.avgWaitTime}
                      </div>
                    </div>
                  </div>

                  {cacheStats.performance?.breakthroughRisk && (
                    <div className={`alert ${cacheStats.performance.breakthroughRisk.riskLevel === 'high' ? 'alert-error' : cacheStats.performance.breakthroughRisk.riskLevel === 'medium' ? 'alert-warning' : 'alert-success'} mt-4`}>
                      <span>{cacheStats.performance.breakthroughRisk.message}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
