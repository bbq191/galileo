/**
 * 查询执行 API
 * POST /api/query/execute
 *
 * 功能：
 * - 接收自然语言查询
 * - 执行完整的 SQL 生成和执行流程
 * - 返回查询结果和元数据
 * - 支持跨数据库查询
 */

import { NextRequest, NextResponse } from 'next/server';
import { getQueryOrchestrator } from '@/lib/di/setup';
import type { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { sanitizeError, ErrorCategory } from '@/lib/security/error-sanitizer';

export interface ExecuteQueryRequest {
  query: string;  // 自然语言查询
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
  warnings?: string[];
  optimizationSuggestions?: Array<{
    type: string;
    message: string;
    impact: string;
  }>;
  error?: string;
  errors?: Array<{
    type: string;
    message: string;
  }>;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const sessionId = request.headers.get('x-session-id') || `session-${Date.now()}`;

  try {
    // 解析请求体
    const body = await request.json();

    // 验证输入
    const inputValidation = validateOrRespond(schemas.queryExecute, body);
    if ('response' in inputValidation) {
      return inputValidation.response;
    }

    const { query, options } = inputValidation.data;

    console.log(`[Query Execute] Starting query execution: "${query}"`);

    // 使用 QueryOrchestrator 处理查询
    const queryOrchestrator = getQueryOrchestrator() as QueryOrchestrator;
    const result = await queryOrchestrator.processNaturalLanguageQuery(query, {
      ...options,
      sessionId,
    });

    // TODO: Add audit logging when we have the complete intent data
    // const auditOrchestrator = getAuditOrchestrator();
    // await auditOrchestrator.logQuery({...});

    // 返回结果
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        metadata: result.metadata,
        warnings: result.warnings,
        optimizationSuggestions: result.suggestions,
      } as ExecuteQueryResponse);
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        metadata: result.metadata,
      } as ExecuteQueryResponse, { status: result.error?.includes('未找到') ? 404 : 500 });
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

    console.error('[Query Execute] Error:', {
      errorId: safeError.code,
      category: safeError.category,
      timestamp: safeError.timestamp,
    });

    return NextResponse.json({
      success: false,
      error: safeError.message,
      errorId: safeError.code,
    } as ExecuteQueryResponse, { status: 500 });
  }
}
