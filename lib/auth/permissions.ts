/**
 * 权限验证模块
 *
 * 功能：
 * - 用户角色管理
 * - 权限检查
 * - API 访问控制
 */

import { NextRequest } from 'next/server';

/**
 * 用户角色枚举
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
    Permission.AUDIT_VIEW,
  ],
  [UserRole.GUEST]: [
    Permission.QUERY_EXECUTE,
  ],
};

/**
 * 从请求中提取用户信息
 *
 * 注意：这是一个简化的实现
 * 实际生产环境应该：
 * 1. 使用 JWT 或 Session 进行身份验证
 * 2. 从数据库查询用户角色
 * 3. 实现完整的认证中间件
 */
export function getUserFromRequest(request: NextRequest): {
  id?: string;
  role: UserRole;
  permissions: Permission[];
} {
  // 从请求头获取用户信息
  const authHeader = request.headers.get('Authorization');
  const apiKey = request.headers.get('X-API-Key');

  // 简化实现：通过环境变量配置的管理员 API Key
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (adminApiKey && apiKey === adminApiKey) {
    return {
      id: 'admin',
      role: UserRole.ADMIN,
      permissions: ROLE_PERMISSIONS[UserRole.ADMIN],
    };
  }

  // 简化实现：检查 Authorization header
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // TODO: 实现真实的 JWT 验证
    // const user = verifyJWT(token);
    // return user;

    // 暂时根据 token 前缀判断角色
    if (token.startsWith('admin_')) {
      return {
        id: 'admin',
        role: UserRole.ADMIN,
        permissions: ROLE_PERMISSIONS[UserRole.ADMIN],
      };
    } else if (token.startsWith('user_')) {
      return {
        id: token,
        role: UserRole.USER,
        permissions: ROLE_PERMISSIONS[UserRole.USER],
      };
    }
  }

  // 默认为访客权限
  return {
    role: UserRole.GUEST,
    permissions: ROLE_PERMISSIONS[UserRole.GUEST],
  };
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
