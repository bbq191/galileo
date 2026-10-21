'use client';

import { apiFetch } from '@/lib/client/api-fetch';
import { useAsyncData } from '@/lib/client/use-async-data';

/**
 * 系统概览数据类型
 */
interface SystemOverview {
  system: {
    healthScore: number;
    performanceScore: number;
    reliabilityScore: number;
    status: string;
  };
  queries: {
    total: number;
    success: number;
    failed: number;
    successRate: number;
    avgExecutionTime: number;
    p95ExecutionTime: number;
  };
  cache: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  };
  audit: {
    totalRecords: number;
    avgRecordsPerDay: number;
    recentErrors: number;
  };
}

/**
 * 热点分析数据类型
 */
interface HotspotAnalysis {
  hotQueries: Array<{
    query: string;
    count: number;
    avgTime: number;
  }>;
  hotTables: Array<{
    table: string;
    accessCount: number;
  }>;
  slowQueries: Array<{
    query: string;
    avgTime: number;
    count: number;
  }>;
}

/**
 * 统计分析页面
 * 系统统计概览和热点数据分析
 */
export default function StatisticsPage() {
  /**
   * 获取系统概览
   */
  const overviewData = useAsyncData(async (signal) => {
    const response = await fetch('/api/statistics/overview', { signal });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '获取系统概览失败');
    }
    return data.data as SystemOverview;
  }, []);

  /**
   * 获取热点分析（失败时在热点区域提示，不影响系统概览）
   */
  const hotspotsData = useAsyncData(async (signal) => {
    const res = await apiFetch<HotspotAnalysis>('/api/statistics/hotspots', { signal });
    if (!res.ok) throw res.error;
    return res.data;
  }, []);

  const overview = overviewData.data ?? null;
  const hotspots = hotspotsData.data ?? null;
  const loading = overviewData.loading || hotspotsData.loading;
  const { error } = overviewData;

  /**
   * 刷新所有数据
   */
  const refreshData = () => {
    overviewData.reload();
    hotspotsData.reload();
  };

  /**
   * 获取健康度颜色
   */
  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-success';
    if (score >= 70) return 'text-info';
    if (score >= 50) return 'text-warning';
    return 'text-error';
  };

  /**
   * 获取状态徽章
   */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'badge-success';
      case 'warning':
        return 'badge-warning';
      case 'critical':
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  };

  return (
    <div className="space-y-6">
        {/* 快速导航 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <a href="/admin/audit" className="card bg-gradient-to-br from-primary to-primary-focus text-primary-content shadow-xl hover:shadow-2xl transition-shadow">
            <div className="card-body">
              <h2 className="card-title">审计日志</h2>
              <p className="text-sm opacity-80">查询审计和异常检测</p>
            </div>
          </a>

          <a href="/admin/performance" className="card bg-gradient-to-br from-secondary to-secondary-focus text-secondary-content shadow-xl hover:shadow-2xl transition-shadow">
            <div className="card-body">
              <h2 className="card-title">性能监控</h2>
              <p className="text-sm opacity-80">API性能和缓存统计</p>
            </div>
          </a>

          <a href="/admin/ai-cost" className="card bg-gradient-to-br from-accent to-accent-focus text-accent-content shadow-xl hover:shadow-2xl transition-shadow">
            <div className="card-body">
              <h2 className="card-title">AI成本</h2>
              <p className="text-sm opacity-80">成本追踪和缓存管理</p>
            </div>
          </a>

          <button
            onClick={refreshData}
            disabled={loading}
            className="card bg-gradient-to-br from-info to-info-focus text-info-content shadow-xl hover:shadow-2xl transition-shadow"
          >
            <div className="card-body">
              <h2 className="card-title">{loading ? '刷新中...' : '刷新数据'}</h2>
              <p className="text-sm opacity-80">更新所有统计数据</p>
            </div>
          </button>
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

        {/* 系统概览 */}
        {overview && (
          <>
            {/* 系统健康度 */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <h2 className="card-title">系统健康度</h2>
                  <span className={`badge ${getStatusBadge(overview.system.status)}`}>
                    {overview.system.status === 'healthy' ? '健康' :
                     overview.system.status === 'warning' ? '警告' : '严重'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">整体健康度</div>
                    <div className={`stat-value ${getHealthColor(overview.system.healthScore)}`}>
                      {overview.system.healthScore}
                    </div>
                    <div className="stat-desc">综合评分</div>
                    <progress
                      className="progress progress-success w-full mt-2"
                      value={overview.system.healthScore}
                      max="100"
                    ></progress>
                  </div>

                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">性能评分</div>
                    <div className={`stat-value ${getHealthColor(overview.system.performanceScore)}`}>
                      {overview.system.performanceScore}
                    </div>
                    <div className="stat-desc">响应速度和吞吐量</div>
                    <progress
                      className="progress progress-info w-full mt-2"
                      value={overview.system.performanceScore}
                      max="100"
                    ></progress>
                  </div>

                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">可靠性评分</div>
                    <div className={`stat-value ${getHealthColor(overview.system.reliabilityScore)}`}>
                      {overview.system.reliabilityScore}
                    </div>
                    <div className="stat-desc">稳定性和成功率</div>
                    <progress
                      className="progress progress-warning w-full mt-2"
                      value={overview.system.reliabilityScore}
                      max="100"
                    ></progress>
                  </div>
                </div>
              </div>
            </div>

            {/* 查询统计 */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">查询统计</h2>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-4">
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">总查询</div>
                    <div className="stat-value text-primary text-2xl">{overview.queries.total}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">成功</div>
                    <div className="stat-value text-success text-2xl">{overview.queries.success}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">失败</div>
                    <div className="stat-value text-error text-2xl">{overview.queries.failed}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">成功率</div>
                    <div className="stat-value text-2xl">{overview.queries.successRate.toFixed(1)}%</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">平均耗时</div>
                    <div className="stat-value text-sm">{overview.queries.avgExecutionTime.toFixed(0)}ms</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">P95耗时</div>
                    <div className="stat-value text-sm">{overview.queries.p95ExecutionTime.toFixed(0)}ms</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 缓存和审计 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">缓存统计</h2>

                  <div className="grid grid-cols-1 gap-4 mt-4">
                    <div className="stat bg-base-200 rounded-lg">
                      <div className="stat-title">缓存命中率</div>
                      <div className="stat-value text-success text-3xl">
                        {(overview.cache.hitRate * 100).toFixed(1)}%
                      </div>
                      <progress
                        className="progress progress-success w-full mt-2"
                        value={overview.cache.hitRate * 100}
                        max="100"
                      ></progress>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="stat bg-base-200 rounded-lg p-3">
                        <div className="stat-title text-xs">命中</div>
                        <div className="stat-value text-success text-xl">{overview.cache.totalHits}</div>
                      </div>
                      <div className="stat bg-base-200 rounded-lg p-3">
                        <div className="stat-title text-xs">未命中</div>
                        <div className="stat-value text-xl">{overview.cache.totalMisses}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">审计统计</h2>

                  <div className="grid grid-cols-1 gap-4 mt-4">
                    <div className="stat bg-base-200 rounded-lg">
                      <div className="stat-title">总审计记录</div>
                      <div className="stat-value text-primary text-3xl">{overview.audit.totalRecords}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="stat bg-base-200 rounded-lg p-3">
                        <div className="stat-title text-xs">日均记录</div>
                        <div className="stat-value text-xl">{overview.audit.avgRecordsPerDay.toFixed(0)}</div>
                      </div>
                      <div className="stat bg-base-200 rounded-lg p-3">
                        <div className="stat-title text-xs">近期错误</div>
                        <div className="stat-value text-error text-xl">{overview.audit.recentErrors}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 热点分析 */}
        {hotspotsData.error && (
          <div className="alert alert-warning">
            <span>热点分析加载失败：{hotspotsData.error}</span>
            <button className="btn btn-sm" onClick={hotspotsData.reload}>
              重试
            </button>
          </div>
        )}
        {hotspots && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 热门查询 */}
            {hotspots.hotQueries && hotspots.hotQueries.length > 0 && (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-base">热门查询</h2>

                  <div className="space-y-2 mt-4">
                    {hotspots.hotQueries.slice(0, 5).map((item, index) => (
                      <div key={index} className="p-3 bg-base-200 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <span className="badge badge-primary badge-sm">#{index + 1}</span>
                          <span className="text-xs opacity-70">{item.count}次</span>
                        </div>
                        <div className="text-sm truncate">{item.query}</div>
                        <div className="text-xs opacity-70 mt-1">平均: {item.avgTime.toFixed(0)}ms</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 热门表 */}
            {hotspots.hotTables && hotspots.hotTables.length > 0 && (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-base">热门表</h2>

                  <div className="space-y-2 mt-4">
                    {hotspots.hotTables.slice(0, 5).map((item, index) => (
                      <div key={index} className="p-3 bg-base-200 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <span className="badge badge-secondary badge-sm">#{index + 1}</span>
                          <span className="text-xs opacity-70">{item.accessCount}次</span>
                        </div>
                        <div className="text-sm font-mono">{item.table}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 慢查询 */}
            {hotspots.slowQueries && hotspots.slowQueries.length > 0 && (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-base">慢查询</h2>

                  <div className="space-y-2 mt-4">
                    {hotspots.slowQueries.slice(0, 5).map((item, index) => (
                      <div key={index} className="p-3 bg-base-200 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <span className="badge badge-warning badge-sm">#{index + 1}</span>
                          <span className="text-xs opacity-70">{item.count}次</span>
                        </div>
                        <div className="text-sm truncate">{item.query}</div>
                        <div className="text-xs text-warning mt-1">平均: {item.avgTime.toFixed(0)}ms</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 系统建议 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">系统优化建议</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="alert alert-info">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <div className="font-bold">定期查看审计日志</div>
                  <div className="text-xs">监控异常查询和潜在的安全问题</div>
                </div>
              </div>

              <div className="alert alert-success">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <div className="font-bold">优化缓存策略</div>
                  <div className="text-xs">提高缓存命中率可以显著改善性能</div>
                </div>
              </div>

              <div className="alert alert-warning">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                <div>
                  <div className="font-bold">关注慢查询</div>
                  <div className="text-xs">优化慢查询可以改善整体响应时间</div>
                </div>
              </div>

              <div className="alert alert-error">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <div className="font-bold">控制AI成本</div>
                  <div className="text-xs">合理使用Prompt缓存降低调用成本</div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
