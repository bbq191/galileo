export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 分钟，依次同步所有数据源

import { NextResponse } from 'next/server';
import { getMetadataOrchestrator, getPrismaClient } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';
import { parseTargetDatabases } from '@/lib/metadata/sync/target-databases';

/**
 * 同一实例上避免重复执行（多实例部署时由调度方保证同一时间只触发一次）
 */
let running = false;

/**
 * POST /api/admin/maintenance/sync-datasources
 *
 * 依次增量同步所有 active 数据源的元数据，供外部定时任务调用（见 manual/operations.md）。
 * 需要管理员权限（浏览器会话或 X-API-Key）。
 *
 * 不做关系推断与 AI 标注（耗时、耗 AI 额度），需要时在数据源页面手动触发。
 * 单个数据源失败不影响其他数据源，失败明细在响应的 results 中返回。
 */
export async function POST() {
  if (running) {
    return NextResponse.json({ success: false, error: '同步任务正在执行中' }, { status: 409 });
  }

  running = true;
  const startTime = Date.now();

  try {
    const dataSources = await getPrismaClient().dataSource.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, targetDatabases: true },
      orderBy: { id: 'asc' },
    });

    const orchestrator = getMetadataOrchestrator();
    const results = [];

    for (const ds of dataSources) {
      const itemStart = Date.now();
      try {
        // syncDataSource 失败时返回 success: false，而不是抛出异常
        const result = await orchestrator.syncDataSource({
          dataSourceId: ds.id,
          databases: parseTargetDatabases(ds.targetDatabases),
          inferRelationships: false,
          trackChanges: true,
          enableAIAnnotation: false,
        });
        results.push({
          id: ds.id,
          name: ds.name,
          success: result.success,
          ...(result.success
            ? { tableCount: result.tableCount, unchangedTableCount: result.unchangedTableCount }
            : { error: result.error }),
          duration: Date.now() - itemStart,
        });
      } catch (error) {
        console.error(`[Maintenance] 数据源 ${ds.id} 同步失败:`, error);
        results.push({
          id: ds.id,
          name: ds.name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - itemStart,
        });
      }
    }

    const failed = results.filter((r) => !r.success).length;
    console.log(`[Maintenance] 元数据同步完成：${results.length - failed} 成功，${failed} 失败`);

    return NextResponse.json({
      success: failed === 0,
      data: { total: results.length, failed, duration: Date.now() - startTime, results },
    }, { status: failed === 0 ? 200 : 207 });
  } catch (error) {
    return safeServerErrorResponse(error instanceof Error ? error : new Error('批量同步失败'), {
      context: 'maintenance-sync-datasources',
    });
  } finally {
    running = false;
  }
}
