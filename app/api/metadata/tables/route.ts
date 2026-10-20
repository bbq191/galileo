export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getMetadataOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * GET /api/metadata/tables
 * 获取数据库的所有表（支持分页和搜索）
 *
 * 查询参数:
 * - tableId: 表 ID (可选,获取单个表)
 * - databaseId: 数据库 ID (必需,除非提供 tableId)
 * - page: 页码 (默认 1)
 * - limit: 每页数量 (默认 20)
 * - search: 搜索关键词
 * - orderBy: 排序字段 (默认 tableName)
 * - orderDirection: 排序方向 (asc/desc,默认 asc)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableId = searchParams.get('tableId');
    const databaseId = searchParams.get('databaseId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || undefined;
    const orderBy = searchParams.get('orderBy') || 'tableName';
    const orderDirection = (searchParams.get('orderDirection') || 'asc') as 'asc' | 'desc';

    const orchestrator = getMetadataOrchestrator();

    // 如果提供了 tableId, 通过 repository 直接查询单个表
    if (tableId) {
      const { getService } = require('@/lib/di/setup');
      const { DI_TOKENS } = require('@/lib/di/tokens');
      const repository = getService(DI_TOKENS.MetadataRepository);
      const table = await repository.getTableById(parseInt(tableId));

      if (!table) {
        return NextResponse.json(
          {
            status: 'error',
            message: 'Table not found',
          },
          { status: 404 }
        );
      }

      // 转换 BigInt 为字符串
      const serializedTable = {
        ...table,
        rowCount: table.rowCount ? table.rowCount.toString() : '0',
      };

      return NextResponse.json({
        status: 'success',
        data: [serializedTable], // 返回数组格式以保持一致性
      });
    }

    // 参数验证
    if (!databaseId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'databaseId is required',
        },
        { status: 400 }
      );
    }

    // 使用 MetadataOrchestrator 分页获取表列表
    const result = await orchestrator.getTables(parseInt(databaseId), {
      page,
      limit,
      search,
      orderBy,
      orderDirection,
    });

    // 转换 BigInt 为字符串，避免 JSON 序列化错误
    const serializedData = result.data.map((table: any) => ({
      ...table,
      rowCount: table.rowCount ? table.rowCount.toString() : '0',
    }));

    console.log(`[GET /api/metadata/tables] Retrieved ${result.data.length} tables (page ${page}/${result.totalPages})`);

    return NextResponse.json({
      status: 'success',
      data: serializedData,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
      },
    });

  } catch (error) {
    console.error('[GET /api/metadata/tables] Error:', error);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to get tables'),
      {
        context: 'metadata-tables-get',
        metadata: { operation: 'get_tables' },
      }
    );
  }
}
