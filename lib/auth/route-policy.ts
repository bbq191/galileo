/**
 * 路由访问策略
 *
 * 集中定义每个页面 / API 需要的访问级别，由 middleware 统一执行。
 * 规则按顺序匹配，第一条命中即生效；未命中任何规则时要求登录。
 *
 * 注意：本模块被 middleware（Edge Runtime）引用，不能依赖 Node.js 专有 API。
 */

import { Permission } from './permissions';

export type RouteAccess =
  | { kind: 'public' }
  | { kind: 'authenticated'; permission?: Permission };

interface Rule {
  /** 路径前缀（匹配自身及其子路径） */
  prefix: string;
  /** 限定的 HTTP 方法；`write` 表示 GET/HEAD/OPTIONS 以外的方法 */
  methods?: 'write' | string[];
  access: RouteAccess;
}

const PUBLIC: RouteAccess = { kind: 'public' };
const AUTHENTICATED: RouteAccess = { kind: 'authenticated' };
const requires = (permission: Permission): RouteAccess => ({ kind: 'authenticated', permission });

const RULES: Rule[] = [
  // 公开：登录页、认证接口、健康检查（供负载均衡探活）
  { prefix: '/login', access: PUBLIC },
  { prefix: '/api/auth/login', access: PUBLIC },
  { prefix: '/api/auth/refresh', access: PUBLIC },
  { prefix: '/api/auth/logout', access: PUBLIC },
  { prefix: '/api/health', access: PUBLIC },

  // 管理后台页面
  { prefix: '/admin', access: requires(Permission.STATS_VIEW) },

  // 查询
  { prefix: '/api/query', access: requires(Permission.QUERY_EXECUTE) },

  // 审计（包含所有用户的查询记录）
  { prefix: '/api/audit', access: requires(Permission.AUDIT_VIEW) },

  // 统计与监控：首页需要概览数据，对所有登录用户开放
  { prefix: '/api/statistics/overview', methods: ['GET'], access: AUTHENTICATED },
  { prefix: '/api/statistics', access: requires(Permission.STATS_VIEW) },
  { prefix: '/api/performance', access: requires(Permission.STATS_VIEW) },
  { prefix: '/api/cache/stats', access: requires(Permission.STATS_VIEW) },
  { prefix: '/api/ai/cost', access: requires(Permission.STATS_VIEW) },
  { prefix: '/api/ai/diagnostic', access: requires(Permission.STATS_VIEW) },
  { prefix: '/api/ai/prompt-cache', methods: ['GET'], access: requires(Permission.STATS_VIEW) },

  // 系统配置与维护任务（定时任务通过 X-API-Key 调用）
  { prefix: '/api/admin', access: requires(Permission.SYSTEM_CONFIG) },
  { prefix: '/api/cache/clear', access: requires(Permission.SYSTEM_CONFIG) },
  { prefix: '/api/ai/prompt-cache', access: requires(Permission.SYSTEM_CONFIG) },

  // 数据资产：读对所有登录用户开放，写需要管理权限
  { prefix: '/api/datasources', methods: 'write', access: requires(Permission.DATASOURCE_MANAGE) },
  { prefix: '/api/metadata', methods: 'write', access: requires(Permission.METADATA_MANAGE) },
  { prefix: '/api/domains', methods: 'write', access: requires(Permission.METADATA_MANAGE) },
  { prefix: '/api/relationships', methods: 'write', access: requires(Permission.METADATA_MANAGE) },
];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

function matchesMethod(method: string, methods: Rule['methods']): boolean {
  if (!methods) return true;
  if (methods === 'write') return !READ_METHODS.has(method);
  return methods.includes(method);
}

export function resolveRouteAccess(pathname: string, method: string): RouteAccess {
  const upperMethod = method.toUpperCase();
  const rule = RULES.find(
    (r) => matchesPrefix(pathname, r.prefix) && matchesMethod(upperMethod, r.methods)
  );
  return rule?.access ?? AUTHENTICATED;
}
