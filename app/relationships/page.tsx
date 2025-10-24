'use client';

import { useEffect, useState } from 'react';
import RelationshipGraph from './components/RelationshipGraph';
import RelationshipDetail from './components/RelationshipDetail';
import VerificationPanel from './components/VerificationPanel';

interface GraphNode {
  id: number;
  label: string;
  type: 'table';
  databaseId: number;
  databaseName: string;
  tableId: number;
}

interface GraphEdge {
  id: string;
  source: number;
  target: number;
  type: 'explicit' | 'inferred';
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
  confidence?: number;
  sourceColumn: string;
  targetColumn: string;
  isVerified?: boolean;
}

export default function RelationshipsPage() {
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);

  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<number | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  const [depth, setDepth] = useState(2);
  const [includeInferred, setIncludeInferred] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0.7);

  const [graphKey, setGraphKey] = useState(0); // 用于强制刷新图谱
  const [isInitializing, setIsInitializing] = useState(true); // 标记是否正在初始化

  // 从URL参数初始化选择
  useEffect(() => {
    const initializeFromUrl = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlTableId = params.get('tableId');
      const urlDatabaseId = params.get('databaseId');

      if (urlDatabaseId) {
        const dbId = parseInt(urlDatabaseId);
        // 先加载数据库信息获取sourceId
        await loadSourceByDatabaseId(dbId);
        setSelectedDatabaseId(dbId);
      }

      if (urlTableId) {
        setSelectedTableId(parseInt(urlTableId));
      }

      setIsInitializing(false);
    };

    initializeFromUrl();
  }, []);

  // 根据数据库ID加载对应的数据源
  const loadSourceByDatabaseId = async (databaseId: number) => {
    try {
      const response = await fetch(`/api/metadata/databases?databaseId=${databaseId}`);
      const result = await response.json();

      if (result.status === 'success' && result.data && result.data.length > 0) {
        const database = result.data[0];
        setSelectedSourceId(database.sourceId);
      }
    } catch (err) {
      console.error('Error loading source by database ID:', err);
    }
  };

  // 加载数据源列表
  useEffect(() => {
    loadDataSources();
  }, []);

  const loadDataSources = async () => {
    try {
      const response = await fetch('/api/datasources');
      const result = await response.json();

      if (result.status === 'success') {
        setDataSources(result.data || []);
      }
    } catch (err) {
      console.error('Error loading data sources:', err);
    }
  };

  // 加载数据库列表
  useEffect(() => {
    if (selectedSourceId) {
      loadDatabases(selectedSourceId);
    } else if (!isInitializing) {
      // 只在非初始化状态下清空
      setDatabases([]);
      setSelectedDatabaseId(null);
    }
  }, [selectedSourceId, isInitializing]);

  const loadDatabases = async (sourceId: number) => {
    try {
      const response = await fetch(`/api/metadata/databases?sourceId=${sourceId}`);
      const result = await response.json();

      if (result.status === 'success') {
        setDatabases(result.data || []);
      }
    } catch (err) {
      console.error('Error loading databases:', err);
    }
  };

  // 加载表列表
  useEffect(() => {
    if (selectedDatabaseId) {
      loadTables(selectedDatabaseId);
    } else if (!isInitializing) {
      // 只在非初始化状态下清空
      setTables([]);
      setSelectedTableId(null);
    }
  }, [selectedDatabaseId, isInitializing]);

  const loadTables = async (databaseId: number) => {
    try {
      const response = await fetch(`/api/metadata/tables?databaseId=${databaseId}`);
      const result = await response.json();

      if (result.status === 'success') {
        setTables(result.data || []);
      }
    } catch (err) {
      console.error('Error loading tables:', err);
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
  const handleSetAsCenter = (tableId: number, databaseId: number) => {
    setSelectedTableId(tableId);

    // 如果当前数据库ID不同，需要切换数据库
    if (selectedDatabaseId !== databaseId) {
      setSelectedDatabaseId(databaseId);
      // 重新加载数据源信息
      loadSourceByDatabaseId(databaseId);
    }

    // 更新URL参数
    const url = new URL(window.location.href);
    url.searchParams.set('tableId', tableId.toString());
    url.searchParams.set('databaseId', databaseId.toString());
    window.history.replaceState({}, '', url.toString());

    // 刷新图谱
    refreshGraph();
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
              <li>
                <a href="/">首页</a>
              </li>
              <li>关系图谱</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <a href="/datasources" className="btn btn-outline btn-sm">
            数据源管理
          </a>
          <a href="/metadata" className="btn btn-outline btn-sm">
            元数据浏览
          </a>
        </div>
      </div>

      {/* 控制面板 */}
      <div className="container mx-auto p-6">
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title">图谱配置</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 数据源选择 */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">数据源</span>
                </label>
                <select
                  className="select select-bordered"
                  value={selectedSourceId || ''}
                  onChange={(e) =>
                    setSelectedSourceId(e.target.value ? parseInt(e.target.value) : null)
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
                  <span className="label-text">数据库</span>
                </label>
                <select
                  className="select select-bordered"
                  value={selectedDatabaseId || ''}
                  onChange={(e) =>
                    setSelectedDatabaseId(e.target.value ? parseInt(e.target.value) : null)
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
                  <span className="label-text">中心表 (可选)</span>
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
                  className="select select-bordered"
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
                  <span className="label-text">关系深度: {depth}</span>
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
                  <span className="label-text">包含推断关系</span>
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
                  <span className="label-text">
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
                  点击"同步元数据"按钮采集表关系,或使用"推断关系"功能生成AI推断的关系。
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* 左侧：关系图谱 */}
            <div className="lg:col-span-3">
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body p-0">
                  <div style={{ height: '600px' }}>
                    <RelationshipGraph
                      key={graphKey}
                      tableId={selectedTableId || undefined}
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
            <div className="lg:col-span-1 space-y-6">
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
    </div>
  );
}
