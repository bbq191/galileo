'use client';

import { useState, useEffect } from 'react';

/**
 * 业务域数据类型
 */
interface BusinessDomain {
  id: number;
  name: string;
  description: string | null;
  ownerTeam: string | null;
  createdAt: string;
  updatedAt: string;
  databaseCount?: number;
}

/**
 * 业务域管理页面
 *
 * 功能：
 * - 查看所有业务域
 * - 新建、编辑、删除业务域
 * - 查看每个业务域关联的数据库数量
 */
export default function DomainsPage() {
  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDomain, setEditingDomain] = useState<BusinessDomain | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    ownerTeam: '',
  });

  /**
   * 加载业务域列表
   */
  const loadDomains = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/metadata/domains?includeStats=true');
      const result = await response.json();

      if (result.success) {
        setDomains(result.data.domains || []);
      } else {
        throw new Error(result.error || '获取业务域列表失败');
      }
    } catch (err) {
      console.error('获取业务域列表失败:', err);
      setError(err instanceof Error ? err.message : '获取业务域列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDomains();
  }, []);

  /**
   * 打开新建模态框
   */
  const handleAdd = () => {
    setEditingDomain(null);
    setFormData({ name: '', description: '', ownerTeam: '' });
    setShowModal(true);
  };

  /**
   * 打开编辑模态框
   */
  const handleEdit = (domain: BusinessDomain) => {
    setEditingDomain(domain);
    setFormData({
      name: domain.name,
      description: domain.description || '',
      ownerTeam: domain.ownerTeam || '',
    });
    setShowModal(true);
  };

  /**
   * 保存业务域（新建或更新）
   */
  const handleSave = async () => {
    try {
      // 验证表单
      if (!formData.name.trim()) {
        alert('业务域名称不能为空');
        return;
      }

      const url = editingDomain
        ? `/api/metadata/domains/${editingDomain.id}`
        : '/api/metadata/domains';

      const method = editingDomain ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          ownerTeam: formData.ownerTeam.trim() || null,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setShowModal(false);
        await loadDomains();
      } else {
        throw new Error(result.error || '保存失败');
      }
    } catch (err) {
      console.error('保存业务域失败:', err);
      alert(err instanceof Error ? err.message : '保存失败');
    }
  };

  /**
   * 删除业务域
   */
  const handleDelete = async (domain: BusinessDomain) => {
    if (domain.databaseCount && domain.databaseCount > 0) {
      alert(
        `无法删除业务域"${domain.name}"，因为有 ${domain.databaseCount} 个数据库正在使用该业务域。\n请先将这些数据库重新分配到其他业务域。`
      );
      return;
    }

    if (!confirm(`确定要删除业务域"${domain.name}"吗？`)) {
      return;
    }

    try {
      const response = await fetch(`/api/metadata/domains/${domain.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        await loadDomains();
      } else {
        throw new Error(result.error || '删除失败');
      }
    } catch (err) {
      console.error('删除业务域失败:', err);
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  /**
   * 格式化时间
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* 导航栏 */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <a href="/" className="btn btn-ghost normal-case text-xl">
            Galileo
          </a>
          <div className="breadcrumbs text-sm ml-4">
            <ul>
              <li><a href="/admin">管理后台</a></li>
              <li>业务域管理</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <div className="container mx-auto p-6">
        {/* 页面标题和操作按钮 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">业务域管理</h1>
            <p className="text-sm text-gray-500 mt-1">
              管理系统中的业务域，用于组织和分类数据库
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/metadata/domains" className="btn btn-outline btn-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
              </svg>
              数据库分配
            </a>
            <a href="/admin/domains/metrics" className="btn btn-outline btn-info">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
              推断监控
            </a>
            <button className="btn btn-primary" onClick={handleAdd}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              新建业务域
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="alert alert-error mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        )}

        {/* 业务域列表 */}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {domains.map((domain) => (
              <div key={domain.id} className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">
                    {domain.name}
                    <div className="badge badge-primary">
                      {domain.databaseCount || 0} 个数据库
                    </div>
                  </h2>

                  {domain.description && (
                    <p className="text-sm text-gray-600">{domain.description}</p>
                  )}

                  {domain.ownerTeam && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">所属团队：</span>
                      <span className="text-sm font-medium ml-1">
                        {domain.ownerTeam}
                      </span>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2">
                    创建于 {formatDate(domain.createdAt)}
                  </div>

                  <div className="card-actions justify-end mt-4">
                    {domain.databaseCount && domain.databaseCount > 0 && (
                      <a
                        href={`/metadata/domains?domainId=${domain.id}`}
                        className="btn btn-sm btn-ghost"
                      >
                        查看数据库
                      </a>
                    )}
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleEdit(domain)}
                    >
                      编辑
                    </button>
                    <button
                      className="btn btn-sm btn-ghost text-error"
                      onClick={() => handleDelete(domain)}
                      disabled={!!domain.databaseCount && domain.databaseCount > 0}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {domains.length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-gray-500">暂无业务域</p>
                <button className="btn btn-primary mt-4" onClick={handleAdd}>
                  创建第一个业务域
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 新建/编辑模态框 */}
      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">
              {editingDomain ? '编辑业务域' : '新建业务域'}
            </h3>

            <div className="form-control">
              <label className="label">
                <span className="label-text">业务域名称 *</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                placeholder="例如：用户中心、订单系统"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="form-control mt-4">
              <label className="label">
                <span className="label-text">描述</span>
              </label>
              <textarea
                className="textarea textarea-bordered"
                placeholder="业务域的详细描述"
                rows={3}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="form-control mt-4">
              <label className="label">
                <span className="label-text">所属团队</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                placeholder="例如：用户增长团队"
                value={formData.ownerTeam}
                onChange={(e) =>
                  setFormData({ ...formData, ownerTeam: e.target.value })
                }
              />
            </div>

            <div className="modal-action">
              <button className="btn" onClick={() => setShowModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
