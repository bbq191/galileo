export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';
import { rebuildSuggestions } from '@/lib/suggestions/question-suggestions';

/**
 * POST /api/admin/maintenance/rebuild-suggestions
 *
 * 按已验证查询、近 30 天的热门问题与查询模板重建推荐问题，供外部定时任务调用（建议每天一次）。
 * 需要管理员权限（浏览器会话或 X-API-Key）。
 */
export async function POST() {
  try {
    const summary = await rebuildSuggestions(getPrismaClient());
    console.log('[Maintenance] 推荐问题已重建', JSON.stringify(summary));
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return safeServerErrorResponse(error instanceof Error ? error : new Error('重建推荐问题失败'), {
      context: 'maintenance-rebuild-suggestions',
    });
  }
}
