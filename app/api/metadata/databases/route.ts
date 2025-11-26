export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getMetadataOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * GET /api/metadata/databases
 * 获取数据源的所有数据库
 *
 * 查询参数:
 * - sourceId: 数据源 ID (可选)
 * - databaseId: 数据库 ID (可选,获取单个数据库)
 * - includeDomain: 是否包含业务域信息 (可选)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId');
    const databaseId = searchParams.get('databaseId');
    const includeDomain = searchParams.get('includeDomain') === 'true';

    // 如果请求包含业务域信息，使用 Prisma 直接查询
    if (includeDomain) {
      const { getService } = require('@/lib/di/setup');
      const { DI_TOKENS } = require('@/lib/di/tokens');
      const prisma = getService(DI_TOKENS.PrismaClient);

      const where: any = {};
      if (sourceId) {
        where.sourceId = parseInt(sourceId);
      }
      if (databaseId) {
        where.id = parseInt(databaseId);
      }

      const databases = await prisma.databaseMeta.findMany({
        where,
        include: {
          domain: true,
          source: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      });

      if (databaseId && databases.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Database not found',
          },
          { status: 404 }
        );
      }

      console.log(`[GET /api/metadata/databases] Retrieved ${databases.length} databases with domain info`);

      return NextResponse.json({
        success: true,
        data: databases,
        total: databases.length,
      });
    }

    // 使用 MetadataOrchestrator 获取数据库列表（原有逻辑）
    const orchestrator = getMetadataOrchestrator();
    const databases = await orchestrator.getDatabases(
      sourceId ? parseInt(sourceId) : undefined,
      databaseId ? parseInt(databaseId) : undefined
    );

    if (databaseId && databases.length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Database not found',
        },
        { status: 404 }
      );
    }

    console.log(`[GET /api/metadata/databases] Retrieved ${databases.length} databases`);

    return NextResponse.json({
      status: 'success',
      data: databases,
      total: databases.length,
    });

  } catch (error) {
    console.error('[GET /api/metadata/databases] Error:', error);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to get databases'),
      {
        context: 'metadata-databases-get',
        metadata: { operation: 'get_databases' },
      }
    );
  }
}
