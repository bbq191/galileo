'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { apiFetch, redirectToLogin } from '@/lib/client/api-fetch';
import type { AuthMe, AuthSession } from '@/lib/client/contracts';

// 图标组件
const Icons = {
  Query: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l-4-4m0 0l4-4m-4 4h16m-8-8v16" />
    </svg>
  ),
  History: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  ),
  Table: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  Graph: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  Domain: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Health: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Performance: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Audit: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Feedback: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  ),
  Cost: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Doc: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  Menu: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Home: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
};

// 导航配置（adminOnly 分组仅管理员可见，服务端同样按 lib/auth/route-policy.ts 拦截）
const navGroups: Array<{
  title: string;
  adminOnly?: boolean;
  items: Array<{ href: string; label: string; icon: () => JSX.Element }>;
}> = [
  {
    title: '智能查询',
    items: [
      { href: '/query', label: '自然语言查询', icon: Icons.Query },
      { href: '/query/history', label: '查询历史', icon: Icons.History },
    ],
  },
  {
    title: '数据资产',
    items: [
      { href: '/datasources', label: '数据源管理', icon: Icons.Database },
      { href: '/metadata', label: '元数据浏览', icon: Icons.Table },
      { href: '/relationships', label: '关系图谱', icon: Icons.Graph },
      { href: '/metadata/domains', label: '业务域', icon: Icons.Domain },
    ],
  },
  {
    title: '系统管理',
    adminOnly: true,
    items: [
      { href: '/admin/health', label: '健康监控', icon: Icons.Health },
      { href: '/admin/statistics', label: '统计概览', icon: Icons.Chart },
      { href: '/admin/performance', label: '性能分析', icon: Icons.Performance },
      { href: '/admin/audit', label: '审计日志', icon: Icons.Audit },
      { href: '/admin/feedback', label: '查询反馈', icon: Icons.Feedback },
      { href: '/admin/ai-cost', label: 'AI 成本', icon: Icons.Cost },
      { href: '/admin/domains', label: '业务域管理', icon: Icons.Settings },
    ],
  },
  {
    title: '帮助',
    items: [
      { href: '/docs/api', label: 'API 文档', icon: Icons.Doc },
    ],
  },
];

interface MainLayoutProps {
  children: ReactNode;
}

/** 不使用侧边栏与导航的页面 */
const BARE_PATHS = ['/login'];

/** Access Token 过期前多久主动续期 */
const REFRESH_AHEAD_MS = 2 * 60 * 1000;

const ROLE_LABELS: Record<AuthMe['user']['role'], string> = {
  admin: '管理员',
  user: '普通用户',
  guest: '访客',
};

