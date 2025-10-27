/**
 * 字段元数据查询 API
 * GET /api/metadata/columns
 */

import { NextRequest, NextResponse } from 'next/server';
import { cachedMetadataRepository } from '@/lib/metadata/storage/cached-metadata-repository';

/**
 * GET /api/metadata/columns
 * 获取表的所有字段
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableId = searchParams.get('tableId');

    if (!tableId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'tableId is required',
        },
        { status: 400 }
      );
    }

    // 获取字段列表
    const columns = await cachedMetadataRepository.getTableColumns(parseInt(tableId));

    return NextResponse.json({
      status: 'success',
      data: columns,
      total: columns.length,
    });
  } catch (error) {
    console.error('获取字段列表失败:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get columns',
      },
      { status: 500 }
    );
  }
}
