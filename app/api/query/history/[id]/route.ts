export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';
import type { QueryDetailResponse } from '@/lib/api/types';
import { getUserFromRequest, isAdmin } from '@/lib/auth/permissions';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    console.log('[Query Detail] API called with ID:', params.id);

    const id = parseInt(params.id, 10);

    if (isNaN(id)) {
      return NextResponse.json({
        success: false,
        error: '无效的查询 ID',
      } as QueryDetailResponse, { status: 400 });
    }

    console.log(`[Query Detail] Fetching detail for ID: ${id}`);

    // 获取 Prisma 客户端
    const prisma = getPrismaClient();
    console.log('[Query Detail] Prisma client obtained:', !!prisma);

    // 查询审计日志
    const log = await prisma.queryAuditLog.findUnique({
      where: { id: BigInt(id) },
    });

    console.log('[Query Detail] Query result:', !!log);

    // 非本人的记录对普通用户按不存在处理，避免泄露记录是否存在
    const currentUser = getUserFromRequest(request);
    if (!log || (!isAdmin(currentUser) && log.userId !== currentUser.id)) {
      return NextResponse.json({
        success: false,
        error: '查询记录不存在',
      } as QueryDetailResponse, { status: 404 });
    }

    // 格式化返回数据 - 添加安全检查
    const data = {
      id: Number(log.id),
      userId: log.userId || undefined,
      userName: log.userName || undefined,
      sessionId: log.sessionId,
      naturalLanguageQuery: log.naturalLanguageQuery,
      intent: JSON.parse(log.intent),
      generatedSQL: log.generatedSql,
      executionResult: {
        success: log.executionSuccess,
        rowCount: log.rowCount || undefined,
        error: log.executionError || undefined,
      },
      metadata: {
        usedDatabases: JSON.parse(log.usedDatabases),
        usedTables: JSON.parse(log.usedTables),
        usedColumns: [],
      },
      performance: {
        intentRecognitionTime: log.intentRecognitionTime,
        sqlGenerationTime: log.sqlGenerationTime,
        validationTime: log.validationTime,
        executionTime: log.executionTime,
        totalTime: log.totalTime,
      },
      timestamp: (log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp)).toISOString(),
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
    };

    console.log('[Query Detail] Successfully formatted data for ID:', id);

    return NextResponse.json({
      success: true,
      data,
    } as QueryDetailResponse);

  } catch (error: any) {
    console.error('[Query Detail] Error:', error);
    console.error('[Query Detail] Error stack:', error?.stack);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('获取查询详情失败'),
      {
        context: 'query-detail-get',
        metadata: {
          operation: 'get_query_detail',
          errorMessage: error?.message,
          errorName: error?.name,
          id: params.id,
        },
      }
    );
  }
}
