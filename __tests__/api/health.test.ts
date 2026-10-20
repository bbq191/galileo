/**
 * 契约测试：GET /api/health
 * 首页、/admin、/admin/health、/admin/performance 均依赖此结构
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const healthStatus = new Map<string, { healthy: boolean }>();

const services = {
  prisma: jest.fn(() => ({ $queryRaw: jest.fn(async () => [1]) })),
  connectionManager: jest.fn(() => ({
    getConnectionCount: () => healthStatus.size,
    getAllHealthStatus: async () => healthStatus,
  })),
  multiLevelCache: jest.fn(() => ({
    getStats: () => ({ l1Size: 1, l1MaxSize: 100, hitRate: 0.5 }),
  })),
  queryCacheManager: jest.fn(() => ({
    getStatistics: () => ({ totalHits: 1, totalMisses: 1, hitRate: 0.5 }),
  })),
  cacheInvalidationService: jest.fn(() => ({ getCacheStatus: () => ({}) })),
};

jest.mock('@/lib/di/helpers/app-router', () => ({ getService: services }));
jest.mock('@/lib/cache/redis-client', () => ({ checkRedisHealth: async () => true }));
jest.mock('@/lib/security/redis-rate-limiter', () => ({
  getRedisRateLimiterInfo: () => ({ type: 'redis' }),
}));
jest.mock('@/lib/security/distributed-rate-limiter', () => ({
  getRateLimiterInfo: () => ({ type: 'distributed' }),
}));

import { GET } from '@/app/api/health/route';

const originalEnv = { ...process.env };
const request = () => new NextRequest('http://localhost/api/health');

beforeEach(() => {
  healthStatus.clear();
  healthStatus.set('1', { healthy: true });
  process.env.DEEPSEEK_API_KEY = 'k';
  process.env.DEEPSEEK_API_URL = 'u';
  process.env.DEEPSEEK_MODEL = 'm';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('GET /api/health', () => {
  it('全部正常：200 + status "ok"，各项检查位于 checks 下', async () => {
    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      timestamp: expect.any(String),
      checks: {
        prisma: { status: 'ok' },
        connectionManager: { status: 'ok', totalConnections: 1, healthyConnections: 1 },
        multiLevelCache: { status: 'ok' },
        queryCacheManager: { status: 'ok' },
        cacheInvalidationService: { status: 'ok' },
        redis: { status: 'ok', connected: true },
        rateLimiter: { status: 'ok' },
        aiService: { status: 'ok', configured: true },
      },
    });
    // 首页曾按 'healthy' / database / redis 顶层字段读取，这些字段不存在
    expect(body).not.toHaveProperty('database');
    expect(body).not.toHaveProperty('redis');
  });

  it('存在不健康连接：503 + status "degraded"，响应体仍完整', async () => {
    healthStatus.set('2', { healthy: false });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      status: 'degraded',
      checks: { connectionManager: { status: 'degraded', healthyConnections: 1, totalConnections: 2 } },
    });
  });

  it('AI 未配置：503 + status "degraded"', async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.checks.aiService).toMatchObject({ status: 'degraded', configured: false });
  });

  it('数据库不可用：checks.prisma.status 为 "error"', async () => {
    services.prisma.mockReturnValueOnce({
      $queryRaw: jest.fn(async () => {
        throw new Error('down');
      }),
    });

    const body = await (await GET(request())).json();

    expect(body.checks.prisma).toMatchObject({ status: 'error' });
  });
});
