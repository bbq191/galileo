/**
 * 关系图谱 API
 * GET /api/relationships/graph - 获取关系图谱数据
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

interface GraphNode {
  id: number;
  label: string;
  type: 'table';
  databaseId: number;
  databaseName: string;
  tableId: number;
}

interface GraphEdge {
  id: string;
  source: number;  // table id
  target: number;  // table id
  type: 'explicit' | 'inferred';
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
  confidence?: number;
  sourceColumn: string;
  targetColumn: string;
  isVerified?: boolean;
}

/**
 * GET /api/relationships/graph
 * 获取关系图谱数据（用于可视化）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 过滤参数
    const tableId = searchParams.get('tableId');       // 中心表 ID
    const depth = parseInt(searchParams.get('depth') || '2'); // 关系深度
    const databaseId = searchParams.get('databaseId'); // 限制数据库
    const includeInferred = searchParams.get('includeInferred') !== 'false'; // 是否包含推断关系
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0.7'); // 最小置信度

    // 如果指定了 tableId，从该表开始构建图谱
    let tableIds: Set<number> = new Set();

    if (tableId) {
      const tid = parseInt(tableId);
      tableIds.add(tid);

      // 递归查找相关表（最多 depth 层）
      await findRelatedTables(tid, depth, tableIds, includeInferred, minConfidence);
    } else if (databaseId) {
      // 查询指定数据库的所有表
      const tables = await prisma.tableMeta.findMany({
        where: { databaseId: parseInt(databaseId) },
        select: { id: true },
      });
      tables.forEach((t) => tableIds.add(t.id));
    } else {
      // 如果没有指定，返回错误
      return NextResponse.json(
        {
          status: 'error',
          message: 'Either tableId or databaseId is required',
        },
        { status: 400 }
      );
    }

    // 获取节点数据
    const tables = await prisma.tableMeta.findMany({
      where: {
        id: { in: Array.from(tableIds) },
      },
      select: {
        id: true,
        tableName: true,
        databaseId: true,
        database: {
          select: {
            databaseName: true,
          },
        },
      },
    });

    const nodes: GraphNode[] = tables.map((table) => ({
      id: table.id,
      label: table.tableName,
      type: 'table' as const,
      databaseId: table.databaseId,
      databaseName: table.database.databaseName,
      tableId: table.id,
    }));

    // 获取边数据（显式关系）
    const explicitRelationships = await prisma.explicitRelationship.findMany({
      where: {
        AND: [
          { sourceTableId: { in: Array.from(tableIds) } },
          { targetTableId: { in: Array.from(tableIds) } },
        ],
      },
      include: {
        sourceColumn: { select: { columnName: true } },
        targetColumn: { select: { columnName: true } },
      },
    });

    const edges: GraphEdge[] = explicitRelationships.map((rel) => ({
      id: `explicit-${rel.id}`,
      source: rel.sourceTableId,
      target: rel.targetTableId,
      type: 'explicit' as const,
      relationshipType: rel.relationshipType.replace(/_/g, '-') as any,
      confidence: 1.0,
      sourceColumn: rel.sourceColumn.columnName,
      targetColumn: rel.targetColumn.columnName,
    }));

    // 获取边数据（推断关系）
    if (includeInferred) {
      const inferredRelationships = await prisma.inferredRelationship.findMany({
        where: {
          AND: [
            { sourceTableId: { in: Array.from(tableIds) } },
            { targetTableId: { in: Array.from(tableIds) } },
            { confidenceScore: { gte: minConfidence } },
          ],
        },
        include: {
          sourceColumn: { select: { columnName: true } },
          targetColumn: { select: { columnName: true } },
        },
      });

      inferredRelationships.forEach((rel) => {
        edges.push({
          id: `inferred-${rel.id}`,
          source: rel.sourceTableId,
          target: rel.targetTableId,
          type: 'inferred' as const,
          relationshipType: rel.relationshipType.replace(/_/g, '-') as any,
          confidence: parseFloat(rel.confidenceScore.toString()),
          sourceColumn: rel.sourceColumn.columnName,
          targetColumn: rel.targetColumn.columnName,
          isVerified: rel.isVerified,
        });
      });
    }

    return NextResponse.json({
      status: 'success',
      data: {
        nodes,
        edges,
        metadata: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          explicitEdgeCount: edges.filter((e) => e.type === 'explicit').length,
          inferredEdgeCount: edges.filter((e) => e.type === 'inferred').length,
          depth,
          centerTableId: tableId ? parseInt(tableId) : null,
        },
      },
    });
  } catch (error) {
    console.error('获取关系图谱失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch relationship graph',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * 递归查找相关表
 */
async function findRelatedTables(
  tableId: number,
  remainingDepth: number,
  visited: Set<number>,
  includeInferred: boolean,
  minConfidence: number
): Promise<void> {
  if (remainingDepth <= 0) {
    return;
  }

  // 查找显式关系
  const explicitRelations = await prisma.explicitRelationship.findMany({
    where: {
      OR: [
        { sourceTableId: tableId },
        { targetTableId: tableId },
      ],
    },
    select: {
      sourceTableId: true,
      targetTableId: true,
    },
  });

  const relatedTableIds = new Set<number>();
  explicitRelations.forEach((rel) => {
    if (rel.sourceTableId !== tableId && !visited.has(rel.sourceTableId)) {
      relatedTableIds.add(rel.sourceTableId);
    }
    if (rel.targetTableId !== tableId && !visited.has(rel.targetTableId)) {
      relatedTableIds.add(rel.targetTableId);
    }
  });

  // 查找推断关系
  if (includeInferred) {
    const inferredRelations = await prisma.inferredRelationship.findMany({
      where: {
        OR: [
          { sourceTableId: tableId },
          { targetTableId: tableId },
        ],
        confidenceScore: { gte: minConfidence },
      },
      select: {
        sourceTableId: true,
        targetTableId: true,
      },
    });

    inferredRelations.forEach((rel) => {
      if (rel.sourceTableId !== tableId && !visited.has(rel.sourceTableId)) {
        relatedTableIds.add(rel.sourceTableId);
      }
      if (rel.targetTableId !== tableId && !visited.has(rel.targetTableId)) {
        relatedTableIds.add(rel.targetTableId);
      }
    });
  }

  // 添加到已访问集合
  relatedTableIds.forEach((id) => visited.add(id));

  // 递归查找下一层
  if (remainingDepth > 1) {
    for (const id of relatedTableIds) {
      await findRelatedTables(id, remainingDepth - 1, visited, includeInferred, minConfidence);
    }
  }
}
