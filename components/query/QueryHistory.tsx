'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface QueryHistoryItem {
  id: number;
  naturalLanguageQuery: string;
  generatedSQL: string;
  executionSuccess: boolean;
  rowCount?: number;
  executionTime: number;
  timestamp: string;
}

interface QueryHistoryResponse {
  success: boolean;
  data?: QueryHistoryItem[];
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  error?: string;
}

interface QueryHistoryProps {
  userId?: string;
  limit?: number;
  showPagination?: boolean;
}

/**
 * 查询历史组件
 * 显示用户的查询历史记录，支持分页和筛选
 */
export default function QueryHistory({
  userId,
  limit = 20,
  showPagination = true,
}: QueryHistoryProps) {
  const [data, setData] = useState<QueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filterSuccess, setFilterSuccess] = useState<boolean | null>(null);

  // 加载查询历史
  const loadHistory = async (page: number = 1) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (userId) {
        params.append('userId', userId);
      }

      if (filterSuccess !== null) {
        params.append('success', filterSuccess.toString());
      }

      const response = await fetch(`/api/query/history?${params.toString()}`);
      const result: QueryHistoryResponse = await response.json();

      if (result.success && result.data) {
        setData(result.data);
        if (result.pagination) {
          setCurrentPage(result.pagination.page);
          setTotalPages(result.pagination.totalPages);
          setTotalCount(result.pagination.totalCount);
        }
      } else {
        setError(result.error || '加载查询历史失败');
      }
    } catch (err) {
      console.error('Failed to load query history:', err);
      setError(err instanceof Error ? err.message : '加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadHistory(1);
  }, [userId, filterSuccess]);

  // 格式化时间
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (days > 0) {
      return `${days}天前`;
    } else if (hours > 0) {
      return `${hours}小时前`;
    } else if (minutes > 0) {
      return `${minutes}分钟前`;
    } else {
      return '刚刚';
    }
  };

  // 格式化执行时间
  const formatExecutionTime = (ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  };

  // 切换筛选条件
  const toggleFilter = (success: boolean | null) => {
    setFilterSuccess(success);
    setCurrentPage(1);
  };

  // 加载状态
  if (loading && data.length === 0) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-4 md:p-6">
          <div className="flex justify-center items-center py-12">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error && data.length === 0) {
    return (
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
              <div className="text-xs">{error}</div>
            </div>
            <button className="btn btn-sm" onClick={() => loadHistory(currentPage)}>
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 空状态
  if (data.length === 0 && !loading) {
    return (
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-bold mb-2">暂无查询历史</h3>
            <p className="text-sm text-base-content/60">
              开始执行查询后，历史记录将会显示在这里
            </p>
            <Link href="/query" className="btn btn-primary btn-sm mt-4">
              开始查询
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body p-4 md:p-6">
        {/* 标题和筛选 */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h2 className="card-title text-lg md:text-xl">查询历史</h2>
            <p className="text-sm text-base-content/60 mt-1">
              共 {totalCount} 条记录
              {showPagination && totalPages > 1 && ` (第 ${currentPage}/${totalPages} 页)`}
            </p>
          </div>

          {/* 筛选按钮 */}
          <div className="flex gap-2">
            <button
              className={`btn btn-sm ${filterSuccess === null ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => toggleFilter(null)}
            >
              全部
            </button>
            <button
              className={`btn btn-sm ${filterSuccess === true ? 'btn-success' : 'btn-outline'}`}
              onClick={() => toggleFilter(true)}
            >
              成功
            </button>
            <button
              className={`btn btn-sm ${filterSuccess === false ? 'btn-error' : 'btn-outline'}`}
              onClick={() => toggleFilter(false)}
            >
              失败
            </button>
          </div>
        </div>

        {/* 历史记录列表 */}
        <div className="space-y-3">
          {data.map((item) => (
            <Link
              key={item.id}
              href={`/query/history/${item.id}`}
              className="block"
            >
              <div className="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer">
                <div className="card-body p-4">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* 状态标识 */}
                    <div className="flex-shrink-0">
                      {item.executionSuccess ? (
                        <div className="badge badge-success gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
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
                          成功
                        </div>
                      ) : (
                        <div className="badge badge-error gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
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
                          失败
                        </div>
                      )}
                    </div>

                    {/* 查询内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-base mb-2 line-clamp-2">
                        {item.naturalLanguageQuery}
                      </div>
                      <div className="bg-base-300 rounded p-2 mb-2">
                        <code className="text-xs font-mono break-all line-clamp-2">
                          {item.generatedSQL}
                        </code>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-base-content/60">
                        {item.rowCount !== undefined && (
                          <span className="badge badge-sm badge-ghost">
                            {item.rowCount} 行
                          </span>
                        )}
                        <span className="badge badge-sm badge-ghost">
                          {formatExecutionTime(item.executionTime)}
                        </span>
                        <span className="badge badge-sm badge-ghost">
                          {formatTime(item.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* 箭头图标 */}
                    <div className="flex-shrink-0 self-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-base-content/40"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* 分页 */}
        {showPagination && totalPages > 1 && (
          <div className="flex justify-center mt-6">
            <div className="join">
              <button
                className="join-item btn btn-sm"
                onClick={() => loadHistory(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1 || loading}
              >
                «
              </button>
              <button className="join-item btn btn-sm">
                第 {currentPage} / {totalPages} 页
              </button>
              <button
                className="join-item btn btn-sm"
                onClick={() => loadHistory(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages || loading}
              >
                »
              </button>
            </div>
          </div>
        )}

        {/* 加载中遮罩 */}
        {loading && data.length > 0 && (
          <div className="absolute inset-0 bg-base-100/50 flex items-center justify-center rounded-xl">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        )}
      </div>
    </div>
  );
}
