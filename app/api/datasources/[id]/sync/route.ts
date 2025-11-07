/**
 * 数据源元数据同步 API
 * POST /api/datasources/:id/sync - 同步数据源的元数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeServerErrorResponse } from '@/lib/api/response';
import { getMetadataOrchestrator } from '@/lib/di/setup';

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

    console.log(`[POST /api/datasources/${id}/sync] Starting metadata sync...`);

    // 解析请求体（可选参数）
    const body = await request.json().catch(() => ({}));
    const {
      databases,
      inferRelationships = true,
      minConfidence = 0.70,
      trackChanges = true,
    } = body;

    // 使用 MetadataOrchestrator 同步元数据
    const orchestrator = getMetadataOrchestrator();
    const result = await orchestrator.syncDataSource({
      dataSourceId,
      databases,
      inferRelationships,
      minConfidence,
      trackChanges,
    });

    const duration = Date.now() - startTime;

    console.log(`[POST /api/datasources/${id}/sync] Sync completed in ${duration}ms`);
    console.log(`[POST /api/datasources/${id}/sync] Synced ${result.databaseCount} databases, ${result.tableCount} tables, ${result.columnCount} columns`);

    return NextResponse.json({
      status: 'success',
      message: `Successfully synced ${result.databaseCount} databases with ${result.tableCount} tables`,
      data: {
        ...result,
        duration,
      },
    });
  } catch (error) {
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to synchronize metadata'),
      {
        context: 'datasource-sync',
        metadata: { operation: 'sync_metadata' },
      }
    );
  }
}
