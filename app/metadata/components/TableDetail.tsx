'use client';

interface TableDetailProps {
  table: any;
}

export default function TableDetail({ table }: TableDetailProps) {
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
      {table.semanticDescription && (
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
          <div>
            <h3 className="font-bold">AI 语义描述</h3>
            <div className="text-sm">{table.semanticDescription}</div>
          </div>
        </div>
      )}

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
