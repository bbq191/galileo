/**
 * /api/performance：重置只能用 POST（GET 可被跨站链接触发）
 */
import { describe, it, expect, jest } from '@jest/globals';
import { NextRequest } from 'next/server';

const reset = jest.fn();
jest.mock('@/lib/api/performance-monitor', () => ({ performanceMonitor: { reset } }));
jest.mock('@/lib/cache', () => ({ cacheStats: { reset }, multiLevelCache: {} }));

import { GET, POST } from '@/app/api/performance/route';

describe('/api/performance 重置', () => {
  it('GET ?action=reset 返回 405，不执行重置', async () => {
    const res = await GET(new NextRequest('http://localhost/api/performance?action=reset'));

    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    expect(reset).not.toHaveBeenCalled();
  });

  it('POST ?action=reset 执行重置', async () => {
    const res = await POST(new NextRequest('http://localhost/api/performance?action=reset', { method: 'POST' }));

    expect(res.status).toBe(200);
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('POST 其他 action 返回 400', async () => {
    const res = await POST(new NextRequest('http://localhost/api/performance?action=drop', { method: 'POST' }));

    expect(res.status).toBe(400);
  });
});
