/**
 * middleware：认证、访问控制、身份注入、速率限制
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const checkDistributedRateLimit = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock('@/lib/security/distributed-rate-limiter', () => ({
  distributedRateLimiters: { query: 'query', metadata: 'metadata', general: 'general', ai: 'ai', auth: 'auth' },
  getClientIp: () => '10.0.0.8',
  checkDistributedRateLimit: (...args: any[]) => checkDistributedRateLimit(...args),
}));

import { middleware } from '@/middleware';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/permissions';

const originalEnv = { ...process.env };

beforeEach(() => {
  checkDistributedRateLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, resetMs: 1000 });
});

afterEach(() => {
  process.env = { ...originalEnv };
});

async function cookieFor(role: UserRole, username = 'alice') {
  const token = await signAccessToken({ userId: '7', username, role, sessionId: 'sid-7' });
  return `galileo_at=${token}`;
}

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://galileo.local${path}`, {
    method: init.method ?? 'GET',
    headers: { host: 'galileo.local', ...init.headers },
  });
}

/** NextResponse.next({ request: { headers } }) 覆盖的请求头 */
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

describe('middleware - 未登录', () => {
  it('API 返回 401 JSON', async () => {
    const res = await middleware(request('/api/datasources'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: expect.any(String), code: 'unauthorized' });
    expect(checkDistributedRateLimit).not.toHaveBeenCalled();
  });

  it('页面重定向到刷新接口并带上原路径', async () => {
    const res = await middleware(request('/query/history?page=2'));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/api/auth/refresh');
    expect(location.searchParams.get('next')).toBe('/query/history?page=2');
  });

  it('公开路径直接放行：登录页、健康检查', async () => {
    expect((await middleware(request('/login'))).headers.get('x-middleware-next')).toBe('1');

    const health = await middleware(request('/api/health'));
    expect(health.headers.get('x-middleware-next')).toBe('1');
    expect(health.headers.get('API-Version')).toBeTruthy();
  });

  it('登录接口按 IP 使用 auth 限流器', async () => {
    await middleware(request('/api/auth/login', { method: 'POST' }));

    expect(checkDistributedRateLimit).toHaveBeenCalledWith('auth', 'ip:10.0.0.8');
  });

  it('无效 Token 视为未登录', async () => {
    const res = await middleware(request('/api/datasources', { headers: { cookie: 'galileo_at=garbage' } }));

    expect(res.status).toBe(401);
  });
});

