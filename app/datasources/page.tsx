'use client';

import { useEffect, useState } from 'react';
import DataSourceList from './components/DataSourceList';
import DataSourceForm from './components/DataSourceForm';
import { apiFetch, formatApiError } from '@/lib/client/api-fetch';

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDataSource, setEditingDataSource] = useState<any | null>(null);
  const [testingConnections, setTestingConnections] = useState<Set<number>>(new Set());
  const [syncingDataSources, setSyncingDataSources] = useState<Set<number>>(new Set());
  const [inferringRelationships, setInferringRelationships] = useState<Set<number>>(new Set());
  const [annotatingDataSources, setAnnotatingDataSources] = useState<Set<number>>(new Set());
  const [operationInProgress, setOperationInProgress] = useState<number | null>(null);

  // 格式化持续时间为人类可读格式
  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms} 毫秒`;
    } else if (ms < 60000) {
      const seconds = (ms / 1000).toFixed(1);
      return `${seconds} 秒`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes} 分 ${seconds} 秒`;
    }
  };

  // 加载数据源列表
  const loadDataSources = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiFetch<any[]>('/api/datasources');

      if (res.ok) {
        setDataSources(res.data || []);
      } else {
        throw new Error(formatApiError(res.error));
      }
    } catch (err) {
      console.error('Error loading data sources:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data sources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDataSources();
  }, []);

  // 打开添加数据源模态框
  const handleAdd = () => {
    setEditingDataSource(null);
    setShowModal(true);
  };

  // 打开编辑数据源模态框
  const handleEdit = (dataSource: any) => {
    setEditingDataSource(dataSource);
    setShowModal(true);
  };

  // 删除数据源
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个数据源吗？此操作将删除所有相关的元数据。')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/datasources/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // 刷新列表
        await loadDataSources();
      } else {
        throw new Error(formatApiError(res.error));
      }
    } catch (err) {
      console.error('Error deleting data source:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete data source');
    }
  };

  // 测试连接
  const handleTestConnection = async (id: number) => {
    // 防止重复点击和互斥操作
    if (testingConnections.has(id) || operationInProgress !== null) {
      return;
    }

    try {
      setOperationInProgress(id);
      setTestingConnections(prev => new Set(prev).add(id));

      const res = await apiFetch(`/api/datasources/${id}/test`, {
        method: 'POST',
      });

      if (res.ok) {
        alert('连接测试成功！');
        // 刷新列表以查看更新的连接状态
        await loadDataSources();
      } else {
        alert(`连接测试失败：${formatApiError(res.error)}`);
      }
    } catch (err) {
      console.error('Error testing connection:', err);
      alert(err instanceof Error ? err.message : 'Failed to test connection');
    } finally {
      setTestingConnections(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setOperationInProgress(null);
    }
  };

  // 触发同步
  const handleSync = async (id: number) => {
    // 防止重复点击和互斥操作
    if (syncingDataSources.has(id) || operationInProgress !== null) {
      return;
    }

    try {
      setOperationInProgress(id);
      setSyncingDataSources(prev => new Set(prev).add(id));

      const res = await apiFetch<any>(`/api/datasources/${id}/sync`, {
        method: 'POST',
        json: {
          inferRelationships: false, // 明确禁用自动关系推断
        },
      });

      if (res.ok) {
        const stats = res.data;
        const changes = stats.changes || {};
        const added = changes.added || {};
        const updated = changes.updated || {};
        const removed = changes.removed || {};
        const failedTables: Array<{ database: string; table?: string; error: string }> = stats.errors || [];
        let message = `同步成功！\n\n` +
          `数据库: ${stats.databaseCount || 0} 个\n` +
          `表: ${stats.tableCount || 0} 个 (新增 ${added.tables || 0}, 修改 ${updated.tables || 0}, 删除 ${removed.tables || 0}, 结构未变化 ${stats.unchangedTableCount || 0})\n` +
          `列: ${stats.columnCount || 0} 个 (新增 ${added.columns || 0}, 修改 ${updated.columns || 0}, 删除 ${removed.columns || 0})\n\n` +
          `耗时: ${formatDuration(stats.duration || 0)}`;
        if (failedTables.length > 0) {
          message += `\n\n⚠️ ${failedTables.length} 项同步失败：\n` +
            failedTables.slice(0, 5).map((e) => `- ${e.database}${e.table ? '.' + e.table : ''}: ${e.error}`).join('\n') +
            (failedTables.length > 5 ? `\n...` : '');
        }
        alert(message);
        // 刷新列表以查看更新的同步状态
        await loadDataSources();
      } else {
        alert(`同步失败：${formatApiError(res.error)}`);
      }
    } catch (err) {
      console.error('Error triggering sync:', err);
      alert(err instanceof Error ? err.message : 'Failed to trigger sync');
    } finally {
      setSyncingDataSources(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setOperationInProgress(null);
    }
  };

  // 推断关系
  const handleInferRelationships = async (dataSource: any, incrementalMode: boolean = false) => {
    // 防止重复点击和互斥操作
    if (inferringRelationships.has(dataSource.id) || operationInProgress !== null) {
      return;
    }

    try {
      setOperationInProgress(dataSource.id);
      setInferringRelationships(prev => new Set(prev).add(dataSource.id));

      // 获取数据源配置的数据库列表
      // 如果没有配置数据库列表或为空数组，不传递 databases 参数，让服务端推断所有数据库
      const databases = dataSource.databases && dataSource.databases.length > 0
        ? dataSource.databases
        : undefined;

      const res = await apiFetch<any>('/api/metadata/relationships/infer', {
        method: 'POST',
        json: {
          dataSourceId: dataSource.id.toString(),
          ...(databases && { databases }), // 只有当 databases 存在时才传递
          crossDatabase: true, // 启用跨库推断以支持跨库查询场景
          minConfidence: 0.7,
          incrementalMode, // 增量模式
        },
      });

      if (res.ok) {
        const data = res.data;

        // 直接使用新的返回数据结构
        const relationshipsCount = data.inferredCount || 0;
        const durationMs = data.duration || 0;
        const savedCount = data.savedCount || 0;
        const highCount = data.highConfidenceCount || 0;
        const mediumCount = data.mediumConfidenceCount || 0;
        const lowCount = data.lowConfidenceCount || 0;
        const isIncremental = data.isIncremental || false;
        const changesProcessed = data.changesProcessed || 0;
        const relationshipsCleanedUp = data.relationshipsCleanedUp || 0;

        const dbInfo = databases && databases.length > 0
          ? `数据库: ${databases.join(', ')}\n`
          : '所有数据库\n';

        let message = `关系推断完成！\n\n`;
        message += `${dbInfo}`;
        message += `模式: ${isIncremental ? '增量推断' : '全量推断'}\n`;
        if (isIncremental) {
          message += `处理变更: ${changesProcessed} 项\n`;
          message += `清理关系: ${relationshipsCleanedUp} 个\n`;
        }
        message += `\n推断出 ${relationshipsCount} 个关系\n` +
          `  - 高置信度: ${highCount} 个\n` +
          `  - 中置信度: ${mediumCount} 个\n` +
          `  - 低置信度: ${lowCount} 个\n\n` +
          `已保存 ${savedCount} 个关系到数据库\n` +
          `耗时: ${formatDuration(durationMs)}`;
        alert(message);
      } else {
        alert(`关系推断失败：${formatApiError(res.error)}`);
      }
    } catch (err) {
      console.error('Error inferring relationships:', err);
      alert(err instanceof Error ? err.message : 'Failed to infer relationships');
    } finally {
      setInferringRelationships(prev => {
        const newSet = new Set(prev);
        newSet.delete(dataSource.id);
        return newSet;
      });
      setOperationInProgress(null);
    }
  };

  // 触发语义标注
  const handleAnnotate = async (id: number) => {
    // 防止重复点击和互斥操作
    if (annotatingDataSources.has(id) || operationInProgress !== null) {
      return;
    }

    try {
      setOperationInProgress(id);
      setAnnotatingDataSources(prev => new Set(prev).add(id));

      const res = await apiFetch<any>(`/api/datasources/${id}/annotate`, {
        method: 'POST',
        json: {
          force: false, // 不强制重新标注已有描述的项
        },
      });

      if (res.ok) {
        const stats = res.data.summary;
        const message = `语义标注完成！\n\n` +
          `数据库: ${stats.databases} 个\n` +
          `表: ${stats.tables} 个\n` +
          `字段: ${stats.columns} 个\n\n` +
          `处理统计:\n` +
          `  - 规则引擎: ${stats.ruleProcessed} 个\n` +
          `  - AI 处理: ${stats.aiProcessed} 个\n` +
          `  - 已跳过: ${stats.skipped} 个\n` +
          `  - 失败: ${stats.failed} 个\n\n` +
          `耗时: ${formatDuration(res.data.duration || 0)}`;
        alert(message);
        // 刷新列表
        await loadDataSources();
      } else {
        alert(`语义标注失败：${formatApiError(res.error)}`);
      }
    } catch (err) {
      console.error('Error annotating semantics:', err);
      alert(err instanceof Error ? err.message : 'Failed to annotate semantics');
    } finally {
      setAnnotatingDataSources(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setOperationInProgress(null);
    }
  };

  // 表单提交成功后的回调
  const handleFormSuccess = async () => {
    setShowModal(false);
    setEditingDataSource(null);
    await loadDataSources();
  };

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">数据源管理</h1>
          <p className="text-sm opacity-60 mt-1">管理数据库连接与元数据同步</p>
        </div>
        <button className="btn btn-primary" onClick={handleAdd}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          添加数据源
        </button>
      </div>

      {/* 主要内容区 */}
      <div className="bg-base-100 border border-base-300 rounded-xl p-4 lg:p-6">
        {/* 错误提示 */}
        {error && (
          <div className="alert alert-error mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 数据源列表 */}
        {!loading && !error && (
          <DataSourceList
            dataSources={dataSources}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTestConnection={handleTestConnection}
            onSync={handleSync}
            onInferRelationships={handleInferRelationships}
            onAnnotate={handleAnnotate}
            testingConnections={testingConnections}
            syncingDataSources={syncingDataSources}
            inferringRelationships={inferringRelationships}
            annotatingDataSources={annotatingDataSources}
            operationInProgress={operationInProgress}
          />
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && dataSources.length === 0 && (
          <div className="text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mx-auto text-base-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            <h3 className="text-lg font-bold mb-2">暂无数据源</h3>
            <p className="text-base-content/60 mb-4">点击&ldquo;添加数据源&rdquo;按钮创建第一个数据源</p>
            <button className="btn btn-primary" onClick={handleAdd}>
              添加数据源
            </button>
          </div>
        )}
      </div>

      {/* 数据源表单模态框 */}
      {showModal && (
        <DataSourceForm
          dataSource={editingDataSource}
          onClose={() => {
            setShowModal(false);
            setEditingDataSource(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
