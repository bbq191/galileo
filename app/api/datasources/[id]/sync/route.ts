/**
 * 数据源同步 API
 * POST /api/datasources/:id/sync - 手动触发同步
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncScheduler } from '@/lib/metadata/sync/sync-scheduler';
import prisma from '@/lib/prisma/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/datasources/:id/sync
 * 手动触发数据源同步
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const dataSourceId = parseInt(id);

    // 检查数据源是否存在
    const dataSource = await prisma.dataSource.findUnique({
      where: { id: dataSourceId },
    });

    if (!dataSource) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Data source not found',
        },
        { status: 404 }
      );
    }

    // 检查数据源状态
    if (dataSource.status !== 'active') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Data source is not active',
        },
        { status: 400 }
      );
    }

    // 获取请求体（可选参数）
    const body = await request.json().catch(() => ({}));
    const {
      force = false, // 是否强制同步（忽略正在运行的限制）
    } = body;

    // 检查调度器状态
    const taskStatus = syncScheduler.getTaskStatus(dataSourceId);

    if (!taskStatus.exists) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Sync task not found for this data source',
        },
        { status: 404 }
      );
    }

    if (taskStatus.isRunning && !force) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Sync is already running for this data source',
          data: {
            lastRunAt: taskStatus.lastRunAt,
          },
        },
        { status: 409 }
      );
    }

    // 触发同步
    // 使用异步方式，不等待完成
    syncScheduler.triggerSync(dataSourceId).catch((error) => {
      console.error(`Sync failed for data source ${dataSourceId}:`, error);
    });

    return NextResponse.json({
      status: 'success',
      message: 'Sync triggered successfully',
      data: {
        dataSourceId,
        triggeredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('触发同步失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to trigger sync',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
