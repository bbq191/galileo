'use client';

interface QueryMetadata {
  executionTime?: number;
  rowCount?: number;
  fromCache?: boolean;
  generatedSQL?: string;
  explanation?: string;
}

interface OptimizationSuggestion {
  type: string;
  message: string;
  impact: string;
}

interface PerformanceMetricsProps {
  metrics?: QueryMetadata;
  warnings?: string[];
  optimizationSuggestions?: OptimizationSuggestion[];
}

/**
 * 性能指标组件
 * 显示查询执行的性能指标、警告和优化建议
 */
export default function PerformanceMetrics({
  metrics,
  warnings = [],
  optimizationSuggestions = [],
}: PerformanceMetricsProps) {
  if (!metrics) {
    return null;
  }

  const { executionTime = 0, rowCount = 0, fromCache = false } = metrics;

  // 根据执行时间判断性能等级
  const getPerformanceLevel = (time: number) => {
    if (time < 100) return { level: 'excellent', color: 'success', label: '优秀' };
    if (time < 500) return { level: 'good', color: 'info', label: '良好' };
    if (time < 2000) return { level: 'fair', color: 'warning', label: '一般' };
    return { level: 'poor', color: 'error', label: '较慢' };
  };

  const performance = getPerformanceLevel(executionTime);

  // 根据影响程度获取样式
  const getImpactBadge = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high':
        return 'badge-error';
      case 'medium':
        return 'badge-warning';
      case 'low':
        return 'badge-info';
      default:
        return 'badge-ghost';
    }
  };

  return (
    <div className="space-y-4">
      {/* 性能指标卡片 */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-4 md:p-6">
          <h2 className="card-title text-lg md:text-xl mb-4">性能指标</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 执行时间 */}
            <div className="stat bg-base-200 rounded-lg p-4">
              <div className="stat-figure text-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="stat-title text-xs">执行时间</div>
              <div className="stat-value text-primary text-2xl">
                {executionTime}
                <span className="text-base ml-1">ms</span>
              </div>
              <div className="stat-desc">
                <span className={`badge badge-${performance.color} badge-sm`}>
                  {performance.label}
                </span>
              </div>
            </div>

            {/* 返回行数 */}
            <div className="stat bg-base-200 rounded-lg p-4">
              <div className="stat-figure text-secondary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="stat-title text-xs">返回行数</div>
              <div className="stat-value text-secondary text-2xl">
                {rowCount.toLocaleString()}
              </div>
              <div className="stat-desc">
                {rowCount > 1000 ? '大量数据' : '正常范围'}
              </div>
            </div>

            {/* 缓存状态 */}
            <div className="stat bg-base-200 rounded-lg p-4">
              <div className="stat-figure text-accent">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
              </div>
              <div className="stat-title text-xs">缓存状态</div>
              <div className="stat-value text-accent text-xl">
                {fromCache ? '命中' : '未命中'}
              </div>
              <div className="stat-desc">
                {fromCache ? '从缓存读取' : '实时查询'}
              </div>
            </div>

            {/* 查询效率 */}
            <div className="stat bg-base-200 rounded-lg p-4">
              <div className="stat-figure text-success">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </div>
              <div className="stat-title text-xs">查询效率</div>
              <div className="stat-value text-success text-xl">
                {rowCount > 0 ? Math.round(rowCount / Math.max(executionTime, 1)) : 0}
              </div>
              <div className="stat-desc">行/毫秒</div>
            </div>
          </div>
        </div>
      </div>

      {/* 警告信息 */}
      {warnings.length > 0 && (
        <div className="alert alert-warning shadow-lg">
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
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="w-full">
            <h3 className="font-bold">性能警告</h3>
            <ul className="text-xs mt-2 space-y-1">
              {warnings.map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 优化建议 */}
      {optimizationSuggestions.length > 0 && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4 md:p-6">
            <h3 className="card-title text-base md:text-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-info"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              优化建议
            </h3>
            <div className="space-y-3 mt-2">
              {optimizationSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-base-200 rounded-lg"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <span className={`badge ${getImpactBadge(suggestion.impact)} badge-sm`}>
                      {suggestion.impact === 'high'
                        ? '高影响'
                        : suggestion.impact === 'medium'
                        ? '中影响'
                        : '低影响'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium opacity-70 mb-1">
                      {suggestion.type}
                    </div>
                    <div className="text-sm">{suggestion.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
