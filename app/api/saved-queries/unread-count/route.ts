export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { serviceErrorResponse } from '@/lib/api/service-error';
import { countUnreadRuns } from '@/lib/saved-queries/saved-query-service';
import { requireUser } from '@/lib/saved-queries/route-deps';

/**
 * GET /api/saved-queries/unread-count
 *
 * 定时刷新产生、尚未查看的执行结果数（导航栏角标）
 */
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  try {
    return NextResponse.json({ success: true, data: { count: await countUnreadRuns(getPrismaClient(), auth.user.id) } });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-unread');
  }
}
