/**
 * 关系图谱 API
 * GET /api/relationships/graph - 获取关系图谱数据
 *
 * 重构后使用 RelationshipOrchestrator 和统一错误处理
 */


/**
 * 显式声明 Node.js Runtime
 *
 * API Routes 运行在 Node.js Runtime 中，支持：
 * - Prisma ORM
 * - ioredis
 * - mysql2
 * - 其他 Node.js 专有 API
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getRelationshipOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * GET /api/relationships/graph
 * 获取关系图谱数据（用于可视化）
 *
 * 查询参数:
 * - dataSourceId: 数据源 ID (必需)
 * - databaseId: 数据库 ID (可选，用于过滤单个数据库)
 * - databases: 数据库列表 (可选,逗号分隔)
 * - tableId: 中心表 ID (可选，用于以表为中心展示)
 * - depth: 关系深度 (默认 2)
 * - minConfidence: 最小置信度 (默认 0.7)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 解析参数
    const dataSourceId = searchParams.get('dataSourceId');
    const databaseIdStr = searchParams.get('databaseId');
    const databases = searchParams.get('databases')?.split(',');
    const tableIdStr = searchParams.get('tableId');
    const depth = parseInt(searchParams.get('depth') || '2');
    const includeInferred = searchParams.get('includeInferred') === 'true';
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.7');

    // 参数验证
    if (!dataSourceId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'dataSourceId is required',
        },
        { status: 400 }
      );
    }

    const databaseId = databaseIdStr ? parseInt(databaseIdStr) : undefined;
    const tableId = tableIdStr ? parseInt(tableIdStr) : undefined;

    console.log(`[GET /api/relationships/graph] Building graph for data source ${dataSourceId}, database ${databaseId || 'all'}, table ${tableId || 'all'}, depth ${depth}`);

    // 使用 RelationshipOrchestrator 构建关系图谱
    const orchestrator = getRelationshipOrchestrator();
    const graph = await orchestrator.buildRelationshipGraph(
      parseInt(dataSourceId),
      databases,
      minConfidence,
      tableId,
      depth,
      databaseId,
      includeInferred
    );

    console.log(
      `[GET /api/relationships/graph] Graph built: ` +
      `${graph.nodes?.length || 0} nodes, ${graph.edges?.length || 0} edges`
    );

    return NextResponse.json({
      status: 'success',
      data: graph,
    });

  } catch (error) {
    console.error('[GET /api/relationships/graph] Error:', error);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to fetch relationship graph'),
      {
        context: 'relationships-graph-get',
        metadata: { operation: 'get_relationship_graph' },
      }
    );
  }
}
