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


/**
 * 显式声明 Node.js Runtime
 *
 * API Routes 运行在 Node.js Runtime 中，支持：
 * - Prisma ORM
 * - ioredis
 * - mysql2
 * - 其他 Node.js 专有 API
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAuditOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';
import type { QueryHistoryResponse } from '@/lib/api/types';

export async function GET(request: NextRequest) {
  try {
    console.log('[Query History] API called');

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
    let auditOrchestrator;
    try {
      auditOrchestrator = getAuditOrchestrator();
      console.log(`[Query History] AuditOrchestrator obtained:`, !!auditOrchestrator);
    } catch (diError: any) {
      console.error('[Query History] Failed to get AuditOrchestrator:', diError);
      throw new Error(`DI 容器初始化失败: ${diError.message}`);
    }

    const result = await auditOrchestrator.getQueryHistory({
      userId: userId || undefined,
      page,
      limit,
      success: success === 'true' ? true : success === 'false' ? false : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    console.log(`[Query History] Result obtained, data length:`, result.data.length);

    // 格式化返回数据 - 增加安全检查
    const formattedData = result.data.map(log => {
      // 确保 timestamp 是 Date 对象
      const timestamp = log.timestamp instanceof Date
        ? log.timestamp
        : new Date(log.timestamp);

      return {
        id: log.id || 0,
        naturalLanguageQuery: log.naturalLanguageQuery,
        generatedSQL: log.generatedSQL,
        executionSuccess: log.executionResult.success,
        rowCount: log.executionResult.rowCount,
        executionTime: log.performance.executionTime,
        timestamp: timestamp.toISOString(),
      };
    });

    console.log(`[Query History] Retrieved ${formattedData.length} history entries`);

    return NextResponse.json({
      success: true,
      data: formattedData,
      pagination: result.pagination,
    } as QueryHistoryResponse);

  } catch (error: any) {
    console.error('[Query History] Error:', error);
    console.error('[Query History] Error stack:', error?.stack);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('获取查询历史失败'),
      {
        context: 'query-history-get',
        metadata: {
          operation: 'get_query_history',
          errorMessage: error?.message,
          errorName: error?.name,
        },
      }
    );
  }
}
