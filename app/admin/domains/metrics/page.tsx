'use client';

import { useState, useEffect } from 'react';

/**
 * 推断指标数据类型
 */
interface InferenceMetrics {
  // 基础统计
  totalInferences: number;
  successfulInferences: number;
  failedInferences: number;
  successRate: number;

  // 置信度统计
  avgConfidence: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;

  // 审核统计
  autoAppliedCount: number;
  manualReviewCount: number;
  autoApplyRate: number;
  manualReviewRate: number;

  // 策略统计
  strategyHits: {
    naming_rule: number;
    vector_similarity: number;
    ai_reasoning: number;
  };

  // 耗时统计（毫秒）
  avgDuration: number;
  minDuration: number;
  maxDuration: number;

  // 缓存统计
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;

  // 运行时间
  uptime: number;
  startTime: number;
  lastUpdated: number;
}

/**
 * 推断监控页面
 *
 * 功能：
 * - 查看推断性能指标
 * - 展示成功率、置信度、耗时等统计信息
 * - 策略命中率分析
 * - 缓存性能监控
 */
export default function DomainMetricsPage() {
  const [metrics, setMetrics] = useState<InferenceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  /**
   * 加载指标数据
   */
  const loadMetrics = async () => {
    try {
      setError(null);

      const response = await fetch('/api/metadata/domains/metrics');
      const result = await response.json();

      if (result.success) {
        setMetrics(result.data.metrics);
      } else {
        throw new Error(result.error || '获取指标失败');
      }
    } catch (err) {
      console.error('获取指标失败:', err);
      setError(err instanceof Error ? err.message : '获取指标失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 重置指标
   */
  const handleResetMetrics = async () => {
    if (!confirm('确定要重置所有推断指标吗？此操作不可恢复。')) {
      return;
    }

    try {
      const response = await fetch('/api/metadata/domains/metrics', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        await loadMetrics();
      } else {
        throw new Error(result.error || '重置失败');
      }
    } catch (err) {
      console.error('重置指标失败:', err);
      alert(err instanceof Error ? err.message : '重置失败');
    }
  };

  useEffect(() => {
    loadMetrics();

    // 自动刷新（每 10 秒）
    let intervalId: NodeJS.Timeout;
    if (autoRefresh) {
      intervalId = setInterval(loadMetrics, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh]);

  /**
   * 格式化百分比
   */
  const formatPercent = (value: number): string => {
    return `${(value * 100).toFixed(2)}%`;
  };

  /**
   * 格式化时长
   */
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes} 分 ${seconds} 秒`;
  };

  /**
   * 格式化运行时间
   */
  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} 天 ${hours % 24} 小时`;
    } else if (hours > 0) {
      return `${hours} 小时 ${minutes % 60} 分钟`;
    } else if (minutes > 0) {
      return `${minutes} 分钟 ${seconds % 60} 秒`;
    } else {
      return `${seconds} 秒`;
    }
  };

  /**
   * 获取进度条颜色
   */
  const getProgressColor = (rate: number): string => {
    if (rate >= 0.8) return 'progress-success';
    if (rate >= 0.6) return 'progress-warning';
    return 'progress-error';
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* 导航栏 */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <a href="/" className="btn btn-ghost normal-case text-xl">
            Galileo
          </a>
          <div className="breadcrumbs text-sm ml-4">
            <ul>
              <li><a href="/admin">管理后台</a></li>
              <li><a href="/admin/domains">业务域管理</a></li>
              <li>推断监控</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <label className="label cursor-pointer gap-2">
            <span className="label-text">自动刷新</span>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </label>
          <button className="btn btn-ghost" onClick={loadMetrics}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button className="btn btn-error btn-outline" onClick={handleResetMetrics}>
            重置指标
          </button>
        </div>
      </div>

      {/* 主内容 */}
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">业务域推断性能监控</h1>

        {/* 错误提示 */}
        {error && (
          <div className="alert alert-error mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        )}

        {/* 指标展示 */}
        {!loading && !error && metrics && (
          <div className="space-y-6">
            {/* 概览卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* 总推断次数 */}
              <div className="stats shadow">
                <div className="stat">
                  <div className="stat-title">总推断次数</div>
                  <div className="stat-value">{metrics.totalInferences}</div>
                  <div className="stat-desc">
                    成功 {metrics.successfulInferences} / 失败 {metrics.failedInferences}
                  </div>
                </div>
              </div>

              {/* 成功率 */}
              <div className="stats shadow">
                <div className="stat">
                  <div className="stat-title">成功率</div>
                  <div className="stat-value text-success">
                    {formatPercent(metrics.successRate)}
                  </div>
                  <div className="stat-desc">
                    运行时间: {formatUptime(metrics.uptime)}
                  </div>
                </div>
              </div>

              {/* 平均置信度 */}
              <div className="stats shadow">
                <div className="stat">
                  <div className="stat-title">平均置信度</div>
                  <div className="stat-value text-primary">
                    {(metrics.avgConfidence * 100).toFixed(1)}%
                  </div>
                  <div className="stat-desc">
                    高置信度 {metrics.highConfidenceCount} 次
                  </div>
                </div>
              </div>

              {/* 平均耗时 */}
              <div className="stats shadow">
                <div className="stat">
                  <div className="stat-title">平均耗时</div>
                  <div className="stat-value text-info">
                    {metrics.avgDuration.toFixed(0)} ms
                  </div>
                  <div className="stat-desc">
                    最快 {metrics.minDuration.toFixed(0)} ms / 最慢{' '}
                    {metrics.maxDuration.toFixed(0)} ms
                  </div>
                </div>
              </div>
            </div>

            {/* 审核统计 */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">审核统计</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span>自动应用率</span>
                      <span className="font-bold">
                        {formatPercent(metrics.autoApplyRate)}
                      </span>
                    </div>
                    <progress
                      className={`progress ${getProgressColor(metrics.autoApplyRate)}`}
                      value={metrics.autoApplyRate * 100}
                      max="100"
                    ></progress>
                    <div className="text-sm text-gray-500 mt-1">
                      {metrics.autoAppliedCount} 次自动应用
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span>人工审核率</span>
                      <span className="font-bold">
                        {formatPercent(metrics.manualReviewRate)}
                      </span>
                    </div>
                    <progress
                      className="progress progress-warning"
                      value={metrics.manualReviewRate * 100}
                      max="100"
                    ></progress>
                    <div className="text-sm text-gray-500 mt-1">
                      {metrics.manualReviewCount} 次需要审核
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 策略统计 */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">策略命中统计</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span>命名规则策略</span>
                      <span className="font-bold">
                        {metrics.strategyHits.naming_rule} 次
                      </span>
                    </div>
                    <progress
                      className="progress progress-primary"
                      value={metrics.strategyHits.naming_rule}
                      max={Math.max(
                        metrics.strategyHits.naming_rule,
                        metrics.strategyHits.vector_similarity,
                        metrics.strategyHits.ai_reasoning
                      )}
                    ></progress>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span>向量相似度策略</span>
                      <span className="font-bold">
                        {metrics.strategyHits.vector_similarity} 次
                      </span>
                    </div>
                    <progress
                      className="progress progress-secondary"
                      value={metrics.strategyHits.vector_similarity}
                      max={Math.max(
                        metrics.strategyHits.naming_rule,
                        metrics.strategyHits.vector_similarity,
                        metrics.strategyHits.ai_reasoning
                      )}
                    ></progress>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span>AI 推理策略</span>
                      <span className="font-bold">
                        {metrics.strategyHits.ai_reasoning} 次
                      </span>
                    </div>
                    <progress
                      className="progress progress-accent"
                      value={metrics.strategyHits.ai_reasoning}
                      max={Math.max(
                        metrics.strategyHits.naming_rule,
                        metrics.strategyHits.vector_similarity,
                        metrics.strategyHits.ai_reasoning
                      )}
                    ></progress>
                  </div>
                </div>
              </div>
            </div>

            {/* 缓存性能 */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">缓存性能</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span>缓存命中率</span>
                      <span className="font-bold">
                        {formatPercent(metrics.cacheHitRate)}
                      </span>
                    </div>
                    <progress
                      className={`progress ${getProgressColor(metrics.cacheHitRate)}`}
                      value={metrics.cacheHitRate * 100}
                      max="100"
                    ></progress>
                  </div>

                  <div>
                    <div className="stats shadow w-full">
                      <div className="stat">
                        <div className="stat-title">缓存命中</div>
                        <div className="stat-value text-sm">{metrics.cacheHits}</div>
                      </div>
                      <div className="stat">
                        <div className="stat-title">缓存未命中</div>
                        <div className="stat-value text-sm">{metrics.cacheMisses}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 运行信息 */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">运行信息</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <div className="text-sm text-gray-500">启动时间</div>
                    <div className="font-bold">
                      {new Date(metrics.startTime).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">最后更新</div>
                    <div className="font-bold">
                      {new Date(metrics.lastUpdated).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">运行时长</div>
                    <div className="font-bold">{formatUptime(metrics.uptime)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 无数据提示 */}
        {!loading && !error && metrics && metrics.totalInferences === 0 && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body text-center">
              <h2 className="card-title justify-center">暂无推断记录</h2>
              <p className="text-gray-500">
                系统还没有执行过业务域推断，请先在
                <a href="/metadata/domains" className="link link-primary mx-1">
                  数据库业务域分配
                </a>
                页面进行推断操作。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
