/**
 * 关系图谱 API
 * GET /api/relationships/graph - 获取关系图谱数据
 *
 * 重构后使用 RelationshipOrchestrator 和统一错误处理
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRelationshipOrchestrator } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * GET /api/relationships/graph
 * 获取关系图谱数据（用于可视化）
 *
 * 查询参数:
 * - dataSourceId: 数据源 ID (必需)
 * - databases: 数据库列表 (可选,逗号分隔)
 * - minConfidence: 最小置信度 (默认 0.7)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 解析参数
    const dataSourceId = searchParams.get('dataSourceId');
    const databases = searchParams.get('databases')?.split(',');
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

    console.log(`[GET /api/relationships/graph] Building graph for data source ${dataSourceId}`);

    // 使用 RelationshipOrchestrator 构建关系图谱
    const orchestrator = getRelationshipOrchestrator();
    const graph = await orchestrator.buildRelationshipGraph(
      parseInt(dataSourceId),
      databases,
      minConfidence
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
