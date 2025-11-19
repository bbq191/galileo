'use client';

import { useState, useEffect } from 'react';

/**
 * 数据库元数据（含业务域）
 */
interface DatabaseWithDomain {
  id: number;
  databaseName: string;
  sourceId: number;
  domainId: number | null;
  domain: {
    id: number;
    name: string;
    description: string | null;
  } | null;
  source: {
    id: number;
    name: string;
    type: string;
  };
}

/**
 * 业务域
 */
interface BusinessDomain {
  id: number;
  name: string;
  description: string | null;
}

/**
 * 推断结果
 */
interface InferenceResult {
  databaseId: number;
  suggestedDomain: {
    id: number;
    name: string;
    description: string | null;
  };
  confidence: number;
  reasoning: string;
  requiresReview: boolean;
  strategies: Array<{
    strategyName: string;
    score: number;
    weight: number;
    features: string[];
  }>;
  alternativeDomains?: Array<{
    id: number;
    name: string;
    confidence: number;
  }>;
}

/**
 * 数据库业务域分配页面
 *
 * 功能：
 * - 查看所有数据库及其业务域
 * - 批量自动推断业务域
 * - 手动修改业务域
 * - 查看推断结果详情
 */
export default function DatabaseDomainsPage() {
  const [databases, setDatabases] = useState<DatabaseWithDomain[]>([]);
  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inferring, setInferring] = useState(false);
  const [selectedDatabases, setSelectedDatabases] = useState<Set<number>>(new Set());
  const [showInferenceModal, setShowInferenceModal] = useState(false);
  const [inferenceResults, setInferenceResults] = useState<Map<number, InferenceResult>>(
    new Map()
  );
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningDatabase, setAssigningDatabase] = useState<DatabaseWithDomain | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);
  const [filterDomainId, setFilterDomainId] = useState<number | null>(null);

  /**
   * 从 URL 获取过滤参数
   */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const domainIdParam = params.get('domainId');
      if (domainIdParam) {
        setFilterDomainId(Number(domainIdParam));
      }
    }
  }, []);

  /**
   * 加载数据库列表
   */
  const loadDatabases = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/metadata/databases?includeDomain=true');
      const result = await response.json();

      if (result.success) {
        setDatabases(result.data || []);
      } else {
        throw new Error(result.error || '获取数据库列表失败');
      }
    } catch (err) {
      console.error('获取数据库列表失败:', err);
      setError(err instanceof Error ? err.message : '获取数据库列表失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 加载业务域列表
   */
  const loadDomains = async () => {
    try {
      const response = await fetch('/api/metadata/domains');
      const result = await response.json();

      if (result.success) {
        setDomains(result.data.domains || []);
      }
    } catch (err) {
      console.error('获取业务域列表失败:', err);
    }
  };

  useEffect(() => {
    Promise.all([loadDatabases(), loadDomains()]);
  }, []);

  /**
   * 切换数据库选择
   */
  const toggleDatabaseSelection = (databaseId: number) => {
    const newSelection = new Set(selectedDatabases);
    if (newSelection.has(databaseId)) {
      newSelection.delete(databaseId);
    } else {
      newSelection.add(databaseId);
    }
    setSelectedDatabases(newSelection);
  };

  /**
   * 全选/取消全选
   */
  const toggleSelectAll = () => {
    if (selectedDatabases.size === databases.length) {
      setSelectedDatabases(new Set());
    } else {
      setSelectedDatabases(new Set(databases.map((db) => db.id)));
    }
  };

  /**
   * 批量推断业务域
   */
  const handleBatchInfer = async () => {
    if (selectedDatabases.size === 0) {
      alert('请先选择要推断的数据库');
      return;
    }

    try {
      setInferring(true);

      const response = await fetch('/api/metadata/domains/batch-infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          databaseIds: Array.from(selectedDatabases),
          enableAI: true,
          autoApply: false, // 不自动应用，让用户审核
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 构建推断结果 Map
        const resultsMap = new Map<number, InferenceResult>();
        result.data.results.forEach((item: any) => {
          if (item.success && item.suggestedDomain) {
            resultsMap.set(item.databaseId, item as InferenceResult);
          }
        });

        setInferenceResults(resultsMap);
        setShowInferenceModal(true);
      } else {
        throw new Error(result.error || '批量推断失败');
      }
    } catch (err) {
      console.error('批量推断失败:', err);
      alert(err instanceof Error ? err.message : '批量推断失败');
    } finally {
      setInferring(false);
    }
  };

  /**
   * 应用推断结果
   */
  const handleApplyInference = async (databaseId: number, domainId: number) => {
    try {
      const response = await fetch('/api/metadata/domains/apply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseId, domainId }),
      });

      const result = await response.json();

      if (result.success) {
        // 从推断结果中移除
        const newResults = new Map(inferenceResults);
        newResults.delete(databaseId);
        setInferenceResults(newResults);

        // 刷新数据库列表
        await loadDatabases();

        // 如果所有推断都已处理，关闭模态框
        if (newResults.size === 0) {
          setShowInferenceModal(false);
        }
      } else {
        throw new Error(result.error || '应用失败');
      }
    } catch (err) {
      console.error('应用推断结果失败:', err);
      alert(err instanceof Error ? err.message : '应用失败');
    }
  };

  /**
   * 打开手动分配模态框
   */
  const handleManualAssign = (database: DatabaseWithDomain) => {
    setAssigningDatabase(database);
    setSelectedDomainId(database.domainId);
    setShowAssignModal(true);
  };

  /**
   * 保存手动分配
   */
  const handleSaveAssignment = async () => {
    if (!assigningDatabase || !selectedDomainId) {
      alert('请选择业务域');
      return;
    }

    try {
      const response = await fetch('/api/metadata/domains/apply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          databaseId: assigningDatabase.id,
          domainId: selectedDomainId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setShowAssignModal(false);
        await loadDatabases();
      } else {
        throw new Error(result.error || '分配失败');
      }
    } catch (err) {
      console.error('分配业务域失败:', err);
      alert(err instanceof Error ? err.message : '分配失败');
    }
  };

  /**
   * 获取置信度颜色
   */
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'badge-success';
    if (confidence >= 0.7) return 'badge-warning';
    return 'badge-error';
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
              <li><a href="/metadata">元数据</a></li>
              <li>业务域分配</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <div className="container mx-auto p-6">
        {/* 页面标题和操作按钮 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold">数据库业务域分配</h1>
              <p className="text-sm text-gray-500 mt-1">
                为数据库分配业务域，支持自动推断和手动分配
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-primary"
                onClick={handleBatchInfer}
                disabled={selectedDatabases.size === 0 || inferring}
              >
                {inferring ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    推断中...
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-2"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                    </svg>
                    批量推断 ({selectedDatabases.size})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 业务域过滤器 */}
          <div className="flex gap-2 items-center">
            <span className="text-sm font-medium">按业务域过滤:</span>
            <select
              className="select select-bordered select-sm"
              value={filterDomainId || ''}
              onChange={(e) => setFilterDomainId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">全部业务域</option>
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
            {filterDomainId && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setFilterDomainId(null)}
              >
                清除过滤
              </button>
            )}
          </div>
        </div>

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

        {/* 数据库列表 */}
        {!loading && !error && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead>
                    <tr>
                      <th>
                        <label>
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={selectedDatabases.size === databases.length}
                            onChange={toggleSelectAll}
                          />
                        </label>
                      </th>
                      <th>数据库名称</th>
                      <th>数据源</th>
                      <th>当前业务域</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {databases
                      .filter((db) => !filterDomainId || db.domainId === filterDomainId)
                      .map((database) => (
                      <tr key={database.id}>
                        <td>
                          <label>
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={selectedDatabases.has(database.id)}
                              onChange={() => toggleDatabaseSelection(database.id)}
                            />
                          </label>
                        </td>
                        <td>
                          <div className="font-bold">{database.databaseName}</div>
                        </td>
                        <td>
                          <div className="text-sm">
                            {database.source.name}
                            <span className="badge badge-ghost badge-sm ml-2">
                              {database.source.type}
                            </span>
                          </div>
                        </td>
                        <td>
                          {database.domain ? (
                            <div className="badge badge-primary">
                              {database.domain.name}
                            </div>
                          ) : (
                            <div className="badge badge-ghost">未分配</div>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => handleManualAssign(database)}
                          >
                            分配
                          </button>
                        </td>
                      </tr>
                    ))}

                    {databases.filter((db) => !filterDomainId || db.domainId === filterDomainId).length === 0 && databases.length > 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-gray-500 py-8">
                          没有找到匹配的数据库
                        </td>
                      </tr>
                    )}

                    {databases.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-gray-500 py-8">
                          暂无数据库
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 推断结果模态框 */}
      {showInferenceModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <h3 className="font-bold text-lg mb-4">推断结果审核</h3>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {Array.from(inferenceResults.entries()).map(([databaseId, result]) => {
                const database = databases.find((db) => db.id === databaseId);
                if (!database) return null;

                return (
                  <div key={databaseId} className="card bg-base-200">
                    <div className="card-body">
                      <h4 className="font-bold">{database.databaseName}</h4>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-sm">推荐业务域:</span>
                        <div className="badge badge-primary">
                          {result.suggestedDomain.name}
                        </div>
                        <div
                          className={`badge ${getConfidenceColor(result.confidence)}`}
                        >
                          置信度: {(result.confidence * 100).toFixed(1)}%
                        </div>
                        {result.requiresReview && (
                          <div className="badge badge-warning">需要审核</div>
                        )}
                      </div>

                      <div className="text-sm text-gray-600 mt-2">
                        <strong>推理依据:</strong>
                        <pre className="whitespace-pre-wrap mt-1 text-xs">
                          {result.reasoning}
                        </pre>
                      </div>

                      {result.alternativeDomains &&
                        result.alternativeDomains.length > 0 && (
                          <div className="mt-2">
                            <span className="text-xs text-gray-500">
                              其他候选:
                            </span>
                            <div className="flex gap-2 mt-1">
                              {result.alternativeDomains.map((alt) => (
                                <div
                                  key={alt.id}
                                  className="badge badge-ghost badge-sm"
                                >
                                  {alt.name} ({(alt.confidence * 100).toFixed(0)}%)
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      <div className="card-actions justify-end mt-4">
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => {
                            const newResults = new Map(inferenceResults);
                            newResults.delete(databaseId);
                            setInferenceResults(newResults);
                            if (newResults.size === 0) {
                              setShowInferenceModal(false);
                            }
                          }}
                        >
                          跳过
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            handleApplyInference(databaseId, result.suggestedDomain.id)
                          }
                        >
                          应用
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-action">
              <button
                className="btn"
                onClick={() => setShowInferenceModal(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手动分配模态框 */}
      {showAssignModal && assigningDatabase && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">
              分配业务域 - {assigningDatabase.databaseName}
            </h3>

            <div className="form-control">
              <label className="label">
                <span className="label-text">选择业务域</span>
              </label>
              <select
                className="select select-bordered"
                value={selectedDomainId || ''}
                onChange={(e) => setSelectedDomainId(Number(e.target.value))}
              >
                <option value="">请选择业务域</option>
                {domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                    {domain.description ? ` - ${domain.description}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-action">
              <button className="btn" onClick={() => setShowAssignModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSaveAssignment}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
