export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getMetadataRetriever, getPrismaClient } from '@/lib/di/setup';
import { setVerifiedQueryActive } from '@/lib/feedback/feedback-service';
import { feedbackErrorResponse, parseId } from '@/lib/feedback/route-helpers';

/**
 * PATCH /api/admin/verified-queries/:id  { isActive: boolean }
 *
 * 停用或重新启用。重新启用时按当前元数据刷新表结构快照（表结构变化后自动停用的，
 * 由管理员确认 SQL 仍然正确后再启用）。
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseId(params.id);
    const body = await request.json().catch(() => ({}));
    if (!id || typeof body.isActive !== 'boolean') {
      return NextResponse.json({ success: false, error: '参数不正确' }, { status: 400 });
    }

    const verified = await setVerifiedQueryActive(getPrismaClient(), getMetadataRetriever(), id, body.isActive);
    return NextResponse.json({
      success: true,
      data: { id: verified.id, isActive: verified.isActive, invalidReason: verified.invalidReason },
    });
  } catch (error) {
    return feedbackErrorResponse(error, 'admin-verified-update');
  }
}
