/**
 * 契约测试：POST /api/query/preview
 */
import { describe, it, expect, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

const processNaturalLanguageQuery = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock('@/lib/di/setup', () => ({
  getQueryOrchestrator: () => ({ processNaturalLanguageQuery }),
}));

import { POST } from '@/app/api/query/preview/route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/query/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/query/preview', () => {
  it('成功：仅生成不执行，返回 sql / explanation / usedTables', async () => {
    processNaturalLanguageQuery.mockResolvedValue({
      success: true,
      metadata: {
        generatedSQL: 'SELECT 1',
        explanation: '说明',
        rowCount: 0,
        executionTime: 0,
        fromCache: false,
        columns: [],
        usedTables: ['t'],
      },
    });

    const res = await POST(request({ query: '查询' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, sql: 'SELECT 1', explanation: '说明', usedTables: ['t'] });
    expect(processNaturalLanguageQuery).toHaveBeenCalledWith('查询', {
      explainOnly: true,
      user: { id: undefined, role: 'guest' },
    });
  });

  it('透传 warnings 与 optimizationSuggestions（与 execute 接口一致）', async () => {
    processNaturalLanguageQuery.mockResolvedValue({
      success: true,
      metadata: { generatedSQL: 'SELECT 1', explanation: '', usedTables: [] },
      warnings: ['跨库 JOIN 可能影响性能'],
      suggestions: [{ type: 'index', message: 'm', impact: 'low' }],
    });

    const body = await (await POST(request({ query: '查询' }))).json();

    expect(body).toMatchObject({
      warnings: ['跨库 JOIN 可能影响性能'],
      optimizationSuggestions: [{ type: 'index', message: 'm', impact: 'low' }],
    });
  });

  it('空查询：400', async () => {
    const res = await POST(request({ query: '  ' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: expect.any(String) });
  });

  it('未通过 SQL 校验：422，并返回被拦截的 SQL', async () => {
    processNaturalLanguageQuery.mockResolvedValue({
      success: false,
      errorCode: 'validation_failed',
      error: '查询未通过安全校验：不允许执行 DELETE 操作',
      metadata: { generatedSQL: 'DELETE FROM t' },
    });

    const res = await POST(request({ query: '查询' }));

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ success: false, errorCode: 'validation_failed', sql: 'DELETE FROM t' });
  });

  it('未找到相关表：404', async () => {
    processNaturalLanguageQuery.mockResolvedValue({ success: false, error: '未找到相关的数据表' });

    const res = await POST(request({ query: '查询' }));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false });
  });
});
