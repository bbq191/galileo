'use client';

import { useState } from 'react';
import { useAsyncData } from '@/lib/client/use-async-data';

/**
 * AI成本统计数据类型（匹配后端返回结构）
 */
interface AICostStatistics {
  period: {
    start: Date;
    end: Date;
  };
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  cachedCalls: number;
  cacheHitRate: number;
  tokens: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
  };
  costs: {
    totalPromptCost: number;
    totalCompletionCost: number;
    totalCost: number;
  };
  byType: Record<string, {
    calls: number;
    tokens: number;
    cost: number;
  }>;
  avgLatency: number;
}

/**
 * Prompt缓存统计类型（匹配后端返回结构）
 */
interface PromptCacheStats {
  totalEntries: number;
  byType: Record<string, {
    count: number;
    hits: number;
    tokensSaved: number;
  }>;
  totalTokensSaved: number;
  hitRate: number;
  sizeBytes: number;
  lastUpdated: string;
}

/**
 * AI成本管理页面
 * 提供AI调用成本追踪和Prompt缓存管理功能
 */
export default function AICostPage() {
  // 时间周期选择
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  // 生成报告、清理缓存等操作进行中
  const [busy, setBusy] = useState(false);

  /**
   * 获取AI成本统计
   */
  const costData = useAsyncData(async (signal) => {
    const response = await fetch(`/api/ai/cost?period=${period}`, { signal });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '获取成本统计失败');
    }
    return data.statistics as AICostStatistics;
  }, [period]);

  /**
   * 获取Prompt缓存统计（失败时不提示，缓存统计区域不显示）
   */
  const promptCacheData = useAsyncData(async (signal) => {
    try {
      const response = await fetch('/api/ai/prompt-cache', { signal });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || '获取缓存统计失败');
      }
      return data.stats as PromptCacheStats;
    } catch (err) {
      console.error('获取缓存统计失败:', err);
      return null;
    }
  }, []);

  const costStats = costData.data ?? null;
  const promptCacheStats = promptCacheData.data ?? null;
  const error = costData.error;
  const loading = costData.loading || promptCacheData.loading || busy;

  /**
   * 刷新所有数据
   */
  const refreshData = () => {
    costData.reload();
    promptCacheData.reload();
  };

  /**
   * 生成成本报告
   */
  const generateReport = async () => {
    setBusy(true);

    try {
      const response = await fetch(`/api/ai/cost?period=${period}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        // 创建一个blob并下载
        const blob = new Blob([data.report], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-cost-report-${period}-${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        throw new Error(data.error || '生成报告失败');
      }
    } catch (err) {
      console.error('生成报告失败:', err);
      alert(err instanceof Error ? err.message : '生成报告失败');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 清理Prompt缓存
   */
  const cleanupPromptCache = async () => {
    if (!confirm('确定要清理低质量的Prompt缓存吗？')) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch('/api/ai/prompt-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          minAccessCount: 2,
          maxAge: 30,
          minSimilarity: 0.85,
        }),
      });
      const data = await response.json();

      if (data.success) {
        alert(`成功清理 ${data.removedCount} 条低质量缓存`);
        promptCacheData.reload();
      } else {
        throw new Error(data.error || '清理失败');
      }
    } catch (err) {
      console.error('清理缓存失败:', err);
      alert(err instanceof Error ? err.message : '清理缓存失败');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 清空Prompt缓存
   */
  const clearPromptCache = async () => {
    if (!confirm('确定要清空所有Prompt缓存吗？此操作不可恢复！')) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch('/api/ai/prompt-cache', {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        alert('Prompt缓存已清空');
        promptCacheData.reload();
      } else {
        throw new Error(data.error || '清空失败');
      }
    } catch (err) {
      console.error('清空缓存失败:', err);
      alert(err instanceof Error ? err.message : '清空缓存失败');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 格式化货币
   */
  const formatCurrency = (amount: number) => {
    return `¥${amount.toFixed(4)}`;
  };

  /**
   * 格式化数字
   */
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toString();
  };

  return (
    <div className="space-y-6">
        {/* 控制面板 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">时间周期</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as 'day' | 'week' | 'month')}
                  >
                    <option value="day">今日</option>
                    <option value="week">本周</option>
                    <option value="month">本月</option>
                  </select>
                </div>

                <button
                  className="btn btn-primary btn-sm mt-8"
                  onClick={refreshData}
                  disabled={loading}
                >
                  {loading ? '刷新中...' : '刷新数据'}
                </button>

                <button
                  className="btn btn-outline btn-sm mt-8"
                  onClick={generateReport}
                  disabled={loading}
                >
                  生成报告
                </button>
              </div>
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

        {/* AI成本统计 */}
        {costStats && (
          <>
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">AI成本概览</h2>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">总成本</div>
                    <div className="stat-value text-primary text-2xl">{formatCurrency(costStats.costs.totalCost)}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">总Token数</div>
                    <div className="stat-value text-2xl">{formatNumber(costStats.tokens.totalTokens)}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">总请求数</div>
                    <div className="stat-value text-2xl">{costStats.totalCalls}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">平均每请求成本</div>
                    <div className="stat-value text-sm">{formatCurrency(costStats.totalCalls > 0 ? costStats.costs.totalCost / costStats.totalCalls : 0)}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-lg">
                    <div className="stat-title">平均每请求Token</div>
                    <div className="stat-value text-2xl">{formatNumber(costStats.totalCalls > 0 ? costStats.tokens.totalTokens / costStats.totalCalls : 0)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 按类型统计 */}
            {costStats.byType && Object.keys(costStats.byType).length > 0 && (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">AI调用类型详情</h2>

                  <div className="overflow-x-auto mt-4">
                    <table className="table table-zebra">
                      <thead>
                        <tr>
                          <th>类型</th>
                          <th>调用次数</th>
                          <th>总Token</th>
                          <th>成本</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(costStats.byType).map(([type, stats]) => (
                          <tr key={type}>
                            <td className="font-mono text-xs">{type}</td>
                            <td>{stats.calls}</td>
                            <td className="font-bold">{formatNumber(stats.tokens)}</td>
                            <td className="text-primary font-bold">{formatCurrency(stats.cost)}</td>
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

        {/* Prompt缓存统计 */}
        {promptCacheStats && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex items-center justify-between">
                <h2 className="card-title">Prompt缓存</h2>
                <div className="flex gap-2">
                  <button
                    className="btn btn-outline btn-warning btn-sm"
                    onClick={cleanupPromptCache}
                    disabled={loading}
                  >
                    清理低质量缓存
                  </button>
                  <button
                    className="btn btn-outline btn-error btn-sm"
                    onClick={clearPromptCache}
                    disabled={loading}
                  >
                    清空所有缓存
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div className="stat bg-base-200 rounded-lg">
                  <div className="stat-title">缓存条目</div>
                  <div className="stat-value text-2xl">{promptCacheStats.totalEntries}</div>
                </div>
                <div className="stat bg-base-200 rounded-lg">
                  <div className="stat-title">总大小</div>
                  <div className="stat-value text-2xl">
                    {(promptCacheStats.sizeBytes / 1024).toFixed(2)}KB
                  </div>
                </div>
                <div className="stat bg-base-200 rounded-lg">
                  <div className="stat-title">命中率</div>
                  <div className="stat-value text-success text-2xl">
                    {(promptCacheStats.hitRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="stat bg-base-200 rounded-lg">
                  <div className="stat-title">节省Token数</div>
                  <div className="stat-value text-2xl">
                    {formatNumber(promptCacheStats.totalTokensSaved)}
                  </div>
                </div>
              </div>

              <div className="alert alert-info mt-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div className="text-sm">
                  <div className="font-bold">Prompt缓存说明</div>
                  <div>缓存高频使用的Prompt可以减少重复构建的成本，提高响应速度。建议定期清理低质量缓存以保持最佳性能。</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 成本优化建议 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">成本优化建议</h2>

            <div className="space-y-3 mt-4">
              <div className="flex items-start gap-3 p-3 bg-base-200 rounded-lg">
                <span className="badge badge-success">建议</span>
                <div>
                  <div className="font-bold">使用Prompt缓存</div>
                  <div className="text-sm opacity-70">
                    启用Prompt缓存可以减少重复的AI调用，特别是对于频繁使用的查询模板。
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-base-200 rounded-lg">
                <span className="badge badge-info">建议</span>
                <div>
                  <div className="font-bold">选择合适的模型</div>
                  <div className="text-sm opacity-70">
                    根据任务复杂度选择合适的模型。简单任务使用小模型，复杂任务使用大模型。
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-base-200 rounded-lg">
                <span className="badge badge-warning">建议</span>
                <div>
                  <div className="font-bold">优化Prompt长度</div>
                  <div className="text-sm opacity-70">
                    精简Prompt内容，移除不必要的信息可以显著降低Token使用量。
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-base-200 rounded-lg">
                <span className="badge badge-error">建议</span>
                <div>
                  <div className="font-bold">设置合理的超时和重试策略</div>
                  <div className="text-sm opacity-70">
                    避免因超时重试导致的重复调用，合理设置超时时间和重试次数。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
