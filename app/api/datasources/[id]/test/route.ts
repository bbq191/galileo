/**
 * 测试数据源连接 API
 * POST /api/datasources/:id/test - 测试连接
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/database';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 测试数据源连接
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    // 检查连接是否存在
    if (!connectionManager.hasConnection(id)) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Connection not found. Please create connection first.',
        },
        { status: 404 }
      );
    }

    // 执行健康检查
    const healthCheck = await connectionManager.testConnection(id);

    if (healthCheck.healthy) {
      return NextResponse.json({
        status: 'success',
        message: 'Connection test successful',
        data: {
          healthy: true,
          responseTime: healthCheck.responseTime,
          checkedAt: healthCheck.checkedAt,
        },
      });
    } else {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Connection test failed',
          data: {
            healthy: false,
            responseTime: healthCheck.responseTime,
            error: healthCheck.error,
            checkedAt: healthCheck.checkedAt,
          },
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('测试连接失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to test connection',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
