export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { listVerifiedQueries } from '@/lib/feedback/feedback-service';
import { serviceErrorResponse, parsePagination } from '@/lib/api/service-error';

/**
 * GET /api/admin/verified-queries?active=true&page=1&limit=20
 *
 * 已验证查询列表；active 省略时返回全部（启用的在前）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const active = searchParams.get('active');
    const { page, limit } = parsePagination(searchParams);
    const { items, total } = await listVerifiedQueries(getPrismaClient(), {
      isActive: active === null ? undefined : active === 'true',
      page,
      limit,
    });
    return NextResponse.json({ success: true, data: items, total, page, limit });
  } catch (error) {
    return serviceErrorResponse(error, 'admin-verified-list');
  }
}
