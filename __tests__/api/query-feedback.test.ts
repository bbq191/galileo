/**
 * 契约测试：查询反馈与审核接口
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const submitFeedback = jest.fn<(...args: any[]) => Promise<any>>();
const reviewFeedback = jest.fn<(...args: any[]) => Promise<any>>();
const listFeedback = jest.fn<(...args: any[]) => Promise<any>>();
const setVerifiedQueryActive = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock('@/lib/di/setup', () => ({
  getPrismaClient: () => ({}),
  getMetadataRetriever: () => ({}),
}));
jest.mock('@/lib/feedback/feedback-service', () => {
  const actual = jest.requireActual('@/lib/feedback/feedback-service') as Record<string, unknown>;
  return {
    FeedbackError: actual.FeedbackError,
    submitFeedback: (...args: any[]) => submitFeedback(...args),
    reviewFeedback: (...args: any[]) => reviewFeedback(...args),
    listFeedback: (...args: any[]) => listFeedback(...args),
    setVerifiedQueryActive: (...args: any[]) => setVerifiedQueryActive(...args),
  };
});

import { POST as postFeedback } from '@/app/api/query/feedback/route';
import { GET as listRoute } from '@/app/api/admin/feedback/route';
import { POST as reviewRoute } from '@/app/api/admin/feedback/[id]/route';
import { PATCH as patchVerified } from '@/app/api/admin/verified-queries/[id]/route';
import { FeedbackError } from '@/lib/feedback/feedback-service';
import { resolveRouteAccess } from '@/lib/auth/route-policy';
import { Permission } from '@/lib/auth/permissions';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const user = { 'x-user-id': '7', 'x-user-role': 'user', 'x-user-name': 'alice' };

function req(path: string, method: string, body?: unknown, headers: Record<string, string> = user) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  });
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  submitFeedback.mockReset();
  reviewFeedback.mockReset();
  listFeedback.mockReset();
});

describe('POST /api/query/feedback', () => {
  it('提交反馈：以当前用户身份', async () => {
    submitFeedback.mockResolvedValue({ id: 1, rating: 'down', reason: 'wrong_filter', status: 'pending' });

    const res = await postFeedback(req('/api/query/feedback', 'POST', { runId: RUN_ID, rating: 'down', reason: 'wrong_filter' }));

    expect(await res.json()).toEqual({ success: true, data: { id: 1, rating: 'down', reason: 'wrong_filter', status: 'pending' } });
    expect(submitFeedback).toHaveBeenCalledWith(expect.anything(), { runId: RUN_ID, rating: 'down', reason: 'wrong_filter', userId: '7' });
  });

  it('参数错误 400；FeedbackError 按其状态码返回', async () => {
    expect((await postFeedback(req('/api/query/feedback', 'POST', { runId: 'x', rating: 'up' }))).status).toBe(400);
    expect((await postFeedback(req('/api/query/feedback', 'POST', { runId: RUN_ID, rating: 'meh' }))).status).toBe(400);

    submitFeedback.mockRejectedValue(new FeedbackError('只能反馈自己的查询', 403));
    const res = await postFeedback(req('/api/query/feedback', 'POST', { runId: RUN_ID, rating: 'up' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: '只能反馈自己的查询' });
  });

  it('需要查询权限；审核接口需要系统配置权限', () => {
    expect(resolveRouteAccess('/api/query/feedback', 'POST')).toEqual({ kind: 'authenticated', permission: Permission.QUERY_EXECUTE });
    expect(resolveRouteAccess('/api/admin/feedback', 'GET')).toEqual({ kind: 'authenticated', permission: Permission.SYSTEM_CONFIG });
    expect(resolveRouteAccess('/api/admin/verified-queries/1', 'PATCH')).toEqual({ kind: 'authenticated', permission: Permission.SYSTEM_CONFIG });
  });
});

describe('/api/admin/feedback', () => {
  it('列表默认只看待审核，status=all 返回全部；非法参数 400', async () => {
    listFeedback.mockResolvedValue({ items: [{ id: 1 }], total: 1 });

    const res = await listRoute(req('/api/admin/feedback', 'GET'));
    expect(await res.json()).toEqual({ success: true, data: [{ id: 1 }], total: 1, page: 1, limit: 20 });
    expect(listFeedback).toHaveBeenLastCalledWith(expect.anything(), { status: 'pending', rating: undefined, page: 1, limit: 20 });

    await listRoute(req('/api/admin/feedback?status=all&rating=corrected&page=2&limit=500', 'GET'));
    expect(listFeedback).toHaveBeenLastCalledWith(expect.anything(), { status: undefined, rating: 'corrected', page: 2, limit: 100 });

    expect((await listRoute(req('/api/admin/feedback?status=done', 'GET'))).status).toBe(400);
  });

  it('审核：记录审核人；采纳时可修改问题与 SQL', async () => {
    reviewFeedback.mockResolvedValue({ feedback: { id: 3, status: 'accepted' }, verifiedQuery: { id: 9 } });

    const res = await reviewRoute(
      req('/api/admin/feedback/3', 'POST', { action: 'accept', question: ' 订单数 ', sql: 'SELECT 1 FROM t' }),
      { params: Promise.resolve({ id: '3' }) }
    );

    expect(res.status).toBe(200);
    expect(reviewFeedback).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      id: 3, action: 'accept', question: '订单数', sql: 'SELECT 1 FROM t', reviewer: 'alice',
    });
    expect((await reviewRoute(req('/api/admin/feedback/x', 'POST', { action: 'accept' }), { params: Promise.resolve({ id: 'x' }) })).status).toBe(400);
    expect((await reviewRoute(req('/api/admin/feedback/3', 'POST', { action: 'maybe' }), { params: Promise.resolve({ id: '3' }) })).status).toBe(400);
  });

  it('已验证查询启用 / 停用：isActive 必须是布尔值', async () => {
    setVerifiedQueryActive.mockResolvedValue({ id: 2, isActive: false, invalidReason: '管理员停用' });

    const res = await patchVerified(req('/api/admin/verified-queries/2', 'PATCH', { isActive: false }), { params: Promise.resolve({ id: '2' }) });
    expect(await res.json()).toEqual({ success: true, data: { id: 2, isActive: false, invalidReason: '管理员停用' } });
    expect((await patchVerified(req('/api/admin/verified-queries/2', 'PATCH', { isActive: 'no' }), { params: Promise.resolve({ id: '2' }) })).status).toBe(400);
  });
});
