/**
 * 元数据同步 API
 * POST /api/metadata/sync
 *
 * 使用 MetadataOrchestrator 简化元数据同步流程
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetadataOrchestrator } from '@/lib/di/setup';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { safeServerErrorResponse } from '@/lib/api/response';

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
  let requestDataSourceId: number | undefined;

  try {
    const body = await request.json();
    requestDataSourceId = body.dataSourceId;

    // 验证输入
    const validation = validateOrRespond(schemas.metadataSync, body);
    if ('response' in validation) {
      return validation.response;
    }

    const { dataSourceId, databases, inferRelationships, minConfidence, trackChanges } = validation.data;

    console.log(`[Metadata Sync] Starting sync for data source ${dataSourceId}`);

    // 使用 MetadataOrchestrator 执行同步
    const orchestrator = getMetadataOrchestrator();
    const result = await orchestrator.syncDataSource({
      dataSourceId,
      databases,
      inferRelationships: inferRelationships ?? true,
      minConfidence: minConfidence ?? 0.70,
      trackChanges: trackChanges ?? true,
    });

    // 返回结果
    if (result.success) {
      return NextResponse.json({
        status: 'success',
        message: `Successfully synced ${result.databaseCount} database(s)`,
        data: {
          databaseCount: result.databaseCount,
          tableCount: result.tableCount,
          columnCount: result.columnCount,
          relationshipCount: result.relationshipCount,
          changes: result.changes,
          duration: result.duration,
        },
      });
    } else {
      return NextResponse.json({
        status: 'error',
        message: 'Metadata sync failed',
        error: result.error,
        data: {
          duration: result.duration,
        },
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[Metadata Sync] Sync failed:', error);

    // 使用安全的错误响应（已脱敏，不泄露堆栈信息）
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to sync metadata'),
      {
        context: 'metadata-sync',
        metadata: {
          dataSourceId: requestDataSourceId,
          operation: 'sync_metadata',
        },
      }
    );
  }
}
