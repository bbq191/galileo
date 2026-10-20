'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/client/api-fetch';
import type { AuthSession } from '@/lib/client/contracts';
import { sanitizeNextPath } from '@/lib/auth/redirect';

/**
 * 登录页面
 * 不使用 MainLayout 的侧边栏和导航（见 components/layout/MainLayout.tsx）
 */
export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await apiFetch<AuthSession>('/api/auth/login', {
      method: 'POST',
      json: { username: username.trim(), password },
    });

    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get('next');
      // 整页跳转，让布局重新加载当前用户信息
      window.location.replace(sanitizeNextPath(next));
      return;
    }

    setError(res.error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
      <div className="card w-full max-w-sm bg-base-100 shadow-xl">
        <form className="card-body gap-4" onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="text-white font-bold text-lg">G</span>
            </div>
            <div>
              <h1 className="font-bold text-lg">Galileo</h1>
              <p className="text-xs opacity-60">NL2SQL System</p>
            </div>
          </div>

          {error && (
            <div className="alert alert-error text-sm py-2">
              <span>{error}</span>
            </div>
          )}

          <label className="form-control w-full">
            <span className="label-text mb-1">用户名</span>
            <input
              className="input input-bordered w-full"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1">密码</span>
            <input
              className="input input-bordered w-full"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className="btn btn-primary w-full" type="submit" disabled={loading}>
            {loading && <span className="loading loading-spinner loading-sm" />}
            登录
          </button>
        </form>
      </div>
    </div>
  );
}
