'use client';

interface DataSource {
  id: number;
  name: string;
  type: string;
  host: string;
  port: number;
  username: string;
  status: 'active' | 'inactive' | 'error';
  lastSyncAt: string | null;
  createdAt: string;
  isConnected?: boolean;
  connectionStats?: {
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
  };
}

interface DataSourceListProps {
  dataSources: DataSource[];
  onEdit: (dataSource: DataSource) => void;
  onDelete: (id: number) => void;
  onTestConnection: (id: number) => void;
  onSync: (id: number) => void;
}

export default function DataSourceList({
  dataSources,
  onEdit,
  onDelete,
  onTestConnection,
  onSync,
}: DataSourceListProps) {
  // 获取状态徽章
  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'badge-success',
      inactive: 'badge-warning',
      error: 'badge-error',
    };
    const labels = {
      active: '正常',
      inactive: '未激活',
      error: '错误',
    };
    return (
      <div className={`badge ${badges[status as keyof typeof badges] || 'badge-ghost'}`}>
        {labels[status as keyof typeof labels] || status}
      </div>
    );
  };

  // 格式化时间
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  // 计算相对时间
  const getRelativeTime = (dateString: string | null) => {
    if (!dateString) return '从未同步';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return formatDate(dateString);
  };

  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>类型</th>
            <th>主机</th>
            <th>用户名</th>
            <th>状态</th>
            <th>连接状态</th>
            <th>最后同步</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {dataSources.map((ds) => (
            <tr key={ds.id} className="hover">
              <td>{ds.id}</td>
              <td>
                <div className="font-bold">{ds.name}</div>
              </td>
              <td>
                <div className="badge badge-outline">{ds.type.toUpperCase()}</div>
              </td>
              <td>
                <div className="text-sm">
                  {ds.host}:{ds.port}
                </div>
              </td>
              <td>{ds.username}</td>
              <td>{getStatusBadge(ds.status)}</td>
              <td>
                {ds.isConnected ? (
                  <div className="tooltip" data-tip={`活动: ${ds.connectionStats?.activeConnections || 0} / 总计: ${ds.connectionStats?.totalConnections || 0}`}>
                    <div className="badge badge-success gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      已连接
                    </div>
                  </div>
                ) : (
                  <div className="badge badge-ghost gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    未连接
                  </div>
                )}
              </td>
              <td>
                <div className="text-sm" title={formatDate(ds.lastSyncAt)}>
                  {getRelativeTime(ds.lastSyncAt)}
                </div>
              </td>
              <td>
                <div className="flex gap-2">
                  {/* 测试连接按钮 */}
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => onTestConnection(ds.id)}
                    title="测试连接"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* 同步按钮 */}
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onSync(ds.id)}
                    title="触发同步"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* 编辑按钮 */}
                  <button
                    className="btn btn-sm btn-info"
                    onClick={() => onEdit(ds)}
                    title="编辑"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>

                  {/* 删除按钮 */}
                  <button
                    className="btn btn-sm btn-error"
                    onClick={() => onDelete(ds.id)}
                    title="删除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
