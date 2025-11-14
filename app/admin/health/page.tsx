'use client';

import { useState, useEffect } from 'react';

/**
 * 健康检查结果接口
 */
interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  message: string;
  [key: string]: any;
}

/**
 * 健康检查响应接口
 */
interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  phase: string;
  message: string;
  checks: {
    prisma?: HealthCheck;
    connectionManager?: HealthCheck;
    multiLevelCache?: HealthCheck;
    queryCacheManager?: HealthCheck;
    cacheInvalidationService?: HealthCheck;
  };
}

/**
 * 系统健康检查页面
 * 实时展示各服务的健康状态
 */
export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  /**
   * 获取健康状态
   */
  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/health');
      const data = await response.json();

      setHealth(data);
    } catch (err) {
      console.error('获取健康状态失败:', err);
      setError(err instanceof Error ? err.message : '获取健康状态失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 自动刷新
   */
  useEffect(() => {
    fetchHealth();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchHealth();
    }, 5000); // 每5秒刷新一次

    return () => clearInterval(interval);
  }, [autoRefresh]);

  /**
   * 获取状态徽章样式
   */
  const getStatusBadge = (status: string) => {
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
   * 获取状态图标
   */
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'degraded':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'error':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return null;
    }
  };

  /**
   * 获取状态文本
   */
  const getStatusText = (status: string) => {
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

  /**
   * 渲染检查项卡片
   */
  const renderCheckCard = (title: string, check: HealthCheck | undefined) => {
    if (!check) return null;

    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h3 className="card-title text-base">{title}</h3>
            <div className="flex items-center gap-2">
              {getStatusIcon(check.status)}
              <span className={`badge ${getStatusBadge(check.status)}`}>
                {getStatusText(check.status)}
              </span>
            </div>
          </div>

          <p className="text-sm opacity-70 mt-2">{check.message}</p>

          {/* 显示额外信息 */}
          <div className="mt-3 space-y-1">
            {Object.entries(check)
              .filter(([key]) => key !== 'status' && key !== 'message')
              .map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="opacity-70">{key}:</span>
                  <span className="font-mono">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
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
              <li>管理中心</li>
              <li>健康检查</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <a href="/admin/audit" className="btn btn-ghost btn-sm">审计日志</a>
          <a href="/admin/performance" className="btn btn-ghost btn-sm">性能监控</a>
          <a href="/admin/statistics" className="btn btn-ghost btn-sm">统计分析</a>
        </div>
      </div>

      <div className="container mx-auto p-6 space-y-6">
        {/* 控制面板 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">系统健康检查</h1>
            {health && (
              <span className={`badge ${getStatusBadge(health.status)} badge-lg`}>
                {getStatusText(health.status)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="label cursor-pointer gap-2">
              <span className="label-text">自动刷新</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            </label>

            <button
              onClick={fetchHealth}
              disabled={loading}
              className={`btn btn-primary btn-sm ${loading ? 'loading' : ''}`}
            >
              {loading ? '刷新中...' : '刷新'}
            </button>
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

        {/* 系统概览 */}
        {health && (
          <>
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">系统概览</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">系统状态</div>
                    <div className={`stat-value text-2xl ${
                      health.status === 'ok' ? 'text-success' :
                      health.status === 'degraded' ? 'text-warning' : 'text-error'
                    }`}>
                      {getStatusText(health.status)}
                    </div>
                    <div className="stat-desc">{health.message}</div>
                  </div>

                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">检查时间</div>
                    <div className="stat-value text-base font-mono">
                      {new Date(health.timestamp).toLocaleString('zh-CN')}
                    </div>
                    <div className="stat-desc">最后更新时间</div>
                  </div>

                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">系统阶段</div>
                    <div className="stat-value text-sm">{health.phase}</div>
                    <div className="stat-desc">当前部署阶段</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 服务健康状态 */}
            <div>
              <h2 className="text-xl font-bold mb-4">服务健康状态</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderCheckCard('数据库 (Prisma)', health.checks.prisma)}
                {renderCheckCard('连接管理器 (ConnectionManager)', health.checks.connectionManager)}
                {renderCheckCard('多级缓存 (MultiLevelCache)', health.checks.multiLevelCache)}
                {renderCheckCard('查询缓存 (QueryCacheManager)', health.checks.queryCacheManager)}
                {renderCheckCard('缓存失效服务 (CacheInvalidation)', health.checks.cacheInvalidationService)}
              </div>
            </div>

            {/* 健康检查说明 */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">健康检查说明</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="alert alert-success">
                    <div>
                      <div className="font-bold">正常 (OK)</div>
                      <div className="text-xs">服务运行正常，所有功能可用</div>
                    </div>
                  </div>

                  <div className="alert alert-warning">
                    <div>
                      <div className="font-bold">降级 (Degraded)</div>
                      <div className="text-xs">服务部分功能受限，但核心功能可用</div>
                    </div>
                  </div>

                  <div className="alert alert-error">
                    <div>
                      <div className="font-bold">错误 (Error)</div>
                      <div className="text-xs">服务不可用，需要立即处理</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
