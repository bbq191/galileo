/**
 * GET /api/metadata/domains/metrics
 *
 * 获取业务域推断性能指标
 */


export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { DomainInferencer } from '@/lib/metadata/inference/domain-inferencer';

/**
 * 获取推断性能指标
 *
 * 职责：
 * - 返回推断成功率、置信度、耗时等统计信息
 * - 支持监控和性能分析
 */
export async function GET(request: NextRequest) {
  try {
    // 获取 DomainInferencer 服务
    const domainInferencer = getService<DomainInferencer>(DI_TOKENS.DomainInferencer);

    // 获取指标统计
    const metrics = domainInferencer.getMetrics();

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        summary: {
          // 概览信息
          totalInferences: metrics.totalInferences,
          successRate: `${(metrics.successRate * 100).toFixed(2)}%`,
          avgConfidence: metrics.avgConfidence.toFixed(4),
          avgDuration: `${metrics.avgDuration.toFixed(2)}ms`,
          cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(2)}%`,

          // 关键指标
          autoApplyRate: `${(metrics.autoApplyRate * 100).toFixed(2)}%`,
          manualReviewRate: `${(metrics.manualReviewRate * 100).toFixed(2)}%`,

          // 运行时间
          uptime: formatUptime(metrics.uptime),
        },
      },
    });
  } catch (error: any) {
    console.error('[API] 获取推断指标失败:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/metadata/domains/metrics
 *
 * 重置推断性能指标
 */
export async function DELETE(request: NextRequest) {
  try {
    // 获取 DomainInferencer 服务
    const domainInferencer = getService<DomainInferencer>(DI_TOKENS.DomainInferencer);

    // 重置指标
    domainInferencer.resetMetrics();

    return NextResponse.json({
      success: true,
      message: '推断指标已重置',
    });
  } catch (error: any) {
    console.error('[API] 重置推断指标失败:', error);
    return NextResponse.json(
      { error: error.message || '重置失败' },
      { status: 500 }
    );
  }
}

/**
 * 格式化运行时间
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}天 ${hours % 24}小时`;
  } else if (hours > 0) {
    return `${hours}小时 ${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟 ${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
}
