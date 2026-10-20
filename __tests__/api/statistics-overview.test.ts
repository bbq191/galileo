/**
 * 契约测试：GET /api/statistics/overview
 * 首页、/admin、/admin/statistics 均依赖此结构
 */
import { describe, it, expect, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

const getSystemOverview = jest.fn<() => Promise<any>>();

jest.mock('@/lib/di/setup', () => ({}));
jest.mock('@/lib/di/container', () => ({
  getContainer: () => ({ resolve: () => ({ getSystemOverview }) }),
}));

import { GET } from '@/app/api/statistics/overview/route';

function overview(healthScore: number) {
  return {
    overall: { healthScore, performanceScore: 90, reliabilityScore: 95 },
    realtime: {
      totalQueries: 100,
      successfulQueries: 95,
      failedQueries: 5,
      successRate: 95, // 0-100
      averageDuration: 120,
      p95Duration: 400,
    },
    cache: { totalHitRate: 0.6 /* 0-1 */, totalHits: 60, totalMisses: 40 },
    audit: { totalQueriesLogged: 1000, avgRecordsPerDay: 33 },
  };
}

const request = () => new NextRequest('http://localhost/api/statistics/overview');

describe('GET /api/statistics/overview', () => {
  it('成功：数据嵌套在 data.{system,queries,cache,audit} 下', async () => {
    getSystemOverview.mockResolvedValue(overview(85));

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      timestamp: expect.any(String),
      data: {
        system: { healthScore: 85, performanceScore: 90, reliabilityScore: 95, status: 'healthy' },
        queries: {
          total: 100,
          success: 95,
          failed: 5,
          successRate: 95,
          avgExecutionTime: 120,
          p95ExecutionTime: 400,
        },
        cache: { hitRate: 0.6, totalHits: 60, totalMisses: 40 },
        audit: { totalRecords: 1000, avgRecordsPerDay: 33, recentErrors: 5 },
      },
    });
  });

  it.each([
    [80, 'healthy'],
    [79, 'warning'],
    [60, 'warning'],
    [59, 'critical'],
  ])('healthScore=%i → system.status=%s', async (score, status) => {
    getSystemOverview.mockResolvedValue(overview(score));

    const body = await (await GET(request())).json();

    expect(body.data.system.status).toBe(status);
  });

  it('服务异常：500 + success: false', async () => {
    getSystemOverview.mockRejectedValue(new Error('boom'));

    const res = await GET(request());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ success: false });
  });
});
