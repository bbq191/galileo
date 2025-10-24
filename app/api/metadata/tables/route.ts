/**
 * 表元数据查询 API
 * GET /api/metadata/tables
 */

import { NextRequest, NextResponse } from 'next/server';
import { metadataRepository } from '@/lib/metadata/storage';

/**
 * GET /api/metadata/tables
 * 获取数据库的所有表（支持分页和搜索）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const databaseId = searchParams.get('databaseId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || undefined;
    const orderBy = searchParams.get('orderBy') || 'tableName';
    const orderDirection = (searchParams.get('orderDirection') || 'asc') as 'asc' | 'desc';

    if (!databaseId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'databaseId is required',
        },
        { status: 400 }
      );
    }

    // 分页获取表列表
    const result = await metadataRepository.getTablesPaginated(parseInt(databaseId), {
      page,
      limit,
      search,
      orderBy,
      orderDirection,
    });

    // 转换 BigInt 为字符串，避免 JSON 序列化错误
    const serializedData = result.data.map((table) => ({
      ...table,
      rowCount: table.rowCount ? table.rowCount.toString() : '0',
    }));

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
    console.error('获取表列表失败:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get tables',
      },
      { status: 500 }
    );
  }
}
