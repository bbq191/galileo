/**
 * 数据访问权限
 *
 * 将登录用户映射为 SQLValidator 使用的 UserPermissions（库 / 表级别）。
 *
 * 当前系统尚未定义数据级访问规则，所有角色均可查询全部已同步的表，
 * 因此返回不受限的权限；PermissionChecker 仍会拒绝非 SELECT 语句。
 * 引入库表级规则时只需修改本文件，并让 getDataScopeKey 反映规则差异（用于隔离查询缓存）。
 */

import type { UserPermissions } from '@/lib/sql/validator/types';
import type { UserRole } from './permissions';

export interface QueryUser {
  id?: string;
  role: UserRole;
}

export function getDataPermissions(user?: QueryUser): UserPermissions {
  return {
    userId: user?.id,
    unrestricted: true,
    canAccessTable: () => true,
  };
}

/**
 * 数据可见范围标识
 *
 * 用于查询结果缓存的 key：可见范围不同的用户不能共享缓存，
 * 否则无权访问某些表的用户可能通过缓存拿到其他用户的查询结果。
 */
export function getDataScopeKey(permissions: UserPermissions): string {
  if (permissions.unrestricted) return 'all';

  const databases = [...(permissions.allowedDatabases ?? [])].sort().join(',');
  const tables = [...(permissions.allowedTables ?? [])].sort().join(',');
  return `db=${databases};tbl=${tables}`;
}
