/**
 * 契约测试：保存的查询接口
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const service = {
  createSavedQuery: jest.fn<(...args: any[]) => Promise<any>>(),
  listSavedQueries: jest.fn<(...args: any[]) => Promise<any>>(),
  updateSavedQuery: jest.fn<(...args: any[]) => Promise<any>>(),
  deleteSavedQuery: jest.fn<(...args: any[]) => Promise<any>>(),
  runSavedQueryNow: jest.fn<(...args: any[]) => Promise<any>>(),
  getSavedQueryRun: jest.fn<(...args: any[]) => Promise<any>>(),
};

jest.mock('@/lib/di/setup', () => ({
  getPrismaClient: () => ({}),
  getQueryOrchestrator: () => ({}),
  getMetadataRetriever: () => ({}),
}));
jest.mock('@/lib/saved-queries/saved-query-service', () => ({
  createSavedQuery: (...args: any[]) => service.createSavedQuery(...args),
  listSavedQueries: (...args: any[]) => service.listSavedQueries(...args),
  updateSavedQuery: (...args: any[]) => service.updateSavedQuery(...args),
  deleteSavedQuery: (...args: any[]) => service.deleteSavedQuery(...args),
  runSavedQueryNow: (...args: any[]) => service.runSavedQueryNow(...args),
  getSavedQueryRun: (...args: any[]) => service.getSavedQueryRun(...args),
}));

import { GET as list, POST as create } from '@/app/api/saved-queries/route';
import { PATCH as update } from '@/app/api/saved-queries/[id]/route';
import { POST as runNow } from '@/app/api/saved-queries/[id]/run/route';
import { GET as runDetail } from '@/app/api/saved-queries/[id]/runs/[runId]/route';
import { ServiceError } from '@/lib/api/service-error';
import { resolveRouteAccess } from '@/lib/auth/route-policy';
import { Permission } from '@/lib/auth/permissions';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

function req(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = { 'x-user-id': '7', 'x-user-role': 'user' }) {
  return new NextRequest(`http://localhost${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers });
}

beforeEach(() => {
  Object.values(service).forEach((m) => m.mockReset());
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('/api/saved-queries', () => {
  it('保存：201，以当前用户身份；参数错误 400；未登录 401', async () => {
    service.createSavedQuery.mockResolvedValue({ id: 4, title: 't', nextRunAt: null });

    const res = await create(req('/api/saved-queries', 'POST', { runId: RUN_ID, schedule: 'daily', runAtHour: 8 }));
    expect(res.status).toBe(201);
    expect(service.createSavedQuery).toHaveBeenCalledWith(expect.anything(), { runId: RUN_ID, schedule: 'daily', runAtHour: 8, userId: '7' });

    expect((await create(req('/api/saved-queries', 'POST', { runId: RUN_ID, runAtHour: 24 }))).status).toBe(400);
    expect((await create(req('/api/saved-queries', 'POST', { runId: RUN_ID }, {}))).status).toBe(401);
  });

  it('服务层错误按状态码返回', async () => {
    service.listSavedQueries.mockRejectedValue(new ServiceError('x', 404));
    expect((await list(req('/api/saved-queries'))).status).toBe(404);
  });

  it('修改：status 只能是 active / paused', async () => {
    service.updateSavedQuery.mockResolvedValue({ id: 4, status: 'paused', schedule: 'daily', nextRunAt: null });
    const ok = await update(req('/api/saved-queries/4', 'PATCH', { status: 'paused' }), { params: Promise.resolve({ id: '4' }) });
    expect(ok.status).toBe(200);
    const bad = await update(req('/api/saved-queries/4', 'PATCH', { status: 'needs_review' }), { params: Promise.resolve({ id: '4' }) });
    expect(bad.status).toBe(400);
  });

  it('立即执行：响应结构与 /api/query/execute 一致；失败按 errorCode 返回 422', async () => {
    service.runSavedQueryNow.mockResolvedValue({
      runId: '9',
      result: { success: true, data: [{ n: 1 }], metadata: { rowCount: 1, columns: [] }, warnings: ['w'] },
    });
    const res = await runNow(req('/api/saved-queries/4/run', 'POST'), { params: Promise.resolve({ id: '4' }) });
    expect(await res.json()).toEqual({ success: true, savedQueryRunId: '9', data: [{ n: 1 }], metadata: { rowCount: 1, columns: [] }, warnings: ['w'] });
    expect(service.runSavedQueryNow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: '7', role: 'user' }), 4);

    service.runSavedQueryNow.mockResolvedValue({ runId: '10', result: { success: false, errorCode: 'validation_failed', error: '未通过' } });
    expect((await runNow(req('/api/saved-queries/4/run', 'POST'), { params: Promise.resolve({ id: '4' }) })).status).toBe(422);
  });

  it('执行记录详情：runId 必须是数字', async () => {
    service.getSavedQueryRun.mockResolvedValue({ id: '9' });
    expect((await runDetail(req('/api/saved-queries/4/runs/9'), { params: Promise.resolve({ id: '4', runId: '9' }) })).status).toBe(200);
    expect(service.getSavedQueryRun).toHaveBeenCalledWith(expect.anything(), '7', 4, BigInt(9));
    expect((await runDetail(req('/api/saved-queries/4/runs/x'), { params: Promise.resolve({ id: '4', runId: 'x' }) })).status).toBe(400);
  });

  it('需要查询权限', () => {
    expect(resolveRouteAccess('/api/saved-queries/4/run', 'POST')).toEqual({ kind: 'authenticated', permission: Permission.QUERY_EXECUTE });
  });
});
