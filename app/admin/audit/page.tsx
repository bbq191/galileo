'use client';

import { useState, useEffect } from 'react';

/**
 * 审计日志数据类型
 */
interface AuditLog {
  id: number;
  userId?: string;
  userName?: string;
  sessionId: string;
  naturalLanguageQuery: string;
  generatedSQL: string;
  executionSuccess: boolean;
  executionError?: string;
  rowCount?: number;
  usedDatabases: string[];
  usedTables: string[];
  performance: {
    intentRecognitionTime: number;
    sqlGenerationTime: number;
    validationTime: number;
    executionTime: number;
    totalTime: number;
  };
  timestamp: string;
  ipAddress?: string;
}

/**
 * 审计统计数据类型
 */
interface AuditStats {
  overview: {
    totalQueries: number;
    successQueries: number;
    failedQueries: number;
    successRate: number;
    avgExecutionTime: number;
  };
  anomalies?: Array<{
    type: string;
    severity: string;
    description: string;
    count: number;
    details?: any;
  }>;
}

/**
 * 审计日志页面
 * 提供审计日志查看和统计分析功能
 */
export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // 分页参数
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  // 筛选参数
  const [filterSuccess, setFilterSuccess] = useState<string>('all');
  const [detectAnomalies, setDetectAnomalies] = useState(false);

  /**
   * 获取审计日志
   */
  const fetchLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (filterSuccess !== 'all') {
        params.append('success', filterSuccess);
      }

      const response = await fetch(`/api/audit/logs?${params}`);
      const data = await response.json();

      if (data.success) {
        setLogs(data.data || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages);
        }
      } else {
        setError(data.error || '获取审计日志失败');
      }
    } catch (err) {
      console.error('获取审计日志失败:', err);
      setError(err instanceof Error ? err.message : '获取审计日志失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 获取审计统计
   */
  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (detectAnomalies) {
        params.append('detectAnomalies', 'true');
      }

      const response = await fetch(`/api/audit/stats?${params}`);
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('获取审计统计失败:', err);
    }
  };

  // 初始化加载
  useEffect(() => {
    fetchLogs();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterSuccess, detectAnomalies]);

  /**
   * 格式化时间
   */
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  /**
   * 格式化性能时间
   */
  const formatPerformance = (ms: number) => {
    return `${ms.toFixed(0)}ms`;
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
              <li>审计日志</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <a href="/admin/performance" className="btn btn-ghost btn-sm">性能监控</a>
          <a href="/admin/ai-cost" className="btn btn-ghost btn-sm">AI成本</a>
          <a href="/admin/statistics" className="btn btn-ghost btn-sm">统计分析</a>
        </div>
      </div>

      <div className="container mx-auto p-6 space-y-6">
        {/* 统计概览 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="stat bg-base-100 shadow rounded-lg">
              <div className="stat-title">总查询数</div>
              <div className="stat-value text-primary">{stats.overview.totalQueries}</div>
            </div>
            <div className="stat bg-base-100 shadow rounded-lg">
              <div className="stat-title">成功查询</div>
              <div className="stat-value text-success">{stats.overview.successQueries}</div>
            </div>
            <div className="stat bg-base-100 shadow rounded-lg">
              <div className="stat-title">失败查询</div>
              <div className="stat-value text-error">{stats.overview.failedQueries}</div>
            </div>
            <div className="stat bg-base-100 shadow rounded-lg">
              <div className="stat-title">成功率</div>
              <div className="stat-value">{stats.overview.successRate.toFixed(1)}%</div>
            </div>
            <div className="stat bg-base-100 shadow rounded-lg">
              <div className="stat-title">平均执行时间</div>
              <div className="stat-value text-sm">{formatPerformance(stats.overview.avgExecutionTime)}</div>
            </div>
          </div>
        )}

        {/* 异常检测 */}
        {stats?.anomalies && stats.anomalies.length > 0 && (
          <div className="alert alert-warning shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="w-full">
              <h3 className="font-bold">检测到 {stats.anomalies.length} 个异常</h3>
              <div className="text-xs mt-2 space-y-1">
                {stats.anomalies.map((anomaly, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className={`badge badge-sm ${anomaly.severity === 'high' ? 'badge-error' : anomaly.severity === 'medium' ? 'badge-warning' : 'badge-info'}`}>
                      {anomaly.severity}
                    </span>
                    <span>{anomaly.description} (计数: {anomaly.count})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 筛选和控制 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">执行状态</span>
                </label>
                <select
                  className="select select-bordered select-sm"
                  value={filterSuccess}
                  onChange={(e) => {
                    setFilterSuccess(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">全部</option>
                  <option value="true">成功</option>
                  <option value="false">失败</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer gap-2">
                  <span className="label-text">异常检测</span>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={detectAnomalies}
                    onChange={(e) => setDetectAnomalies(e.target.checked)}
                  />
                </label>
              </div>

              <button
                className="btn btn-primary btn-sm mt-8"
                onClick={() => {
                  fetchLogs();
                  fetchStats();
                }}
                disabled={loading}
              >
                {loading ? '刷新中...' : '刷新数据'}
              </button>
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

        {/* 审计日志表格 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-0">
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>用户</th>
                    <th>查询内容</th>
                    <th>状态</th>
                    <th>执行时间</th>
                    <th>行数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="text-xs">{formatTime(log.timestamp)}</td>
                      <td className="text-sm">
                        {log.userName || log.userId || '-'}
                        <br />
                        <span className="text-xs opacity-50">{log.ipAddress || '-'}</span>
                      </td>
                      <td className="max-w-xs truncate">{log.naturalLanguageQuery}</td>
                      <td>
                        {log.executionSuccess ? (
                          <span className="badge badge-success badge-sm">成功</span>
                        ) : (
                          <span className="badge badge-error badge-sm">失败</span>
                        )}
                      </td>
                      <td>{formatPerformance(log.performance.totalTime)}</td>
                      <td>{log.rowCount?.toLocaleString() || '-'}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => setSelectedLog(log)}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex justify-center p-4">
                <div className="join">
                  <button
                    className="join-item btn btn-sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1 || loading}
                  >
                    «
                  </button>
                  <button className="join-item btn btn-sm">
                    第 {page} / {totalPages} 页
                  </button>
                  <button
                    className="join-item btn btn-sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages || loading}
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 详情模态框 */}
      {selectedLog && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <h3 className="font-bold text-lg mb-4">审计日志详情</h3>

            <div className="space-y-4">
              <div>
                <label className="label font-bold">自然语言查询</label>
                <div className="p-3 bg-base-200 rounded">{selectedLog.naturalLanguageQuery}</div>
              </div>

              <div>
                <label className="label font-bold">生成的 SQL</label>
                <pre className="p-3 bg-base-200 rounded text-xs overflow-x-auto">
                  {selectedLog.generatedSQL}
                </pre>
              </div>

              {selectedLog.executionError && (
                <div>
                  <label className="label font-bold text-error">执行错误</label>
                  <div className="p-3 bg-error bg-opacity-10 rounded text-sm">
                    {selectedLog.executionError}
                  </div>
                </div>
              )}

              <div>
                <label className="label font-bold">性能指标</label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-base-200 rounded">
                    意图识别: {formatPerformance(selectedLog.performance.intentRecognitionTime)}
                  </div>
                  <div className="p-2 bg-base-200 rounded">
                    SQL生成: {formatPerformance(selectedLog.performance.sqlGenerationTime)}
                  </div>
                  <div className="p-2 bg-base-200 rounded">
                    验证: {formatPerformance(selectedLog.performance.validationTime)}
                  </div>
                  <div className="p-2 bg-base-200 rounded">
                    执行: {formatPerformance(selectedLog.performance.executionTime)}
                  </div>
                  <div className="p-2 bg-base-200 rounded col-span-2 font-bold">
                    总计: {formatPerformance(selectedLog.performance.totalTime)}
                  </div>
                </div>
              </div>

              <div>
                <label className="label font-bold">使用的资源</label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-base-200 rounded">
                    数据库: {selectedLog.usedDatabases.join(', ') || '-'}
                  </div>
                  <div className="p-2 bg-base-200 rounded">
                    表: {selectedLog.usedTables.join(', ') || '-'}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-action">
              <button className="btn" onClick={() => setSelectedLog(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
