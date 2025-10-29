/**
 * SQL 预览 API
 * POST /api/query/preview
 *
 * 功能：
 * - 接收自然语言查询
 * - 生成 SQL 但不执行
 * - 返回 SQL 和验证结果
 */

import { NextRequest, NextResponse } from 'next/server';
import { IntentRecognizer } from '@/lib/nlp/intent-recognizer';
import { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import { SQLValidator } from '@/lib/sql/validator/sql-validator';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface PreviewQueryRequest {
  query: string;  // 自然语言查询
}

export interface PreviewQueryResponse {
  success: boolean;
  sql?: string;
  explanation?: string;
  confidence?: number;
  intent?: {
    type: string;
    entities: any;
  };
  validation?: {
    isValid: boolean;
    errors?: Array<{
      type: string;
      message: string;
    }>;
    warnings?: Array<{
      type: string;
      message: string;
    }>;
    optimizationSuggestions?: Array<{
      type: string;
      message: string;
      impact: string;
    }>;
    estimatedCost?: {
      complexity: string;
      rowsScanned?: number;
      executionTimeMs?: number;
    };
  };
  usedTables?: string[];
  usedColumns?: string[];
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body: PreviewQueryRequest = await request.json();

    if (!body.query || typeof body.query !== 'string' || body.query.trim() === '') {
      return NextResponse.json({
        success: false,
        error: '查询内容不能为空',
      } as PreviewQueryResponse, { status: 400 });
    }

    console.log(`[Query Preview] Generating SQL for: "${body.query}"`);

    // 1. 意图识别
    const intentRecognizer = new IntentRecognizer();
    const intent = await intentRecognizer.recognize(body.query);
    console.log(`[Query Preview] Intent recognized:`, intent.type);

    // 2. 元数据检索
    const metadataRetriever = new MetadataRetriever(prisma);
    const context = await metadataRetriever.retrieveContext(intent);
    console.log(`[Query Preview] Metadata retrieved: ${context.tables.length} tables`);

    // 检查是否找到相关表
    if (context.tables.length === 0) {
      return NextResponse.json({
        success: false,
        error: '未找到相关的数据表，请检查查询内容',
        intent: {
          type: intent.type,
          entities: intent.entities,
        },
      } as PreviewQueryResponse, { status: 404 });
    }

    // 3. SQL 生成
    const sqlGenerator = new SQLGenerator();
    const sqlResult = await sqlGenerator.generate(intent, context);
    console.log(`[Query Preview] SQL generated successfully`);

    // 4. SQL 验证
    const validator = new SQLValidator();
    const validation = await validator.validate(sqlResult.sql, context);
    console.log(`[Query Preview] SQL validated: ${validation.isValid}`);

    // 5. 返回结果
    return NextResponse.json({
      success: true,
      sql: sqlResult.sql,
      explanation: sqlResult.explanation,
      confidence: sqlResult.confidence,
      intent: {
        type: intent.type,
        entities: intent.entities,
      },
      validation: {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        optimizationSuggestions: validation.optimizationSuggestions,
        estimatedCost: validation.estimatedCost,
      },
      usedTables: sqlResult.usedTables,
      usedColumns: sqlResult.usedColumns,
    } as PreviewQueryResponse);

  } catch (error: any) {
    console.error('[Query Preview] Error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || 'SQL 生成失败',
    } as PreviewQueryResponse, { status: 500 });
  }
}
