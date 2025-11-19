/**
 * AI 成本监控 API
 *
 * 提供 AI 调用成本的统计和报告功能
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
import type { AICostTracker } from '@/lib/ai/ai-cost-tracker';
import { withAiRateLimit } from '@/lib/security/api-rate-limit-middleware';

// 延迟导入以避免循环依赖
function getService(): AICostTracker {
  const { getContainer } = require('@/lib/di/container');
  const { DI_TOKENS } = require('@/lib/di/tokens');
  // 确保 DI 容器已初始化
  require('@/lib/di/setup');

  const container = getContainer();
  return container.resolve(DI_TOKENS.AICostTracker) as AICostTracker;
}

/**
 * GET /api/ai/cost
 *
 * 获取 AI 成本统计
 *
 * Query 参数：
 * - period: 'day' | 'week' | 'month' | 'custom'
 * - start: 开始时间（ISO 格式，仅 period=custom 时需要）
 * - end: 结束时间（ISO 格式，仅 period=custom 时需要）
 *
 * @example
 * GET /api/ai/cost?period=day
 * GET /api/ai/cost?period=custom&start=2025-11-01&end=2025-11-11
 */
export const GET = withAiRateLimit(async (request: Request) => {
  try {
    const costTracker = getService();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'day';

    let statistics;

    switch (period) {
      case 'day':
        statistics = await costTracker.getTodayStatistics();
        break;

      case 'week':
        statistics = await costTracker.getWeekStatistics();
        break;

      case 'month':
        statistics = await costTracker.getMonthStatistics();
        break;

      case 'custom': {
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');

        if (!startParam || !endParam) {
          return NextResponse.json(
            { error: 'Custom period requires start and end parameters' },
            { status: 400 }
          );
        }

        const start = new Date(startParam);
        const end = new Date(endParam);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date format' },
            { status: 400 }
          );
        }

        statistics = await costTracker.getStatistics(start, end);
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid period parameter. Must be: day, week, month, or custom' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      period,
      statistics,
    });
  } catch (error) {
    console.error('[API] AI cost statistics error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get AI cost statistics',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/ai/cost
 *
 * 生成 AI 成本报告（Markdown 格式）
 *
 * Query 参数：
 * - period: 'day' | 'week' | 'month'
 *
 * @example
 * POST /api/ai/cost?period=week
 */
export const POST = withAiRateLimit(async (request: Request) => {
  try {
    const costTracker = getService();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') as 'day' | 'week' | 'month';

    if (!['day', 'week', 'month'].includes(period)) {
      return NextResponse.json(
        { error: 'Invalid period parameter. Must be: day, week, or month' },
        { status: 400 }
      );
    }

    const report = await costTracker.generateReport(period);

    return NextResponse.json({
      success: true,
      period,
      report,
    });
  } catch (error) {
    console.error('[API] AI cost report error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate AI cost report',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});
