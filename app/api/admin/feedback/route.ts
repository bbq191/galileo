export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { listFeedback } from '@/lib/feedback/feedback-service';
import { serviceErrorResponse, parsePagination } from '@/lib/api/service-error';

const STATUSES = ['pending', 'accepted', 'rejected'] as const;
const RATINGS = ['up', 'down', 'corrected'] as const;

/**
 * GET /api/admin/feedback?status=pending&rating=corrected&page=1&limit=20
 *
 * 反馈审核队列，按提交时间倒序。status 默认 pending，传 all 返回全部。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const statusParam = searchParams.get('status') ?? 'pending';
    const ratingParam = searchParams.get('rating');
    const status = STATUSES.find((s) => s === statusParam);
    const rating = RATINGS.find((r) => r === ratingParam);

    if ((statusParam !== 'all' && !status) || (ratingParam && !rating)) {
      return NextResponse.json({ success: false, error: '筛选参数不正确' }, { status: 400 });
    }

    const { page, limit } = parsePagination(searchParams);
    const { items, total } = await listFeedback(getPrismaClient(), { status, rating, page, limit });
    return NextResponse.json({ success: true, data: items, total, page, limit });
  } catch (error) {
    return serviceErrorResponse(error, 'admin-feedback-list');
  }
}
