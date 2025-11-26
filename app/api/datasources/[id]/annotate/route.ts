export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';
export const maxDuration = 300; // 5 分钟，用于处理大型数据库的 AI 语义标注

import { NextRequest, NextResponse } from 'next/server';
import { safeServerErrorResponse } from '@/lib/api/response';
import { getService, getPrismaClient } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { SemanticAnnotator } from '@/lib/ai/semantic-annotator';
import { logger, logError } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/datasources/[id]/annotate
 *
 * 为指定数据源的所有数据库、表、字段执行 AI 语义标注
 *
 * 职责：
 * - 获取数据源下的所有数据库
 * - 调用 SemanticAnnotator 批量标注
 * - 返回标注统计结果
 *
 * @author xusy
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const startTime = Date.now();

  try {
    const { id } = await context.params;
    const dataSourceId = parseInt(id);

    logger.info({
      dataSourceId,
      action: 'annotation_start',
      path: `/api/datasources/${id}/annotate`,
    }, 'Starting semantic annotation');

    // 解析请求体（可选参数）
    const body = await request.json().catch(() => ({}));
    const {
      databases: requestDatabases,
      force = false, // 是否强制重新标注已有描述的项
    } = body;

    // 获取数据库列表
    const prisma = getPrismaClient();

    let databases = requestDatabases;
    if (!databases || databases.length === 0) {
      // 如果未指定数据库，则获取该数据源下的所有数据库
      const dbMetas = await prisma.databaseMeta.findMany({
        where: { sourceId: dataSourceId },
        select: { databaseName: true },
      });
      databases = dbMetas.map(db => db.databaseName);
    }

    if (databases.length === 0) {
      return NextResponse.json({
        status: 'error',
        message: '该数据源下没有数据库需要标注',
      }, { status: 400 });
    }

    logger.info({
      dataSourceId,
      databases,
      force,
      action: 'annotation_databases_selected',
    }, `Selected ${databases.length} databases for annotation`);

    // 获取 SemanticAnnotator 服务
    const annotator = getService<SemanticAnnotator>(DI_TOKENS.SemanticAnnotator);

    // 批量标注所有数据库
    const results = [];
    let totalStats = {
      databases: 0,
      tables: 0,
      columns: 0,
      ruleProcessed: 0,
      aiProcessed: 0,
      skipped: 0,
      failed: 0,
    };

    for (const databaseName of databases) {
      try {
        // 获取数据库 ID
        const dbMeta = await prisma.databaseMeta.findFirst({
          where: {
            sourceId: dataSourceId,
            databaseName,
          },
        });

        if (!dbMeta) {
          logger.warn({
            dataSourceId,
            databaseName,
            action: 'database_not_found',
          }, `Database not found: ${databaseName}`);

          results.push({
            database: databaseName,
            success: false,
            error: '数据库不存在',
          });
          continue;
        }

        // 执行完整标注
        logger.info({
          dataSourceId,
          databaseId: dbMeta.id,
          databaseName,
          action: 'annotating_database',
        }, `Annotating database: ${databaseName}`);

        const result = await annotator.annotateDatabaseFull(dbMeta.id, {
          force,
          onProgress: (progress) => {
            logger.debug({
              dataSourceId,
              databaseId: dbMeta.id,
              stage: progress.stage,
              completed: progress.progress.completed,
              total: progress.progress.total,
            }, `Annotation progress: ${progress.stage} - ${progress.progress.completed}/${progress.progress.total}`);
          },
        });

        results.push({
          database: databaseName,
          success: true,
          stats: {
            database: result.database,
            tables: result.tables,
            columns: result.columns,
          },
        });

        // 累计统计
        totalStats.databases++;
        totalStats.tables += result.tables.total;
        totalStats.columns += result.columns.total;
        totalStats.ruleProcessed += result.columns.ruleProcessed;
        totalStats.aiProcessed += result.columns.aiProcessed + result.tables.aiProcessed + (result.database.source === 'ai' ? 1 : 0);
        totalStats.skipped += result.columns.skipped + result.tables.skipped;
        totalStats.failed += result.columns.failed + result.tables.failed;

      } catch (error: any) {
        logger.error({
          dataSourceId,
          databaseName,
          error: error.message,
          action: 'annotation_database_failed',
        }, `Failed to annotate database: ${databaseName}`);

        results.push({
          database: databaseName,
          success: false,
          error: error.message,
        });
        totalStats.failed++;
      }
    }

    const duration = Date.now() - startTime;

    logger.info({
      dataSourceId,
      action: 'annotation_success',
      duration,
      stats: totalStats,
    }, `Annotation completed in ${duration}ms`);

    return NextResponse.json({
      status: 'success',
      message: `成功标注 ${totalStats.databases} 个数据库`,
      data: {
        results,
        summary: totalStats,
        duration,
      },
    });

  } catch (error) {
    const err = error instanceof Error ? error : new Error('Failed to annotate semantics');
    const { id } = await context.params;
    const dataSourceId = parseInt(id);
    const duration = Date.now() - startTime;

    logError(err, {
      dataSourceId,
      action: 'annotation_failed',
      duration,
      context: 'datasource-annotate',
    });

    return safeServerErrorResponse(err, {
      context: 'datasource-annotate',
      metadata: { operation: 'annotate_semantics' },
    });
  }
}
