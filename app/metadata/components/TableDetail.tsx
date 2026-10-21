'use client';

import { useState } from 'react';
import { apiFetch, formatApiError } from '@/lib/client/api-fetch';

interface TableDetailProps {
  table: any;
}

export default function TableDetail({ table }: TableDetailProps) {
  const [description, setDescription] = useState<string | null>(table.semanticDescription ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const startEditing = () => {
    setDraft(description ?? '');
    setSaveError(null);
    setEditing(true);
  };

  // 保存语义描述（需要元数据管理权限）
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    const res = await apiFetch<{ semanticDescription: string | null }>(`/api/metadata/tables/${table.id}`, {
      method: 'PUT',
      json: { semanticDescription: draft },
    });

    if (res.ok) {
      setDescription(res.data.semanticDescription);
      setEditing(false);
    } else {
      setSaveError(formatApiError(res.error));
    }
    setSaving(false);
  };

  // 格式化数字
  const formatNumber = (num: number | bigint | null) => {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString();
  };

  // 格式化日期
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  return (
    <div className="space-y-4">
      {/* 基本信息 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="stat bg-base-200 rounded-lg">
          <div className="stat-title">表名</div>
          <div className="stat-value text-2xl">{table.tableName}</div>
          {table.tableComment && (
            <div className="stat-desc">{table.tableComment}</div>
          )}
        </div>

        <div className="stat bg-base-200 rounded-lg">
          <div className="stat-title">数据行数</div>
          <div className="stat-value text-2xl">{formatNumber(table.rowCount)}</div>
          <div className="stat-desc">预估值</div>
        </div>
      </div>

      {/* 语义描述 */}
      <div className="card bg-base-200">
        <div className="card-body p-4 gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">语义描述</h3>
            {!editing && (
              <button className="btn btn-xs btn-ghost" onClick={startEditing}>
                编辑
              </button>
            )}
          </div>

          {editing ? (
            <>
              <textarea
                className="textarea textarea-bordered w-full text-sm"
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="描述这张表的业务含义（表没有数据库注释时，SQL 生成会使用该描述）"
              />
              {saveError && <div className="text-error text-sm whitespace-pre-line">{saveError}</div>}
              <div className="flex gap-2">
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                  {saving && <span className="loading loading-spinner loading-xs" />}
                  保存
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
                  取消
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm opacity-80">{description || '暂无描述'}</div>
          )}
        </div>
      </div>

      {/* 详细信息 */}
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full">
          <tbody>
            <tr>
              <td className="font-bold">表 ID</td>
              <td>{table.id}</td>
            </tr>
            <tr>
              <td className="font-bold">所属数据库</td>
              <td>
                {table.database?.databaseName || '-'}
                {table.database?.semanticDescription && (
                  <div className="text-sm text-base-content/60 mt-1">
                    {table.database.semanticDescription}
                  </div>
                )}
              </td>
            </tr>
            <tr>
              <td className="font-bold">创建时间</td>
              <td>{formatDate(table.createdTime)}</td>
            </tr>
            <tr>
              <td className="font-bold">更新时间</td>
              <td>{formatDate(table.updatedTime)}</td>
            </tr>
            <tr>
              <td className="font-bold">最后同步时间</td>
              <td>{formatDate(table.lastSyncedAt)}</td>
            </tr>
            {table.structureHash && (
              <tr>
                <td className="font-bold">结构哈希</td>
                <td>
                  <code className="text-xs bg-base-200 px-2 py-1 rounded">
                    {table.structureHash.substring(0, 16)}...
                  </code>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 统计信息 */}
      <div className="stats stats-vertical lg:stats-horizontal shadow w-full">
        <div className="stat">
          <div className="stat-title">字段数量</div>
          <div className="stat-value text-primary">
            {table._count?.columns || table.columns?.length || 0}
          </div>
          <div className="stat-desc">包含所有字段类型</div>
        </div>

        <div className="stat">
          <div className="stat-title">主键数量</div>
          <div className="stat-value text-secondary">
            {table.columns?.filter((c: any) => c.isPrimaryKey).length || 0}
          </div>
          <div className="stat-desc">唯一标识字段</div>
        </div>

        <div className="stat">
          <div className="stat-title">关系数量</div>
          <div className="stat-value text-accent">
            {(table._count?.sourceRelationships || 0) +
              (table._count?.targetRelationships || 0)}
          </div>
          <div className="stat-desc">显式 + 推断关系</div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <a
          href={`/relationships?tableId=${table.id}&databaseId=${table.databaseId}`}
          className="btn btn-primary btn-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
          查看关系图谱
        </a>

        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            // 复制表名
            navigator.clipboard.writeText(table.tableName);
            alert('表名已复制到剪贴板');
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
          </svg>
          复制表名
        </button>
      </div>
    </div>
  );
}
