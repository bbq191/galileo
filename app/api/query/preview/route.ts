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
import { getQueryOrchestrator } from '@/lib/di/setup';
import type { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';

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

    // 使用 QueryOrchestrator 处理查询（仅解释，不执行）
    const queryOrchestrator = getQueryOrchestrator() as QueryOrchestrator;
    const result = await queryOrchestrator.processNaturalLanguageQuery(body.query, {
      explainOnly: true,
    });

    if (!result.success || !result.metadata) {
      return NextResponse.json({
        success: false,
        error: result.error || '未找到相关的数据表，请检查查询内容',
      } as PreviewQueryResponse, { status: result.error?.includes('未找到') ? 404 : 500 });
    }

    // 返回结果
    return NextResponse.json({
      success: true,
      sql: result.metadata.generatedSQL,
      explanation: result.metadata.explanation,
      usedTables: result.metadata.usedTables,
    } as PreviewQueryResponse);

  } catch (error: any) {
    console.error('[Query Preview] Error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || 'SQL 生成失败',
    } as PreviewQueryResponse, { status: 500 });
  }
}
