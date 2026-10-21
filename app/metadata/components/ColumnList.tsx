/**
 * 字段列表组件
 *
 * 功能：
 * - 展示表的字段信息
 * - 支持编辑字段的语义描述
 * - 支持复制字段名和DDL
 *
 * @author xusy
 */

'use client';

import React, { useState } from 'react';
import { useAsyncData } from '@/lib/client/use-async-data';

interface ColumnListProps {
  tableId: number;
}

export default function ColumnList({ tableId }: ColumnListProps) {
  // 保存后的语义描述（覆盖加载结果，避免重新请求整张表的字段）
  const [savedDescriptions, setSavedDescriptions] = useState<
    Record<number, { semanticDescription: string | null; semanticSource: string | null }>
  >({});
  const [expandedColumn, setExpandedColumn] = useState<number | null>(null);

  // 编辑语义描述的状态
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);

  const columnsData = useAsyncData(async (signal) => {
    const response = await fetch(`/api/metadata/columns?tableId=${tableId}`, { signal });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Failed to load columns');
    }
    return (result.data || []) as any[];
  }, [tableId]);
  const { loading, error } = columnsData;
  const columns = (columnsData.data ?? []).map((col) =>
    savedDescriptions[col.id] ? { ...col, ...savedDescriptions[col.id] } : col
  );

  const toggleColumn = (columnId: number) => {
    setExpandedColumn(expandedColumn === columnId ? null : columnId);
  };

  /**
   * 开始编辑语义描述
   */
  const handleStartEdit = (column: any) => {
    setEditingColumnId(column.id);
    setEditingDescription(column.semanticDescription || '');
  };

  /**
   * 取消编辑
   */
  const handleCancelEdit = () => {
    setEditingColumnId(null);
    setEditingDescription('');
  };

  /**
   * 保存语义描述
   */
  const handleSaveDescription = async (columnId: number) => {
    try {
      setSavingDescription(true);

      const response = await fetch(`/api/metadata/columns/${columnId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semanticDescription: editingDescription,
        }),
      });

      const result = await response.json();

      if (result.status === 'success') {
        // 更新本地数据
        setSavedDescriptions((prev) => ({
          ...prev,
          [columnId]: {
            semanticDescription: result.data.semanticDescription,
            semanticSource: result.data.semanticSource,
          },
        }));

        setEditingColumnId(null);
        setEditingDescription('');
      } else {
        throw new Error(result.message || '保存失败');
      }
    } catch (err) {
      console.error('保存语义描述失败:', err);
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingDescription(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span>{error}</span>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/60">
        <p>该表暂无字段信息</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 统计信息 */}
      <div className="stats shadow w-full">
        <div className="stat">
          <div className="stat-title">总字段数</div>
          <div className="stat-value text-primary">{columns.length}</div>
        </div>
        <div className="stat">
          <div className="stat-title">主键字段</div>
          <div className="stat-value text-secondary">
            {columns.filter((c) => c.isPrimaryKey).length}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">唯一字段</div>
          <div className="stat-value text-accent">
            {columns.filter((c) => c.isUnique).length}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">可空字段</div>
          <div className="stat-value">
            {columns.filter((c) => c.isNullable).length}
          </div>
        </div>
      </div>

      {/* 字段列表 */}
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>#</th>
              <th>字段名</th>
              <th>数据类型</th>
              <th>属性</th>
              <th>默认值</th>
              <th>注释</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column, index) => (
              <React.Fragment key={column.id}>
                <tr className="hover">
                  <td>{column.ordinalPosition || index + 1}</td>
                  <td>
                    <div className="font-medium">{column.columnName}</div>
                  </td>
                  <td>
                    <div className="badge badge-outline">{column.dataType}</div>
                    <div className="text-xs text-base-content/60 mt-1">
                      {column.columnType}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {column.isPrimaryKey && (
                        <div className="badge badge-warning badge-sm">PK</div>
                      )}
                      {column.isUnique && (
                        <div className="badge badge-info badge-sm">UNIQUE</div>
                      )}
                      {column.isNullable && (
                        <div className="badge badge-ghost badge-sm">NULL</div>
                      )}
                      {!column.isNullable && (
                        <div className="badge badge-error badge-sm">NOT NULL</div>
                      )}
                    </div>
                  </td>
                  <td>
                    {column.defaultValue ? (
                      <code className="text-xs bg-base-200 px-2 py-1 rounded">
                        {column.defaultValue}
                      </code>
                    ) : (
                      <span className="text-base-content/40">-</span>
                    )}
                  </td>
                  <td>
                    {column.columnComment ? (
                      <div className="max-w-xs">
                        <p className="text-sm truncate" title={column.columnComment}>
                          {column.columnComment}
                        </p>
                      </div>
                    ) : (
                      <span className="text-base-content/40">-</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => toggleColumn(column.id)}
                    >
                      {expandedColumn === column.id ? '收起' : '详情'}
                    </button>
                  </td>
                </tr>

                {/* 展开的详情行 */}
                {expandedColumn === column.id && (
                  <tr>
                    <td colSpan={7}>
                      <div className="p-4 bg-base-200 rounded-lg space-y-3">
                        {/* 语义描述 */}
                        <div className="alert alert-info">
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
                          <div className="w-full">
                            <div className="flex justify-between items-start">
                              <h4 className="font-bold">语义描述</h4>
                              {editingColumnId !== column.id && (
                                <button
                                  className="btn btn-xs btn-ghost"
                                  onClick={() => handleStartEdit(column)}
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
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                  编辑
                                </button>
                              )}
                            </div>

                            {editingColumnId === column.id ? (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  className="textarea textarea-bordered w-full"
                                  rows={3}
                                  value={editingDescription}
                                  onChange={(e) => setEditingDescription(e.target.value)}
                                  placeholder="请输入语义描述..."
                                />
                                <div className="flex gap-2">
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleSaveDescription(column.id)}
                                    disabled={savingDescription}
                                  >
                                    {savingDescription ? (
                                      <>
                                        <span className="loading loading-spinner loading-xs"></span>
                                        保存中...
                                      </>
                                    ) : (
                                      '保存'
                                    )}
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={handleCancelEdit}
                                    disabled={savingDescription}
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="text-sm mt-1">
                                  {column.semanticDescription || (
                                    <span className="text-base-content/40 italic">
                                      暂无语义描述
                                    </span>
                                  )}
                                </div>
                                {column.semanticSource && (
                                  <div className="text-xs mt-1">
                                    来源:
                                    <span className="badge badge-xs ml-1">
                                      {column.semanticSource === 'rule' && '规则引擎'}
                                      {column.semanticSource === 'ai' && 'AI 推断'}
                                      {column.semanticSource === 'manual' && '手动标注'}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* 详细信息表格 */}
                        <div className="overflow-x-auto">
                          <table className="table table-sm w-full">
                            <tbody>
                              <tr>
                                <td className="font-bold">字段 ID</td>
                                <td>{column.id}</td>
                              </tr>
                              <tr>
                                <td className="font-bold">完整类型</td>
                                <td>
                                  <code className="text-xs bg-base-300 px-2 py-1 rounded">
                                    {column.columnType}
                                  </code>
                                </td>
                              </tr>
                              <tr>
                                <td className="font-bold">是否可空</td>
                                <td>
                                  {column.isNullable ? (
                                    <span className="badge badge-success">是</span>
                                  ) : (
                                    <span className="badge badge-error">否</span>
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="font-bold">是否主键</td>
                                <td>
                                  {column.isPrimaryKey ? (
                                    <span className="badge badge-warning">是</span>
                                  ) : (
                                    <span className="badge badge-ghost">否</span>
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="font-bold">是否唯一</td>
                                <td>
                                  {column.isUnique ? (
                                    <span className="badge badge-info">是</span>
                                  ) : (
                                    <span className="badge badge-ghost">否</span>
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="font-bold">默认值</td>
                                <td>
                                  {column.defaultValue ? (
                                    <code className="text-xs bg-base-300 px-2 py-1 rounded">
                                      {column.defaultValue}
                                    </code>
                                  ) : (
                                    <span className="text-base-content/40">无</span>
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="font-bold">顺序位置</td>
                                <td>{column.ordinalPosition}</td>
                              </tr>
                              {column.columnComment && (
                                <tr>
                                  <td className="font-bold">字段注释</td>
                                  <td>{column.columnComment}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* 关系信息 */}
                        {(column.sourceRelationships?.length > 0 ||
                          column.targetRelationships?.length > 0) && (
                          <div>
                            <h4 className="font-bold mb-2">关系信息</h4>
                            <div className="space-y-2">
                              {column.sourceRelationships?.map((rel: any) => (
                                <div key={rel.id} className="badge badge-primary">
                                  → {rel.targetTable?.tableName}.{rel.targetColumn?.columnName}
                                </div>
                              ))}
                              {column.targetRelationships?.map((rel: any) => (
                                <div key={rel.id} className="badge badge-secondary">
                                  ← {rel.sourceTable?.tableName}.{rel.sourceColumn?.columnName}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 操作按钮 */}
                        <div className="flex gap-2">
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={() => {
                              navigator.clipboard.writeText(column.columnName);
                              alert('字段名已复制');
                            }}
                          >
                            复制字段名
                          </button>
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={() => {
                              const ddl = `${column.columnName} ${column.columnType}${
                                !column.isNullable ? ' NOT NULL' : ''
                              }${column.defaultValue ? ` DEFAULT ${column.defaultValue}` : ''}${
                                column.columnComment ? ` COMMENT '${column.columnComment}'` : ''
                              }`;
                              navigator.clipboard.writeText(ddl);
                              alert('DDL 已复制');
                            }}
                          >
                            复制 DDL
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
