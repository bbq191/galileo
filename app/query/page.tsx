'use client';

import { useEffect, useState } from 'react';
import QueryInput from '@/components/query/QueryInput';
import SQLPreview from '@/components/query/SQLPreview';
import ResultTable from '@/components/query/ResultTable';
import PerformanceMetrics from '@/components/query/PerformanceMetrics';
import ChartVisualization from '@/components/query/ChartVisualization';
import { apiFetch } from '@/lib/client/api-fetch';

interface DataSourceOption {
  id: number;
  name: string;
}

interface QueryResult {
  success: boolean;
  data?: any[];
  metadata?: {
    generatedSQL: string;
    explanation: string;
    rowCount: number;
    executionTime: number;
    fromCache: boolean;
    columns: Array<{
      name: string;
      type: string;
    }>;
    usedDatabases?: string[];
    dataSourceIds?: number[];
  };
  warnings?: string[];
  optimizationSuggestions?: Array<{
    type: string;
    message: string;
    impact: string;
  }>;
  error?: string;
}

/**
 * 查询页面
 * 提供自然语言查询输入、SQL 预览、结果展示等功能
 */
export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);
  // 未选择时在全部数据源中检索
  const [dataSourceId, setDataSourceId] = useState<number | undefined>(undefined);

  useEffect(() => {
    apiFetch<DataSourceOption[]>('/api/datasources').then((res) => {
      if (res.ok) setDataSources(res.data);
    });
  }, []);

  const dataSourceNames = (ids?: number[]) =>
    (ids ?? []).map((id) => dataSources.find((d) => d.id === id)?.name ?? `#${id}`).join('、');

  // 执行查询
  const handleExecute = async () => {
    if (!query.trim()) {
      setError('请输入查询内容');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await apiFetch<any[]>('/api/query/execute', {
      method: 'POST',
      json: {
        query: query.trim(),
        options: {
          enableCache: true,
          maxRows: 10000,
          timeout: 30000,
          ...(dataSourceId !== undefined && { dataSourceId }),
        },
      },
    });

    if (res.ok) {
      setResult({ success: true, data: res.data, ...res.meta } as QueryResult);
    } else {
      // 执行失败或被拦截时仍展示已生成的 SQL
      const body = res.body as QueryResult | undefined;
      setResult(body?.metadata ? { ...body, success: false } : null);
      setError(res.error.message);
    }
    setLoading(false);
  };

  // 预览 SQL（不执行）
  const handlePreview = async () => {
    if (!query.trim()) {
      setError('请输入查询内容');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await apiFetch<{
      sql: string;
      explanation: string;
      dataSourceIds?: number[];
      warnings?: string[];
      optimizationSuggestions?: QueryResult['optimizationSuggestions'];
    }>('/api/query/preview', {
      method: 'POST',
      json: {
        query: query.trim(),
        ...(dataSourceId !== undefined && { dataSourceId }),
      },
    });

    if (res.ok) {
      // 预览模式：只显示 SQL，不显示结果
      setResult({
        success: true,
        metadata: {
          generatedSQL: res.data.sql,
          explanation: res.data.explanation,
          rowCount: 0,
          executionTime: 0,
          fromCache: false,
          columns: [],
          dataSourceIds: res.data.dataSourceIds,
        },
        warnings: res.data.warnings,
        optimizationSuggestions: res.data.optimizationSuggestions,
      });
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  };

  // 清除结果
  const handleClear = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
        {/* 数据源范围 */}
        {dataSources.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-70 shrink-0">数据源</span>
            <select
              className="select select-bordered select-sm w-full max-w-xs"
              value={dataSourceId ?? ''}
              onChange={(e) => setDataSourceId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">全部数据源</option>
              {dataSources.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 查询输入 */}
        <QueryInput
          value={query}
          onChange={setQuery}
          onExecute={handleExecute}
          onPreview={handlePreview}
          loading={loading}
        />

        {/* 错误提示 */}
        {error && (
          <div className="alert alert-error shadow-lg">
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
            <div>
              <h3 className="font-bold">查询失败</h3>
              <div className="text-xs">{error}</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={handleClear}>
              关闭
            </button>
          </div>
        )}

        {/* 查询结果 */}
        {result && (
          <>
            {/* 实际涉及的数据源与库 */}
            {!!result.metadata?.dataSourceIds?.length && (
              <div className="text-sm opacity-70">
                数据源：{dataSourceNames(result.metadata.dataSourceIds)}
                {!!result.metadata.usedDatabases?.length && (
                  <> · 库：{result.metadata.usedDatabases.join('、')}</>
                )}
              </div>
            )}

            {/* SQL 预览 */}
            {result.metadata?.generatedSQL && (
              <SQLPreview
                sql={result.metadata.generatedSQL}
                explanation={result.metadata.explanation}
                editable={false}
              />
            )}

            {/* 查询结果表格 */}
            {result.success && result.data && result.data.length > 0 && (
              <>
                <ResultTable
                  data={result.data}
                  columns={result.metadata?.columns || []}
                  loading={loading}
                />

                {/* 数据可视化 */}
                <ChartVisualization
                  data={result.data}
                  columns={result.metadata?.columns || []}
                />
              </>
            )}

            {/* 空结果提示 */}
            {result.success &&
              result.data &&
              result.data.length === 0 &&
              result.metadata?.rowCount === 0 && (
                <div className="card bg-base-100 shadow-xl">
                  <div className="card-body p-4 md:p-6">
                    <div className="text-center py-12">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-16 w-16 mx-auto text-base-300 mb-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                        />
                      </svg>
                      <h3 className="text-lg font-bold mb-2">查询成功，但未返回数据</h3>
                      <p className="text-sm text-base-content/60">
                        SQL 执行成功，但没有匹配的结果
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {/* 性能指标 */}
            {result.success && result.metadata && (
              <PerformanceMetrics
                metrics={result.metadata}
                warnings={result.warnings}
                optimizationSuggestions={result.optimizationSuggestions}
              />
            )}
          </>
        )}

        {/* 初始提示 */}
        {!result && !error && !loading && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body p-4 md:p-6">
              <div className="text-center py-12">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-24 w-24 mx-auto text-primary mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                <h3 className="text-2xl font-bold mb-4">开始您的数据探索之旅</h3>
                <p className="text-base-content/60 mb-6 max-w-2xl mx-auto">
                  使用自然语言描述您的查询需求，我们的 AI
                  将帮助您生成精确的 SQL 查询并执行
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mt-8">
                  <div className="card bg-base-200">
                    <div className="card-body p-4">
                      <div className="text-4xl mb-2">🔍</div>
                      <h4 className="font-bold">智能理解</h4>
                      <p className="text-sm text-base-content/60">
                        AI 精准识别查询意图
                      </p>
                    </div>
                  </div>
                  <div className="card bg-base-200">
                    <div className="card-body p-4">
                      <div className="text-4xl mb-2">⚡</div>
                      <h4 className="font-bold">快速执行</h4>
                      <p className="text-sm text-base-content/60">
                        优化的 SQL 生成与执行
                      </p>
                    </div>
                  </div>
                  <div className="card bg-base-200">
                    <div className="card-body p-4">
                      <div className="text-4xl mb-2">📊</div>
                      <h4 className="font-bold">结果可视</h4>
                      <p className="text-sm text-base-content/60">
                        清晰的数据展示与导出
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
