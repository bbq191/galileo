export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getRelationshipOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * 推断关系请求体
 */
interface InferRelationshipsRequest {
  /** 数据源 ID */
  dataSourceId: string;

  /** 数据库列表（如果为空则推断所有数据库） */
  databases?: string[];

  /** 是否跨数据库推断 */
  crossDatabase?: boolean;

  /** 最小置信度阈值 */
  minConfidence?: number;

  /** 是否启用 AI 推断 */
  enableAI?: boolean;

  /** 是否保存到数据库（默认 true） */
  saveToDatabase?: boolean;

  /** 增量模式（只推断变更的表/列） */
  incrementalMode?: boolean;

  /** 增量推断的起始时间 */
  sinceTimestamp?: Date;
}

/**
 * POST /api/metadata/relationships/infer
 * 推断数据库关系
 *
 * 使用 RelationshipOrchestrator 进行关系推断，
 * 简化了原来的 373 行代码至约 80 行（减少 78%）
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let requestDataSourceId: string | undefined;

  try {
    const body: InferRelationshipsRequest = await request.json();
    requestDataSourceId = body.dataSourceId;

    const {
      dataSourceId,
      databases,
      crossDatabase = true,
      minConfidence = 0.70,
      enableAI = true,
      saveToDatabase = true,
      incrementalMode = false,
      sinceTimestamp,
    } = body;

    // 验证必需参数
    if (!dataSourceId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'dataSourceId is required',
        },
        { status: 400 }
      );
    }

    console.log(`[POST /api/metadata/relationships/infer] Starting inference for data source ${dataSourceId}...`);

    // 如果没有传递 databases 参数，从数据源配置中读取 targetDatabases
    let targetDatabases = databases;
    if (!targetDatabases || targetDatabases.length === 0) {
      const { getDatabaseService } = await import('@/lib/di/setup');
      const { DatabaseService } = await import('@/lib/di/services/database.service');
      const dbService = getDatabaseService() as InstanceType<typeof DatabaseService>;
      const dataSource = await dbService.prisma.dataSource.findUnique({
        where: { id: parseInt(dataSourceId) },
        select: { targetDatabases: true, name: true },
      });

      if (dataSource?.targetDatabases) {
        try {
          const parsed = JSON.parse(dataSource.targetDatabases);
          if (Array.isArray(parsed) && parsed.length > 0) {
            targetDatabases = parsed;
            console.log(`[POST /api/metadata/relationships/infer] Using targetDatabases from data source config: ${targetDatabases.join(', ')}`);
          }
        } catch (error) {
          console.warn(`[POST /api/metadata/relationships/infer] Failed to parse targetDatabases:`, error);
        }
      }

      if (!targetDatabases || targetDatabases.length === 0) {
        console.log(`[POST /api/metadata/relationships/infer] No databases specified, will infer all databases for data source ${dataSourceId}`);
      }
    }

    // 使用 RelationshipOrchestrator 推断关系
    const orchestrator = getRelationshipOrchestrator();
    const result = await orchestrator.inferRelationships({
      dataSourceId: parseInt(dataSourceId),
      databases: targetDatabases,
      minConfidence,
      enableAI,
      crossDatabase,
      autoSave: saveToDatabase,
      autoSaveThreshold: 0.80, // 自动保存高置信度关系
      incrementalMode,
      sinceTimestamp,
    });

    const duration = Date.now() - startTime;

    if (!result.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: result.error || 'Failed to infer relationships',
        },
        { status: 500 }
      );
    }

    console.log(
      `[POST /api/metadata/relationships/infer] Inference completed in ${duration}ms: ` +
      `${result.inferredCount} relationships (${result.highConfidenceCount} high, ` +
      `${result.mediumConfidenceCount} medium, ${result.lowConfidenceCount} low)`
    );

    return NextResponse.json({
      status: 'success',
      message: `Successfully inferred ${result.inferredCount} relationships`,
      data: {
        inferredCount: result.inferredCount,
        savedCount: result.savedCount,
        highConfidenceCount: result.highConfidenceCount,
        mediumConfidenceCount: result.mediumConfidenceCount,
        lowConfidenceCount: result.lowConfidenceCount,
        duration,
        databases: targetDatabases && targetDatabases.length > 0 ? targetDatabases : 'all',
        isIncremental: result.isIncremental,
        changesProcessed: result.changesProcessed,
        relationshipsCleanedUp: result.relationshipsCleanedUp,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`[POST /api/metadata/relationships/infer] Error after ${duration}ms:`, error);

    // 使用安全的错误响应（已脱敏，不泄露堆栈信息）
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to infer relationships'),
      {
        context: 'relationships-infer',
        metadata: {
          dataSourceId: requestDataSourceId,
          operation: 'infer_relationships',
        },
      }
    );
  }
}
