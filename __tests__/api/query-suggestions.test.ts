/**
 * 契约测试：推荐问题接口
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const listSuggestions = jest.fn(async (..._args: any[]) => [{ id: 1, question: '各城市订单数', source: 'verified', dataSourceIds: [1], userCount: 2 }]);
const rebuildSuggestions = jest.fn(async (..._args: any[]) => ({ verified: 1, popular: 2, template: 0, hidden: 0 }));

jest.mock('@/lib/di/setup', () => ({ getPrismaClient: () => ({}) }));
jest.mock('@/lib/suggestions/question-suggestions', () => ({
  listSuggestions: (...args: any[]) => listSuggestions(...args),
  rebuildSuggestions: (...args: any[]) => rebuildSuggestions(...args),
}));

import { GET } from '@/app/api/query/suggestions/route';
import { POST as rebuild } from '@/app/api/admin/maintenance/rebuild-suggestions/route';
import { resolveRouteAccess } from '@/lib/auth/route-policy';
import { Permission } from '@/lib/auth/permissions';

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('GET /api/query/suggestions', () => {
  it('返回推荐与已验证查询开关状态；按数据源过滤', async () => {
    process.env.ENABLE_VERIFIED_QUERIES = 'true';
    const res = await GET(new NextRequest('http://localhost/api/query/suggestions?dataSourceId=1'));

    expect(await res.json()).toEqual({
      success: true,
      data: [{ id: 1, question: '各城市订单数', source: 'verified', dataSourceIds: [1], userCount: 2 }],
      verifiedEnabled: true,
    });
    expect(listSuggestions).toHaveBeenLastCalledWith(expect.anything(), 1);
  });

  it('数据源 ID 非法：400', async () => {
    const res = await GET(new NextRequest('http://localhost/api/query/suggestions?dataSourceId=abc'));
    expect(res.status).toBe(400);
  });

  it('需要查询权限；重建与隐藏需要系统配置权限', async () => {
    expect(resolveRouteAccess('/api/query/suggestions', 'GET')).toEqual({ kind: 'authenticated', permission: Permission.QUERY_EXECUTE });
    expect(resolveRouteAccess('/api/admin/suggestions/1', 'PATCH')).toEqual({ kind: 'authenticated', permission: Permission.SYSTEM_CONFIG });

    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await (await rebuild()).json()).toEqual({ success: true, data: { verified: 1, popular: 2, template: 0, hidden: 0 } });
  });
});
