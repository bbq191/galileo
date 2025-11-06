/**
 * 查询执行 API (v2 - 使用服务编排层)
 * POST /api/query/execute
 *
 * 使用 QueryOrchestrator 和 AuditOrchestrator 简化业务逻辑
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueryOrchestrator, getAuditOrchestrator } from '@/lib/di/setup';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { sanitizeError, ErrorCategory } from '@/lib/security/error-sanitizer';
import type { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';
import type { AuditOrchestrator } from '@/lib/di/orchestrators/audit.orchestrator';

export interface ExecuteQueryRequest {
  query: string;
  options?: {
    enableCache?: boolean;
    maxRows?: number;
    timeout?: number;
  };
}

export interface ExecuteQueryResponse {
  success: boolean;
  data?: any[];
  metadata?: {
    generatedSQL: string;
    explanation: string;
    rowCount: number;
    executionTime: number;
    fromCache: boolean;
    columns: Array<{
      name: string;
      type: string;
    }>;
  };
  performance?: {
    intentRecognitionTime: number;
    metadataRetrievalTime: number;
    sqlGenerationTime: number;
    queryExecutionTime: number;
    totalTime: number;
  };
  warnings?: string[];
  suggestions?: Array<{
    type: string;
    message: string;
    impact: string;
  }>;
  error?: string;
  errorId?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const sessionId = request.headers.get('x-session-id') || `session-${Date.now()}`;

  // 获取编排器实例
  const queryOrchestrator = getQueryOrchestrator() as QueryOrchestrator;
  const auditOrchestrator = getAuditOrchestrator() as AuditOrchestrator;

  try {
    // 解析和验证请求体
    const body = await request.json();
    const validation = validateOrRespond(schemas.queryExecute, body);
    if ('response' in validation) {
      return validation.response;
    }

    const { query, options } = validation.data;

    console.log(`[Query Execute V2] Processing query: "${query}"`);

    // 使用 QueryOrchestrator 处理查询
    const result = await queryOrchestrator.processNaturalLanguageQuery(query, {
      enableCache: options?.enableCache,
      maxRows: options?.maxRows,
      timeout: options?.timeout,
      sessionId,
    });

    // 记录审计日志（仅当查询成功或有 SQL 生成时）
    if (result.metadata) {
      await auditOrchestrator.logQuery({
        sessionId,
        naturalLanguageQuery: query,
        intent: {
          type: 'select',
          entities: {
            databases: result.metadata.usedDatabases || [],
            tables: result.metadata.usedTables || [],
            columns: []
          },
          conditions: {}
        },
        generatedSQL: result.metadata.generatedSQL,
        executionResult: {
          success: result.success,
          rowCount: result.metadata.rowCount,
          error: result.error,
        },
        metadata: {
          usedDatabases: result.metadata.usedDatabases || [],
          usedTables: result.metadata.usedTables || [],
          usedColumns: [],
        },
        performance: {
          intentRecognitionTime: result.performance?.intentRecognitionTime || 0,
          sqlGenerationTime: result.performance?.sqlGenerationTime || 0,
          validationTime: 0,
          executionTime: result.performance?.queryExecutionTime || 0,
          totalTime: Date.now() - startTime,
        },
        timestamp: new Date(),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });
    }

    // 返回结果
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        metadata: result.metadata,
        performance: result.performance,
        warnings: result.warnings,
        suggestions: result.suggestions,
      } as ExecuteQueryResponse);
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        metadata: result.metadata,
        performance: result.performance,
      } as ExecuteQueryResponse, { status: 500 });
    }

  } catch (error: any) {
    // 使用安全的错误脱敏
    const safeError = sanitizeError(
      error instanceof Error ? error : new Error('查询执行失败'),
      {
        category: ErrorCategory.DATABASE,
        statusCode: 500,
      }
    );

    console.error('[Query Execute V2] Error:', {
      errorId: safeError.code,
      category: safeError.category,
      timestamp: safeError.timestamp,
    });

    // 记录错误审计日志
    await auditOrchestrator.logError({
      sessionId,
      errorType: safeError.category,
      errorMessage: safeError.message,
      errorStack: error.stack,
      context: {
        route: '/api/query/execute',
        timestamp: new Date(),
      },
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: false,
      error: safeError.message,
      errorId: safeError.code,
    } as ExecuteQueryResponse, { status: 500 });
  }
}
