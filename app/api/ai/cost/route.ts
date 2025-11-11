/**
 * AI 成本监控 API
 *
 * 提供 AI 调用成本的统计和报告功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContainer } from '@/lib/di/container';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { AICostTracker } from '@/lib/ai/ai-cost-tracker';

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
export async function GET(request: NextRequest) {
  try {
    const container = getContainer();
    const costTracker = container.resolve<AICostTracker>(DI_TOKENS.AICostTracker);

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
}

/**
 * GET /api/ai/cost/report
 *
 * 生成 AI 成本报告（Markdown 格式）
 *
 * Query 参数：
 * - period: 'day' | 'week' | 'month'
 *
 * @example
 * GET /api/ai/cost/report?period=week
 */
export async function POST(request: NextRequest) {
  try {
    const container = getContainer();
    const costTracker = container.resolve<AICostTracker>(DI_TOKENS.AICostTracker);

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
}
