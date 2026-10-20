export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { parseId, serviceErrorResponse } from '@/lib/api/service-error';
import { getSavedQueryRun } from '@/lib/saved-queries/saved-query-service';
import { requireUser } from '@/lib/saved-queries/route-deps';

/**
 * GET /api/saved-queries/:id/runs/:runId
 *
 * 一次执行的结果预览（最多 SAVED_QUERY_PREVIEW_ROWS 行）
 */
export async function GET(request: NextRequest, { params }: { params: { id: string; runId: string } }) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  const id = parseId(params.id);
  if (!id || !/^\d+$/.test(params.runId)) {
    return NextResponse.json({ success: false, error: '无效的 ID' }, { status: 400 });
  }
  try {
    const run = await getSavedQueryRun(getPrismaClient(), auth.user.id, id, BigInt(params.runId));
    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-run-detail');
  }
}
