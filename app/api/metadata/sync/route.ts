/**
 * 元数据同步 API
 * POST /api/metadata/sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { metadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import { schemas } from '@/lib/validation/schemas';
import { validateOrRespond } from '@/lib/validation/validator';
import { safeServerErrorResponse } from '@/lib/api/response';
import { ErrorCategory } from '@/lib/security/error-sanitizer';

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