describe('middleware - 已登录', () => {
  it('注入可信身份请求头，并按用户计数限流', async () => {
    const res = await middleware(
      request('/api/query/execute', { method: 'POST', headers: { cookie: await cookieFor(UserRole.USER, '张三') } })
    );

    expect(forwarded(res, 'x-user-id')).toBe('7');
    expect(forwarded(res, 'x-user-role')).toBe('user');
    expect(decodeURIComponent(forwarded(res, 'x-user-name')!)).toBe('张三');
    expect(forwarded(res, 'x-session-id')).toBe('sid-7');
    expect(checkDistributedRateLimit).toHaveBeenCalledWith('query', 'user:7');
  });

  it('手动执行保存的查询与执行查询共用限额，其他保存的查询接口走通用限额', async () => {
    const cookie = await cookieFor(UserRole.USER);
    await middleware(request('/api/saved-queries/4/run', { method: 'POST', headers: { cookie } }));
    expect(checkDistributedRateLimit).toHaveBeenLastCalledWith('query', 'user:7');

    await middleware(request('/api/saved-queries/4', { headers: { cookie } }));
    expect(checkDistributedRateLimit).toHaveBeenLastCalledWith('general', 'user:7');
  });

  it('客户端伪造的身份请求头被覆盖', async () => {
    const res = await middleware(
      request('/api/query/execute', {
        method: 'POST',
        headers: { cookie: await cookieFor(UserRole.USER), 'x-user-id': '1', 'x-user-role': 'admin' },
      })
    );

    expect(forwarded(res, 'x-user-id')).toBe('7');
    expect(forwarded(res, 'x-user-role')).toBe('user');
  });

  it('公开路径上伪造的身份请求头被剥离', async () => {
    const res = await middleware(request('/api/health', { headers: { 'x-user-id': '1', 'x-user-role': 'admin' } }));

    // 被删除的请求头不会出现在覆盖列表中
    const overridden = res.headers.get('x-middleware-override-headers')!.split(',');
    expect(overridden).not.toContain('x-user-id');
    expect(overridden).not.toContain('x-user-role');
  });

  it('普通用户访问管理接口返回 403，访问管理页面重定向到首页', async () => {
    const cookie = await cookieFor(UserRole.USER);

    const api = await middleware(request('/api/audit/logs', { headers: { cookie } }));
    expect(api.status).toBe(403);
    expect(await api.json()).toMatchObject({ code: 'forbidden' });

    const page = await middleware(request('/admin/audit', { headers: { cookie } }));
    expect(page.status).toBe(307);
    expect(new URL(page.headers.get('location')!).pathname).toBe('/');
  });

  it('普通用户可以读数据源，不能写', async () => {
    const cookie = await cookieFor(UserRole.USER);

    expect((await middleware(request('/api/datasources', { headers: { cookie } }))).status).toBe(200);
    expect((await middleware(request('/api/datasources/1/sync', { method: 'POST', headers: { cookie } }))).status).toBe(403);
  });

  it('管理员可以访问管理接口', async () => {
    const res = await middleware(request('/api/audit/logs', { headers: { cookie: await cookieFor(UserRole.ADMIN) } }));

    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-user-role')).toBe('admin');
  });

  it('超过速率限制返回 429', async () => {
    checkDistributedRateLimit.mockResolvedValue({ success: false, limit: 10, remaining: 0, resetMs: 5000, retryAfter: 5 });

    const res = await middleware(
      request('/api/query/execute', { method: 'POST', headers: { cookie: await cookieFor(UserRole.USER) } })
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('5');
  });
});

describe('middleware - API Key', () => {
  it('匹配 ADMIN_API_KEY 时以管理员身份放行', async () => {
    process.env.ADMIN_API_KEY = 'k'.repeat(40);

    const res = await middleware(request('/api/audit/logs', { headers: { 'x-api-key': 'k'.repeat(40) } }));

    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-user-id')).toBe('api-key');
    expect(forwarded(res, 'x-user-role')).toBe('admin');
  });

  it('API Key 不匹配或未配置时视为未登录', async () => {
    process.env.ADMIN_API_KEY = 'k'.repeat(40);
    expect((await middleware(request('/api/audit/logs', { headers: { 'x-api-key': 'wrong' } }))).status).toBe(401);

    delete process.env.ADMIN_API_KEY;
    expect((await middleware(request('/api/audit/logs', { headers: { 'x-api-key': '' } }))).status).toBe(401);
  });
});

describe('middleware - 跨站与配置', () => {
  it('跨站写请求返回 403', async () => {
    const res = await middleware(
      request('/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.example' } })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'cross_origin' });
  });

  it('同站写请求与跨站读请求不受影响', async () => {
    const cookie = await cookieFor(UserRole.ADMIN);

    const sameOrigin = await middleware(
      request('/api/datasources', { method: 'POST', headers: { cookie, origin: 'http://galileo.local' } })
    );
    expect(sameOrigin.status).toBe(200);

    const crossRead = await middleware(
      request('/api/datasources', { headers: { cookie, origin: 'https://other.example' } })
    );
    expect(crossRead.status).toBe(200);
  });

  it('反向代理场景使用 x-forwarded-host 比对', async () => {
    const res = await middleware(
      request('/api/auth/login', {
        method: 'POST',
        headers: { host: 'internal:3000', 'x-forwarded-host': 'galileo.example.com', origin: 'https://galileo.example.com' },
      })
    );

    expect(res.status).not.toBe(403);
  });

  it('JWT_SECRET 未配置时受保护路径返回 500，公开路径不受影响', async () => {
    const cookie = await cookieFor(UserRole.USER);
    delete process.env.JWT_SECRET;

    const res = await middleware(request('/api/datasources', { headers: { cookie } }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'auth_misconfigured' });

    expect((await middleware(request('/api/health'))).status).toBe(200);
  });
});
