'use client';

import { useState, useEffect } from 'react';

/**
 * 业务域关键词
 */
interface DomainKeyword {
  keyword: string;
  weight: number;
}

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
  keywords?: DomainKeyword[];
  _count?: {
    databases: number;
    keywords: number;
  };
}

/**
 * 业务域管理页面
 *
 * 功能：
 * - 查看所有业务域
 * - 新建、编辑、删除业务域
 * - 🆕 管理业务域关键词（添加、删除、调整权重）
 * - 🆕 自动发现业务域
 * - 查看每个业务域关联的数据库数量
 *
 * @author xusy
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

  // 🆕 关键词管理状态
  const [keywords, setKeywords] = useState<DomainKeyword[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newKeywordWeight, setNewKeywordWeight] = useState(1.0);
  const [loadingKeywords, setLoadingKeywords] = useState(false);

  // 🆕 自动发现状态
  const [discovering, setDiscovering] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [dataSources, setDataSources] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<number | null>(null);

  /**
   * 加载业务域列表
   */
  const loadDomains = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/domains');
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
    loadDataSources();
  }, []);

  /**
   * 🆕 加载数据源列表
   */
  const loadDataSources = async () => {
    try {
      const response = await fetch('/api/datasources');
      const result = await response.json();

      if (result.status === 'success') {
        setDataSources(result.data || []);
      }
    } catch (err) {
      console.error('加载数据源列表失败:', err);
    }
  };

  /**
   * 🆕 加载业务域关键词
   */
  const loadKeywords = async (domainId: number) => {
    try {
      setLoadingKeywords(true);
      const response = await fetch(`/api/domains/${domainId}/keywords`);
      const result = await response.json();

      if (result.success) {
        setKeywords(result.data || []);
      }
    } catch (err) {
      console.error('加载关键词失败:', err);
    } finally {
      setLoadingKeywords(false);
    }
  };

  /**
   * 打开新建模态框
   */
  const handleAdd = () => {
    setEditingDomain(null);
    setFormData({ name: '', description: '', ownerTeam: '' });
    setKeywords([]);
    setShowModal(true);
  };

  /**
   * 打开编辑模态框
   */
  const handleEdit = async (domain: BusinessDomain) => {
    setEditingDomain(domain);
    setFormData({
      name: domain.name,
      description: domain.description || '',
      ownerTeam: domain.ownerTeam || '',
    });
    setShowModal(true);

    // 🆕 加载关键词
    await loadKeywords(domain.id);
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
        ? `/api/domains/${editingDomain.id}`
        : '/api/domains';

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
        const domainId = editingDomain?.id || result.data.id;

        // 🆕 保存关键词
        if (keywords.length > 0) {
          await fetch(`/api/domains/${domainId}/keywords`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords }),
          });
        }

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
    const dbCount = domain._count?.databases || 0;
    if (dbCount > 0) {
      alert(
        `无法删除业务域"${domain.name}"，因为有 ${dbCount} 个数据库正在使用该业务域。\n请先将这些数据库重新分配到其他业务域。`
      );
      return;
    }

    if (!confirm(`确定要删除业务域"${domain.name}"吗？`)) {
      return;
    }

    try {
      const response = await fetch(`/api/domains/${domain.id}`, {
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
   * 🆕 添加关键词
   */
  const handleAddKeyword = () => {
    if (!newKeyword.trim()) {
      alert('关键词不能为空');
      return;
    }

    if (keywords.some(k => k.keyword === newKeyword.trim())) {
      alert('关键词已存在');
      return;
    }

    setKeywords([...keywords, {
      keyword: newKeyword.trim(),
      weight: newKeywordWeight
    }]);
    setNewKeyword('');
    setNewKeywordWeight(1.0);
  };

  /**
   * 🆕 删除关键词
   */
  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k.keyword !== keyword));
  };

  /**
   * 🆕 更新关键词权重
   */
  const handleUpdateKeywordWeight = (keyword: string, weight: number) => {
    setKeywords(keywords.map(k =>
      k.keyword === keyword ? { ...k, weight } : k
    ));
  };

  /**
   * 🆕 触发自动发现
   */
  const handleAutoDiscover = async () => {
    if (!selectedDataSourceId) {
      alert('请选择数据源');
      return;
    }

    try {
      setDiscovering(true);

      const response = await fetch('/api/domains/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataSourceId: selectedDataSourceId,
          autoCreate: true,
          minClusterSize: 2,
          autoCreateThreshold: 0.8,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message || '自动发现完成');
        setShowDiscoverModal(false);
        await loadDomains();
      } else {
        throw new Error(result.error || '自动发现失败');
      }
    } catch (err) {
      console.error('自动发现失败:', err);
      alert(err instanceof Error ? err.message : '自动发现失败');
    } finally {
      setDiscovering(false);
    }
  };

  /**
   * 格式化时间
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div className="space-y-6">
        {/* 页面标题和操作按钮 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">业务域管理</h1>
            <p className="text-sm text-gray-500 mt-1">
              管理系统中的业务域，用于组织和分类数据库
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-outline btn-secondary"
              onClick={() => setShowDiscoverModal(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M9 9a2 2 0 114 0 2 2 0 01-4 0z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a4 4 0 00-3.446 6.032l-2.261 2.26a1 1 0 101.414 1.415l2.261-2.261A4 4 0 1011 5z" clipRule="evenodd" />
              </svg>
              自动发现
            </button>
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
                      {domain._count?.databases || 0} 个数据库
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

                  {/* 🆕 关键词数量显示 */}
                  {domain._count && domain._count.keywords > 0 && (
                    <div className="mt-2">
                      <span className="badge badge-ghost badge-sm">
                        {domain._count.keywords} 个关键词
                      </span>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2">
                    创建于 {formatDate(domain.createdAt)}
                  </div>

                  <div className="card-actions justify-end mt-4">
                    {(domain._count?.databases || 0) > 0 && (
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
                      disabled={(domain._count?.databases || 0) > 0}
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

      {/* 新建/编辑模态框 */}
      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
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

            {/* 🆕 关键词管理部分 */}
            <div className="divider mt-6">查询关键词配置</div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">关键词用于自动推断查询所属的业务域</span>
              </label>

              {/* 关键词列表 */}
              {loadingKeywords ? (
                <div className="flex justify-center py-4">
                  <span className="loading loading-spinner loading-sm"></span>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {keywords.map((kw) => (
                    <div key={kw.keyword} className="flex items-center gap-2 bg-base-200 p-2 rounded">
                      <span className="flex-1 font-medium">{kw.keyword}</span>
                      <input
                        type="number"
                        className="input input-sm input-bordered w-20"
                        min="0"
                        max="10"
                        step="0.1"
                        value={kw.weight}
                        onChange={(e) =>
                          handleUpdateKeywordWeight(kw.keyword, parseFloat(e.target.value) || 1.0)
                        }
                      />
                      <span className="text-xs text-gray-500">权重</span>
                      <button
                        className="btn btn-sm btn-ghost btn-circle text-error"
                        onClick={() => handleRemoveKeyword(kw.keyword)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {keywords.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      暂无关键词，添加关键词可提高查询推断准确率
                    </p>
                  )}
                </div>
              )}

              {/* 添加关键词 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input input-sm input-bordered flex-1"
                  placeholder="输入关键词"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                />
                <input
                  type="number"
                  className="input input-sm input-bordered w-24"
                  min="0"
                  max="10"
                  step="0.1"
                  value={newKeywordWeight}
                  onChange={(e) => setNewKeywordWeight(parseFloat(e.target.value) || 1.0)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleAddKeyword}
                >
                  添加
                </button>
              </div>

              <label className="label">
                <span className="label-text-alt text-gray-500">
                  提示：权重越高，匹配该关键词时置信度越高
                </span>
              </label>
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

      {/* 🆕 自动发现模态框 */}
      {showDiscoverModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">自动发现业务域</h3>
            <p className="text-sm text-gray-600 mb-4">
              系统将分析所选数据源中所有数据库的表结构，自动识别业务域并创建。
            </p>

            <div className="form-control">
              <label className="label">
                <span className="label-text">选择数据源 *</span>
              </label>
              <select
                className="select select-bordered"
                value={selectedDataSourceId || ''}
                onChange={(e) => setSelectedDataSourceId(Number(e.target.value))}
              >
                <option value="">请选择数据源</option>
                {dataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="alert alert-info mt-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div className="text-sm">
                <p className="font-medium mb-1">自动发现规则：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>基于表名和字段的语义相似度聚类</li>
                  <li>每个聚类至少包含 2 个数据库</li>
                  <li>置信度 ≥ 0.8 的业务域将自动创建</li>
                </ul>
              </div>
            </div>

            <div className="modal-action">
              <button
                className="btn"
                onClick={() => setShowDiscoverModal(false)}
                disabled={discovering}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAutoDiscover}
                disabled={discovering || !selectedDataSourceId}
              >
                {discovering ? (
                  <>
                    <span className="loading loading-spinner loading-sm mr-2"></span>
                    发现中...
                  </>
                ) : (
                  '开始发现'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
