/**
 * 契约测试：GET /api/datasources
 * 数据源、元数据、关系图谱、业务域管理页面均依赖此结构
 */
import { describe, it, expect, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

const listDataSources = jest.fn<(status?: string) => Promise<any[]>>();

jest.mock('@/lib/di/setup', () => ({
  getDataSourceOrchestrator: () => ({ listDataSources }),
}));

import { GET } from '@/app/api/datasources/route';

describe('GET /api/datasources', () => {
  it('成功：{ status: "success", data, total }', async () => {
    listDataSources.mockResolvedValue([{ id: 1, name: 'main' }]);

    const res = await GET(new NextRequest('http://localhost/api/datasources'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'success', data: [{ id: 1, name: 'main' }], total: 1 });
    expect(listDataSources).toHaveBeenCalledWith(undefined);
  });

  it('透传 status 过滤参数', async () => {
    listDataSources.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost/api/datasources?status=active'));

    expect(listDataSources).toHaveBeenCalledWith('active');
  });

  it('服务异常：500 + safeErrorResponse 结构 { success: false, error: { code, message } }', async () => {
    listDataSources.mockRejectedValue(new Error('boom'));

    const res = await GET(new NextRequest('http://localhost/api/datasources'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: { code: expect.any(String), message: expect.any(String) },
    });
  });
});
