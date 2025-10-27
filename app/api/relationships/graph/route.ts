/**
 * 关系图谱 API
 * GET /api/relationships/graph - 获取关系图谱数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { relationshipGraphBuilder } from '@/lib/metadata/graph/relationship-graph-builder';

/**
 * GET /api/relationships/graph
 * 获取关系图谱数据（用于可视化）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 过滤参数
    const tableIdParam = searchParams.get('tableId');
    const databaseIdParam = searchParams.get('databaseId');
    const depth = parseInt(searchParams.get('depth') || '2');
    const includeInferred = searchParams.get('includeInferred') !== 'false';
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.7');

    // 验证参数
    if (!tableIdParam && !databaseIdParam) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Either tableId or databaseId is required',
        },
        { status: 400 }
      );
    }

    // 使用带缓存的图谱构建器
    const tableId = tableIdParam ? parseInt(tableIdParam) : null;
    const databaseId = databaseIdParam ? parseInt(databaseIdParam) : null;

    const graph = await relationshipGraphBuilder.buildGraph(
      tableId,
      databaseId,
      depth,
      includeInferred,
      minConfidence
    );

    return NextResponse.json({
      status: 'success',
      data: graph,
    });
  } catch (error) {
    console.error('获取关系图谱失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch relationship graph',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
