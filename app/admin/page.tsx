'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/**
 * 系统概览数据
 */
interface SystemOverview {
  system: {
    healthScore: number;
    status: string;
  };
  queries: {
    total: number;
    successRate: number;
  };
  cache: {
    hitRate: number;
  };
}

/**
 * 健康状态数据
 */
interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
}

/**
 * 功能模块配置
 */
const adminModules = [
  {
    title: '业务域管理',
    description: '管理业务域、关键词及数据库关联',
    href: '/admin/domains',
    icon: '🏢',
    color: 'bg-blue-500',
  },
  {
    title: '业务域指标',
    description: '查看业务域分布与统计指标',
    href: '/admin/domains/metrics',
    icon: '📊',
    color: 'bg-indigo-500',
  },
  {
    title: '系统统计',
    description: '查询统计、缓存命中率、热点分析',
    href: '/admin/statistics',
    icon: '📈',
    color: 'bg-green-500',
  },
  {
    title: '健康检查',
    description: '各服务组件的健康状态监控',
    href: '/admin/health',
    icon: '💚',
    color: 'bg-emerald-500',
  },
  {
    title: '性能监控',
    description: '系统性能指标与响应时间分析',
    href: '/admin/performance',
    icon: '⚡',
    color: 'bg-yellow-500',
  },
  {
    title: '审计日志',
    description: '操作日志与查询历史记录',
    href: '/admin/audit',
    icon: '📝',
    color: 'bg-purple-500',
  },
  {
    title: 'AI 成本',
    description: 'AI 调用统计与成本分析',
    href: '/admin/ai-cost',
    icon: '🤖',
    color: 'bg-pink-500',
  },
];

/**
 * 管理后台首页
 * 展示系统概览和功能模块导航
 * @author xusy
 */
export default function AdminPage() {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, healthRes] = await Promise.all([
          fetch('/api/statistics/overview').catch(() => null),
          fetch('/api/health').catch(() => null),
        ]);

        if (overviewRes?.ok) {
          const data = await overviewRes.json();
          setOverview(data);
        }
        if (healthRes?.ok) {
          const data = await healthRes.json();
          setHealth(data);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  /**
   * 获取健康状态样式
   */
  const getHealthStyle = (status?: string) => {
    switch (status) {
      case 'ok':
        return 'text-green-600 bg-green-100';
      case 'degraded':
        return 'text-yellow-600 bg-yellow-100';
      case 'error':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  /**
   * 获取健康状态文本
   */
  const getHealthText = (status?: string) => {
    switch (status) {
      case 'ok':
        return '正常';
      case 'degraded':
        return '降级';
      case 'error':
        return '异常';
      default:
        return '未知';
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold">管理后台</h1>
        <p className="text-sm opacity-60 mt-1">Galileo 系统管理与监控中心</p>
      </div>

      {/* 系统概览卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-base-100 border border-base-300 rounded-xl p-4">
          <div className="text-sm opacity-60 mb-1">系统状态</div>
          {loading ? (
            <span className="loading loading-dots loading-sm" />
          ) : (
            <span className={`badge ${health?.status === 'ok' ? 'badge-success' : health?.status === 'degraded' ? 'badge-warning' : 'badge-error'}`}>
              {getHealthText(health?.status)}
            </span>
          )}
        </div>

        <div className="bg-base-100 border border-base-300 rounded-xl p-4">
          <div className="text-sm opacity-60 mb-1">健康评分</div>
          {loading ? (
            <span className="loading loading-dots loading-sm" />
          ) : (
            <div className="text-2xl font-bold text-primary">
              {overview?.system?.healthScore ?? '-'}
              <span className="text-sm opacity-60 ml-1">/ 100</span>
            </div>
          )}
        </div>

        <div className="bg-base-100 border border-base-300 rounded-xl p-4">
          <div className="text-sm opacity-60 mb-1">查询成功率</div>
          {loading ? (
            <span className="loading loading-dots loading-sm" />
          ) : (
            <div className="text-2xl font-bold text-secondary">
              {overview?.queries?.successRate != null
                ? `${(overview.queries.successRate * 100).toFixed(1)}%`
                : '-'}
            </div>
          )}
        </div>

        <div className="bg-base-100 border border-base-300 rounded-xl p-4">
          <div className="text-sm opacity-60 mb-1">缓存命中率</div>
          {loading ? (
            <span className="loading loading-dots loading-sm" />
          ) : (
            <div className="text-2xl font-bold text-accent">
              {overview?.cache?.hitRate != null
                ? `${(overview.cache.hitRate * 100).toFixed(1)}%`
                : '-'}
            </div>
          )}
        </div>
      </div>

      {/* 功能模块导航 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">功能模块</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {adminModules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="card bg-base-100 border border-base-300 hover:border-primary transition-all hover:shadow-lg"
            >
              <div className="card-body p-4 flex-row items-start gap-4">
                <div className={`${module.color} w-12 h-12 rounded-lg flex items-center justify-center text-2xl flex-shrink-0`}>
                  {module.icon}
                </div>
                <div>
                  <h3 className="font-semibold">{module.title}</h3>
                  <p className="text-sm opacity-60 mt-1">{module.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
