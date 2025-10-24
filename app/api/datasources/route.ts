/**
 * 数据源管理 API
 * POST   /api/datasources - 创建数据源
 * GET    /api/datasources - 获取数据源列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/database';
import type { DatabaseConfig } from '@/lib/database';
import prisma from '@/lib/prisma/client';

/**
 * 获取数据源列表
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    const dataSources = await prisma.dataSource.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    console.log(`[GET /api/datasources] Found ${dataSources.length} data sources`);
    console.log(`[GET /api/datasources] ConnectionManager has ${connectionManager.getConnectionCount()} connections`);

    // 获取连接池统计信息（需要异步处理）
    const dataSourcesWithStats = await Promise.all(
      dataSources.map(async (ds) => {
        const id = ds.id.toString();
        const hasConnection = await connectionManager.hasConnection(id);

        console.log(`[GET /api/datasources] Data source ${id} (${ds.name}): hasConnection=${hasConnection}`);

        const stats = hasConnection
          ? await connectionManager.getConnectionStats(id)
          : null;

        return {
          ...ds,
          passwordEncrypted: undefined, // 不返回密码
          databases: ds.targetDatabases ? (ds.targetDatabases as string[]) : [],
          targetDatabases: undefined, // 不直接返回内部字段
          connectionStats: stats,
          isConnected: hasConnection,
        };
      })
    );

    return NextResponse.json({
      status: 'success',
      data: dataSourcesWithStats,
      total: dataSources.length,
    });
  } catch (error) {
    console.error('获取数据源列表失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch data sources',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建数据源
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证必填字段
    const requiredFields = ['name', 'type', 'host', 'port', 'username'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          {
            status: 'error',
            message: `Missing required field: ${field}`,
          },
          { status: 400 }
        );
      }
    }

    // 检查名称是否已存在
    const existing = await prisma.dataSource.findUnique({
      where: { name: body.name },
    });

    if (existing) {
      return NextResponse.json(
        {
          status: 'error',
          message: `Data source with name '${body.name}' already exists`,
        },
        { status: 409 }
      );
    }

    // 创建连接配置
    const config: DatabaseConfig = {
      id: '', // 将在数据库创建后更新
      name: body.name,
      type: body.type,
      host: body.host,
      port: parseInt(body.port),
      username: body.username,
      password: body.password || '', // 密码可选
      databases: body.databases || [],
    };

    // 先创建数据库记录获取 ID
    const dataSource = await prisma.dataSource.create({
      data: {
        name: config.name,
        type: config.type,
        host: config.host,
        port: config.port,
        username: config.username,
        passwordEncrypted: '', // 临时值
        targetDatabases: config.databases && config.databases.length > 0 ? config.databases : null,
        status: 'inactive',
      },
    });

    // 更新配置 ID
    config.id = dataSource.id.toString();

    // 创建连接池
    try {
      await connectionManager.createConnection(config);

      return NextResponse.json({
        status: 'success',
        message: 'Data source created successfully',
        data: {
          id: dataSource.id,
          name: dataSource.name,
          type: dataSource.type,
          status: 'active',
        },
      });
    } catch (error) {
      // 创建连接失败，删除数据库记录
      await prisma.dataSource.delete({ where: { id: dataSource.id } });
      throw error;
    }
  } catch (error) {
    console.error('创建数据源失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to create data source',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
