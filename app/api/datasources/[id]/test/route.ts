export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { safeServerErrorResponse } from '@/lib/api/response';
import { getDataSourceOrchestrator } from '@/lib/di/setup';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 测试数据源连接
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const startTime = Date.now();

  try {
    const { id } = await context.params;
    const dataSourceId = parseInt(id);

    console.log(`[POST /api/datasources/${id}/test] Testing connection...`);

    // 验证数据源 ID
    if (isNaN(dataSourceId)) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid data source ID',
        },
        { status: 400 }
      );
    }

    // 使用 DataSourceOrchestrator 测试连接
    const orchestrator = getDataSourceOrchestrator();
    const result = await orchestrator.testConnection(dataSourceId);

    const duration = Date.now() - startTime;

    if (!result) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Failed to test connection',
        },
        { status: 500 }
      );
    }

    // 返回连接测试结果
    if (result.healthy) {
      console.log(`[POST /api/datasources/${id}/test] Connection test successful (${duration}ms)`);

      return NextResponse.json({
        status: 'success',
        message: 'Connection test successful',
        data: {
          healthy: result.healthy,
          responseTime: result.responseTime,
          checkedAt: result.checkedAt,
          duration,
        },
      });
    } else {
      console.log(`[POST /api/datasources/${id}/test] Connection test failed: ${result.error}`);

      return NextResponse.json(
        {
          status: 'error',
          message: result.error || 'Connection test failed',
          data: {
            healthy: result.healthy,
            checkedAt: result.checkedAt,
            duration,
          },
        },
        { status: 400 }
      );
    }
  } catch (error) {
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to test connection'),
      {
        context: 'datasource-test',
        metadata: { operation: 'test_connection' },
      }
    );
  }
}
