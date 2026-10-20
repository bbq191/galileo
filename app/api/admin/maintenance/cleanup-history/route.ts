export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getAuditOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/** 查询历史（审计日志）保留天数，与查询历史页面的说明保持一致 */
const DEFAULT_RETENTION_DAYS = 90;
const MIN_RETENTION_DAYS = 7;

/**
 * POST /api/admin/maintenance/cleanup-history
 *
 * 删除超过保留期的查询历史，供外部定时任务调用（见 manual/operations.md）。
 * 需要管理员权限（浏览器会话或 X-API-Key）。
 *
 * 请求体（可选）：{ "days": 90 }，默认取 QUERY_HISTORY_RETENTION_DAYS 或 90，最少 7 天
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const configured = Number(body.days ?? process.env.QUERY_HISTORY_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);

    if (!Number.isInteger(configured) || configured < MIN_RETENTION_DAYS) {
      return NextResponse.json(
        { success: false, error: `保留天数必须是不小于 ${MIN_RETENTION_DAYS} 的整数` },
        { status: 400 }
      );
    }

    const deleted = await getAuditOrchestrator().cleanupOldLogs(configured);
    console.log(`[Maintenance] 已清理 ${deleted} 条超过 ${configured} 天的查询历史`);

    return NextResponse.json({ success: true, data: { deleted, retentionDays: configured } });
  } catch (error) {
    return safeServerErrorResponse(error instanceof Error ? error : new Error('清理查询历史失败'), {
      context: 'maintenance-cleanup-history',
    });
  }
}
