'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api-fetch';
import { useAsyncData } from '@/lib/client/use-async-data';
import RelationshipGraph from './components/RelationshipGraph';
import RelationshipDetail from './components/RelationshipDetail';
import VerificationPanel from './components/VerificationPanel';

interface GraphNode {
  tableId: number;
  tableName: string;
  databaseName: string;
  outDegree: number;
  inDegree: number;
}

interface GraphEdge {
  relationshipId: number;
  sourceTableId: number;
  targetTableId: number;
  sourceColumn: string;
  targetColumn: string;
  confidence: number;
  type: 'explicit' | 'inferred' | 'verified';
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/**
 * 读取列表接口；失败（含限流）时抛出错误，由页面提示并允许重试
 */
async function fetchList(url: string, signal?: AbortSignal): Promise<any[]> {
  const res = await apiFetch<any[]>(url, { signal });
  if (!res.ok) throw res.error;
  return res.data || [];
}

async function fetchFirst(url: string): Promise<any | null> {
  const list = await fetchList(url);
  return list[0] ?? null;
}

/**
 * 根据 URL 中的 databaseId / tableId 查出对应的数据源、数据库与中心表
 */
async function resolveUrlSelection(
  databaseId: number | null,
  tableId: number | null
): Promise<{ sourceId: number | null; databaseId: number | null; tableId: number | null }> {
  let resolvedDatabaseId = databaseId;
  if (!resolvedDatabaseId && tableId) {
    const table = await fetchFirst(`/api/metadata/tables?tableId=${tableId}`);
    resolvedDatabaseId = table?.databaseId ?? null;
  }

  let sourceId: number | null = null;
  if (resolvedDatabaseId) {
    const database = await fetchFirst(`/api/metadata/databases?databaseId=${resolvedDatabaseId}`);
    sourceId = database?.sourceId ?? null;
  }

  return { sourceId, databaseId: resolvedDatabaseId, tableId };
}

export default function RelationshipsPage() {

  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<number | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  const [depth, setDepth] = useState(2);
  const [includeInferred, setIncludeInferred] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0.7);

  const [graphKey, setGraphKey] = useState(0); // 用于强制刷新图谱
  const [preselectError, setPreselectError] = useState<string | null>(null);
  // 预选失败后重试：递增后重新执行预选
  const [preselectAttempt, setPreselectAttempt] = useState(0);

  // 从URL参数初始化选择（从元数据浏览等页面跳转过来）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTableId = params.get('tableId');
    const urlDatabaseId = params.get('databaseId');
    if (!urlTableId && !urlDatabaseId) return;

