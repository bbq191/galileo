'use client';

import { useEffect, useState } from 'react';
import DataSourceList from './components/DataSourceList';
import DataSourceForm from './components/DataSourceForm';

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDataSource, setEditingDataSource] = useState<any | null>(null);
  const [testingConnections, setTestingConnections] = useState<Set<number>>(new Set());
  const [syncingDataSources, setSyncingDataSources] = useState<Set<number>>(new Set());
  const [inferringRelationships, setInferringRelationships] = useState<Set<number>>(new Set());

  // 加载数据源列表
  const loadDataSources = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/datasources');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'success') {
        setDataSources(result.data || []);
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
      const response = await fetch(`/api/datasources/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.status === 'success') {
        // 刷新列表
        await loadDataSources();
      } else {
        throw new Error(result.message || 'Failed to delete data source');
      }
    } catch (err) {
      console.error('Error deleting data source:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete data source');
    }
  };

  // 测试连接
  const handleTestConnection = async (id: number) => {
    // 防止重复点击
    if (testingConnections.has(id)) {
      return;
    }

    try {
      setTestingConnections(prev => new Set(prev).add(id));

      const response = await fetch(`/api/datasources/${id}/test`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.status === 'success') {
        alert('连接测试成功！');
        // 刷新列表以查看更新的连接状态
        await loadDataSources();
      } else {
        alert(`连接测试失败：${result.message || result.error}`);
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
    }
  };

  // 触发同步
  const handleSync = async (id: number) => {
    // 防止重复点击
    if (syncingDataSources.has(id)) {
      return;
    }

    try {
      setSyncingDataSources(prev => new Set(prev).add(id));

      const response = await fetch(`/api/datasources/${id}/sync`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.status === 'success') {
        const stats = result.data;
        const message = `同步成功！\n\n数据库: ${stats.databasesAdded} 个新增, ${stats.databasesUpdated} 个更新\n表: ${stats.tablesAdded} 个新增, ${stats.tablesUpdated} 个更新\n列: ${stats.columnsAdded} 个新增, ${stats.columnsUpdated} 个更新\n\n耗时: ${stats.duration}ms`;
        alert(message);
        // 刷新列表以查看更新的同步状态
        await loadDataSources();
      } else {
        // 显示详细错误信息
        const errorMsg = result.error
          ? `${result.message}\n\n详细错误: ${result.error}`
          : result.message;
        alert(`同步失败：${errorMsg}`);
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
    }
  };

  // 推断关系
  const handleInferRelationships = async (dataSource: any) => {
    // 防止重复点击
    if (inferringRelationships.has(dataSource.id)) {
      return;
    }

    try {
      setInferringRelationships(prev => new Set(prev).add(dataSource.id));

      // 获取数据源配置的数据库列表
      const databases = dataSource.databases && dataSource.databases.length > 0
        ? dataSource.databases
        : []; // 空数组表示推断所有数据库

      const response = await fetch('/api/metadata/relationships/infer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataSourceId: dataSource.id.toString(),
          databases: databases,
          crossDatabase: true, // 启用跨库推断以支持跨库查询场景
          minConfidence: 0.7,
        }),
      });

      const result = await response.json();

      if (result.status === 'success') {
        const data = result.data;

        // 处理不同的返回数据结构
        let relationshipsCount = 0;
        let durationMs = 0;
        let savedCount = 0;

        // 单数据库推断：data.relationships
        if (data.relationships) {
          relationshipsCount = data.relationships.length;
          durationMs = data.stats?.duration || data.duration || 0;
        }
        // 多数据库推断：data.results
        else if (data.results) {
          relationshipsCount = data.results.reduce((sum: number, r: any) =>
            sum + (r.relationships?.length || 0), 0
          );
          durationMs = data.results.reduce((sum: number, r: any) =>
            sum + (r.stats?.duration || r.duration || 0), 0
          );
        }

        // 获取保存结果
        if (data.saveResult) {
          savedCount = data.saveResult.successCount || 0;
        }

        const dbInfo = databases.length > 0
          ? `数据库: ${databases.join(', ')}\n`
          : '所有数据库\n';
        const message = `关系推断完成！\n\n${dbInfo}推断出 ${relationshipsCount} 个关系\n已保存 ${savedCount} 个关系到数据库\n耗时: ${durationMs}ms`;
        alert(message);
      } else {
        alert(`关系推断失败：${result.message || result.error}`);
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
    }
  };

  // 表单提交成功后的回调
  const handleFormSuccess = async () => {
    setShowModal(false);
    setEditingDataSource(null);
    await loadDataSources();
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* 页面头部 */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1 min-w-0">
          <a href="/" className="btn btn-ghost normal-case text-xl">Galileo</a>
          <div className="breadcrumbs text-sm ml-2 md:ml-4 hidden sm:block">
            <ul>
              <li><a href="/">首页</a></li>
              <li>数据源管理</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <button className="btn btn-primary btn-sm md:btn-md" onClick={handleAdd}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span className="hidden md:inline">添加数据源</span>
          </button>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="container mx-auto p-4 md:p-6">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-2xl mb-4">
              数据源列表
              {loading && <span className="loading loading-spinner loading-sm"></span>}
            </h2>

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
                testingConnections={testingConnections}
                syncingDataSources={syncingDataSources}
                inferringRelationships={inferringRelationships}
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
                <p className="text-base-content/60 mb-4">点击"添加数据源"按钮创建第一个数据源</p>
                <button className="btn btn-primary" onClick={handleAdd}>
                  添加数据源
                </button>
              </div>
            )}
          </div>
        </div>
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
