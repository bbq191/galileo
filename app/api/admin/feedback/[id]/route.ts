export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getMetadataRetriever, getPrismaClient } from '@/lib/di/setup';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { getUserFromRequest } from '@/lib/auth/permissions';
import { reviewFeedback } from '@/lib/feedback/feedback-service';
import { serviceErrorResponse, parseId } from '@/lib/api/service-error';

/**
 * POST /api/admin/feedback/:id
 *
 * 审核反馈：{ action: 'accept' | 'reject', question?, sql? }
 * 采纳时生成已验证查询；SQL 默认取用户纠正后的版本，没有纠正时取原 SQL。
 * SQL 中的表必须都在已同步的元数据中（400）。
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseId(params.id);
    if (!id) {
      return NextResponse.json({ success: false, error: '无效的反馈 ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateOrRespond(schemas.feedbackReview, body);
    if ('response' in validation) {
      return validation.response;
    }

    const reviewer = getUserFromRequest(request);
    const result = await reviewFeedback(getPrismaClient(), getMetadataRetriever(), {
      id,
      ...validation.data,
      reviewer: reviewer.username ?? reviewer.id ?? 'unknown',
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return serviceErrorResponse(error, 'admin-feedback-review');
  }
}
