export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { schemas } from '@/lib/validation/schemas';
import { validateRequest } from '@/lib/validation/validator';
import { safeServerErrorResponse } from '@/lib/api/response';
import { getAuditOrchestrator } from '@/lib/di/setup';
import type { AuditLogsResponse } from '@/lib/api/types';

export async function GET(request: NextRequest) {
  try {
    // 管理员权限验证（middleware 已按路由策略拦截，此处为纵深防御）
    const { checkAdminPermission } = await import('@/lib/auth/permissions');
    const isAdmin = await checkAdminPermission(request);
    if (!isAdmin) {
      return NextResponse.json({
        success: false,
        error: '需要管理员权限',
      } as AuditLogsResponse, { status: 403 });
    }

    // 解析查询参数
    const searchParams = request.nextUrl.searchParams;
    const queryParams = {
      userId: searchParams.get('userId') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '50',
      success: searchParams.get('success') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    };

    // 验证查询参数
    const validation = validateRequest(schemas.auditLogQuery, queryParams);
    if (!validation.success || !validation.data) {
      return NextResponse.json({
        success: false,
        error: '查询参数验证失败',
        details: validation.errors,
      } as AuditLogsResponse, { status: 400 });
    }

    const { userId, page, limit, success, startDate, endDate } = validation.data;

    console.log(`[GET /api/audit/logs] Fetching logs: page=${page}, limit=${limit}, userId=${userId || 'all'}`);

    // 使用 AuditOrchestrator 获取审计日志
    const orchestrator = getAuditOrchestrator();
    const result = await orchestrator.getQueryHistory({
      userId,
      page: parseInt(page.toString()),
      limit: parseInt(limit.toString()),
      success: success === 'true' ? true : success === 'false' ? false : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    // 格式化返回数据
    const formattedData = result.data.map(log => ({
      id: log.id!,
      userId: log.userId,
      userName: log.userName,
      sessionId: log.sessionId,
      naturalLanguageQuery: log.naturalLanguageQuery,
      generatedSQL: log.generatedSQL,
      executionSuccess: log.executionResult.success,
      executionError: log.executionResult.error,
      rowCount: log.executionResult.rowCount,
      usedDatabases: log.metadata.usedDatabases,
      usedTables: log.metadata.usedTables,
      performance: log.performance,
      timestamp: log.timestamp.toISOString(),
      ipAddress: log.ipAddress,
    }));

    console.log(`[GET /api/audit/logs] Found ${formattedData.length} logs (total: ${result.pagination.totalCount})`);

    return NextResponse.json({
      success: true,
      data: formattedData,
      pagination: result.pagination,
    } as AuditLogsResponse);

  } catch (error: any) {
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to fetch audit logs'),
      {
        context: 'audit-logs',
        metadata: { operation: 'fetch_audit_logs' },
      }
    );
  }
}
