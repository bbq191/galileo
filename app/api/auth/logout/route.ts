export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { AUTH_COOKIES } from '@/lib/auth/config';
import { verifyRefreshToken } from '@/lib/auth/tokens';
import { clearSession } from '@/lib/auth/session';

/**
 * POST /api/auth/logout
 *
 * 清除 Cookie，并递增 tokenVersion 使该用户所有设备上的 Refresh Token 失效。
 * 已签发的 Access Token 在剩余有效期（JWT_EXPIRES_IN）内仍然可用。
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIES.refresh)?.value;

  if (token) {
    try {
      const verified = await verifyRefreshToken(token);
      const userId = verified.ok ? Number(verified.payload.userId) : NaN;
      if (Number.isInteger(userId)) {
        await getPrismaClient().user.updateMany({
          where: { id: userId },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    } catch (error) {
      // 吊销失败不影响清除本地 Cookie
      console.error('[Auth] 登出时吊销 Refresh Token 失败:', error);
    }
  }

  const response = NextResponse.json({ success: true });
  clearSession(response);
  return response;
}
