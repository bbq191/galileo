export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { parseId, serviceErrorResponse } from '@/lib/api/service-error';
import { deleteSavedQuery, getSavedQuery, updateSavedQuery } from '@/lib/saved-queries/saved-query-service';
import { requireUser, savedQueryDeps } from '@/lib/saved-queries/route-deps';

type Params = { params: { id: string } };

const invalidId = () => NextResponse.json({ success: false, error: '无效的查询 ID' }, { status: 400 });

/**
 * GET /api/saved-queries/:id
 *
 * 详情与最近 20 次执行记录（不含结果预览，见 runs/:runId）；查看后未读结果标记为已读
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  const id = parseId(params.id);
  if (!id) return invalidId();
  try {
    return NextResponse.json({ success: true, data: await getSavedQuery(getPrismaClient(), auth.user.id, id) });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-detail');
  }
}

/**
 * PATCH /api/saved-queries/:id
 *
 * { title?, schedule?, runAtHour?, runOnWeekday?, status?: 'active' | 'paused' }
 * 因表结构变化而需要确认的查询，设置 status=active 表示用户确认 SQL 仍然正确，会刷新表结构快照。
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  const id = parseId(params.id);
  if (!id) return invalidId();
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateOrRespond(schemas.savedQueryUpdate, body);
    if ('response' in validation) return validation.response;

    const saved = await updateSavedQuery(savedQueryDeps(), auth.user.id, id, validation.data);
    return NextResponse.json({
      success: true,
      data: { id: saved.id, status: saved.status, schedule: saved.schedule, nextRunAt: saved.nextRunAt },
    });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-update');
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  const id = parseId(params.id);
  if (!id) return invalidId();
  try {
    await deleteSavedQuery(getPrismaClient(), auth.user.id, id);
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-delete');
  }
}
