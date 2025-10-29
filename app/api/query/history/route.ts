/**
 * 查询历史 API
 * GET /api/query/history
 *
 * 功能：
 * - 获取用户的查询历史
 * - 支持分页和筛选
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditLogger } from '@/lib/audit/audit-logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

    // 构建筛选条件
    const filters: any = {
      page,
      limit,
    };

    if (userId) {
      filters.userId = userId;
    }

    if (success !== null && success !== undefined) {
      filters.success = success === 'true';
    }

    if (startDate) {
      filters.startDate = new Date(startDate);
    }

    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    // 获取查询历史
    const auditLogger = new AuditLogger(prisma);
    const result = await auditLogger.queryWithPagination(filters);

    // 格式化返回数据
    const formattedData = result.data.map(log => ({
      id: log.id!,
      naturalLanguageQuery: log.naturalLanguageQuery,
      generatedSQL: log.generatedSQL,
      executionSuccess: log.executionResult.success,
      rowCount: log.executionResult.rowCount,
      executionTime: log.performance.executionTime,
      timestamp: log.timestamp.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: formattedData,
      pagination: result.pagination,
    } as QueryHistoryResponse);

  } catch (error: any) {
    console.error('[Query History] Error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || '获取查询历史失败',
    } as QueryHistoryResponse, { status: 500 });
  }
}
