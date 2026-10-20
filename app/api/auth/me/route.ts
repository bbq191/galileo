export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIES } from '@/lib/auth/config';
import { getUserFromRequest } from '@/lib/auth/permissions';
import { verifyAccessToken } from '@/lib/auth/tokens';

/**
 * GET /api/auth/me
 *
 * 返回当前登录用户（身份已由 middleware 校验并注入请求头）。
 * expiresAt 供前端在 Access Token 过期前主动续期；API Key 调用时为 null。
 */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user.id) {
    return NextResponse.json({ success: false, error: '未登录', code: 'unauthorized' }, { status: 401 });
  }

  const token = request.cookies.get(AUTH_COOKIES.access)?.value;
  const verified = token ? await verifyAccessToken(token) : null;

  return NextResponse.json({
    success: true,
    data: {
      user: { id: user.id, username: user.username, role: user.role },
      permissions: user.permissions,
      expiresAt: verified?.ok ? verified.expiresAt : null,
    },
  });
}
