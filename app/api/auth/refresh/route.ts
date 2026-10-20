export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { AUTH_COOKIES } from '@/lib/auth/config';
import { verifyRefreshToken } from '@/lib/auth/tokens';
import {
  clearSession,
  createSession,
  sanitizeNextPath,
  toSessionUser,
  type IssuedSession,
  type SessionUser,
} from '@/lib/auth/session';

/**
 * 用 Refresh Token 换发新的 Token 对
 *
 * 与数据库比对 tokenVersion 和账号状态，因此登出、改密、停用后 Refresh Token 立即失效；
 * 会话 ID 保持不变，审计日志可以串联同一次登录内的操作。
 */
async function rotate(
  request: NextRequest
): Promise<{ user: SessionUser; session: IssuedSession } | null> {
  const token = request.cookies.get(AUTH_COOKIES.refresh)?.value;
  if (!token) return null;

  const verified = await verifyRefreshToken(token);
  if (!verified.ok) return null;

  const userId = Number(verified.payload.userId);
  if (!Number.isInteger(userId)) return null;

  const user = await getPrismaClient().user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || user.tokenVersion !== verified.payload.tokenVersion) {
    return null;
  }

  return {
    user: toSessionUser(user),
    session: await createSession(user, verified.payload.sessionId),
  };
}

/**
 * GET /api/auth/refresh?next=/path
 *
 * 页面请求时 Access Token 缺失或过期，middleware 会重定向到这里：
 * 续期成功跳回原页面，失败跳转登录页。
 */
export async function GET(request: NextRequest) {
  const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'));
  const result = await rotate(request).catch((error) => {
    console.error('[Auth] 刷新失败:', error);
    return null;
  });

  if (result) {
    const response = NextResponse.redirect(new URL(next, request.url));
    result.session.setCookies(response);
    return response;
  }

  const loginUrl = new URL('/login', request.url);
  if (next !== '/') loginUrl.searchParams.set('next', next);
  const response = NextResponse.redirect(loginUrl);
  clearSession(response);
  return response;
}

/**
 * POST /api/auth/refresh
 *
 * 前端定时续期，或 apiFetch 收到 401 后调用。
 */
export async function POST(request: NextRequest) {
  const result = await rotate(request).catch((error) => {
    console.error('[Auth] 刷新失败:', error);
    return null;
  });

  if (!result) {
    const response = NextResponse.json(
      { success: false, error: '登录已过期，请重新登录', code: 'unauthorized' },
      { status: 401 }
    );
    clearSession(response);
    return response;
  }

  const response = NextResponse.json({
    success: true,
    data: { user: result.user, expiresAt: result.session.expiresAt },
  });
  result.session.setCookies(response);
  return response;
}
