export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { safeErrorResponse, safeServerErrorResponse } from '@/lib/api/response';
import { ErrorCategory } from '@/lib/security/error-sanitizer';
import { getDataSourceOrchestrator } from '@/lib/di/setup';

/**
 * 获取数据源列表
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as 'active' | 'inactive' | null;

    // 使用 DataSourceOrchestrator 获取数据源列表
    const orchestrator = getDataSourceOrchestrator();
    const dataSources = await orchestrator.listDataSources(status || undefined);

    console.log(`[GET /api/datasources] Found ${dataSources.length} data sources`);

    return NextResponse.json({
      status: 'success',
      data: dataSources,
      total: dataSources.length,
    });
  } catch (error) {
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to fetch data sources'),
      {
        context: 'datasources-list',
        metadata: { operation: 'fetch_datasources' },
      }
    );
  }
}

/**
 * 创建数据源
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证输入
    const validation = validateOrRespond(schemas.datasourceCreate, body);
    if ('response' in validation) {
      return validation.response;
    }

    const { name, type, host, port, username, password, databases, description } = validation.data;

    // 使用 DataSourceOrchestrator 创建数据源
    const orchestrator = getDataSourceOrchestrator();
    const result = await orchestrator.createDataSource({
      name,
      type: type as 'mysql' | 'mariadb' | 'postgresql',
      host,
      port,
      username,
      password,
      databases: databases || [],
      description,
      autoSync: body.autoSync === true, // 默认不自动同步，创建后用户可手动触发
    });

    if (!result.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: result.error || 'Failed to create data source',
        },
        { status: 400 }
      );
    }

    console.log(`[POST /api/datasources] Created data source: ${result.dataSource?.name} (ID: ${result.dataSource?.id})`);

    return NextResponse.json({
      status: 'success',
      message: result.message,
      data: {
        id: result.dataSource?.id,
        name: result.dataSource?.name,
        type: result.dataSource?.type,
        status: result.dataSource?.status,
        metadata: result.metadata,
      },
    });
  } catch (error) {
    return safeErrorResponse(
      error instanceof Error ? error : new Error('Failed to create data source'),
      {
        category: ErrorCategory.DATABASE,
        statusCode: 500,
      }
    );
  }
}
