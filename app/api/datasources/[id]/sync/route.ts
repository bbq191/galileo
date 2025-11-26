export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { safeServerErrorResponse } from '@/lib/api/response';
import { getMetadataOrchestrator, getPrismaClient } from '@/lib/di/setup';
import { logger, logError } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 同步数据源元数据
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const startTime = Date.now();

  try {
    const { id } = await context.params;
    const dataSourceId = parseInt(id);

    logger.info({
      dataSourceId,
      action: 'sync_start',
      path: `/api/datasources/${id}/sync`,
    }, 'Starting metadata sync');

    // 解析请求体（可选参数）
    const body = await request.json().catch(() => ({}));
    const {
      databases: requestDatabases,
      inferRelationships = true,
      minConfidence = 0.70,
      trackChanges = true,
      enableAIAnnotation = false,
    } = body;

    // 获取要同步的数据库列表
    // 优先使用请求体中的 databases，否则使用数据源配置的 targetDatabases
    let databases = requestDatabases;
    if (!databases || databases.length === 0) {
      const prisma = getPrismaClient();
      const dataSource = await prisma.dataSource.findUnique({
        where: { id: dataSourceId },
        select: { targetDatabases: true },
      });
      if (dataSource?.targetDatabases) {
        try {
          databases = JSON.parse(dataSource.targetDatabases);
          logger.info({
            dataSourceId,
            databases,
            action: 'using_configured_databases',
          }, 'Using configured target databases');
        } catch {
          logger.warn({
            dataSourceId,
            action: 'parse_target_databases_failed',
          }, 'Failed to parse targetDatabases, will sync all databases');
        }
      }
    }

    // 使用 MetadataOrchestrator 同步元数据
    const orchestrator = getMetadataOrchestrator();
    const result = await orchestrator.syncDataSource({
      dataSourceId,
      databases,
      inferRelationships,
      minConfidence,
      trackChanges,
      enableAIAnnotation,
    });

    const duration = Date.now() - startTime;

    logger.info({
      dataSourceId,
      action: 'sync_success',
      duration,
      databaseCount: result.databaseCount,
      tableCount: result.tableCount,
      columnCount: result.columnCount,
    }, `Sync completed in ${duration}ms - ${result.databaseCount} databases, ${result.tableCount} tables, ${result.columnCount} columns`);

    return NextResponse.json({
      status: 'success',
      message: `Successfully synced ${result.databaseCount} databases with ${result.tableCount} tables`,
      data: {
        ...result,
        duration,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Failed to synchronize metadata');
    const { id } = await context.params;
    const dataSourceId = parseInt(id);
    const duration = Date.now() - startTime;

    logError(err, {
      dataSourceId,
      action: 'sync_failed',
      duration,
      context: 'datasource-sync',
    });

    return safeServerErrorResponse(err, {
      context: 'datasource-sync',
      metadata: { operation: 'sync_metadata' },
    });
  }
}
