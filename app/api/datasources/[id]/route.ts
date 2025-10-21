/**
 * 单个数据源操作 API
 * GET    /api/datasources/:id - 获取数据源详情
 * PUT    /api/datasources/:id - 更新数据源
 * DELETE /api/datasources/:id - 删除数据源
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/database';
import prisma from '@/lib/prisma/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取数据源详情
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const dataSourceId = parseInt(id);

    const dataSource = await prisma.dataSource.findUnique({
      where: { id: dataSourceId },
      include: {
        databases: {
          include: {
            tables: {
              select: {
                id: true,
                tableName: true,
              },
            },
          },
        },
      },
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

    // 获取连接统计
    const hasConnection = connectionManager.hasConnection(id);
    const stats = hasConnection ? connectionManager.getConnectionStats(id) : null;

    return NextResponse.json({
      status: 'success',
      data: {
        ...dataSource,
        passwordEncrypted: undefined, // 不返回密码
        connectionStats: stats,
        isConnected: hasConnection,
      },
    });
  } catch (error) {
    console.error('获取数据源详情失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch data source',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * 更新数据源
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const dataSourceId = parseInt(id);
    const body = await request.json();

    const dataSource = await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: {
        name: body.name,
        host: body.host,
        port: body.port,
        username: body.username,
        // 如果提供了新密码，则更新
        ...(body.password && { passwordEncrypted: body.password }),
      },
    });

    return NextResponse.json({
      status: 'success',
      message: 'Data source updated successfully',
      data: {
        ...dataSource,
        passwordEncrypted: undefined,
      },
    });
  } catch (error) {
    console.error('更新数据源失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to update data source',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除数据源
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const dataSourceId = parseInt(id);

    // 先关闭连接
    if (connectionManager.hasConnection(id)) {
      await connectionManager.closeConnection(id);
    }

    // 删除数据库记录（级联删除相关数据）
    await prisma.dataSource.delete({
      where: { id: dataSourceId },
    });

    return NextResponse.json({
      status: 'success',
      message: 'Data source deleted successfully',
    });
  } catch (error) {
    console.error('删除数据源失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to delete data source',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
