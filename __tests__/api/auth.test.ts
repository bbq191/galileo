/**
 * 认证接口：登录、刷新、登出、当前用户
 */
import { describe, it, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/password';
import { signRefreshToken, verifyAccessToken, verifyRefreshToken } from '@/lib/auth/tokens';

interface FakeUser {
  id: number;
  username: string;
  passwordHash: string;
  displayName: string | null;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
  tokenVersion: number;
  lastLoginAt: Date | null;
}

const users = new Map<number, FakeUser>();

const prisma = {
  user: {
    findUnique: jest.fn(async ({ where }: any) =>
      where.id !== undefined
        ? users.get(where.id) ?? null
        : [...users.values()].find((u) => u.username === where.username) ?? null
    ),
    update: jest.fn(async ({ where, data }: any) => Object.assign(users.get(where.id)!, data)),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const user = users.get(where.id);
      if (user) user.tokenVersion += data.tokenVersion.increment;
      return { count: user ? 1 : 0 };
    }),
  },
};

jest.mock('@/lib/di/setup', () => ({ getPrismaClient: () => prisma }));

import { POST as login } from '@/app/api/auth/login/route';
import { GET as refreshPage, POST as refresh } from '@/app/api/auth/refresh/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';

let aliceHash: string;

beforeAll(async () => {
  aliceHash = await hashPassword('alice-password-123');
});

beforeEach(() => {
  users.clear();
  users.set(1, {
    id: 1,
    username: 'alice',
    passwordHash: aliceHash,
    displayName: 'Alice',
    role: 'user',
    isActive: true,
    tokenVersion: 0,
    lastLoginAt: null,
  });
});

