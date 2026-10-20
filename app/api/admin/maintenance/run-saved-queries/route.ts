export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** 单次最多执行 SAVED_QUERY_MAX_PER_TICK 个查询，每个最长 30 秒 */
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { safeServerErrorResponse } from '@/lib/api/response';
import { runDueSavedQueries } from '@/lib/saved-queries/saved-query-service';
import { savedQueryDeps } from '@/lib/saved-queries/route-deps';

/**
 * POST /api/admin/maintenance/run-saved-queries
 *
 * 执行到期的定时刷新查询，供外部定时任务调用（建议每 10 分钟，见 manual/operations.md）。
 * 需要管理员权限（浏览器会话或 X-API-Key）。
 */
export async function POST() {
  try {
    const summary = await runDueSavedQueries(savedQueryDeps());
    console.log('[Maintenance] 定时查询执行完成', JSON.stringify(summary));
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return safeServerErrorResponse(error instanceof Error ? error : new Error('执行定时查询失败'), {
      context: 'maintenance-run-saved-queries',
    });
  }
}
