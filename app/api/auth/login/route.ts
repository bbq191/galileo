export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { safeServerErrorResponse } from '@/lib/api/response';
import { verifyPassword, verifyPasswordAgainstDummy } from '@/lib/auth/password';
import { createSession, toSessionUser } from '@/lib/auth/session';

const INVALID_CREDENTIALS = '用户名或密码错误';

/**
 * POST /api/auth/login
 *
 * 校验用户名密码，成功后写入 Access / Refresh Token Cookie。
 * 用户不存在、密码错误、账号停用统一返回同一提示，避免枚举用户名。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateOrRespond(schemas.login, body);
    if ('response' in validation) {
      return validation.response;
    }

    const { username, password } = validation.data;
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({ where: { username } });

    const passwordOk = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPasswordAgainstDummy(password);

    if (!user || !passwordOk || !user.isActive) {
      console.warn(`[Auth] 登录失败: username="${username}"`);
      return NextResponse.json({ success: false, error: INVALID_CREDENTIALS }, { status: 401 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const session = await createSession(user, randomUUID());
    const response = NextResponse.json({
      success: true,
      data: { user: toSessionUser(user), expiresAt: session.expiresAt },
    });
    session.setCookies(response);
    console.log(`[Auth] 登录成功: userId=${user.id}`);

    return response;
  } catch (error) {
    return safeServerErrorResponse(error instanceof Error ? error : new Error('登录失败'), {
      context: 'auth-login',
    });
  }
}
