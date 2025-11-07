/**
 * 字段元数据查询 API
 * GET /api/metadata/columns
 *
 * 重构后使用 MetadataOrchestrator 和统一错误处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetadataOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * GET /api/metadata/columns
 * 获取表的所有字段
 *
 * 查询参数:
 * - tableId: 表 ID (必需)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableId = searchParams.get('tableId');

    // 参数验证
    if (!tableId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'tableId is required',
        },
        { status: 400 }
      );
    }

    // 使用 MetadataOrchestrator 获取字段列表
    const orchestrator = getMetadataOrchestrator();
    const columns = await orchestrator.getColumns(parseInt(tableId));

    console.log(`[GET /api/metadata/columns] Retrieved ${columns.length} columns for table ${tableId}`);

    return NextResponse.json({
      status: 'success',
      data: columns,
      total: columns.length,
    });

  } catch (error) {
    console.error('[GET /api/metadata/columns] Error:', error);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to get columns'),
      {
        context: 'metadata-columns-get',
        metadata: { operation: 'get_columns' },
      }
    );
  }
}
