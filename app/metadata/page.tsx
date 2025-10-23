'use client';

import { useEffect, useState } from 'react';
import MetadataTree from './components/MetadataTree';
import TableDetail from './components/TableDetail';
import ColumnList from './components/ColumnList';

export default function MetadataPage() {
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<number | null>(null);
  const [selectedTable, setSelectedTable] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载数据源列表
  useEffect(() => {
    loadDataSources();
  }, []);

  const loadDataSources = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/datasources');
      const result = await response.json();

      if (result.status === 'success') {
        setDataSources(result.data || []);
        // 自动选择第一个数据源
        if (result.data && result.data.length > 0) {
          setSelectedSource(result.data[0].id);
        }
      } else {
        throw new Error(result.message || 'Failed to load data sources');
      }
    } catch (err) {
      console.error('Error loading data sources:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data sources');
    } finally {
      setLoading(false);
    }
  };

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

  // 清除选择
  const handleClearSelection = () => {
    setSelectedTable(null);
    setSelectedDatabase(null);
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* 页面头部 */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <a href="/" className="btn btn-ghost normal-case text-xl">Galileo</a>
          <div className="breadcrumbs text-sm ml-4">
            <ul>
              <li><a href="/">首页</a></li>
              <li>元数据浏览</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <a href="/datasources" className="btn btn-outline btn-sm">
            数据源管理
          </a>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="container mx-auto p-6">
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <div className="form-control">
              <div className="input-group">
                <input
                  type="text"
                  placeholder="搜索数据库、表或字段..."
                  className="input input-bordered flex-1"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                <button
                  className="btn btn-square btn-primary"
                  onClick={() => handleSearch(searchQuery)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
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
                <span className="label-text-alt">
                  输入至少 2 个字符开始搜索，搜索范围：数据库名、表名、字段名
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* 搜索结果 */}
        {searchResults && (
          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body">
              <h2 className="card-title">
                搜索结果
                <div className="badge badge-primary">
                  {(searchResults.databases?.length || 0) +
                    (searchResults.tables?.length || 0) +
                    (searchResults.columns?.length || 0)} 项
                </div>
              </h2>

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
          </div>
        )}

        {/* 主要内容区 - 双栏布局 */}
        {!searchResults && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：元数据树 */}
            <div className="lg:col-span-1">
              <div className="card bg-base-100 shadow-xl sticky top-6">
                <div className="card-body">
                  <h2 className="card-title">元数据树</h2>
                  {loading ? (
                    <div className="flex justify-center items-center py-12">
                      <span className="loading loading-spinner loading-lg"></span>
                    </div>
                  ) : error ? (
                    <div className="alert alert-error">
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
            <div className="lg:col-span-2">
              {selectedTable ? (
                <>
                  {/* 表详情 */}
                  <div className="card bg-base-100 shadow-xl mb-6">
                    <div className="card-body">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="card-title">表详情</h2>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={handleClearSelection}
                        >
                          清除选择
                        </button>
                      </div>
                      <TableDetail table={selectedTable} />
                    </div>
                  </div>

                  {/* 字段列表 */}
                  <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                      <h2 className="card-title">字段列表</h2>
                      <ColumnList tableId={selectedTable.id} />
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
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <h3 className="text-lg font-bold mb-2">请选择一个表</h3>
                      <p className="text-base-content/60 mb-4">
                        从左侧树形结构中选择一个表，查看详细信息
                      </p>
                      <div className="text-sm text-base-content/40">
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
    </div>
  );
}
