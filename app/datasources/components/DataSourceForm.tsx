'use client';

import { useState } from 'react';
import { apiFetch, formatApiError } from '@/lib/client/api-fetch';

interface DataSource {
  id?: number;
  name: string;
  type: 'mysql' | 'mariadb' | 'postgresql';
  host: string;
  port: number;
  username: string;
  password?: string;
  databases?: string[];
}

interface DataSourceFormProps {
  dataSource: DataSource | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DataSourceForm({
  dataSource,
  onClose,
  onSuccess,
}: DataSourceFormProps) {
  // 编辑模式用已有配置初始化表单（父组件按数据源设置 key，切换编辑对象时重新挂载）
  const [formData, setFormData] = useState<DataSource>(() =>
    dataSource
      ? { ...dataSource, password: '' } // 不显示已保存的密码
      : {
          name: '',
          type: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'root',
          password: '',
          databases: [],
        }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [databasesInput, setDatabasesInput] = useState(() => dataSource?.databases?.join(', ') || '');

  // 处理表单输入
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'port' ? parseInt(value) || 0 : value,
    }));
  };

  // 处理数据库列表输入
  const handleDatabasesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDatabasesInput(value);
    // 解析逗号分隔的数据库名称
    const databases = value
      .split(',')
      .map((db) => db.trim())
      .filter((db) => db.length > 0);
    setFormData((prev) => ({
      ...prev,
      databases,
    }));
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 验证必填字段
      if (!formData.name || !formData.host || !formData.username) {
        throw new Error('请填写所有必填字段');
      }

      if (!formData.password && !dataSource) {
        throw new Error('请输入密码');
      }

      // 准备提交数据
      const submitData: any = {
        name: formData.name,
        type: formData.type,
        host: formData.host,
        port: formData.port,
        username: formData.username,
      };

      // 如果提供了密码,包含密码字段
      if (formData.password) {
        submitData.password = formData.password;
      }

      // 如果提供了数据库列表,包含数据库字段
      if (formData.databases && formData.databases.length > 0) {
        submitData.databases = formData.databases;
      }

      // 发送请求
      const url = dataSource
        ? `/api/datasources/${dataSource.id}`
        : '/api/datasources';
      const method = dataSource ? 'PUT' : 'POST';

      const res = await apiFetch(url, { method, json: submitData });

      if (res.ok) {
        onSuccess();
      } else {
        throw new Error(formatApiError(res.error));
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(err instanceof Error ? err.message : 'Failed to save data source');
    } finally {
      setLoading(false);
    }
  };

  // 更新端口号根据数据库类型
  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as 'mysql' | 'mariadb' | 'postgresql';
    const defaultPorts = {
      mysql: 3306,
      mariadb: 3306,
      postgresql: 5432,
    };

    setFormData((prev) => ({
      ...prev,
      type,
      port: defaultPorts[type],
    }));
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-4">
          {dataSource ? '编辑数据源' : '添加数据源'}
        </h3>

        {error && (
          <div className="alert alert-error mb-4">
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

        <form onSubmit={handleSubmit}>
          {/* 数据源名称 */}
          <div className="form-control w-full mb-4">
            <label className="label">
              <span className="label-text">数据源名称 *</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="例如: 生产环境数据库"
              className="input input-bordered w-full"
              required
            />
          </div>

          {/* 数据库类型和端口 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">数据库类型 *</span>
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleTypeChange}
                className="select select-bordered w-full"
                required
              >
                <option value="mysql">MySQL</option>
                <option value="mariadb">MariaDB</option>
                <option value="postgresql">PostgreSQL</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">端口 *</span>
              </label>
              <input
                type="number"
                name="port"
                value={formData.port}
                onChange={handleChange}
                placeholder="3306"
                className="input input-bordered w-full"
                required
              />
            </div>
          </div>

          {/* 主机地址 */}
          <div className="form-control w-full mb-4">
            <label className="label">
              <span className="label-text">主机地址 *</span>
            </label>
            <input
              type="text"
              name="host"
              value={formData.host}
              onChange={handleChange}
              placeholder="localhost 或 192.168.1.100"
              className="input input-bordered w-full"
              required
            />
          </div>

          {/* 用户名和密码 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">用户名 *</span>
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="root"
                className="input input-bordered w-full"
                required
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">
                  密码 {dataSource ? '(留空保持不变)' : '*'}
                </span>
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder={dataSource ? '••••••••' : '输入密码'}
                className="input input-bordered w-full"
                required={!dataSource}
              />
            </div>
          </div>

          {/* 数据库列表（可选） */}
          <div className="form-control w-full mb-4">
            <label className="label">
              <span className="label-text">数据库列表（可选）</span>
              <span className="label-text-alt">用逗号分隔，留空则采集所有数据库</span>
            </label>
            <input
              type="text"
              value={databasesInput}
              onChange={handleDatabasesChange}
              placeholder="db1, db2, db3"
              className="input input-bordered w-full"
            />
            {formData.databases && formData.databases.length > 0 && (
              <label className="label">
                <span className="label-text-alt">
                  将采集 {formData.databases.length} 个数据库: {formData.databases.join(', ')}
                </span>
              </label>
            )}
          </div>

          {/* 按钮 */}
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner"></span>
                  保存中...
                </>
              ) : (
                dataSource ? '保存' : '创建'
              )}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
