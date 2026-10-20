'use client';

import { useEffect, useMemo, useState } from 'react';
import QueryInput, { type QuestionOption } from '@/components/query/QueryInput';
import SQLPreview from '@/components/query/SQLPreview';
import ResultTable from '@/components/query/ResultTable';
import PerformanceMetrics from '@/components/query/PerformanceMetrics';
import ChartVisualization from '@/components/query/ChartVisualization';
import ResultFeedback from '@/components/query/ResultFeedback';
import SaveQueryPanel from '@/components/saved-queries/SaveQueryPanel';
import { apiFetch } from '@/lib/client/api-fetch';
import { normalizeQuestion, questionSimilarity } from '@/lib/feedback/similarity';

interface DataSourceOption {
  id: number;
  name: string;
}

interface Suggestion {
  id: number;
  question: string;
  source: 'verified' | 'popular' | 'template';
}

/** 联想与相似问题的最低相似度 */
const SIMILAR_THRESHOLD = 0.3;

/** 按相似度挑选与输入相关的推荐问题（包含输入原文的优先） */
function similarSuggestions(input: string, suggestions: Suggestion[], limit: number): Suggestion[] {
  const normalized = normalizeQuestion(input);
  if (normalized.length < 2) return [];
  return suggestions
    .filter((s) => normalizeQuestion(s.question) !== normalized)
    .map((s) => ({
      s,
      score: normalizeQuestion(s.question).includes(normalized) ? 1 : questionSimilarity(input, s.question),
    }))
    .filter(({ score }) => score >= SIMILAR_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ s }) => s);
}

/** 开启已验证查询时，已验证的问题标记为可直接执行 */
function toQuestionOption(s: Suggestion, verifiedEnabled: boolean): QuestionOption {
  return { question: s.question, verified: verifiedEnabled && s.source === 'verified' };
}

interface QueryResult {
  success: boolean;
  /** 本次执行的标识，用于反馈与纠错 */
  runId?: string;
  /** 编辑 SQL 执行后：是否已记为对原查询的纠正 */
  correctionRecorded?: boolean;
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
    appliedBusinessRules?: { terms: string[]; filters: string[]; aggregations: string[]; templates: string[] };
    verifiedQueryId?: number;
    verifiedExampleIds?: number[];
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
  // 最近一次自然语言查询的 runId：编辑 SQL 后执行时关联为对它的纠正
  const [sourceRunId, setSourceRunId] = useState<string | undefined>(undefined);
  // 推荐问题（已验证 / 多人问过 / 模板示例），用于空白页推荐、输入联想与失败时的相似问题
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [verifiedEnabled, setVerifiedEnabled] = useState(false);
  // 最近一次执行的问题（失败或无数据时据此给出相似问题）
  const [executedQuery, setExecutedQuery] = useState('');

  useEffect(() => {
    apiFetch<DataSourceOption[]>('/api/datasources').then((res) => {
      if (res.ok) setDataSources(res.data);
    });
  }, []);

  useEffect(() => {
    const params = dataSourceId !== undefined ? `?dataSourceId=${dataSourceId}` : '';
    apiFetch<Suggestion[]>(`/api/query/suggestions${params}`).then((res) => {
      if (res.ok) {
        setSuggestions(res.data);
        setVerifiedEnabled(res.meta.verifiedEnabled === true);
      }
    });
  }, [dataSourceId]);

  const toOption = (s: Suggestion) => toQuestionOption(s, verifiedEnabled);
  const typingSuggestions = useMemo(
    () => (loading ? [] : similarSuggestions(query, suggestions, 5).map((s) => toQuestionOption(s, verifiedEnabled))),
    [query, suggestions, verifiedEnabled, loading]
  );
  const recommended = useMemo(
    () => suggestions.slice(0, 6).map((s) => toQuestionOption(s, verifiedEnabled)),
    [suggestions, verifiedEnabled]
  );

  const dataSourceNames = (ids?: number[]) =>
    (ids ?? []).map((id) => dataSources.find((d) => d.id === id)?.name ?? `#${id}`).join('、');

  // 执行查询（question 用于选择推荐问题后立即执行，此时 query 状态尚未更新）
  const handleExecute = async (question: string = query) => {
    if (!question.trim()) {
      setError('请输入查询内容');
      return;
    }

    setLoading(true);
    setError(null);
    setExecutedQuery(question.trim());

    const res = await apiFetch<any[]>('/api/query/execute', {
      method: 'POST',
      json: {
        query: question.trim(),
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
      setSourceRunId(res.meta.runId as string | undefined);
    } else {
      // 执行失败或被拦截时仍展示已生成的 SQL
      const body = res.body as QueryResult | undefined;
      setResult(body?.metadata ? { ...body, success: false } : null);
      setSourceRunId(body?.runId);
      setError(res.error.message);
    }
    setLoading(false);
  };

  // 执行编辑后的 SQL（服务端按 enforce 模式校验）
  const handleExecuteEditedSQL = async (sql: string) => {
    setLoading(true);
    setError(null);

    const res = await apiFetch<any[]>('/api/query/execute-sql', {
      method: 'POST',
      json: {
        sql,
        question: query.trim() || undefined,
        dataSourceIds: result?.metadata?.dataSourceIds,
        sourceRunId,
        options: { maxRows: 10000, timeout: 30000 },
      },
    });

    if (res.ok) {
      setResult({ success: true, data: res.data, ...res.meta } as QueryResult);
    } else {
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
      appliedBusinessRules?: NonNullable<QueryResult['metadata']>['appliedBusinessRules'];
      verifiedQueryId?: number;
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
      // 预览模式：只显示 SQL，不显示结果（没有执行记录，不能反馈）
      setSourceRunId(undefined);
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
          appliedBusinessRules: res.data.appliedBusinessRules,
          verifiedQueryId: res.data.verifiedQueryId,
        },
        warnings: res.data.warnings,
        optimizationSuggestions: res.data.optimizationSuggestions,
      });
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  };

