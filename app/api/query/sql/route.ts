/**
 * 直接执行 SQL API
 * POST /api/query/sql
 *
 * 功能：
 * - 直接执行用户提供的 SQL
 * - 进行安全验证
 * - 需要权限控制（当前简化版本）
 */

import { NextRequest, NextResponse } from 'next/server';
import { SQLValidator } from '@/lib/sql/validator/sql-validator';
import { getQueryExecutor } from '@/lib/di/setup';
import { AuditLogger } from '@/lib/audit/audit-logger';
import prisma from '@/lib/prisma/client';
import type { MetadataContext } from '@/lib/metadata/retrieval/types';
import type { QueryExecutor } from '@/lib/sql/executor/query-executor';

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
  let sessionId = request.headers.get('x-session-id') || `session-${Date.now()}`;

  try {
    // 解析请求体
    const body: ExecuteSQLRequest = await request.json();

    if (!body.sql || typeof body.sql !== 'string' || body.sql.trim() === '') {
      return NextResponse.json({
        success: false,
        error: 'SQL 语句不能为空',
      } as ExecuteSQLResponse, { status: 400 });
    }

    console.log(`[SQL Execute] Executing SQL: ${body.sql.substring(0, 100)}...`);

    // 构建基本的元数据上下文（用于验证）
    // 注意：这里是简化版本，实际应该从SQL中解析出涉及的表并获取完整元数据
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
      // 记录失败的审计日志
      const auditLogger = new AuditLogger(prisma);
      await auditLogger.log({
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
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
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

    // 3. 记录审计日志
    const auditLogger = new AuditLogger(prisma);
    await auditLogger.log({
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
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
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

    return NextResponse.json({
      success: false,
      error: error.message || 'SQL 执行失败',
    } as ExecuteSQLResponse, { status: 500 });
  }
}