export default function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname() ?? '/';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const isBare = BARE_PATHS.includes(pathname);
  const isAdmin = me?.user.role === 'admin';

  // 加载当前用户
  useEffect(() => {
    if (isBare) return;
    apiFetch<AuthMe>('/api/auth/me').then((res) => {
      if (res.ok) {
        setMe(res.data);
        setExpiresAt(res.data.expiresAt);
      }
    });
  }, [isBare]);

  // 在 Access Token 过期前续期，避免尚未迁移到 apiFetch 的请求因过期失败
  useEffect(() => {
    if (isBare || !expiresAt) return;
    const delay = Math.max(expiresAt - Date.now() - REFRESH_AHEAD_MS, 30 * 1000);
    const timer = setTimeout(async () => {
      const res = await apiFetch<AuthSession>('/api/auth/refresh', { method: 'POST' });
      if (res.ok) {
        setExpiresAt(res.data.expiresAt);
      } else {
        redirectToLogin();
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [isBare, expiresAt]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const visibleNavGroups = navGroups.filter((group) => !group.adminOnly || isAdmin);

  // 最长前缀匹配，避免 /query 与 /query/history 同时高亮
  const activeItem = navGroups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];

  // 获取当前页面标题
  const getCurrentTitle = () => {
    if (activeItem) return activeItem.label;
    if (pathname === '/') return '首页';
    // /admin 不在侧边栏中，但是移动端「管理」Tab 的入口
    if (pathname === '/admin') return '管理后台';
    return '页面';
  };

  const isActive = (href: string) => activeItem?.href === href;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-base-300">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <span className="text-white font-bold text-lg">G</span>
          </div>
          <div>
            <h1 className="font-bold text-lg">Galileo</h1>
            <p className="text-xs opacity-60">NL2SQL System</p>
          </div>
        </Link>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 overflow-y-auto p-4">
        {visibleNavGroups.map((group) => (
          <div key={group.title} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2 px-3">
              {group.title}
            </h2>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                        active
                          ? 'bg-primary text-primary-content'
                          : 'hover:bg-base-200'
                      }`}
                    >
                      <Icon />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 底部信息 */}
      <div className="p-4 border-t border-base-300">
        <div className="text-xs opacity-50 text-center">
          © 2024 Galileo by xusy
        </div>
      </div>
    </div>
  );

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-base-100">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-base-100 border-r border-base-300 transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* 主内容区 */}
      <div className="lg:ml-64">
        {/* 顶部导航栏 */}
        <header className="sticky top-0 z-30 bg-base-100/80 backdrop-blur-lg border-b border-base-300">
          <div className="flex items-center justify-between h-16 px-4">
            <div className="flex items-center gap-4">
              {/* 移动端菜单按钮 */}
              <button
                className="lg:hidden btn btn-ghost btn-square"
                onClick={() => setSidebarOpen(true)}
              >
                <Icons.Menu />
              </button>
              {/* 面包屑 */}
              <div className="flex items-center gap-2 text-sm">
                <Link href="/" className="opacity-60 hover:opacity-100">
                  <Icons.Home />
                </Link>
                <span className="opacity-40">/</span>
                <span className="font-medium">{getCurrentTitle()}</span>
              </div>
            </div>

            {/* 右侧操作 */}
            <div className="flex items-center gap-2">
              <Link href="/query" className="btn btn-primary btn-sm">
                新建查询
              </Link>
              {me && (
                <div className="dropdown dropdown-end">
                  <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
                    {me.user.username}
                  </div>
                  <ul
                    tabIndex={0}
                    className="dropdown-content menu z-50 w-40 rounded-box border border-base-300 bg-base-100 p-2 shadow"
                  >
                    <li className="menu-title">{ROLE_LABELS[me.user.role]}</li>
                    <li>
                      <button onClick={handleLogout}>退出登录</button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      {/* 移动端底部导航 */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-base-100 border-t border-base-300 lg:hidden">
        <div className="flex justify-around items-center h-16">
          <Link
            href="/"
            className={`flex flex-col items-center gap-1 px-4 py-2 ${
              pathname === '/' ? 'text-primary' : 'opacity-60'
            }`}
          >
            <Icons.Home />
            <span className="text-xs">首页</span>
          </Link>
          <Link
            href="/query"
            className={`flex flex-col items-center gap-1 px-4 py-2 ${
              pathname.startsWith('/query') ? 'text-primary' : 'opacity-60'
            }`}
          >
            <Icons.Query />
            <span className="text-xs">查询</span>
          </Link>
          <Link
            href="/datasources"
            className={`flex flex-col items-center gap-1 px-4 py-2 ${
              ['/datasources', '/metadata', '/relationships'].some((p) => pathname.startsWith(p))
                ? 'text-primary'
                : 'opacity-60'
            }`}
          >
            <Icons.Database />
            <span className="text-xs">数据</span>
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className={`flex flex-col items-center gap-1 px-4 py-2 ${
                pathname.startsWith('/admin') ? 'text-primary' : 'opacity-60'
              }`}
            >
              <Icons.Settings />
              <span className="text-xs">管理</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
