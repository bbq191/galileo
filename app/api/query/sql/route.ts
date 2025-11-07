/**
 * 直接执行 SQL API
 * POST /api/query/sql
 *
 * 功能：
 * - 直接执行用户提供的 SQL
 * - 进行安全验证
 * - 使用 AuditOrchestrator 记录审计日志
 *
 * 重构后使用 DI 容器和统一错误处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { SQLValidator } from '@/lib/sql/validator/sql-validator';
import { getQueryExecutor, getAuditOrchestrator } from '@/lib/di/setup';
import type { MetadataContext } from '@/lib/metadata/retrieval/types';
import type { QueryExecutor } from '@/lib/sql/executor/query-executor';
import { safeServerErrorResponse, safeErrorResponse } from '@/lib/api/response';
import { ErrorCategory } from '@/lib/security/error-sanitizer';

export interface ExecuteSQLRequest {
  sql: string;  // SQL 查询语句
  options?: {
    enableCache?: boolean;
    maxRows?: number;
    timeout?: number;
  };
}

export interface ExecuteSQLResponse {
  success: boolean;
  data?: any[];
  metadata?: {
    sql: string;
    rowCount: number;
    executionTime: number;
    fromCache: boolean;
    columns: Array<{
      name: string;
      type: string;
    }>;
  };
  warnings?: string[];
  error?: string;
  errors?: Array<{
    type: string;
    message: string;
  }>;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const sessionId = request.headers.get('x-session-id') || `session-${Date.now()}`;

  // 提取用户信息和请求元数据
  const userId = request.headers.get('x-user-id') || undefined;
  const userName = request.headers.get('x-user-name') || undefined;
  const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  let sqlStatement = '';

  try {
    // 解析请求体
    const body: ExecuteSQLRequest = await request.json();

    if (!body.sql || typeof body.sql !== 'string' || body.sql.trim() === '') {
      return NextResponse.json({
        success: false,
        error: 'SQL 语句不能为空',
      } as ExecuteSQLResponse, { status: 400 });
    }

    sqlStatement = body.sql;
    console.log(`[SQL Execute] Executing SQL: ${body.sql.substring(0, 100)}...`);

    // 构建基本的元数据上下文（用于验证）
    const basicContext: MetadataContext = {
      tables: [],
      relationships: [],
      columns: [],
      estimatedComplexity: 'low',
    };

    // 1. SQL 验证
    const validator = new SQLValidator();
    const validation = await validator.validate(body.sql, basicContext);
    console.log(`[SQL Execute] SQL validated: ${validation.isValid}`);

    if (!validation.isValid) {
      // 使用 AuditOrchestrator 记录失败的审计日志
      const auditOrchestrator = getAuditOrchestrator();
      auditOrchestrator.logQuery({
        userId,
        userName,
        sessionId,
        naturalLanguageQuery: '[Direct SQL]',
        intent: {
          type: 'select',
          entities: {},
          conditions: {},
        },
        generatedSQL: body.sql,
        executionResult: {
          success: false,
          rowCount: 0,
          error: validation.errors.map(e => e.message).join('; '),
        },
        metadata: {
          usedDatabases: [],
          usedTables: [],
          usedColumns: [],
        },
        performance: {
          intentRecognitionTime: 0,
          sqlGenerationTime: 0,
          validationTime: Date.now() - startTime,
          executionTime: 0,
          totalTime: Date.now() - startTime,
        },
        timestamp: new Date(),
        ipAddress,
        userAgent,
      }).catch((err) => {
        console.error('[SQL Execute] Failed to log audit entry:', err);
      });

      return NextResponse.json({
        success: false,
        error: 'SQL 验证失败',
        errors: validation.errors,
        metadata: {
          sql: body.sql,
          rowCount: 0,
          executionTime: 0,
          fromCache: false,
          columns: [],
        },
      } as ExecuteSQLResponse, { status: 400 });
    }

    // 2. 执行查询
    const executor = getQueryExecutor() as QueryExecutor;
    const result = await executor.execute(
      body.sql,
      basicContext,
      body.options || {}
    );
    console.log(`[SQL Execute] Query executed: ${result.success}`);

    // 3. 使用 AuditOrchestrator 记录审计日志
    const auditOrchestrator = getAuditOrchestrator();
    auditOrchestrator.logQuery({
      userId,
      userName,
      sessionId,
      naturalLanguageQuery: '[Direct SQL]',
      intent: {
        type: 'select',
        entities: {},
        conditions: {},
      },
      generatedSQL: body.sql,
      executionResult: {
        success: result.success,
        rowCount: result.rowCount,
        error: result.error,
      },
      metadata: {
        usedDatabases: [],
        usedTables: [],
        usedColumns: [],
      },
      performance: {
        intentRecognitionTime: 0,
        sqlGenerationTime: 0,
        validationTime: 0,
        executionTime: result.executionTime,
        totalTime: Date.now() - startTime,
      },
      timestamp: new Date(),
      ipAddress,
      userAgent,
    }).catch((err) => {
      console.error('[SQL Execute] Failed to log audit entry:', err);
    });

    // 4. 返回结果
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        metadata: {
          sql: body.sql,
          rowCount: result.rowCount,
          executionTime: result.executionTime,
          fromCache: result.fromCache,
          columns: result.metadata.columns,
        },
        warnings: validation.warnings.map(w => w.message),
      } as ExecuteSQLResponse);
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        metadata: {
          sql: body.sql,
          rowCount: 0,
          executionTime: result.executionTime,
          fromCache: false,
          columns: [],
        },
      } as ExecuteSQLResponse, { status: 500 });
    }

  } catch (error: any) {
    console.error('[SQL Execute] Error:', error);

    // 记录错误审计日志
    const auditOrchestrator = getAuditOrchestrator();
    auditOrchestrator.logError({
      sessionId,
      errorType: error?.constructor?.name || 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      context: {
        sql: sqlStatement,
        userId,
        userName,
      },
      timestamp: new Date(),
    }).catch((err) => {
      console.error('[SQL Execute] Failed to log error audit entry:', err);
    });

    return safeErrorResponse(
      error instanceof Error ? error : new Error('SQL 执行失败'),
      {
        category: ErrorCategory.DATABASE,
        statusCode: 500,
      }
    );
  }
}
