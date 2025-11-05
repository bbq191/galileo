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
import { IntentRecognizer } from '@/lib/nlp/intent-recognizer';
import { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import { SQLValidator } from '@/lib/sql/validator/sql-validator';
import { QueryExecutor } from '@/lib/sql/executor/query-executor';
import { AuditLogger } from '@/lib/audit/audit-logger';
import prisma from '@/lib/prisma/client';
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
  let sessionId = request.headers.get('x-session-id') || `session-${Date.now()}`;

  try {
    // 解析请求体
    const body = await request.json();

    // 验证输入
    const validation = validateOrRespond(schemas.queryExecute, body);
    if ('response' in validation) {
      return validation.response;
    }

    const { query, options } = validation.data;

    console.log(`[Query Execute] Starting query execution: "${query}"`);

    // 1. 意图识别
    const t1 = Date.now();
    const intentRecognizer = new IntentRecognizer();
    const intent = await intentRecognizer.recognize(query);
    const intentTime = Date.now() - t1;
    console.log(`[Query Execute] Intent recognized in ${intentTime}ms:`, intent.type);

    // 2. 元数据检索
    const t2 = Date.now();
    const metadataRetriever = new MetadataRetriever();
    const context = await metadataRetriever.retrieveContext(intent);
    const metadataTime = Date.now() - t2;
    console.log(`[Query Execute] Metadata retrieved in ${metadataTime}ms: ${context.tables.length} tables`);

    // 检查是否找到相关表
    if (context.tables.length === 0) {
      return NextResponse.json({
        success: false,
        error: '未找到相关的数据表，请检查查询内容',
      } as ExecuteQueryResponse, { status: 404 });
    }

    // 3. SQL 生成
    const t3 = Date.now();
    const sqlGenerator = new SQLGenerator();
    const sqlResult = await sqlGenerator.generate(intent, context);
    const sqlTime = Date.now() - t3;
    console.log(`[Query Execute] SQL generated in ${sqlTime}ms`);

    // 4. SQL 验证
    const t4 = Date.now();
    const validator = new SQLValidator();
    const validation = await validator.validate(sqlResult.sql, context);
    const validationTime = Date.now() - t4;
    console.log(`[Query Execute] Generated SQL: ${sqlResult.sql}`);
    console.log(`[Query Execute] SQL validated in ${validationTime}ms: ${validation.isValid}`);
    if (!validation.isValid) {
      console.log(`[Query Execute] Validation errors:`, validation.errors);
    }

    if (!validation.isValid) {
      // 记录失败的审计日志
      const auditLogger = new AuditLogger(prisma);
      await auditLogger.log({
        sessionId,
        naturalLanguageQuery: query,
        intent,
        generatedSQL: sqlResult.sql,
        executionResult: {
          success: false,
          error: validation.errors.map(e => e.message).join('; '),
        },
        metadata: {
          usedDatabases: [...new Set(context.tables.map(t => t.databaseName))],
          usedTables: context.tables.map(t => t.tableName),
          usedColumns: sqlResult.usedColumns,
        },
        performance: {
          intentRecognitionTime: intentTime,
          sqlGenerationTime: sqlTime,
          validationTime: validationTime,
          executionTime: 0,
          totalTime: Date.now() - startTime,
        },
        timestamp: new Date(),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json({
        success: false,
        error: '生成的 SQL 验证失败',
        errors: validation.errors,
        metadata: {
          generatedSQL: sqlResult.sql,
          explanation: sqlResult.explanation,
          rowCount: 0,
          executionTime: 0,
          fromCache: false,
          columns: [],
        },
      } as ExecuteQueryResponse, { status: 400 });
    }

    // 5. 执行查询
    const t5 = Date.now();
    const executor = new QueryExecutor();
    const result = await executor.execute(
      sqlResult.sql,
      context,
      options
    );
    const execTime = Date.now() - t5;
    console.log(`[Query Execute] Query executed in ${execTime}ms: ${result.success}`);

    // 6. 记录审计日志
    const auditLogger = new AuditLogger(prisma);
    await auditLogger.log({
      sessionId,
      naturalLanguageQuery: query,
      intent,
      generatedSQL: sqlResult.sql,
      executionResult: {
        success: result.success,
        rowCount: result.rowCount,
        error: result.error,
      },
      metadata: {
        usedDatabases: [...new Set(context.tables.map(t => t.databaseName))],
        usedTables: context.tables.map(t => t.tableName),
        usedColumns: sqlResult.usedColumns,
      },
      performance: {
        intentRecognitionTime: intentTime,
        sqlGenerationTime: sqlTime,
        validationTime: validationTime,
        executionTime: execTime,
        totalTime: Date.now() - startTime,
      },
      timestamp: new Date(),
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // 7. 返回结果
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        metadata: {
          generatedSQL: sqlResult.sql,
          explanation: sqlResult.explanation,
          rowCount: result.rowCount,
          executionTime: result.executionTime,
          fromCache: result.fromCache,
          columns: result.metadata.columns,
        },
        warnings: validation.warnings.map(w => w.message),
        optimizationSuggestions: validation.optimizationSuggestions,
      } as ExecuteQueryResponse);
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        metadata: {
          generatedSQL: sqlResult.sql,
          explanation: sqlResult.explanation,
          rowCount: 0,
          executionTime: result.executionTime,
          fromCache: false,
          columns: [],
        },
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
