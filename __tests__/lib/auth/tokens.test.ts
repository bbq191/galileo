import { describe, it, expect, afterEach } from '@jest/globals';
import { SignJWT } from 'jose';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '@/lib/auth/tokens';
import { getAuthConfig, parseDurationSeconds } from '@/lib/auth/config';
import { UserRole } from '@/lib/auth/permissions';
import { sanitizeNextPath } from '@/lib/auth/redirect';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

const access = { userId: '1', username: '张三', role: UserRole.USER, sessionId: 'sid-1' };

describe('tokens', () => {
  it('Access Token 签发后可校验并还原身份', async () => {
    const result = await verifyAccessToken(await signAccessToken(access));

    expect(result).toEqual({ ok: true, payload: access, expiresAt: expect.any(Number) });
  });

  it('Refresh Token 携带 tokenVersion', async () => {
    const token = await signRefreshToken({ userId: '1', sessionId: 'sid-1', tokenVersion: 3 });

    expect(await verifyRefreshToken(token)).toMatchObject({
      ok: true,
      payload: { userId: '1', sessionId: 'sid-1', tokenVersion: 3 },
    });
  });

  it('两种 Token 不能互换使用', async () => {
    const refresh = await signRefreshToken({ userId: '1', sessionId: 's', tokenVersion: 0 });
    const accessToken = await signAccessToken(access);

    expect(await verifyAccessToken(refresh)).toEqual({ ok: false, reason: 'invalid' });
    expect(await verifyRefreshToken(accessToken)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('过期后返回 expired', async () => {
    // jest fake timers 会破坏 jose 依赖的全局对象，这里直接签发一个已过期的 Token
    const config = getAuthConfig();
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ typ: 'access', name: 'u', role: 'user', sid: 's' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(config.secret);

    expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: 'expired' });
  });

  it('密钥不同则校验失败', async () => {
    const token = await signAccessToken(access);
    process.env.JWT_SECRET = 'another-secret-that-is-long-enough-0123456789';

    expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('篡改或格式错误的 Token 返回 invalid', async () => {
    const token = await signAccessToken(access);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: '1', role: 'admin', typ: 'access' })).toString('base64url');

    expect(await verifyAccessToken(`${header}.${forged}.${signature}`)).toEqual({ ok: false, reason: 'invalid' });
    expect(await verifyAccessToken('not-a-jwt')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('getAuthConfig', () => {
  it.each([
    ['未配置', undefined],
    ['过短', 'short'],
    ['示例值', 'your-super-secret-jwt-key-min-32-chars-change-in-production'],
  ])('JWT_SECRET %s时抛错', (_label, value) => {
    if (value === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = value;

    expect(() => getAuthConfig()).toThrow(/JWT_SECRET/);
  });

  it('生产环境默认 Secure Cookie，可通过 AUTH_COOKIE_SECURE 关闭', () => {
    Object.assign(process.env, { NODE_ENV: 'production' });
    expect(getAuthConfig().cookieSecure).toBe(true);

    process.env.AUTH_COOKIE_SECURE = 'false';
    expect(getAuthConfig().cookieSecure).toBe(false);
  });

  it('parseDurationSeconds', () => {
    expect(parseDurationSeconds('30m')).toBe(1800);
    expect(parseDurationSeconds('7d')).toBe(604800);
    expect(() => parseDurationSeconds('7 days')).toThrow();
  });
});

describe('sanitizeNextPath', () => {
  it.each([
    ['/query?q=1', '/query?q=1'],
    [null, '/'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['/login', '/'],
    ['/api/auth/refresh', '/'],
  ])('%s → %s', (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });
});
