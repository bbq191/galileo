export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { serviceErrorResponse } from '@/lib/api/service-error';
import { createSavedQuery, listSavedQueries } from '@/lib/saved-queries/saved-query-service';
import { requireUser, savedQueryDeps } from '@/lib/saved-queries/route-deps';

/**
 * GET /api/saved-queries
 *
 * 当前用户保存的查询，附带每个查询的未读执行结果数（unreadRuns）
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  try {
    return NextResponse.json({ success: true, data: await listSavedQueries(getPrismaClient(), auth.user.id) });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-list');
  }
}

/**
 * POST /api/saved-queries
 *
 * 保存一次执行成功的查询：{ runId, title?, schedule?: 'none'|'daily'|'weekly', runAtHour?: 0-23, runOnWeekday?: 1-7 }
 * 保存的是该次查询最终执行的 SQL（AI 生成、已验证或用户编辑后的），之后执行不再调用 AI。
 */
export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateOrRespond(schemas.savedQueryCreate, body);
    if ('response' in validation) return validation.response;

    const saved = await createSavedQuery(savedQueryDeps(), { ...validation.data, userId: auth.user.id });
    return NextResponse.json({ success: true, data: { id: saved.id, title: saved.title, nextRunAt: saved.nextRunAt } }, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-create');
  }
}
