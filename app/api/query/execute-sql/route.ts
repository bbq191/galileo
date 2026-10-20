export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getQueryOrchestrator, getAuditOrchestrator } from '@/lib/di/setup';
import type { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { safeServerErrorResponse } from '@/lib/api/response';
import { getUserFromRequest } from '@/lib/auth/permissions';
import type { ExecuteQueryResponse } from '@/lib/api/types';

/**
 * POST /api/query/execute-sql
 *
 * 执行用户在查询页编辑后的 SQL。SQL 始终按 enforce 模式校验（只允许 SELECT、只能访问已同步的表等），
 * 路径以 /api/query/execute 开头，与自然语言查询共用 10 次/分钟的速率限制。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateOrRespond(schemas.sqlExecute, body);
    if ('response' in validation) {
      return validation.response;
    }

    const { sql, question, dataSourceIds, options } = validation.data;
    const currentUser = getUserFromRequest(request);
    const sessionId = currentUser.sessionId || `session-${Date.now()}`;

    const orchestrator = getQueryOrchestrator() as QueryOrchestrator;
    const result = await orchestrator.executeUserSQL(sql, {
      ...options,
      dataSourceIds,
      user: { id: currentUser.id, role: currentUser.role },
    });

    // 审计：标明是用户编辑的 SQL，便于与 AI 生成的查询区分
    if (result.intent && result.performance) {
      getAuditOrchestrator().logQuery({
        userId: currentUser.id,
        userName: currentUser.username,
        sessionId,
        naturalLanguageQuery: `[用户编辑 SQL] ${question ?? ''}`.trim(),
        intent: result.intent,
        generatedSQL: sql,
        executionResult: {
          success: result.success,
          rowCount: result.metadata?.rowCount ?? 0,
          error: result.error,
        },
        metadata: {
          usedDatabases: result.metadata?.usedDatabases || [],
          usedTables: result.metadata?.usedTables || [],
          usedColumns: [],
        },
        performance: {
          intentRecognitionTime: 0,
          sqlGenerationTime: 0,
          validationTime: result.performance.validationTime || 0,
          executionTime: result.performance.queryExecutionTime,
          totalTime: result.performance.totalTime,
        },
        timestamp: new Date(),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }).catch((error) => {
        console.error('[Execute SQL] Failed to log audit entry:', error);
      });
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        metadata: result.metadata,
        warnings: result.warnings,
        optimizationSuggestions: result.suggestions,
      } as ExecuteQueryResponse);
    }

    return NextResponse.json({
      success: false,
      error: result.error,
      errorCode: result.errorCode,
      metadata: result.metadata,
    } as ExecuteQueryResponse, { status: result.errorCode ? 422 : 500 });
  } catch (error) {
    return safeServerErrorResponse(error instanceof Error ? error : new Error('SQL 执行失败'), {
      context: 'query-execute-sql',
    });
  }
}
