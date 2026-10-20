export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { parseId, serviceErrorResponse } from '@/lib/api/service-error';
import { setSuggestionHidden } from '@/lib/suggestions/question-suggestions';

/**
 * PATCH /api/admin/suggestions/:id  { isHidden: boolean }
 *
 * 隐藏后不再推荐，重建时保留隐藏状态
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  try {
    const id = parseId(params.id);
    const body = await request.json().catch(() => ({}));
    if (!id || typeof body.isHidden !== 'boolean') {
      return NextResponse.json({ success: false, error: '参数不正确' }, { status: 400 });
    }
    const updated = await setSuggestionHidden(getPrismaClient(), id, body.isHidden);
    return NextResponse.json({ success: true, data: { id: updated.id, isHidden: updated.isHidden } });
  } catch (error) {
    return serviceErrorResponse(error, 'admin-suggestions-update');
  }
}