function post(path: string, body?: unknown, cookie?: string) {
  return new NextRequest(`http://galileo.local${path}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: cookie ? { cookie } : {},
  });
}

/** 从 Set-Cookie 中取出指定 Cookie */
function getCookie(res: Response, name: string) {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  if (!header) return undefined;
  const [pair, ...attrs] = header.split(';').map((s) => s.trim());
  return { value: pair.slice(name.length + 1), attrs: attrs.map((a) => a.toLowerCase()) };
}

async function loginAsAlice() {
  const res = await login(post('/api/auth/login', { username: 'alice', password: 'alice-password-123' }));
  return { res, refreshToken: getCookie(res, 'galileo_rt')!.value };
}

describe('POST /api/auth/login', () => {
  it('成功：写入 httpOnly Cookie，返回用户信息与过期时间', async () => {
    const { res } = await loginAsAlice();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        user: { id: '1', username: 'alice', displayName: 'Alice', role: 'user' },
        expiresAt: expect.any(Number),
      },
    });
    expect(JSON.stringify(body)).not.toContain('passwordHash');

    const access = getCookie(res, 'galileo_at')!;
    expect(access.attrs).toEqual(expect.arrayContaining(['httponly', 'samesite=lax', 'path=/']));
    expect(await verifyAccessToken(access.value)).toMatchObject({
      ok: true,
      payload: { userId: '1', username: 'alice', role: 'user' },
    });

    const refreshCookie = getCookie(res, 'galileo_rt')!;
    expect(refreshCookie.attrs).toEqual(expect.arrayContaining(['httponly', 'path=/api/auth']));
    expect(users.get(1)!.lastLoginAt).toBeInstanceOf(Date);
  });

  it.each([
    ['密码错误', { username: 'alice', password: 'wrong-password' }],
    ['用户不存在', { username: 'nobody', password: 'alice-password-123' }],
  ])('%s：401，提示相同，不写 Cookie', async (_label, credentials) => {
    const res = await login(post('/api/auth/login', credentials));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: '用户名或密码错误' });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('账号停用：401', async () => {
    users.get(1)!.isActive = false;

    const res = await login(post('/api/auth/login', { username: 'alice', password: 'alice-password-123' }));

    expect(res.status).toBe(401);
  });

  it('缺少字段：400', async () => {
    const res = await login(post('/api/auth/login', { username: 'alice' }));

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  it('成功：换发新 Token，会话 ID 保持不变', async () => {
    const { refreshToken } = await loginAsAlice();
    const before = await verifyRefreshToken(refreshToken);

    const res = await refresh(post('/api/auth/refresh', undefined, `galileo_rt=${refreshToken}`));

    expect(res.status).toBe(200);
    expect((await res.json()).data.user.username).toBe('alice');
    const access = await verifyAccessToken(getCookie(res, 'galileo_at')!.value);
    expect(access.ok && before.ok && access.payload.sessionId).toBe(before.ok && before.payload.sessionId);
  });

  it('刷新时读取最新角色', async () => {
    const { refreshToken } = await loginAsAlice();
    users.get(1)!.role = 'admin';

    const res = await refresh(post('/api/auth/refresh', undefined, `galileo_rt=${refreshToken}`));

    expect(await verifyAccessToken(getCookie(res, 'galileo_at')!.value)).toMatchObject({
      payload: { role: 'admin' },
    });
  });

  it.each([
    ['无 Cookie', () => undefined],
    ['tokenVersion 已递增（登出 / 改密）', () => { users.get(1)!.tokenVersion = 1; }],
    ['账号已停用', () => { users.get(1)!.isActive = false; }],
    ['用户已删除', () => { users.clear(); }],
  ])('%s：401 并清除 Cookie', async (label, mutate) => {
    const { refreshToken } = await loginAsAlice();
    mutate();

    const cookie = label === '无 Cookie' ? undefined : `galileo_rt=${refreshToken}`;
    const res = await refresh(post('/api/auth/refresh', undefined, cookie));

    expect(res.status).toBe(401);
    expect(getCookie(res, 'galileo_at')!.attrs).toContain('max-age=0');
  });

  it('Access Token 不能当作 Refresh Token 使用', async () => {
    const { res: loginRes } = await loginAsAlice();
    const accessToken = getCookie(loginRes, 'galileo_at')!.value;

    const res = await refresh(post('/api/auth/refresh', undefined, `galileo_rt=${accessToken}`));

    expect(res.status).toBe(401);
  });

  it('旧 tokenVersion 签发的 Refresh Token 无效', async () => {
    users.get(1)!.tokenVersion = 5;
    const stale = await signRefreshToken({ userId: '1', sessionId: 's', tokenVersion: 4 });

    const res = await refresh(post('/api/auth/refresh', undefined, `galileo_rt=${stale}`));

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/refresh（页面跳转续期）', () => {
  it('成功：跳回 next 指定的页面', async () => {
    const { refreshToken } = await loginAsAlice();

    const res = await refreshPage(
      new NextRequest('http://galileo.local/api/auth/refresh?next=%2Fquery%3Fq%3D1', {
        headers: { cookie: `galileo_rt=${refreshToken}` },
      })
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://galileo.local/query?q=1');
    expect(getCookie(res, 'galileo_at')).toBeDefined();
  });

  it('失败：跳转登录页并保留 next', async () => {
    const res = await refreshPage(new NextRequest('http://galileo.local/api/auth/refresh?next=%2Fquery'));

    expect(res.headers.get('location')).toBe('http://galileo.local/login?next=%2Fquery');
  });

  it('next 指向站外时忽略', async () => {
    const { refreshToken } = await loginAsAlice();

    const res = await refreshPage(
      new NextRequest('http://galileo.local/api/auth/refresh?next=%2F%2Fevil.example', {
        headers: { cookie: `galileo_rt=${refreshToken}` },
      })
    );

    expect(res.headers.get('location')).toBe('http://galileo.local/');
  });
});

describe('POST /api/auth/logout', () => {
  it('清除 Cookie 并递增 tokenVersion，旧 Refresh Token 随即失效', async () => {
    const { refreshToken } = await loginAsAlice();

    const res = await logout(post('/api/auth/logout', undefined, `galileo_rt=${refreshToken}`));

    expect(res.status).toBe(200);
    expect(getCookie(res, 'galileo_at')!.attrs).toContain('max-age=0');
    expect(getCookie(res, 'galileo_rt')!.attrs).toContain('max-age=0');
    expect(users.get(1)!.tokenVersion).toBe(1);

    const again = await refresh(post('/api/auth/refresh', undefined, `galileo_rt=${refreshToken}`));
    expect(again.status).toBe(401);
  });

  it('无 Cookie 或 Token 无效时也返回成功', async () => {
    expect((await logout(post('/api/auth/logout'))).status).toBe(200);
    expect((await logout(post('/api/auth/logout', undefined, 'galileo_rt=garbage'))).status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('返回 middleware 注入的身份与权限', async () => {
    const res = await me(
      new NextRequest('http://galileo.local/api/auth/me', {
        headers: { 'x-user-id': '1', 'x-user-name': encodeURIComponent('张三'), 'x-user-role': 'user' },
      })
    );

    expect(await res.json()).toEqual({
      success: true,
      data: {
        user: { id: '1', username: '张三', role: 'user' },
        permissions: ['query:execute'],
        expiresAt: null,
      },
    });
  });

  it('未注入身份时返回 401', async () => {
    const res = await me(new NextRequest('http://galileo.local/api/auth/me'));

    expect(res.status).toBe(401);
  });
});
