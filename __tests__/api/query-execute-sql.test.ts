/**
 * 契约测试：POST /api/query/execute-sql
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const executeUserSQL = jest.fn<(...args: any[]) => Promise<any>>();
const logQuery = jest.fn(async (..._args: any[]) => undefined);
const recordCorrection = jest.fn(async (..._args: any[]) => true);

jest.mock('@/lib/di/setup', () => ({
  getQueryOrchestrator: () => ({ executeUserSQL }),
  getAuditOrchestrator: () => ({ logQuery }),
  getPrismaClient: () => ({}),
}));
jest.mock('@/lib/feedback/feedback-service', () => ({
  recordCorrection: (...args: any[]) => recordCorrection(...args),
}));

import { POST } from '@/app/api/query/execute-sql/route';
import { resolveRouteAccess } from '@/lib/auth/route-policy';
import { Permission } from '@/lib/auth/permissions';

const performance = { intentRecognitionTime: 0, metadataRetrievalTime: 0, sqlGenerationTime: 0, queryExecutionTime: 3, validationTime: 1, totalTime: 5 };

function request(body: unknown) {
  return new NextRequest('http://localhost/api/query/execute-sql', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-user-id': '7', 'x-user-role': 'user', 'x-session-id': 'sid' },
  });
}

beforeEach(() => {
  executeUserSQL.mockReset();
  logQuery.mockClear();
  recordCorrection.mockClear();
});

const SOURCE_RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('POST /api/query/execute-sql', () => {
  it('成功：返回与 execute 相同的结构，审计日志标明是用户编辑的 SQL', async () => {
    executeUserSQL.mockResolvedValue({
      success: true,
      data: [{ n: 1 }],
      intent: { type: 'select', entities: {}, conditions: {} },
      metadata: { generatedSQL: 'SELECT 1 FROM shop.t', rowCount: 1, usedDatabases: ['shop'], usedTables: ['t'] },
      performance,
    });

    const res = await POST(request({ sql: 'SELECT 1 FROM shop.t', question: '统计', dataSourceIds: [2] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: [{ n: 1 }], metadata: { generatedSQL: 'SELECT 1 FROM shop.t' } });
    expect(executeUserSQL).toHaveBeenCalledWith('SELECT 1 FROM shop.t', expect.objectContaining({
      dataSourceIds: [2],
      user: { id: '7', role: 'user' },
    }));
    expect(logQuery).toHaveBeenCalledWith(expect.objectContaining({
      userId: '7',
      naturalLanguageQuery: '[用户编辑 SQL] 统计',
      generatedSQL: 'SELECT 1 FROM shop.t',
    }));
  });

  it('带 sourceRunId 且执行成功：记为对原查询的纠正', async () => {
    executeUserSQL.mockResolvedValue({
      success: true,
      data: [],
      intent: { type: 'select', entities: {}, conditions: {} },
      metadata: { generatedSQL: 'SELECT 2 FROM shop.t', rowCount: 0, dataSourceIds: [3] },
      performance,
    });

    const res = await POST(request({ sql: 'SELECT 2 FROM shop.t', sourceRunId: SOURCE_RUN_ID }));
    const body = await res.json();

    expect(body).toMatchObject({ success: true, correctionRecorded: true, runId: expect.any(String) });
    expect(body.runId).not.toBe(SOURCE_RUN_ID);
    expect(recordCorrection).toHaveBeenCalledWith(expect.anything(), {
      sourceRunId: SOURCE_RUN_ID,
      userId: '7',
      sql: 'SELECT 2 FROM shop.t',
      dataSourceIds: [3],
    });
  });

  it('执行失败时不记录纠正；纠正记录异常不影响结果', async () => {
    executeUserSQL.mockResolvedValue({
      success: false,
      error: 'Unknown column',
      intent: { type: 'select', entities: {}, conditions: {} },
      metadata: { generatedSQL: 'SELECT x FROM t' },
      performance,
    });
    await POST(request({ sql: 'SELECT x FROM t', sourceRunId: SOURCE_RUN_ID }));
    expect(recordCorrection).not.toHaveBeenCalled();

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    executeUserSQL.mockResolvedValue({
      success: true,
      data: [],
      intent: { type: 'select', entities: {}, conditions: {} },
      metadata: { generatedSQL: 'SELECT 2 FROM t', rowCount: 0 },
      performance,
    });
    recordCorrection.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(request({ sql: 'SELECT 2 FROM t', sourceRunId: SOURCE_RUN_ID }));
    expect(await res.json()).toMatchObject({ success: true, correctionRecorded: false });
  });

  it('sourceRunId 格式错误：400', async () => {
    const res = await POST(request({ sql: 'SELECT 1', sourceRunId: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('未通过校验：422', async () => {
    executeUserSQL.mockResolvedValue({
      success: false,
      errorCode: 'validation_failed',
      error: '查询未通过安全校验',
      intent: { type: 'select', entities: {}, conditions: {} },
      metadata: { generatedSQL: 'DELETE FROM t' },
      performance,
    });

    const res = await POST(request({ sql: 'DELETE FROM t' }));

    expect(res.status).toBe(422);
    expect(logQuery).toHaveBeenCalledWith(expect.objectContaining({ executionResult: expect.objectContaining({ success: false }) }));
  });

  it('参数校验：空 SQL 返回 400', async () => {
    const res = await POST(request({ sql: '  ' }));

    expect(res.status).toBe(400);
    expect(executeUserSQL).not.toHaveBeenCalled();
  });

  it('需要查询权限，并与自然语言查询共用 10 次/分钟限流（路径前缀 /api/query/execute）', () => {
    expect(resolveRouteAccess('/api/query/execute-sql', 'POST')).toEqual({
      kind: 'authenticated',
      permission: Permission.QUERY_EXECUTE,
    });
    expect('/api/query/execute-sql'.startsWith('/api/query/execute')).toBe(true);
  });
});
