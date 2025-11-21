/**
 * SQL 预览 API
 * POST /api/query/preview
 *
 * 功能：
 * - 接收自然语言查询
 * - 生成 SQL 但不执行
 * - 返回 SQL 和验证结果
 */


/**
 * 显式声明 Node.js Runtime
 *
 * API Routes 运行在 Node.js Runtime 中，支持：
 * - Prisma ORM
 * - ioredis
 * - mysql2
 * - 其他 Node.js 专有 API
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getQueryOrchestrator } from '@/lib/di/setup';
import type { QueryOrchestrator } from '@/lib/di/orchestrators/query.orchestrator';
import { performanceMonitor } from '@/lib/api/performance-monitor';
import type { PreviewQueryRequest, PreviewQueryResponse } from '@/lib/api/types';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

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

    // 记录性能指标
    performanceMonitor.record('/api/query/preview', 'POST', Date.now() - startTime, { query: body.query });

    // 返回结果
    return NextResponse.json({
      success: true,
      sql: result.metadata.generatedSQL,
      explanation: result.metadata.explanation,
      usedTables: result.metadata.usedTables,
    } as PreviewQueryResponse);

  } catch (error: any) {
    console.error('[Query Preview] Error:', error);

    // 记录错误请求的性能指标
    performanceMonitor.record('/api/query/preview', 'POST', Date.now() - startTime, { error: true });

    return NextResponse.json({
      success: false,
      error: error.message || 'SQL 生成失败',
    } as PreviewQueryResponse, { status: 500 });
  }
}
