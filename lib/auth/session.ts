/**
 * 会话 Cookie 的签发与清除（API Routes 使用）
 */

import type { NextResponse } from 'next/server';
import type { User } from '@prisma/client';
import { AUTH_COOKIES, REFRESH_COOKIE_PATH, getAuthConfig } from './config';
import { signAccessToken, signRefreshToken } from './tokens';
import { UserRole } from './permissions';

/** 返回给前端的用户信息（不含密码哈希等敏感字段） */
export interface SessionUser {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
}

export function toSessionUser(user: Pick<User, 'id' | 'username' | 'displayName' | 'role'>): SessionUser {
  return {
    id: String(user.id),
    username: user.username,
    displayName: user.displayName,
    role: user.role as UserRole,
  };
}

export interface IssuedSession {
  /** Access Token 过期时间（毫秒时间戳），供前端安排续期 */
  expiresAt: number;
  /** 将 Token 写入响应 Cookie */
  setCookies(response: NextResponse): void;
}

/**
 * 签发 Access / Refresh Token
 */
export async function createSession(
  user: Pick<User, 'id' | 'username' | 'displayName' | 'role' | 'tokenVersion'>,
  sessionId: string
): Promise<IssuedSession> {
  const config = getAuthConfig();
  const sessionUser = toSessionUser(user);

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({
      userId: sessionUser.id,
      username: sessionUser.username,
      role: sessionUser.role,
      sessionId,
    }),
    signRefreshToken({ userId: sessionUser.id, sessionId, tokenVersion: user.tokenVersion }),
  ]);

  const common = { httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure };

  return {
    expiresAt: Date.now() + config.accessTtlSeconds * 1000,
    setCookies(response) {
      response.cookies.set(AUTH_COOKIES.access, accessToken, {
        ...common,
        path: '/',
        maxAge: config.accessTtlSeconds,
      });
      response.cookies.set(AUTH_COOKIES.refresh, refreshToken, {
        ...common,
        path: REFRESH_COOKIE_PATH,
        maxAge: config.refreshTtlSeconds,
      });
    },
  };
}

export function clearSession(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIES.access, '', { path: '/', maxAge: 0 });
  response.cookies.set(AUTH_COOKIES.refresh, '', { path: REFRESH_COOKIE_PATH, maxAge: 0 });
}

export { sanitizeNextPath } from './redirect';
