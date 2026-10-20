export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getQueryOrchestrator, getAuditOrchestrator } from '@/lib/di/setup';
import type { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { sanitizeError, ErrorCategory } from '@/lib/security/error-sanitizer';
import { extractColumnsFromSQL } from '@/lib/sql/parser/column-extractor';
import { withQueryRateLimit } from '@/lib/security/api-rate-limit-middleware';
import { performanceMonitor } from '@/lib/api/performance-monitor';
import type { ExecuteQueryRequest, ExecuteQueryResponse } from '@/lib/api/types';
import { getUserFromRequest } from '@/lib/auth/permissions';

/**
 * 从 SQL 提取使用的列名
 */
async function extractUsedColumns(sql: string): Promise<string[]> {
  try {
    const columns = extractColumnsFromSQL(sql);
    return columns.map(c => {
      const parts = [];
      if (c.database) parts.push(c.database);
      if (c.table) parts.push(c.table);
      parts.push(c.column);
      return parts.join('.');
    });
  } catch (error) {
    console.warn('[extractUsedColumns] 提取失败:', error);
    return [];
  }
}

/**
 * 查询执行处理函数
 * 包装了 Redis 分布式速率限制（10 req/min）
 */
export const POST = withQueryRateLimit(async (request: Request) => {
  const startTime = Date.now();

  // 用户身份由 middleware 校验 Token 后注入（客户端传入的同名请求头已被剥离）
  const currentUser = getUserFromRequest(request);
  const sessionId = currentUser.sessionId || `session-${Date.now()}`;
  const userId = currentUser.id;
  const userName = currentUser.username;
  const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  let naturalLanguageQuery = '';

  try {
    // 解析请求体
    const body = await request.json();

    // 验证输入
    const inputValidation = validateOrRespond(schemas.queryExecute, body);
    if ('response' in inputValidation) {
      return inputValidation.response;
    }

    const { query, options } = inputValidation.data;
    naturalLanguageQuery = query;

    console.log(`[Query Execute] Starting query execution: "${query}"`);

    // 使用 QueryOrchestrator 处理查询
    const queryOrchestrator = getQueryOrchestrator() as QueryOrchestrator;
    const result = await queryOrchestrator.processNaturalLanguageQuery(query, {
      ...options,
      sessionId,
      user: { id: userId, role: currentUser.role },
    });

    // 记录审计日志；runId 返回给前端，用于结果反馈与编辑 SQL 后的纠错关联
    const auditOrchestrator = getAuditOrchestrator();
    const logged = !!(result.intent && result.metadata && result.performance);
    const runId = logged ? randomUUID() : undefined;

    // 异步记录审计日志，不阻塞响应
    if (result.intent && result.metadata && result.performance) {
      auditOrchestrator.logQuery({
        runId,
        userId,
        userName,
        sessionId,
        naturalLanguageQuery: query,
        intent: result.intent,
        generatedSQL: result.metadata.generatedSQL,
        executionResult: {
          success: result.success,
          rowCount: result.metadata.rowCount,
          error: result.error,
        },
        metadata: {
          usedDatabases: result.metadata.usedDatabases || [],
          usedTables: result.metadata.usedTables || [],
          usedColumns: result.metadata.usedColumns || (await extractUsedColumns(result.metadata.generatedSQL)),
          dataSourceIds: result.metadata.dataSourceIds,
        },
        performance: {
          intentRecognitionTime: result.performance.intentRecognitionTime,
          sqlGenerationTime: result.performance.sqlGenerationTime,
          validationTime: result.performance.validationTime || 0,
          executionTime: result.performance.queryExecutionTime,
          totalTime: result.performance.totalTime,
        },
        timestamp: new Date(),
        ipAddress,
        userAgent,
      }).catch((error) => {
        // 审计日志失败不应影响主流程
        console.error('[Query Execute] Failed to log audit entry:', error);
      });
    }

    // 记录性能指标
    const duration = Date.now() - startTime;
    performanceMonitor.record('/api/query/execute', 'POST', duration, { query: naturalLanguageQuery });

    // 返回结果
    if (result.success) {
      return NextResponse.json({
        success: true,
        runId,
        data: result.data,
        metadata: result.metadata,
        warnings: result.warnings,
        optimizationSuggestions: result.suggestions,
      } as ExecuteQueryResponse);
    } else {
      const status = result.errorCode
        ? 422
        : result.error?.includes('未找到') ? 404 : 500;
      return NextResponse.json({
        success: false,
        runId,
        error: result.error,
        errorCode: result.errorCode,
        metadata: result.metadata,
      } as ExecuteQueryResponse, { status });
    }

  } catch (error: any) {
    // 记录错误审计日志
    const auditOrchestrator = getAuditOrchestrator();
    auditOrchestrator.logError({
      sessionId,
      errorType: error?.constructor?.name || 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      context: {
        naturalLanguageQuery,
        userId,
        userName,
      },
      timestamp: new Date(),
    }).catch((err) => {
      console.error('[Query Execute] Failed to log error audit entry:', err);
    });

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

    // 记录错误请求的性能指标
    const duration = Date.now() - startTime;
    performanceMonitor.record('/api/query/execute', 'POST', duration, { query: naturalLanguageQuery, error: true });

    return NextResponse.json({
      success: false,
      error: safeError.message,
      errorId: safeError.code,
    } as ExecuteQueryResponse, { status: 500 });
  }
});
