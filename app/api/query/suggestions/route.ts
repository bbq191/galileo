export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { serviceErrorResponse } from '@/lib/api/service-error';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { listSuggestions } from '@/lib/suggestions/question-suggestions';

/**
 * GET /api/query/suggestions?dataSourceId=
 *
 * 推荐问题（最多 200 条，按分数倒序），前端用于空白页推荐、输入联想与失败时的相似问题。
 * verifiedEnabled=true 时，source=verified 的问题执行时会直接使用已验证的 SQL。
 */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get('dataSourceId');
  const dataSourceId = param ? Number(param) : undefined;
  if (dataSourceId !== undefined && !(Number.isInteger(dataSourceId) && dataSourceId > 0)) {
    return NextResponse.json({ success: false, error: '无效的数据源 ID' }, { status: 400 });
  }
  try {
    return NextResponse.json({
      success: true,
      data: await listSuggestions(getPrismaClient(), dataSourceId),
      verifiedEnabled: isFeatureEnabled('verifiedQueries'),
    });
  } catch (error) {
    return serviceErrorResponse(error, 'query-suggestions');
  }
}
