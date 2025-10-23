'use client';

import { useState, useEffect } from 'react';

interface MetadataTreeProps {
  dataSources: any[];
  selectedSource: number | null;
  selectedDatabase: number | null;
  selectedTable: any | null;
  onSourceSelect: (sourceId: number) => void;
  onDatabaseSelect: (databaseId: number) => void;
  onTableSelect: (table: any) => void;
}

export default function MetadataTree({
  dataSources,
  selectedSource,
  selectedDatabase,
  selectedTable,
  onSourceSelect,
  onDatabaseSelect,
  onTableSelect,
}: MetadataTreeProps) {
  const [databases, setDatabases] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState<Set<number>>(new Set());
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);

  // 加载数据库列表
  useEffect(() => {
    if (selectedSource) {
      loadDatabases(selectedSource);
      setExpandedSources(new Set([selectedSource]));
    }
  }, [selectedSource]);

  // 加载表列表
  useEffect(() => {
    if (selectedDatabase) {
      loadTables(selectedDatabase);
      setExpandedDatabases(new Set([selectedDatabase]));
    }
  }, [selectedDatabase]);

  const loadDatabases = async (sourceId: number) => {
    try {
      setLoadingDatabases(true);
      const response = await fetch(`/api/metadata/databases?sourceId=${sourceId}`);
      const result = await response.json();

      if (result.status === 'success') {
        setDatabases(result.data || []);
      }
    } catch (err) {
      console.error('Error loading databases:', err);
    } finally {
      setLoadingDatabases(false);
    }
  };

  const loadTables = async (databaseId: number) => {
    try {
      setLoadingTables(true);
      const response = await fetch(`/api/metadata/tables?databaseId=${databaseId}`);
      const result = await response.json();

      if (result.status === 'success') {
        setTables(result.data || []);
      }
    } catch (err) {
      console.error('Error loading tables:', err);
    } finally {
      setLoadingTables(false);
    }
  };

  const toggleSource = (sourceId: number) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(sourceId)) {
      newExpanded.delete(sourceId);
    } else {
      newExpanded.add(sourceId);
    }
    setExpandedSources(newExpanded);
    onSourceSelect(sourceId);
  };

  const toggleDatabase = (databaseId: number) => {
    const newExpanded = new Set(expandedDatabases);
    if (newExpanded.has(databaseId)) {
      newExpanded.delete(databaseId);
    } else {
      newExpanded.add(databaseId);
    }
    setExpandedDatabases(newExpanded);
    onDatabaseSelect(databaseId);
  };

  return (
    <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
      {dataSources.length === 0 ? (
        <div className="text-center py-8 text-base-content/60">
          <p>暂无数据源</p>
          <a href="/datasources" className="btn btn-sm btn-primary mt-4">
            添加数据源
          </a>
        </div>
      ) : (
        dataSources.map((source) => (
          <div key={source.id} className="border border-base-300 rounded-lg">
            {/* 数据源 */}
            <div
              className={`p-3 cursor-pointer hover:bg-base-200 rounded-t-lg ${
                selectedSource === source.id ? 'bg-primary/10' : ''
              }`}
              onClick={() => toggleSource(source.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 transition-transform ${
                      expandedSources.has(source.id) ? 'rotate-90' : ''
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-primary"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
                    <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
                    <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
                  </svg>
                  <span className="font-medium">{source.name}</span>
                </div>
                <div className="badge badge-sm badge-ghost">{source.type.toUpperCase()}</div>
              </div>
            </div>

            {/* 数据库列表 */}
            {expandedSources.has(source.id) && (
              <div className="pl-6 pb-2">
                {loadingDatabases ? (
                  <div className="flex items-center gap-2 p-2 text-base-content/60">
                    <span className="loading loading-spinner loading-sm"></span>
                    <span>加载中...</span>
                  </div>
                ) : databases.length === 0 ? (
                  <div className="p-2 text-sm text-base-content/60">
                    暂无数据库（请先同步元数据）
                  </div>
                ) : (
                  databases.map((db) => (
                    <div key={db.id} className="mt-1">
                      <div
                        className={`p-2 cursor-pointer hover:bg-base-200 rounded ${
                          selectedDatabase === db.id ? 'bg-info/10' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDatabase(db.id);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-3 w-3 transition-transform ${
                              expandedDatabases.has(db.id) ? 'rotate-90' : ''
                            }`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 text-info"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM2 12a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z" />
                          </svg>
                          <span className="text-sm">{db.databaseName}</span>
                        </div>
                        {db.semanticDescription && (
                          <div className="text-xs text-base-content/60 ml-7 mt-1">
                            {db.semanticDescription}
                          </div>
                        )}
                      </div>

                      {/* 表列表 */}
                      {expandedDatabases.has(db.id) && (
                        <div className="pl-6 mt-1">
                          {loadingTables ? (
                            <div className="flex items-center gap-2 p-2 text-base-content/60">
                              <span className="loading loading-spinner loading-xs"></span>
                              <span className="text-xs">加载中...</span>
                            </div>
                          ) : tables.length === 0 ? (
                            <div className="p-2 text-xs text-base-content/60">暂无表</div>
                          ) : (
                            tables.map((table) => (
                              <div
                                key={table.id}
                                className={`p-2 cursor-pointer hover:bg-base-200 rounded ${
                                  selectedTable?.id === table.id ? 'bg-success/10' : ''
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTableSelect(table);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4 text-success"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  <span className="text-sm font-medium">{table.tableName}</span>
                                </div>
                                {table.tableComment && (
                                  <div className="text-xs text-base-content/60 ml-6 mt-1">
                                    {table.tableComment}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
