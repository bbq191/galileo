export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { serviceErrorResponse } from '@/lib/api/service-error';
import { getSaveSuggestion } from '@/lib/saved-queries/saved-query-service';
import { requireUser } from '@/lib/saved-queries/route-deps';

/**
 * GET /api/saved-queries/suggestion?runId=...
 *
 * 是否提示用户保存：14 天内问过至少 3 次相同的问题且尚未保存时 suggest=true
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  const runId = request.nextUrl.searchParams.get('runId');
  if (!runId) {
    return NextResponse.json({ success: false, error: '缺少 runId' }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, data: await getSaveSuggestion(getPrismaClient(), auth.user.id, runId) });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-suggestion');
  }
}