  // 选择推荐问题：已验证的直接执行（使用管理员确认的 SQL），其他的填入输入框
  const handleSelectSuggestion = (option: QuestionOption) => {
    setQuery(option.question);
    if (option.verified) {
      handleExecute(option.question);
    }
  };

  // 失败或没有返回数据时，推荐相似的可用问题
  const showSimilar = !loading && !!executedQuery && (!!error || (result?.success === true && result.metadata?.rowCount === 0));
  const similarAfterFailure = showSimilar ? similarSuggestions(executedQuery, suggestions, 3) : [];

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
          onExecute={() => handleExecute()}
          onPreview={handlePreview}
          loading={loading}
          suggestions={typingSuggestions}
          onSelectSuggestion={handleSelectSuggestion}
          examples={recommended}
        />

        {/* 失败或无数据时的相似问题 */}
        {similarAfterFailure.length > 0 && (
          <div className="card bg-base-100 shadow">
            <div className="card-body p-4 space-y-2">
              <div className="text-sm opacity-70">这些相似的问题之前得到过结果，可以试试：</div>
              <div className="flex flex-wrap gap-2">
                {similarAfterFailure.map((s) => {
                  const option = toOption(s);
                  return (
                    <button key={s.id} className="btn btn-sm btn-outline normal-case h-auto py-1" onClick={() => handleSelectSuggestion(option)}>
                      <span className="break-words text-left">{s.question}</span>
                      {option.verified && <span className="badge badge-success badge-xs">已验证</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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

            {/* 注入的业务规则 */}
            {result.metadata?.appliedBusinessRules && (
              <div className="text-sm opacity-70">
                已应用业务规则：
                {[
                  ...result.metadata.appliedBusinessRules.terms,
                  ...result.metadata.appliedBusinessRules.filters,
                  ...result.metadata.appliedBusinessRules.aggregations,
                  ...result.metadata.appliedBusinessRules.templates,
                ].join('、')}
              </div>
            )}

            {/* 已验证查询 */}
            {result.metadata?.verifiedQueryId !== undefined && (
              <div className="text-sm">
                <span className="badge badge-success badge-sm mr-2">已验证</span>
                该问题的 SQL 已由管理员确认，未调用 AI 生成
              </div>
            )}
            {!!result.metadata?.verifiedExampleIds?.length && (
              <div className="text-sm opacity-70">
                参考了 {result.metadata.verifiedExampleIds.length} 条已验证的相似查询
              </div>
            )}
            {result.correctionRecorded && (
              <div className="text-sm text-success">已将修改后的 SQL 记为对原查询的纠正，管理员审核后会用于同类问题</div>
            )}

            {/* SQL 预览 */}
            {result.metadata?.generatedSQL && (
              <SQLPreview
                sql={result.metadata.generatedSQL}
                explanation={result.metadata.explanation}
                editable={!loading}
                onSQLChange={handleExecuteEditedSQL}
              />
            )}

            {/* 结果反馈（编辑 SQL 的执行结果不再单独反馈，修改本身已记为纠正） */}
            {result.runId && result.runId === sourceRunId && (
              <ResultFeedback
                runId={result.runId}
                prompt={!result.success || result.metadata?.rowCount === 0}
              />
            )}

            {/* 保存查询（执行成功的结果，含编辑 SQL 后的执行） */}
            {result.success && result.runId && (
              <SaveQueryPanel
                runId={result.runId}
                defaultTitle={query.trim()}
                checkRepeat={result.runId === sourceRunId}
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
                {recommended.length > 0 ? (
                  <div className="max-w-2xl mx-auto mt-8 text-left space-y-2">
                    <div className="text-sm font-medium opacity-70">大家常问的问题</div>
                    {recommended.map((option) => (
                      <button
                        key={option.question}
                        className="w-full p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors text-left text-sm break-words"
                        onClick={() => handleSelectSuggestion(option)}
                      >
                        {option.question}
                        {option.verified && <span className="badge badge-success badge-xs ml-2 align-middle">已验证</span>}
                      </button>
                    ))}
                  </div>
                ) : (
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
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
