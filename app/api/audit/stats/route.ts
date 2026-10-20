export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { safeServerErrorResponse } from '@/lib/api/response';
import { getAuditOrchestrator } from '@/lib/di/setup';
import type { AuditStatsResponse } from '@/lib/api/types';

export async function GET(request: NextRequest) {
  try {
    // 管理员权限验证
    const { checkAdminPermission } = await import('@/lib/auth/permissions');
    const isAdmin = await checkAdminPermission(request);
    if (!isAdmin) {
      return NextResponse.json({
        success: false,
        error: '需要管理员权限',
      } as AuditStatsResponse, { status: 403 });
    }

    // 解析查询参数
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const detectAnomalies = searchParams.get('detectAnomalies') === 'true';
    const timeWindowMinutes = parseInt(searchParams.get('timeWindow') || '60');

    console.log(`[GET /api/audit/stats] Fetching stats: detectAnomalies=${detectAnomalies}`);

    // 使用 AuditOrchestrator 获取统计数据
    const orchestrator = getAuditOrchestrator();
    const stats = await orchestrator.getStatistics({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    console.log(`[GET /api/audit/stats] Stats: ${stats.totalQueries} queries, ${stats.successRate.toFixed(1)}% success rate`);

    const responseData: any = {
      overview: {
        totalQueries: stats.totalQueries,
        successQueries: stats.successQueries,
        failedQueries: stats.failedQueries,
        successRate: stats.successRate,
        avgExecutionTime: stats.avgExecutionTime,
      },
    };

    // 如果需要检测异常
    if (detectAnomalies) {
      const anomalies = await orchestrator.detectAnomalies(timeWindowMinutes);
      console.log(`[GET /api/audit/stats] Detected ${anomalies.length} anomalies`);

      responseData.anomalies = anomalies.map(a => ({
        type: a.type,
        severity: a.severity,
        description: a.description,
        count: (a.data.totalQueries || a.data.queryCount || a.data.slowQueryCount || 0) as number,
        details: a.data,
      }));
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    } as AuditStatsResponse);

  } catch (error: any) {
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to fetch audit stats'),
      {
        context: 'audit-stats',
        metadata: { operation: 'fetch_audit_stats' },
      }
    );
  }
}
