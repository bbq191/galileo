'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api-fetch';
import {
  HEALTH_FETCH_OPTIONS,
  type HealthResponse,
  type StatisticsOverview,
} from '@/lib/client/contracts';

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [overview, setOverview] = useState<StatisticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<HealthResponse>('/api/health', HEALTH_FETCH_OPTIONS),
      apiFetch<StatisticsOverview>('/api/statistics/overview'),
    ]).then(([h, s]) => {
      setHealth(h.ok ? h.data : null);
      setOverview(s.ok ? s.data : null);
      setLoading(false);
    });
  }, []);

  const quickActions = [
    { href: '/query', label: '新建查询', desc: '使用自然语言查询数据', primary: true },
    { href: '/datasources', label: '数据源', desc: '管理数据库连接' },
    { href: '/metadata', label: '元数据', desc: '浏览表结构信息' },
    { href: '/admin/statistics', label: '统计', desc: '查看系统统计' },
  ];

  const queries = overview?.queries;
  const statCards = [
    { label: '总查询数', value: queries?.total ?? '-', color: 'text-primary' },
    {
      label: '缓存命中率',
      value: overview ? `${(overview.cache.hitRate * 100).toFixed(1)}%` : '-',
      color: 'text-secondary',
    },
    {
      label: '平均响应',
      value: queries ? `${Math.round(queries.avgExecutionTime)}ms` : '-',
      color: 'text-accent',
    },
    { label: '成功率', value: queries ? `${queries.successRate.toFixed(1)}%` : '-', color: 'text-success' },
  ];

  const systemStatus = {
    ok: { text: '正常', dot: 'bg-success', label: 'text-success' },
    degraded: { text: '降级', dot: 'bg-warning', label: 'text-warning' },
    error: { text: '异常', dot: 'bg-error', label: 'text-error' },
  }[health?.status ?? 'error'];
  const databaseOk = health?.checks.prisma?.status === 'ok';
  const redisOk = health?.checks.redis?.connected === true;

  return (
    <div className="space-y-6">
      {/* 欢迎区域 */}
      <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-2xl p-6 lg:p-8">
        <h1 className="text-2xl lg:text-3xl font-bold mb-2">欢迎使用 Galileo</h1>
        <p className="opacity-70 mb-6">自然语言转 SQL 智能系统，让数据查询更简单</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/query" className="btn btn-primary">
            开始查询
          </Link>
          <Link href="/docs/api" className="btn btn-ghost">
            查看文档
          </Link>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-base-100 border border-base-300 rounded-xl p-4">
            <div className="text-sm opacity-60 mb-1">{card.label}</div>
            <div className={`text-2xl font-bold ${card.color}`}>
              {loading ? <span className="loading loading-dots loading-sm" /> : card.value}
            </div>
          </div>
        ))}
      </div>

      {/* 快捷操作 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`card border transition-all hover:shadow-lg ${
                action.primary
                  ? 'bg-primary text-primary-content border-primary'
                  : 'bg-base-100 border-base-300 hover:border-primary'
              }`}
            >
              <div className="card-body p-4">
                <h3 className="font-semibold">{action.label}</h3>
                <p className={`text-sm ${action.primary ? 'opacity-80' : 'opacity-60'}`}>
                  {action.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 系统状态 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">系统状态</h2>
        <div className="bg-base-100 border border-base-300 rounded-xl p-4">
          {loading ? (
            <div className="flex items-center gap-2">
              <span className="loading loading-spinner loading-sm" />
              <span className="opacity-60">检查中...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${systemStatus.dot}`} />
                <span className="text-sm">系统</span>
                <span className={`text-sm font-medium ${systemStatus.label}`}>{systemStatus.text}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${databaseOk ? 'bg-success' : 'bg-error'}`} />
                <span className="text-sm">数据库</span>
                <span className={`text-sm font-medium ${databaseOk ? 'text-success' : 'text-error'}`}>
                  {databaseOk ? '已连接' : '未连接'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${redisOk ? 'bg-success' : 'bg-warning'}`} />
                <span className="text-sm">Redis</span>
                <span className={`text-sm font-medium ${redisOk ? 'text-success' : 'text-warning'}`}>
                  {redisOk ? '已连接' : '未连接'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 功能模块 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-base-100 border border-base-300 rounded-xl p-4">
          <h3 className="font-semibold mb-3">智能查询</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              自然语言转 SQL 查询
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              智能表关联推荐
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              查询结果可视化
            </li>
          </ul>
        </div>
        <div className="bg-base-100 border border-base-300 rounded-xl p-4">
          <h3 className="font-semibold mb-3">数据管理</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              多数据源支持
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              元数据自动发现
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              业务域智能分配
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
