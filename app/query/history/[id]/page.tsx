'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface QueryDetail {
  id: number;
  userId?: string;
  userName?: string;
  sessionId: string;
  naturalLanguageQuery: string;
  intent: any;
  generatedSQL: string;
  executionResult: {
    success: boolean;
    rowCount?: number;
    error?: string;
  };
  metadata: {
    usedDatabases: string[];
    usedTables: string[];
    usedColumns: string[];
  };
  performance: {
    intentRecognitionTime: number;
    sqlGenerationTime: number;
    validationTime: number;
    executionTime: number;
    totalTime: number;
  };
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

interface QueryDetailResponse {
  success: boolean;
  data?: QueryDetail;
  error?: string;
}

/**
 * 查询详情页面
 * 显示单个查询的完整信息和性能指标
 */
export default function QueryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<QueryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSQL, setCopiedSQL] = useState(false);

  // 加载查询详情
  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/query/history/${id}`);
        const result: QueryDetailResponse = await response.json();

        if (result.success && result.data) {
          setData(result.data);
        } else {
          setError(result.error || '加载查询详情失败');
        }
      } catch (err) {
        console.error('Failed to load query detail:', err);
        setError(err instanceof Error ? err.message : '加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadDetail();
    }
  }, [id]);

  // 复制 SQL
  const handleCopySQL = async () => {
    if (!data) return;

    try {
      await navigator.clipboard.writeText(data.generatedSQL);
      setCopiedSQL(true);
      setTimeout(() => setCopiedSQL(false), 2000);
    } catch (err) {
      console.error('Failed to copy SQL:', err);
      alert('复制失败');
    }
  };

  // 格式化时间
  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 格式化执行时间
  const formatExecutionTime = (ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  };

  // 加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-base-200">
        <div className="navbar bg-base-100 shadow-lg">
          <div className="flex-1">
            <Link href="/" className="btn btn-ghost normal-case text-xl">
              Galileo
            </Link>
          </div>
        </div>
        <div className="container mx-auto p-4 md:p-6">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body p-4 md:p-6">
              <div className="flex justify-center items-center py-12">
                <span className="loading loading-spinner loading-lg text-primary"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error || !data) {
    return (
      <div className="min-h-screen bg-base-200">
        <div className="navbar bg-base-100 shadow-lg">
          <div className="flex-1">
            <Link href="/" className="btn btn-ghost normal-case text-xl">
              Galileo
            </Link>
          </div>
        </div>
        <div className="container mx-auto p-4 md:p-6">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body p-4 md:p-6">
              <div className="alert alert-error">
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
                  <h3 className="font-bold">加载失败</h3>
                  <div className="text-xs">{error || '查询记录不存在'}</div>
                </div>
                <Link href="/query/history" className="btn btn-sm">
                  返回列表
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* 页面头部 */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1 min-w-0">
          <Link href="/" className="btn btn-ghost normal-case text-xl">
            Galileo
          </Link>
          <div className="breadcrumbs text-sm ml-2 md:ml-4 hidden sm:block">
            <ul>
              <li>
                <Link href="/">首页</Link>
              </li>
              <li>
                <Link href="/query">查询</Link>
              </li>
              <li>
                <Link href="/query/history">查询历史</Link>
              </li>
              <li>详情</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => router.back()}
          >
            返回
          </button>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        {/* 查询状态 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4 md:p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold mb-2">
                  查询详情 #{data.id}
                </h1>
                <p className="text-sm text-base-content/60">
                  {formatTime(data.timestamp)}
                </p>
              </div>
              <div>
                {data.executionResult.success ? (
                  <div className="badge badge-success badge-lg gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    执行成功
                  </div>
                ) : (
                  <div className="badge badge-error badge-lg gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    执行失败
                  </div>
                )}
              </div>
            </div>

            {/* 自然语言查询 */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-base-content/60 mb-2">
                自然语言查询
              </h3>
              <div className="bg-base-200 rounded-lg p-4">
                <p className="text-base">{data.naturalLanguageQuery}</p>
              </div>
            </div>
          </div>
        </div>

        {/* SQL 语句 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="card-title text-lg md:text-xl">生成的 SQL</h2>
              <button
                className={`btn btn-sm ${copiedSQL ? 'btn-success' : 'btn-outline'}`}
                onClick={handleCopySQL}
              >
                {copiedSQL ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    已复制
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    复制
                  </>
                )}
              </button>
            </div>
            <div className="mockup-code">
              <pre className="px-4">
                <code className="text-sm">{data.generatedSQL}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* 执行结果 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4 md:p-6">
            <h2 className="card-title text-lg md:text-xl mb-4">执行结果</h2>
            {data.executionResult.success ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="stat bg-base-200 rounded-lg">
                  <div className="stat-title">返回行数</div>
                  <div className="stat-value text-2xl md:text-3xl text-primary">
                    {data.executionResult.rowCount || 0}
                  </div>
                  <div className="stat-desc">条记录</div>
                </div>
                <div className="stat bg-base-200 rounded-lg">
                  <div className="stat-title">执行时间</div>
                  <div className="stat-value text-2xl md:text-3xl text-success">
                    {formatExecutionTime(data.performance.executionTime)}
                  </div>
                  <div className="stat-desc">查询耗时</div>
                </div>
                <div className="stat bg-base-200 rounded-lg">
                  <div className="stat-title">总耗时</div>
                  <div className="stat-value text-2xl md:text-3xl text-info">
                    {formatExecutionTime(data.performance.totalTime)}
                  </div>
                  <div className="stat-desc">包含意图识别和 SQL 生成</div>
                </div>
              </div>
            ) : (
              <div className="alert alert-error">
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
                  <h3 className="font-bold">执行错误</h3>
                  <div className="text-sm">{data.executionResult.error}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 性能指标 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4 md:p-6">
            <h2 className="card-title text-lg md:text-xl mb-4">性能指标</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-base-content/60">意图识别</span>
                <div className="flex items-center gap-2">
                  <progress
                    className="progress progress-primary w-32"
                    value={data.performance.intentRecognitionTime}
                    max={data.performance.totalTime}
                  ></progress>
                  <span className="text-sm font-mono">
                    {formatExecutionTime(data.performance.intentRecognitionTime)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-base-content/60">SQL 生成</span>
                <div className="flex items-center gap-2">
                  <progress
                    className="progress progress-secondary w-32"
                    value={data.performance.sqlGenerationTime}
                    max={data.performance.totalTime}
                  ></progress>
                  <span className="text-sm font-mono">
                    {formatExecutionTime(data.performance.sqlGenerationTime)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-base-content/60">SQL 验证</span>
                <div className="flex items-center gap-2">
                  <progress
                    className="progress progress-accent w-32"
                    value={data.performance.validationTime}
                    max={data.performance.totalTime}
                  ></progress>
                  <span className="text-sm font-mono">
                    {formatExecutionTime(data.performance.validationTime)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-base-content/60">查询执行</span>
                <div className="flex items-center gap-2">
                  <progress
                    className="progress progress-success w-32"
                    value={data.performance.executionTime}
                    max={data.performance.totalTime}
                  ></progress>
                  <span className="text-sm font-mono">
                    {formatExecutionTime(data.performance.executionTime)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 元数据信息 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4 md:p-6">
            <h2 className="card-title text-lg md:text-xl mb-4">元数据信息</h2>
            <div className="space-y-4">
              {/* 使用的数据库 */}
              {data.metadata.usedDatabases.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-base-content/60 mb-2">
                    使用的数据库
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {data.metadata.usedDatabases.map((db, index) => (
                      <div key={index} className="badge badge-primary badge-lg">
                        {db}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 使用的表 */}
              {data.metadata.usedTables.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-base-content/60 mb-2">
                    使用的表
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {data.metadata.usedTables.map((table, index) => (
                      <div key={index} className="badge badge-secondary badge-lg">
                        {table}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 其他信息 */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4 md:p-6">
            <h2 className="card-title text-lg md:text-xl mb-4">其他信息</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-base-content/60">会话 ID</span>
                <span className="font-mono">{data.sessionId}</span>
              </div>
              {data.userId && (
                <div className="flex justify-between">
                  <span className="text-base-content/60">用户 ID</span>
                  <span className="font-mono">{data.userId}</span>
                </div>
              )}
              {data.userName && (
                <div className="flex justify-between">
                  <span className="text-base-content/60">用户名</span>
                  <span>{data.userName}</span>
                </div>
              )}
              {data.ipAddress && (
                <div className="flex justify-between">
                  <span className="text-base-content/60">IP 地址</span>
                  <span className="font-mono">{data.ipAddress}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 意图信息（可展开） */}
        <div className="collapse collapse-arrow bg-base-100 shadow-xl">
          <input type="checkbox" />
          <div className="collapse-title text-lg md:text-xl font-medium">
            查询意图（展开查看）
          </div>
          <div className="collapse-content">
            <div className="mockup-code">
              <pre className="px-4">
                <code className="text-xs">
                  {JSON.stringify(data.intent, null, 2)}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
