/**
 * 保存的查询接口的依赖装配与当前用户
 */

import { NextResponse } from 'next/server';
import { getMetadataRetriever, getPrismaClient, getQueryOrchestrator } from '@/lib/di/setup';
import { getUserFromRequest } from '@/lib/auth/permissions';
import type { SavedQueryDeps } from './saved-query-service';

export function savedQueryDeps(): SavedQueryDeps {
  return { prisma: getPrismaClient(), runner: getQueryOrchestrator(), resolver: getMetadataRetriever() };
}

/**
 * 当前登录用户；未登录（理论上已被 middleware 拦截）时返回 401 响应
 */
type CurrentUser = ReturnType<typeof getUserFromRequest> & { id: string };

export function requireUser(request: Request): { response: NextResponse } | { user: CurrentUser } {
  const user = getUserFromRequest(request);
  if (!user.id) {
    return { response: NextResponse.json({ success: false, error: '请先登录' }, { status: 401 }) };
  }
  return { user: { ...user, id: user.id } };
}
