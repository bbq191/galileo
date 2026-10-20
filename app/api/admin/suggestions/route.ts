export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { parsePagination, serviceErrorResponse } from '@/lib/api/service-error';
import { listSuggestionsForAdmin } from '@/lib/suggestions/question-suggestions';

/**
 * GET /api/admin/suggestions?page=1&limit=20
 *
 * 全部推荐问题（含已隐藏，隐藏的在前），供管理员检查并隐藏不宜公开的问题
 */
export async function GET(request: NextRequest) {
  try {
    const { page, limit } = parsePagination(request.nextUrl.searchParams);
    const { items, total } = await listSuggestionsForAdmin(getPrismaClient(), { page, limit });
    return NextResponse.json({ success: true, data: items, total, page, limit });
  } catch (error) {
    return serviceErrorResponse(error, 'admin-suggestions-list');
  }
}
