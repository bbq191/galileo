/**
 * 元数据同步 API
 * POST /api/metadata/sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { metadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';

/**
 * 同步请求体
 */
interface SyncRequest {
  /** 数据源 ID */
  dataSourceId: number;

  /** 要同步的数据库列表（可选） */
  databases?: string[];

  /** 是否推断关系 */
  inferRelationships?: boolean;

  /** 关系推断最小置信度 */
  minConfidence?: number;

  /** 是否记录变更历史 */
  trackChanges?: boolean;
}

/**
 * POST /api/metadata/sync
 * 同步数据源的元数据
 */
export async function POST(request: NextRequest) {
  try {
    const body: SyncRequest = await request.json();

    const { dataSourceId, databases, inferRelationships, minConfidence, trackChanges } = body;

    if (!dataSourceId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'dataSourceId is required',
        },
        { status: 400 }
      );
    }

    console.log(`开始同步数据源: ${dataSourceId}`);

    // 执行同步
    const result = await metadataSyncService.syncDataSource({
      dataSourceId,
      databases,
      inferRelationships: inferRelationships ?? true,
      minConfidence: minConfidence ?? 0.70,
      trackChanges: trackChanges ?? true,
    });

    // 返回结果
    return NextResponse.json({
      status: 'success',
      message: `Successfully synced ${result.databaseCount} database(s)`,
      data: result,
    });
  } catch (error) {
    console.error('同步失败:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to sync metadata',
        error: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}
