/**
 * 查询历史的归属隔离：普通用户只能看到自己的记录
 */
import { describe, it, expect, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

const getQueryHistory = jest.fn<(...args: any[]) => Promise<any>>();
const findUnique = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock('@/lib/di/setup', () => ({
  getAuditOrchestrator: () => ({ getQueryHistory }),
  getPrismaClient: () => ({ queryAuditLog: { findUnique } }),
}));

import { GET as list } from '@/app/api/query/history/route';
import { GET as detail } from '@/app/api/query/history/[id]/route';

const asUser = { 'x-user-id': '7', 'x-user-role': 'user' };
const asAdmin = { 'x-user-id': '1', 'x-user-role': 'admin' };

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://galileo.local${path}`, { headers });
}

function auditLog(userId: string | null) {
  return {
    id: BigInt(42),
    userId,
    userName: null,
    sessionId: 's',
    naturalLanguageQuery: 'q',
    intent: '{}',
    generatedSql: 'SELECT 1',
    executionSuccess: true,
    rowCount: 1,
    executionError: null,
    usedDatabases: '[]',
    usedTables: '[]',
    intentRecognitionTime: 1,
    sqlGenerationTime: 1,
    validationTime: 0,
    executionTime: 1,
    totalTime: 3,
    timestamp: new Date('2026-10-20T00:00:00Z'),
    ipAddress: null,
    userAgent: null,
  };
}

describe('GET /api/query/history', () => {
  getQueryHistory.mockResolvedValue({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });

  it('普通用户：强制按本人过滤，忽略 userId 参数', async () => {
    await list(req('/api/query/history?userId=1', asUser));

    expect(getQueryHistory).toHaveBeenLastCalledWith(expect.objectContaining({ userId: '7' }));
  });

  it('管理员：可按 userId 筛选，不传时查看全部', async () => {
    await list(req('/api/query/history?userId=7', asAdmin));
    expect(getQueryHistory).toHaveBeenLastCalledWith(expect.objectContaining({ userId: '7' }));

    await list(req('/api/query/history', asAdmin));
    expect(getQueryHistory).toHaveBeenLastCalledWith(expect.objectContaining({ userId: undefined }));
  });

  it('缺少身份时拒绝，不能退化为查询全部记录', async () => {
    getQueryHistory.mockClear();

    const res = await list(req('/api/query/history'));

    expect(res.status).toBe(401);
    expect(getQueryHistory).not.toHaveBeenCalled();
  });
});

describe('GET /api/query/history/[id]', () => {
  const params = { params: Promise.resolve({ id: '42' }) };

  it('本人记录：200', async () => {
    findUnique.mockResolvedValue(auditLog('7'));

    const res = await detail(req('/api/query/history/42', asUser), params);

    expect(res.status).toBe(200);
  });

  it('他人记录或无归属的历史记录：对普通用户返回 404', async () => {
    findUnique.mockResolvedValue(auditLog('8'));
    expect((await detail(req('/api/query/history/42', asUser), params)).status).toBe(404);

    findUnique.mockResolvedValue(auditLog(null));
    expect((await detail(req('/api/query/history/42', asUser), params)).status).toBe(404);
  });

  it('管理员可以查看任意记录', async () => {
    findUnique.mockResolvedValue(auditLog('8'));

    const res = await detail(req('/api/query/history/42', asAdmin), params);

    expect(res.status).toBe(200);
  });
});
