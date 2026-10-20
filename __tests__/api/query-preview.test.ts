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
    expect(processNaturalLanguageQuery).toHaveBeenCalledWith('查询', { explainOnly: true });
  });

  it.todo('P1：返回 warnings 与 optimizationSuggestions（前端已读取，接口尚未返回）');

  it('空查询：400', async () => {
    const res = await POST(request({ query: '  ' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: expect.any(String) });
  });

  it('未找到相关表：404', async () => {
    processNaturalLanguageQuery.mockResolvedValue({ success: false, error: '未找到相关的数据表' });

    const res = await POST(request({ query: '查询' }));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false });
  });
});
