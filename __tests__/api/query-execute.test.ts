/**
 * 契约测试：POST /api/query/execute
 * 锁定 app/query/page.tsx 依赖的响应结构
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const processNaturalLanguageQuery = jest.fn<(...args: any[]) => Promise<any>>();
const logQuery = jest.fn<(...args: any[]) => Promise<void>>();
const logError = jest.fn<(...args: any[]) => Promise<void>>();

jest.mock('@/lib/di/setup', () => ({
  getQueryOrchestrator: () => ({ processNaturalLanguageQuery }),
  getAuditOrchestrator: () => ({ logQuery, logError }),
}));

// 速率限制依赖 Redis，契约测试中直接透传
jest.mock('@/lib/security/api-rate-limit-middleware', () => ({
  withQueryRateLimit: (handler: unknown) => handler,
}));

import { POST } from '@/app/api/query/execute/route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/query/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const performance = {
  intentRecognitionTime: 1,
  metadataRetrievalTime: 1,
  sqlGenerationTime: 1,
  queryExecutionTime: 1,
  totalTime: 4,
};

beforeEach(() => {
  logQuery.mockResolvedValue(undefined);
  logError.mockResolvedValue(undefined);
});

describe('POST /api/query/execute', () => {
  it('成功：返回 data / metadata / warnings / optimizationSuggestions', async () => {
    processNaturalLanguageQuery.mockResolvedValue({
      success: true,
      data: [{ total: 42 }],
      intent: { type: 'aggregate' },
      metadata: {
        generatedSQL: 'SELECT COUNT(*) AS total FROM `db`.`t`',
        explanation: '统计总数',
        rowCount: 1,
        executionTime: 5,
        fromCache: false,
        columns: [{ name: 'total', type: 'number' }],
        usedDatabases: ['db'],
        usedTables: ['t'],
      },
      performance,
      warnings: ['w'],
      suggestions: [{ type: 'index', message: 'm', impact: 'low' }],
    });

    const res = await POST(request({ query: '统计总数', options: { enableCache: true } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: [{ total: 42 }],
      metadata: expect.objectContaining({
        generatedSQL: expect.any(String),
        explanation: expect.any(String),
        rowCount: 1,
        executionTime: expect.any(Number),
        fromCache: false,
        columns: [{ name: 'total', type: 'number' }],
      }),
      warnings: ['w'],
      optimizationSuggestions: [{ type: 'index', message: 'm', impact: 'low' }],
    });
    expect(processNaturalLanguageQuery).toHaveBeenCalledWith(
      '统计总数',
      expect.objectContaining({ enableCache: true, sessionId: expect.any(String) })
    );
    expect(logQuery).toHaveBeenCalledTimes(1);
  });

  it('未找到相关表：404 + success: false', async () => {
    processNaturalLanguageQuery.mockResolvedValue({
      success: false,
      intent: { type: 'select' },
      error: '未找到相关的数据表，请检查查询内容',
      performance,
    });

    const res = await POST(request({ query: '不存在的数据' }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ success: false, error: expect.stringContaining('未找到') });
  });

  it('执行失败：500 + success: false，并带回已生成的 SQL', async () => {
    processNaturalLanguageQuery.mockResolvedValue({
      success: false,
      error: 'Unknown column',
      metadata: { generatedSQL: 'SELECT x FROM t', explanation: '', rowCount: 0, executionTime: 1, fromCache: false, columns: [] },
      performance,
    });

    const res = await POST(request({ query: '查询 x' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ success: false, error: 'Unknown column', metadata: { generatedSQL: 'SELECT x FROM t' } });
  });

  it('未通过 SQL 校验：422 + errorCode，并带回被拦截的 SQL', async () => {
    processNaturalLanguageQuery.mockResolvedValue({
      success: false,
      errorCode: 'validation_failed',
      error: '查询未通过安全校验：检测到严重安全问题',
      metadata: { generatedSQL: 'SELECT SLEEP(10)', explanation: '', rowCount: 0, executionTime: 0, fromCache: false, columns: [] },
      performance,
    });

    const res = await POST(request({ query: '查询' }));

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      success: false,
      errorCode: 'validation_failed',
      metadata: { generatedSQL: 'SELECT SLEEP(10)' },
    });
  });

  it('跨实例查询：422 + cross_source_unsupported', async () => {
    processNaturalLanguageQuery.mockResolvedValue({
      success: false,
      errorCode: 'cross_source_unsupported',
      error: '查询涉及位于不同数据库实例的多个数据源',
      performance,
    });

    const res = await POST(request({ query: '查询' }));

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errorCode: 'cross_source_unsupported' });
  });

  it('options.dataSourceId 透传给编排器，非法值被拒绝', async () => {
    processNaturalLanguageQuery.mockResolvedValue({ success: true, data: [], metadata: { columns: [] } });

    await POST(request({ query: '查询', options: { dataSourceId: 3 } }));
    expect(processNaturalLanguageQuery).toHaveBeenLastCalledWith('查询', expect.objectContaining({ dataSourceId: 3 }));

    const res = await POST(request({ query: '查询', options: { dataSourceId: -1 } }));
    expect(res.status).toBe(400);
  });

  it('把当前用户传给编排器', async () => {
    processNaturalLanguageQuery.mockResolvedValue({ success: true, data: [], metadata: { columns: [] } });

    await POST(new NextRequest('http://localhost/api/query/execute', {
      method: 'POST',
      body: JSON.stringify({ query: '查询' }),
      headers: { 'x-user-id': '7', 'x-user-role': 'user', 'x-session-id': 'sid-7' },
    }));

    expect(processNaturalLanguageQuery).toHaveBeenCalledWith('查询', expect.objectContaining({
      sessionId: 'sid-7',
      user: { id: '7', role: 'user' },
    }));
  });

  it('输入校验失败：400 + { error, details }', async () => {
    const res = await POST(request({ query: '' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ error: expect.any(String), details: expect.anything() });
    expect(processNaturalLanguageQuery).not.toHaveBeenCalled();
  });

  it('编排器抛异常：500 + 脱敏错误与 errorId', async () => {
    processNaturalLanguageQuery.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:3306'));

    const res = await POST(request({ query: '统计总数' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false, error: expect.any(String), errorId: expect.any(String) });
    expect(body.error).not.toContain('10.0.0.1');
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
