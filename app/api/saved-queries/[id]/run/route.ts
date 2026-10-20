export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { parseId, serviceErrorResponse } from '@/lib/api/service-error';
import { runSavedQueryNow } from '@/lib/saved-queries/saved-query-service';
import { requireUser, savedQueryDeps } from '@/lib/saved-queries/route-deps';

/**
 * POST /api/saved-queries/:id/run
 *
 * 立即执行保存的 SQL（不调用 AI，enforce 校验），响应结构与 /api/query/execute 一致，另含 savedQueryRunId。
 * 与 /api/query/execute 共用 10 次/分钟的速率限制（见 proxy.ts）。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  const id = parseId(params.id);
  if (!id) {
    return NextResponse.json({ success: false, error: '无效的查询 ID' }, { status: 400 });
  }

  try {
    const { runId, result } = await runSavedQueryNow(savedQueryDeps(), auth.user, id);
    if (!result.success) {
      return NextResponse.json(
        { success: false, savedQueryRunId: runId, error: result.error, errorCode: result.errorCode, metadata: result.metadata },
        { status: result.errorCode ? 422 : 500 }
      );
    }
    return NextResponse.json({
      success: true,
      savedQueryRunId: runId,
      data: result.data,
      metadata: result.metadata,
      warnings: result.warnings,
    });
  } catch (error) {
    return serviceErrorResponse(error, 'saved-queries-run');
  }
}
