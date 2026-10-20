/**
 * AI 成本统计 API
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { AICostTracker } from '@/lib/ai/ai-cost-tracker';

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
 * GET /api/ai/cost - 获取 AI 成本统计
 */
export async function GET(request: Request) {
  // 延迟导入速率限制以避免循环依赖
  const { withAiRateLimit } = await import('@/lib/security/api-rate-limit-middleware');

  const handler = withAiRateLimit(async (req: Request) => {
    try {
      const costTracker = getService();

      const { searchParams } = new URL(req.url);
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

  return handler(request, { params: Promise.resolve({}) });
}

/**
 * POST /api/ai/cost
 *
 * 生成 AI 成本报告（Markdown 格式）
 */
export async function POST(request: Request) {
  // 延迟导入速率限制以避免循环依赖
  const { withAiRateLimit } = await import('@/lib/security/api-rate-limit-middleware');

  const handler = withAiRateLimit(async (req: Request) => {
    try {
      const costTracker = getService();

      const { searchParams } = new URL(req.url);
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

  return handler(request, { params: Promise.resolve({}) });
}
