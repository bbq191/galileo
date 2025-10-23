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
    try {
      const response = await fetch(`/api/datasources/${id}/test`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.status === 'success') {
        alert('连接测试成功！');
      } else {
        alert(`连接测试失败：${result.message || result.error}`);
      }
    } catch (err) {
      console.error('Error testing connection:', err);
      alert(err instanceof Error ? err.message : 'Failed to test connection');
    }
  };

  // 触发同步
  const handleSync = async (id: number) => {
    try {
      const response = await fetch(`/api/datasources/${id}/sync`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.status === 'success') {
        alert('同步任务已触发！');
        // 刷新列表以查看更新的同步状态
        await loadDataSources();
      } else {
        alert(`同步失败：${result.message || result.error}`);
      }
    } catch (err) {
      console.error('Error triggering sync:', err);
      alert(err instanceof Error ? err.message : 'Failed to trigger sync');
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
        <div className="flex-1">
          <a href="/" className="btn btn-ghost normal-case text-xl">Galileo</a>
          <div className="breadcrumbs text-sm ml-4">
            <ul>
              <li><a href="/">首页</a></li>
              <li>数据源管理</li>
            </ul>
          </div>
        </div>
        <div className="flex-none gap-2">
          <button className="btn btn-primary" onClick={handleAdd}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            添加数据源
          </button>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="container mx-auto p-6">
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
