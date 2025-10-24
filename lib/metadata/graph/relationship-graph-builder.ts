/**
 * 关系图谱构建器（优化版）
 * 解决原有 N+1 查询问题
 */

import prisma from '@/lib/prisma/client';
import { multiLevelCache } from '@/lib/cache';

export interface GraphNode {
  id: number;
  label: string;
  type: 'table';
  databaseId: number;
  databaseName: string;
  tableId: number;
}

export interface GraphEdge {
  id: string;
  source: number; // table id
  target: number; // table id
  type: 'explicit' | 'inferred';
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
  confidence?: number;
  sourceColumn: string;
  targetColumn: string;
  isVerified?: boolean;
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    nodeCount: number;
    edgeCount: number;
    explicitEdgeCount: number;
    inferredEdgeCount: number;
    depth: number;
    centerTableId: number | null;
  };
}

/**
 * 关系图谱构建器类
 */
export class RelationshipGraphBuilder {
  /**
   * 构建关系图谱（带缓存）
   */
  async buildGraph(
    tableId: number | null,
    databaseId: number | null,
    depth: number = 2,
    includeInferred: boolean = true,
    minConfidence: number = 0.7
  ): Promise<RelationshipGraph> {
    // 生成缓存键
    const cacheParams = {
      id: tableId || databaseId || 0,
      depth,
      includeInferred: includeInferred ? 'true' : 'false',
    };

    return await multiLevelCache.get('relationship_graph', cacheParams, async () => {
      return await this.buildGraphInternal(
        tableId,
        databaseId,
        depth,
        includeInferred,
        minConfidence
      );
    });
  }

  /**
   * 内部构建逻辑（优化版，批量查询）
   */
  private async buildGraphInternal(
    tableId: number | null,
    databaseId: number | null,
    depth: number,
    includeInferred: boolean,
    minConfidence: number
  ): Promise<RelationshipGraph> {
    const tableIds: Set<number> = new Set();

    // 1. 确定起始表集合
    if (tableId) {
      tableIds.add(tableId);
      // 递归查找相关表
      await this.findRelatedTablesOptimized(tableId, depth, tableIds, includeInferred, minConfidence);
    } else if (databaseId) {
      const tables = await prisma.tableMeta.findMany({
        where: { databaseId },
        select: { id: true },
      });
      tables.forEach((t) => tableIds.add(t.id));
    } else {
      throw new Error('Either tableId or databaseId is required');
    }

    // 2. 批量获取节点数据
    const nodes = await this.fetchNodes(Array.from(tableIds));

    // 3. 批量获取边数据
    const edges = await this.fetchEdges(Array.from(tableIds), includeInferred, minConfidence);

    // 4. 构建返回结果
    return {
      nodes,
      edges,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        explicitEdgeCount: edges.filter((e) => e.type === 'explicit').length,
        inferredEdgeCount: edges.filter((e) => e.type === 'inferred').length,
        depth,
        centerTableId: tableId,
      },
    };
  }

  /**
   * 优化的递归查找相关表（批量查询）
   */
  private async findRelatedTablesOptimized(
    tableId: number,
    remainingDepth: number,
    visited: Set<number>,
    includeInferred: boolean,
    minConfidence: number
  ): Promise<void> {
    if (remainingDepth <= 0) {
      return;
    }

    // 批量查询显式关系和推断关系
    const [explicitRels, inferredRels] = await Promise.all([
      prisma.explicitRelationship.findMany({
        where: {
          OR: [{ sourceTableId: tableId }, { targetTableId: tableId }],
        },
        select: {
          sourceTableId: true,
          targetTableId: true,
        },
      }),
      includeInferred
        ? prisma.inferredRelationship.findMany({
            where: {
              OR: [{ sourceTableId: tableId }, { targetTableId: tableId }],
              confidenceScore: { gte: minConfidence },
            },
            select: {
              sourceTableId: true,
              targetTableId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // 收集相关表 ID
    const relatedTableIds = new Set<number>();

    explicitRels.forEach((rel) => {
      if (rel.sourceTableId !== tableId && !visited.has(rel.sourceTableId)) {
        relatedTableIds.add(rel.sourceTableId);
      }
      if (rel.targetTableId !== tableId && !visited.has(rel.targetTableId)) {
        relatedTableIds.add(rel.targetTableId);
      }
    });

    inferredRels.forEach((rel) => {
      if (rel.sourceTableId !== tableId && !visited.has(rel.sourceTableId)) {
        relatedTableIds.add(rel.sourceTableId);
      }
      if (rel.targetTableId !== tableId && !visited.has(rel.targetTableId)) {
        relatedTableIds.add(rel.targetTableId);
      }
    });

    // 添加到已访问集合
    relatedTableIds.forEach((id) => visited.add(id));

    // 递归查找下一层（并行处理）
    if (remainingDepth > 1 && relatedTableIds.size > 0) {
      await Promise.all(
        Array.from(relatedTableIds).map((id) =>
          this.findRelatedTablesOptimized(
            id,
            remainingDepth - 1,
            visited,
            includeInferred,
            minConfidence
          )
        )
      );
    }
  }

  /**
   * 批量获取节点数据
   */
  private async fetchNodes(tableIds: number[]): Promise<GraphNode[]> {
    const tables = await prisma.tableMeta.findMany({
      where: {
        id: { in: tableIds },
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

    return tables.map((table) => ({
      id: table.id,
      label: table.tableName,
      type: 'table' as const,
      databaseId: table.databaseId,
      databaseName: table.database.databaseName,
      tableId: table.id,
    }));
  }

  /**
   * 批量获取边数据
   */
  private async fetchEdges(
    tableIds: number[],
    includeInferred: boolean,
    minConfidence: number
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];

    // 批量查询显式关系
    const explicitRelationships = await prisma.explicitRelationship.findMany({
      where: {
        AND: [{ sourceTableId: { in: tableIds } }, { targetTableId: { in: tableIds } }],
      },
      include: {
        sourceColumn: { select: { columnName: true } },
        targetColumn: { select: { columnName: true } },
      },
    });

    explicitRelationships.forEach((rel) => {
      edges.push({
        id: `explicit-${rel.id}`,
        source: rel.sourceTableId,
        target: rel.targetTableId,
        type: 'explicit' as const,
        relationshipType: rel.relationshipType.replace(/_/g, '-') as any,
        confidence: 1.0,
        sourceColumn: rel.sourceColumn.columnName,
        targetColumn: rel.targetColumn.columnName,
      });
    });

    // 批量查询推断关系
    if (includeInferred) {
      const inferredRelationships = await prisma.inferredRelationship.findMany({
        where: {
          AND: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
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

    return edges;
  }

  /**
   * 清空关系图谱缓存
   */
  async invalidateCache(tableId?: number): Promise<void> {
    if (tableId) {
      await multiLevelCache.invalidate('relationship_added', `graph:table:${tableId}:*`);
    } else {
      await multiLevelCache.invalidate('relationship_added', 'graph:*');
    }
  }
}

// 导出单例
export const relationshipGraphBuilder = new RelationshipGraphBuilder();
