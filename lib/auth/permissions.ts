/**
 * 权限验证模块
 *
 * 功能：
 * - 用户角色管理
 * - 权限检查
 * - API 访问控制
 *
 * 注意：本模块同时被 middleware（Edge Runtime）引用，不能依赖 Node.js 专有 API。
 */

import type { NextRequest } from 'next/server';
import { IDENTITY_HEADERS } from './config';

/**
 * 用户角色枚举（与 Prisma 的 UserRole 枚举取值一致）
 */
export enum UserRole {
  /** 管理员 - 拥有所有权限 */
  ADMIN = 'admin',
  /** 普通用户 - 基本查询权限 */
  USER = 'user',
  /** 访客 - 只读权限 */
  GUEST = 'guest',
}

/**
 * 权限类型
 */
export enum Permission {
  /** 执行查询 */
  QUERY_EXECUTE = 'query:execute',
  /** 查看审计日志 */
  AUDIT_VIEW = 'audit:view',
  /** 查看统计数据 */
  STATS_VIEW = 'stats:view',
  /** 管理数据源 */
  DATASOURCE_MANAGE = 'datasource:manage',
  /** 管理元数据 */
  METADATA_MANAGE = 'metadata:manage',
  /** 系统配置 */
  SYSTEM_CONFIG = 'system:config',
}

/**
 * 角色权限映射
 *
 * 审计日志包含所有用户的查询记录，仅管理员可见；
 * 普通用户通过查询历史查看自己的记录。
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    Permission.QUERY_EXECUTE,
    Permission.AUDIT_VIEW,
    Permission.STATS_VIEW,
    Permission.DATASOURCE_MANAGE,
    Permission.METADATA_MANAGE,
    Permission.SYSTEM_CONFIG,
  ],
  [UserRole.USER]: [
    Permission.QUERY_EXECUTE,
  ],
  [UserRole.GUEST]: [
    Permission.QUERY_EXECUTE,
  ],
};

/**
 * 根据角色获取权限列表
 */
export function getPermissionsByRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function isUserRole(value: unknown): value is UserRole {
  return Object.values(UserRole).includes(value as UserRole);
}

/**
 * 从请求中提取用户信息
 *
 * 身份由 middleware 校验 Token 后通过可信请求头注入（见 IDENTITY_HEADERS），
 * 未注入时视为访客。
 */
export function getUserFromRequest(request: NextRequest | Request): {
  id?: string;
  role: UserRole;
  permissions: Permission[];
  username?: string;
  sessionId?: string;
} {
  const id = request.headers.get(IDENTITY_HEADERS.userId) || undefined;
  const roleHeader = request.headers.get(IDENTITY_HEADERS.role);
  const role = id && isUserRole(roleHeader) ? roleHeader : UserRole.GUEST;

  return {
    id,
    role,
    permissions: getPermissionsByRole(role),
    username: decodeHeader(request.headers.get(IDENTITY_HEADERS.userName)),
    sessionId: request.headers.get(IDENTITY_HEADERS.sessionId) || undefined,
  };
}

/**
 * 用户名可能包含非 ASCII 字符，middleware 注入时做了 URL 编码
 */
function decodeHeader(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 检查用户是否有指定权限
 */
export function hasPermission(user: {
  role: UserRole;
  permissions: Permission[];
}, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/**
 * 检查用户是否为管理员
 */
export function isAdmin(user: { role: UserRole }): boolean {
  return user.role === UserRole.ADMIN;
}

/**
 * 权限验证装饰器（用于 API 路由）
 */
export function requirePermission(permission: Permission) {
  return function (handler: (request: NextRequest, ...args: any[]) => Promise<Response>) {
    return async function (request: NextRequest, ...args: any[]): Promise<Response> {
      const user = getUserFromRequest(request);

      if (!hasPermission(user, permission)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: '权限不足',
            requiredPermission: permission,
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return handler(request, ...args);
    };
  };
}

/**
 * 管理员权限验证装饰器
 */
export function requireAdmin() {
  return function (handler: (request: NextRequest, ...args: any[]) => Promise<Response>) {
    return async function (request: NextRequest, ...args: any[]): Promise<Response> {
      const user = getUserFromRequest(request);

      if (!isAdmin(user)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: '需要管理员权限',
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return handler(request, ...args);
    };
  };
}

/**
 * 检查管理员权限（用于 API 路由内部）
 */
export async function checkAdminPermission(request: NextRequest): Promise<boolean> {
  const user = getUserFromRequest(request);
  return isAdmin(user);
}

/**
 * 检查指定权限（用于 API 路由内部）
 */
export async function checkPermission(request: NextRequest, permission: Permission): Promise<boolean> {
  const user = getUserFromRequest(request);
  return hasPermission(user, permission);
}
