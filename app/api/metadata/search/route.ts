export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getMetadataOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * GET /api/metadata/search
 * 搜索元数据（数据库、表、列）
 *
 * 查询参数:
 * - q / query: 搜索关键词 (必需)
 * - type: 搜索类型 (database/table/column/all, 默认 all)
 * - sourceId: 数据源 ID (可选)
 * - databaseId: 数据库 ID (可选)
 * - page: 页码 (默认 1)
 * - limit: 每页数量 (默认 20)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 搜索参数
    const query = searchParams.get('q') || searchParams.get('query');
    const type = (searchParams.get('type') || 'all') as 'database' | 'table' | 'column' | 'all';
    const sourceId = searchParams.get('sourceId');
    const databaseId = searchParams.get('databaseId');

    // 分页参数
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // 参数验证
    if (!query) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Search query is required',
        },
        { status: 400 }
      );
    }

    console.log(`[GET /api/metadata/search] Searching: "${query}", type: ${type}`);

    // 使用 MetadataOrchestrator 搜索元数据
    const orchestrator = getMetadataOrchestrator();
    const results = await orchestrator.searchMetadata(query, {
      type,
      sourceId: sourceId ? parseInt(sourceId) : undefined,
      databaseId: databaseId ? parseInt(databaseId) : undefined,
      page,
      limit,
    });

    // 转换 BigInt 为字符串 (用于表的 rowCount)
    if (results.tables && results.tables.length > 0) {
      results.tables = results.tables.map((table: any) => ({
        ...table,
        rowCount: table.rowCount ? table.rowCount.toString() : '0',
      }));
    }

    // 计算总数
    const total = results.databases.length + results.tables.length + results.columns.length;

    // 如果是搜索全部，合并结果并分页
    if (type === 'all') {
      const allResults = [
        ...results.databases.map((d: any) => ({ ...d, _type: 'database' })),
        ...results.tables.map((t: any) => ({ ...t, _type: 'table' })),
        ...results.columns.map((c: any) => ({ ...c, _type: 'column' })),
      ];

      const skip = (page - 1) * limit;
      const paginatedResults = allResults.slice(skip, skip + limit);

      console.log(
        `[GET /api/metadata/search] Found ${total} results ` +
        `(${results.databases.length} databases, ${results.tables.length} tables, ${results.columns.length} columns)`
      );

      return NextResponse.json({
        status: 'success',
        data: paginatedResults,
        summary: {
          databases: results.databases.length,
          tables: results.tables.length,
          columns: results.columns.length,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // 返回分类结果
    console.log(
      `[GET /api/metadata/search] Found ${total} ${type} results`
    );

    return NextResponse.json({
      status: 'success',
      data: results,
      summary: {
        databases: results.databases.length,
        tables: results.tables.length,
        columns: results.columns.length,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error('[GET /api/metadata/search] Error:', error);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to search metadata'),
      {
        context: 'metadata-search',
        metadata: { operation: 'search_metadata' },
      }
    );
  }
}
