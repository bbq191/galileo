export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { getUserFromRequest } from '@/lib/auth/permissions';
import { submitFeedback } from '@/lib/feedback/feedback-service';
import { feedbackErrorResponse } from '@/lib/feedback/route-helpers';

/**
 * POST /api/query/feedback
 *
 * 对自己的一次查询结果点赞 / 点踩，进入管理员审核队列（/admin/feedback）。
 * 请求体：{ runId, rating: 'up' | 'down', reason?, comment? }，runId 来自 /api/query/execute 的响应。
 * 重复提交覆盖原反馈；已审核的反馈不能修改（409）。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateOrRespond(schemas.queryFeedback, body);
    if ('response' in validation) {
      return validation.response;
    }

    const currentUser = getUserFromRequest(request);
    if (!currentUser.id) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const feedback = await submitFeedback(getPrismaClient(), { ...validation.data, userId: currentUser.id });
    return NextResponse.json({
      success: true,
      data: { id: feedback.id, rating: feedback.rating, reason: feedback.reason, status: feedback.status },
    });
  } catch (error) {
    return feedbackErrorResponse(error, 'query-feedback');
  }
}
