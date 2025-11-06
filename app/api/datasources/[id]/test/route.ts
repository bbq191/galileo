/**
 * 测试数据源连接 API
 * POST /api/datasources/:id/test - 测试连接
 */

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseConfig } from '@/lib/database';
import { ConnectionPool } from '@/lib/database/connection-pool';
import { DEFAULT_POOL_CONFIG } from '@/lib/database/connection-config';
import { getService } from '@/lib/di/helpers/app-router';

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

    // 获取 DI 服务
    const prisma = getService.prisma();
    const connectionManager = getService.connectionManager();

    // 检查连接是否存在于 connectionManager 中
    if (await connectionManager.hasConnection(id)) {
      // 如果连接已存在，直接测试
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
    }

    // 如果连接不存在，从数据库加载配置并创建临时连接测试
    const dataSource = await prisma.dataSource.findUnique({
      where: { id: parseInt(id) },
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

    // 创建临时连接配置
    const config: DatabaseConfig = {
      id: dataSource.id.toString(),
      name: dataSource.name,
      type: dataSource.type as any,
      host: dataSource.host,
      port: dataSource.port,
      username: dataSource.username,
      password: dataSource.passwordEncrypted,
      databases: [],
    };

    // 创建临时连接池进行测试
    let tempPool: ConnectionPool | null = null;
    try {
      tempPool = new ConnectionPool(config, DEFAULT_POOL_CONFIG);
      await tempPool.initialize();

      const healthCheck = await tempPool.healthCheck();

      // 关闭临时连接
      await tempPool.close();

      if (healthCheck.healthy) {
        // 测试成功，将连接添加到 connectionManager（如果还不存在）
        try {
          if (!(await connectionManager.hasConnection(id))) {
            console.log(`[Test] Creating connection for data source ${id}...`);
            await connectionManager.createConnection(config);
            console.log(`[Test] Connection ${id} created and added to manager`);
          } else {
            console.log(`[Test] Connection ${id} already exists in manager`);
          }
        } catch (error) {
          // 连接可能已存在，忽略错误
          console.warn('[Test] 连接已存在或创建失败，跳过创建:', error);
        }

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
      // 确保临时连接被关闭
      if (tempPool) {
        try {
          await tempPool.close();
        } catch (closeError) {
          console.error('关闭临时连接失败:', closeError);
        }
      }
      throw error;
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
