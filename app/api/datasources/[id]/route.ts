export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { safeServerErrorResponse, safeErrorResponse } from '@/lib/api/response';
import { ErrorCategory } from '@/lib/security/error-sanitizer';
import { getDataSourceOrchestrator } from '@/lib/di/setup';

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

    // 使用 DataSourceOrchestrator 获取数据源列表，然后筛选
    const orchestrator = getDataSourceOrchestrator();
    const dataSources = await orchestrator.listDataSources();

    const dataSource = dataSources.find(ds => ds.id === dataSourceId);

    if (!dataSource) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Data source not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      data: dataSource,
    });
  } catch (error) {
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to fetch data source'),
      {
        context: 'datasource-detail',
        metadata: { operation: 'fetch_datasource' },
      }
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

    console.log(`[PUT /api/datasources/${id}] Updating data source...`);

    // 使用 DataSourceOrchestrator 更新数据源
    const orchestrator = getDataSourceOrchestrator();
    const result = await orchestrator.updateDataSource({
      id: dataSourceId,
      type: body.type,
      name: body.name,
      host: body.host,
      port: body.port,
      username: body.username,
      password: body.password,
      databases: body.databases,
      description: body.description,
      reconnect: body.reconnect !== false, // 默认重建连接
    });

    if (!result.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: result.error || 'Failed to update data source',
        },
        { status: 400 }
      );
    }

    console.log(`[PUT /api/datasources/${id}] Data source updated successfully`);

    return NextResponse.json({
      status: 'success',
      message: result.message,
      data: {
        id: result.dataSource?.id,
        name: result.dataSource?.name,
        type: result.dataSource?.type,
        status: result.dataSource?.status,
      },
    });
  } catch (error) {
    return safeErrorResponse(
      error instanceof Error ? error : new Error('Failed to update data source'),
      {
        category: ErrorCategory.DATABASE,
        statusCode: 500,
      }
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

    console.log(`[DELETE /api/datasources/${id}] Deleting data source...`);

    // 使用 DataSourceOrchestrator 删除数据源
    const orchestrator = getDataSourceOrchestrator();
    const result = await orchestrator.deleteDataSource(dataSourceId);

    if (!result.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: result.error || 'Failed to delete data source',
        },
        { status: 400 }
      );
    }

    console.log(`[DELETE /api/datasources/${id}] Data source deleted successfully`);

    return NextResponse.json({
      status: 'success',
      message: result.message,
      data: result.metadata,
    });
  } catch (error) {
    return safeErrorResponse(
      error instanceof Error ? error : new Error('Failed to delete data source'),
      {
        category: ErrorCategory.DATABASE,
        statusCode: 500,
      }
    );
  }
}
