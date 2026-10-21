'use client';

import { useEffect, useState } from 'react';
import { useAsyncData } from '@/lib/client/use-async-data';
import MetadataTree from './components/MetadataTree';
import TableDetail from './components/TableDetail';
import ColumnList from './components/ColumnList';

export default function MetadataPage() {
  // 用户选择的数据源；未选择时默认第一个数据源
  const [chosenSource, setSelectedSource] = useState<number | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<number | null>(null);
  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);

  // 加载数据源列表
  const dataSourcesData = useAsyncData(async (signal) => {
    const response = await fetch('/api/datasources', { signal });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Failed to load data sources');
    }
    return (result.data || []) as any[];
  }, []);
  const dataSources = dataSourcesData.data ?? [];
  const { loading, error } = dataSourcesData;
  const selectedSource = chosenSource ?? dataSources[0]?.id ?? null;

  // 从URL参数加载表（如从关系图谱跳转过来）
  useEffect(() => {
    const tableId = new URLSearchParams(window.location.search).get('tableId');
    if (!tableId) return;

    const controller = new AbortController();
    fetch(`/api/metadata/tables?tableId=${parseInt(tableId)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (result.status === 'success' && result.data && result.data.length > 0) {
          const table = result.data[0];
          setSelectedTable(table);
          setSelectedDatabase(table.databaseId);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) console.error('Error loading table by ID:', err);
      });
    return () => controller.abort();
  }, []);

  // 搜索元数据
  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        type: 'all',
      });

      if (selectedSource) {
        params.append('sourceId', selectedSource.toString());
      }

      const response = await fetch(`/api/metadata/search?${params}`);
      const result = await response.json();

      if (result.status === 'success') {
        setSearchResults(result.data);
      } else {
        throw new Error(result.message || 'Search failed');
      }
    } catch (err) {
      console.error('Error searching metadata:', err);
      alert(err instanceof Error ? err.message : 'Search failed');
    }
  };

  // 处理搜索输入
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    // 实时搜索（防抖）
    if (query.length >= 2) {
      const timeoutId = setTimeout(() => {
        handleSearch(query);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults(null);
    }
  };

  // 选择表
  const handleTableSelect = (table: any) => {
    setSelectedTable(table);
    setSearchResults(null); // 清除搜索结果
  };

  // 清除选择：回到第一个数据源，并刷新数据源列表
  const handleClearSelection = () => {
    setSelectedTable(null);
    setSelectedDatabase(null);
    setSelectedSource(null);
    dataSourcesData.reload();
  };

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">元数据浏览</h1>
          <p className="text-sm opacity-60 mt-1">浏览数据库、表结构和字段信息</p>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="bg-base-100 border border-base-300 rounded-xl p-4">
        <div className="form-control">
          <div className="input-group">
                <input
                  type="text"
                  placeholder="搜索数据库、表或字段..."
                  className="input input-bordered flex-1 input-sm md:input-md"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                <button
                  className="btn btn-square btn-primary btn-sm md:btn-md"
                  onClick={() => handleSearch(searchQuery)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 md:h-6 md:w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </button>
              </div>
          <label className="label">
            <span className="label-text-alt text-xs">
              输入至少 2 个字符开始搜索，搜索范围：数据库名、表名、字段名
            </span>
          </label>
        </div>
      </div>

      {/* 搜索结果 */}
      {searchResults && (
        <div className="bg-base-100 border border-base-300 rounded-xl p-4 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold">搜索结果</h2>
            <span className="badge badge-primary">
              {(searchResults.databases?.length || 0) +
                (searchResults.tables?.length || 0) +
                (searchResults.columns?.length || 0)} 项
            </span>
          </div>

              {/* 数据库结果 */}
              {searchResults.databases && searchResults.databases.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-bold mb-2">数据库 ({searchResults.databases.length})</h3>
                  <div className="space-y-2">
                    {searchResults.databases.map((db: any) => (
                      <div key={db.id} className="p-3 bg-base-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{db.databaseName}</div>
                            {db.semanticDescription && (
                              <div className="text-sm text-base-content/60">
                                {db.semanticDescription}
                              </div>
                            )}
                          </div>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => {
                              setSelectedSource(db.sourceId);
                              setSelectedDatabase(db.id);
                              setSearchResults(null);
                            }}
                          >
                            查看
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 表结果 */}
              {searchResults.tables && searchResults.tables.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-bold mb-2">表 ({searchResults.tables.length})</h3>
                  <div className="space-y-2">
                    {searchResults.tables.map((table: any) => (
                      <div key={table.id} className="p-3 bg-base-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{table.tableName}</div>
                            {table.tableComment && (
                              <div className="text-sm text-base-content/60">
                                {table.tableComment}
                              </div>
                            )}
                            {table.semanticDescription && (
                              <div className="text-sm text-info">
                                💡 {table.semanticDescription}
                              </div>
                            )}
                          </div>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleTableSelect(table)}
                          >
                            查看详情
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 字段结果 */}
              {searchResults.columns && searchResults.columns.length > 0 && (
                <div>
                  <h3 className="font-bold mb-2">字段 ({searchResults.columns.length})</h3>
                  <div className="space-y-2">
                    {searchResults.columns.map((column: any) => (
                      <div key={column.id} className="p-3 bg-base-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{column.columnName}</span>
                              <span className="badge badge-sm">{column.dataType}</span>
                              {column.isPrimaryKey && (
                                <span className="badge badge-warning badge-sm">PK</span>
                              )}
                            </div>
                            {column.columnComment && (
                              <div className="text-sm text-base-content/60">
                                {column.columnComment}
                              </div>
                            )}
                            {column.semanticDescription && (
                              <div className="text-sm text-info">
                                💡 {column.semanticDescription}
                              </div>
                            )}
                            <div className="text-xs text-base-content/40 mt-1">
                              表: {column.table?.tableName || '未知'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

          {/* 无结果 */}
          {(!searchResults.databases || searchResults.databases.length === 0) &&
            (!searchResults.tables || searchResults.tables.length === 0) &&
            (!searchResults.columns || searchResults.columns.length === 0) && (
              <div className="text-center py-8">
                <p className="text-base-content/60">未找到匹配的结果</p>
              </div>
            )}
        </div>
      )}

      {/* 主要内容区 - 响应式双栏布局 */}
      {!searchResults && (
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6">
            {/* 左侧：元数据树 */}
            <div className="lg:col-span-1 order-2 lg:order-1">
              <div className="card bg-base-100 shadow-xl lg:sticky lg:top-6">
                <div className="card-body p-4 md:p-6">
                  <h2 className="card-title text-lg md:text-xl">元数据树</h2>
                  {loading ? (
                    <div className="flex justify-center items-center py-8 md:py-12">
                      <span className="loading loading-spinner loading-md md:loading-lg"></span>
                    </div>
                  ) : error ? (
                    <div className="alert alert-error text-sm">
                      <span>{error}</span>
                    </div>
                  ) : (
                    <MetadataTree
                      dataSources={dataSources}
                      selectedSource={selectedSource}
                      selectedDatabase={selectedDatabase}
                      selectedTable={selectedTable}
                      onSourceSelect={setSelectedSource}
                      onDatabaseSelect={setSelectedDatabase}
                      onTableSelect={handleTableSelect}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：详情展示 */}
            <div className="lg:col-span-2 order-1 lg:order-2">
              {selectedTable ? (
                <>
                  {/* 表详情 */}
                  <div className="card bg-base-100 shadow-xl mb-4 md:mb-6">
                    <div className="card-body p-4 md:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="card-title text-lg md:text-xl">表详情</h2>
                        <button
                          className="btn btn-xs md:btn-sm btn-ghost"
                          onClick={handleClearSelection}
                        >
                          清除选择
                        </button>
                      </div>
                      <TableDetail
                        // 切换表或描述在其他地方被修改时重新挂载，重置编辑状态
                        key={`${selectedTable.id}:${selectedTable.semanticDescription ?? ''}`}
                        table={selectedTable}
                      />
                    </div>
                  </div>

                  {/* 字段列表 */}
                  <div className="card bg-base-100 shadow-xl">
                    <div className="card-body p-4 md:p-6">
                      <h2 className="card-title text-lg md:text-xl">字段列表</h2>
                      <ColumnList tableId={selectedTable.id} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="card bg-base-100 shadow-xl">
                  <div className="card-body p-4 md:p-6">
                    <div className="text-center py-8 md:py-12">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-16 w-16 md:h-24 md:w-24 mx-auto text-base-300 mb-4"
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
                      <h3 className="text-base md:text-lg font-bold mb-2">请选择一个表</h3>
                      <p className="text-sm md:text-base text-base-content/60 mb-4">
                        从左侧树形结构中选择一个表，查看详细信息
                      </p>
                      <div className="text-xs md:text-sm text-base-content/40">
                        💡 提示：您也可以使用上方的搜索功能快速查找元数据
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
