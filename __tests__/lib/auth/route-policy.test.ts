import { describe, it, expect } from '@jest/globals';
import { resolveRouteAccess } from '@/lib/auth/route-policy';
import { Permission, UserRole, getPermissionsByRole } from '@/lib/auth/permissions';

const PUBLIC = { kind: 'public' };
const AUTH = { kind: 'authenticated' };
const needs = (permission: Permission) => ({ kind: 'authenticated', permission });

describe('resolveRouteAccess', () => {
  it.each([
    // 公开
    ['GET', '/login', PUBLIC],
    ['POST', '/api/auth/login', PUBLIC],
    ['GET', '/api/auth/refresh', PUBLIC],
    ['POST', '/api/auth/logout', PUBLIC],
    ['GET', '/api/health', PUBLIC],
    // 前缀匹配不能越界：/loginx 不是 /login
    ['GET', '/loginx', AUTH],
    ['GET', '/api/auth/me', AUTH],
    // 页面
    ['GET', '/', AUTH],
    ['GET', '/query', AUTH],
    ['GET', '/admin', needs(Permission.STATS_VIEW)],
    ['GET', '/admin/audit', needs(Permission.STATS_VIEW)],
    // 查询
    ['POST', '/api/query/execute', needs(Permission.QUERY_EXECUTE)],
    ['GET', '/api/query/history', needs(Permission.QUERY_EXECUTE)],
    // 审计与统计
    ['GET', '/api/audit/logs', needs(Permission.AUDIT_VIEW)],
    ['GET', '/api/statistics/overview', AUTH],
    ['GET', '/api/statistics/hotspots', needs(Permission.STATS_VIEW)],
    ['GET', '/api/performance', needs(Permission.STATS_VIEW)],
    ['GET', '/api/ai/prompt-cache', needs(Permission.STATS_VIEW)],
    ['DELETE', '/api/ai/prompt-cache', needs(Permission.SYSTEM_CONFIG)],
    ['POST', '/api/cache/clear', needs(Permission.SYSTEM_CONFIG)],
    // 数据资产：读开放，写受限
    ['GET', '/api/datasources', AUTH],
    ['POST', '/api/datasources', needs(Permission.DATASOURCE_MANAGE)],
    ['POST', '/api/datasources/1/sync', needs(Permission.DATASOURCE_MANAGE)],
    ['DELETE', '/api/datasources/1', needs(Permission.DATASOURCE_MANAGE)],
    ['GET', '/api/metadata/tables', AUTH],
    ['PUT', '/api/metadata/columns/1', needs(Permission.METADATA_MANAGE)],
    ['POST', '/api/metadata/relationships/infer', needs(Permission.METADATA_MANAGE)],
    ['PUT', '/api/domains/1', needs(Permission.METADATA_MANAGE)],
    ['POST', '/api/relationships/verify', needs(Permission.METADATA_MANAGE)],
    // 未列出的路径默认要求登录
    ['GET', '/api/docs/openapi', AUTH],
  ])('%s %s', (method, path, expected) => {
    expect(resolveRouteAccess(path, method)).toEqual(expected);
  });

  it('方法名大小写不敏感', () => {
    expect(resolveRouteAccess('/api/datasources', 'post')).toEqual(needs(Permission.DATASOURCE_MANAGE));
  });
});

describe('角色权限', () => {
  it('普通用户和访客只能查询，管理员拥有全部权限', () => {
    expect(getPermissionsByRole(UserRole.USER)).toEqual([Permission.QUERY_EXECUTE]);
    expect(getPermissionsByRole(UserRole.GUEST)).toEqual([Permission.QUERY_EXECUTE]);
    expect(getPermissionsByRole(UserRole.ADMIN)).toEqual(expect.arrayContaining(Object.values(Permission)));
  });
});
