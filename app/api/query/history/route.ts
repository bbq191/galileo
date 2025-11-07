/**
 * 查询历史 API
 * GET /api/query/history
 *
 * 功能：
 * - 获取用户的查询历史
 * - 支持分页和筛选
 *
 * 重构后使用 AuditOrchestrator 和统一错误处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuditOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

export interface QueryHistoryResponse {
  success: boolean;
  data?: Array<{
    id: number;
    naturalLanguageQuery: string;
    generatedSQL: string;
    executionSuccess: boolean;
    rowCount?: number;
    executionTime: number;
    timestamp: string;
  }>;
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    // 解析查询参数
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const success = searchParams.get('success');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    console.log(`[Query History] Fetching history: page=${page}, limit=${limit}`);

    // 使用 AuditOrchestrator 获取查询历史
    const auditOrchestrator = getAuditOrchestrator();
    const result = await auditOrchestrator.getQueryHistory({
      userId: userId || undefined,
      page,
      limit,
      success: success === 'true' ? true : success === 'false' ? false : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    // 格式化返回数据
    const formattedData = result.data.map(log => ({
      id: log.id || 0,
      naturalLanguageQuery: log.naturalLanguageQuery,
      generatedSQL: log.generatedSQL,
      executionSuccess: log.executionSuccess,
      rowCount: log.rowCount,
      executionTime: log.executionTime,
      timestamp: log.timestamp,
    }));

    console.log(`[Query History] Retrieved ${formattedData.length} history entries`);

    return NextResponse.json({
      success: true,
      data: formattedData,
      pagination: result.pagination,
    } as QueryHistoryResponse);

  } catch (error: any) {
    console.error('[Query History] Error:', error);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('获取查询历史失败'),
      {
        context: 'query-history-get',
        metadata: { operation: 'get_query_history' },
      }
    );
  }
}
