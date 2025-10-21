/**
 * 数据库元数据查询 API
 * GET /api/metadata/databases
 */

import { NextRequest, NextResponse } from 'next/server';
import { metadataRepository } from '@/lib/metadata/storage';

/**
 * GET /api/metadata/databases
 * 获取数据源的所有数据库
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId');

    if (!sourceId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'sourceId is required',
        },
        { status: 400 }
      );
    }

    // 获取数据库列表
    const databases = await metadataRepository.getDatabasesBySource(parseInt(sourceId));

    return NextResponse.json({
      status: 'success',
      data: databases,
      total: databases.length,
    });
  } catch (error) {
    console.error('获取数据库列表失败:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get databases',
      },
      { status: 500 }
    );
  }
}
