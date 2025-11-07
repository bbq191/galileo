/**
 * 数据库元数据查询 API
 * GET /api/metadata/databases
 *
 * 重构后使用 MetadataOrchestrator 和统一错误处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetadataOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * GET /api/metadata/databases
 * 获取数据源的所有数据库
 *
 * 查询参数:
 * - sourceId: 数据源 ID
 * - databaseId: 数据库 ID (可选,获取单个数据库)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId');
    const databaseId = searchParams.get('databaseId');

    // 参数验证
    if (!sourceId && !databaseId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'sourceId or databaseId is required',
        },
        { status: 400 }
      );
    }

    // 使用 MetadataOrchestrator 获取数据库列表
    const orchestrator = getMetadataOrchestrator();
    const databases = await orchestrator.getDatabases(
      sourceId ? parseInt(sourceId) : undefined,
      databaseId ? parseInt(databaseId) : undefined
    );

    if (databaseId && databases.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Database not found',
        },
        { status: 404 }
      );
    }

    console.log(`[GET /api/metadata/databases] Retrieved ${databases.length} databases`);

    return NextResponse.json({
      status: 'success',
      data: databases,
      total: databases.length,
    });

  } catch (error) {
    console.error('[GET /api/metadata/databases] Error:', error);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to get databases'),
      {
        context: 'metadata-databases-get',
        metadata: { operation: 'get_databases' },
      }
    );
  }
}
