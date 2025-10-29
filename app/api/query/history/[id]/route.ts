/**
 * 查询详情 API
 * GET /api/query/history/:id
 *
 * 功能：
 * - 获取特定查询的详细信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface QueryDetailResponse {
  success: boolean;
  data?: {
    id: number;
    userId?: string;
    userName?: string;
    sessionId: string;
    naturalLanguageQuery: string;
    intent: any;
    generatedSQL: string;
    executionResult: {
      success: boolean;
      rowCount?: number;
      error?: string;
    };
    metadata: {
      usedDatabases: string[];
      usedTables: string[];
      usedColumns: string[];
    };
    performance: {
      intentRecognitionTime: number;
      sqlGenerationTime: number;
      validationTime: number;
      executionTime: number;
      totalTime: number;
    };
    timestamp: string;
    ipAddress?: string;
    userAgent?: string;
  };
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);

    if (isNaN(id)) {
      return NextResponse.json({
        success: false,
        error: '无效的查询 ID',
      } as QueryDetailResponse, { status: 400 });
    }

    console.log(`[Query Detail] Fetching detail for ID: ${id}`);

    // 查询审计日志
    const log = await prisma.queryAuditLog.findUnique({
      where: { id: BigInt(id) },
    });

    if (!log) {
      return NextResponse.json({
        success: false,
        error: '查询记录不存在',
      } as QueryDetailResponse, { status: 404 });
    }

    // 格式化返回数据
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
      timestamp: log.timestamp.toISOString(),
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
    };

    return NextResponse.json({
      success: true,
      data,
    } as QueryDetailResponse);

  } catch (error: any) {
    console.error('[Query Detail] Error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || '获取查询详情失败',
    } as QueryDetailResponse, { status: 500 });
  }
}