    let cancelled = false;
    resolveUrlSelection(urlDatabaseId ? parseInt(urlDatabaseId) : null, urlTableId ? parseInt(urlTableId) : null)
      .then((selection) => {
        if (cancelled) return;
        if (selection.sourceId) setSelectedSourceId(selection.sourceId);
        if (selection.databaseId) setSelectedDatabaseId(selection.databaseId);
        if (selection.tableId) setSelectedTableId(selection.tableId);
      })
      .catch((err) => {
        if (!cancelled) setPreselectError(err instanceof Error ? err.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [preselectAttempt]);

  // 加载数据源列表
  const dataSourcesData = useAsyncData((signal) => fetchList('/api/datasources', signal), []);

  // 加载数据库列表（未选择数据源时为空）
  const databasesData = useAsyncData(
    (signal) => fetchList(`/api/metadata/databases?sourceId=${selectedSourceId}`, signal),
    [selectedSourceId],
    { enabled: !!selectedSourceId }
  );

  // 加载表列表（未选择数据库时为空）
  const tablesData = useAsyncData(
    (signal) => fetchList(`/api/metadata/tables?databaseId=${selectedDatabaseId}&limit=10000`, signal),
    [selectedDatabaseId],
    { enabled: !!selectedDatabaseId }
  );

  // 下拉列表加载失败（如限流）时提示，而不是显示为空列表
  const listErrors = [
    dataSourcesData.error && `数据源：${dataSourcesData.error}`,
    databasesData.error && `数据库：${databasesData.error}`,
    tablesData.error && `表：${tablesData.error}`,
    preselectError && `按链接预选：${preselectError}`,
  ].filter(Boolean);
  const retryLists = () => {
    if (dataSourcesData.error) dataSourcesData.reload();
    if (databasesData.error) databasesData.reload();
    if (tablesData.error) tablesData.reload();
    if (preselectError) {
      setPreselectError(null);
      setPreselectAttempt((n) => n + 1);
    }
  };

  const dataSources = dataSourcesData.data ?? [];
  const databases = databasesData.data ?? [];
  const tables = tablesData.data ?? [];

  // 清空数据源时同时清空数据库与中心表；清空数据库时清空中心表
  const handleSourceChange = (sourceId: number | null) => {
    setSelectedSourceId(sourceId);
    if (!sourceId) {
      setSelectedDatabaseId(null);
      setSelectedTableId(null);
    }
  };

  const handleDatabaseChange = (databaseId: number | null) => {
    setSelectedDatabaseId(databaseId);
    if (!databaseId) {
      setSelectedTableId(null);
    }
  };

  // 处理节点点击
  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };

  // 处理边点击
  const handleEdgeClick = (edge: GraphEdge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  // 刷新图谱
  const refreshGraph = () => {
    setGraphKey((prev) => prev + 1);
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  // 设置为中心表
  const handleSetAsCenter = (tableId: number) => {
    setSelectedTableId(tableId);

    // 更新URL参数
    const url = new URL(window.location.href);
    url.searchParams.set('tableId', tableId.toString());
    if (selectedDatabaseId) {
      url.searchParams.set('databaseId', selectedDatabaseId.toString());
    }
    window.history.replaceState({}, '', url.toString());

    // 刷新图谱
    refreshGraph();
  };

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div>
        <h1 className="text-2xl font-bold">关系图谱</h1>
        <p className="text-sm opacity-60 mt-1">可视化展示表之间的关联关系</p>
      </div>

      {/* 控制面板 */}
      <div className="bg-base-100 border border-base-300 rounded-xl p-4 lg:p-6">
        <h2 className="text-lg font-semibold mb-4">图谱配置</h2>

        {listErrors.length > 0 && (
          <div className="alert alert-warning mb-4">
            <span>加载失败，下拉列表可能不完整 —— {listErrors.join('；')}</span>
            <button className="btn btn-sm" onClick={retryLists}>
              重试
            </button>
          </div>
        )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {/* 数据源选择 */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm md:text-base">数据源</span>
                </label>
                <select
                  className="select select-bordered select-sm md:select-md"
                  value={selectedSourceId || ''}
                  onChange={(e) =>
                    handleSourceChange(e.target.value ? parseInt(e.target.value) : null)
                  }
                >
                  <option value="">选择数据源</option>
                  {dataSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 数据库选择 */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm md:text-base">数据库</span>
                </label>
                <select
                  className="select select-bordered select-sm md:select-md"
                  value={selectedDatabaseId || ''}
                  onChange={(e) =>
                    handleDatabaseChange(e.target.value ? parseInt(e.target.value) : null)
                  }
                  disabled={!selectedSourceId}
                >
                  <option value="">选择数据库</option>
                  {databases.map((db) => (
                    <option key={db.id} value={db.id}>
                      {db.databaseName}
                    </option>
                  ))}
                </select>
              </div>

              {/* 表选择 */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm md:text-base">中心表 (可选)</span>
                  {selectedTableId && (
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => {
                        setSelectedTableId(null);
                        // 清除URL参数
                        const url = new URL(window.location.href);
                        url.searchParams.delete('tableId');
                        window.history.replaceState({}, '', url.toString());
                        refreshGraph();
                      }}
                    >
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
                      清除
                    </button>
                  )}
                </label>
                <select
                  className="select select-bordered select-sm md:select-md"
                  value={selectedTableId || ''}
                  onChange={(e) => {
                    const newTableId = e.target.value ? parseInt(e.target.value) : null;
                    setSelectedTableId(newTableId);

                    // 更新URL参数
                    const url = new URL(window.location.href);
                    if (newTableId) {
                      url.searchParams.set('tableId', newTableId.toString());
                    } else {
                      url.searchParams.delete('tableId');
                    }
                    window.history.replaceState({}, '', url.toString());
                  }}
                  disabled={!selectedDatabaseId}
                >
                  <option value="">全部表</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.tableName}
                    </option>
                  ))}
                </select>
              </div>

              {/* 关系深度 */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm md:text-base">关系深度: {depth}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={depth}
                  className="range range-primary"
                  onChange={(e) => setDepth(parseInt(e.target.value))}
                />
                <div className="w-full flex justify-between text-xs px-2">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                </div>
              </div>
            </div>

            {/* 高级选项 */}
            <div className="divider">高级选项</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 包含推断关系 */}
              <div className="form-control">
                <label className="label cursor-pointer">
                  <span className="label-text text-sm md:text-base">包含推断关系</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={includeInferred}
                    onChange={(e) => setIncludeInferred(e.target.checked)}
                  />
                </label>
              </div>

              {/* 最小置信度 */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm md:text-base">
                    最小置信度: {(minConfidence * 100).toFixed(0)}%
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={minConfidence * 100}
                  className="range range-primary range-xs"
                  onChange={(e) => setMinConfidence(parseInt(e.target.value) / 100)}
                  disabled={!includeInferred}
                />
              </div>

              {/* 刷新按钮 */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">&nbsp;</span>
                </label>
                <button className="btn btn-primary" onClick={refreshGraph}>
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  刷新图谱
                </button>
              </div>
            </div>
      </div>

      {/* 主内容区 */}
        {selectedDatabaseId || selectedTableId ? (
          <>
            {/* 关系推断提示 */}
            <div className="alert alert-info mb-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="stroke-current shrink-0 w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <div>
                <h3 className="font-bold">未发现关系数据</h3>
                <div className="text-sm">
                  如果图谱中没有显示任何关系线,请先在
                  <a href="/datasources" className="link link-hover mx-1">
                    数据源管理页面
                  </a>
                  点击&ldquo;同步元数据&rdquo;按钮采集表关系,或使用&ldquo;推断关系&rdquo;功能生成AI推断的关系。
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 md:gap-6">
            {/* 左侧：关系图谱 */}
            <div className="lg:col-span-3 order-1">
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body p-0">
                  <div style={{ height: '400px' }} className="md:h-[500px] lg:h-[600px]">
                    <RelationshipGraph
                      key={graphKey}
                      tableId={selectedTableId || undefined}
                      dataSourceId={selectedSourceId || undefined}
                      databaseId={selectedDatabaseId || undefined}
                      depth={depth}
                      includeInferred={includeInferred}
                      minConfidence={minConfidence}
                      onNodeClick={handleNodeClick}
                      onEdgeClick={handleEdgeClick}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：详情面板 */}
            <div className="lg:col-span-1 order-2 space-y-4 md:space-y-6">
              {/* 关系详情 */}
              <RelationshipDetail
                selectedNode={selectedNode}
                selectedEdge={selectedEdge}
                onClose={() => {
                  setSelectedNode(null);
                  setSelectedEdge(null);
                }}
                onSetAsCenter={handleSetAsCenter}
              />

              {/* 验证面板 */}
              {selectedEdge && selectedEdge.type === 'inferred' && (
                <VerificationPanel selectedEdge={selectedEdge} onVerified={refreshGraph} />
              )}
            </div>
          </div>
          </>
        ) : (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="text-center py-12">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-24 w-24 mx-auto text-base-300 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                <h3 className="text-lg font-bold mb-2">请选择数据库或表</h3>
                <p className="text-base-content/60 mb-4">
                  从上方配置面板选择数据源和数据库,查看关系图谱
                </p>
                <div className="text-sm text-base-content/40">
                  <p>💡 提示:</p>
                  <p>- 选择数据库查看该库所有表的关系</p>
                  <p>- 选择中心表查看以该表为中心的关系网络</p>
                  <p>- 调整关系深度控制图谱显示范围</p>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
