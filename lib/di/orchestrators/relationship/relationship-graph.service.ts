/**
 * RelationshipGraphService - 关系图谱服务
 *
 * 职责：
 * - 构建关系图谱（节点和边）
 * - 提供图谱查询和分析功能
 * - 计算图谱统计信息
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';

/**
 * 关系图谱节点
 */
export interface RelationshipGraphNode {
  /** 表 ID */
  tableId: number;

  /** 表名 */
  tableName: string;

  /** 数据库名 */
  databaseName: string;

  /** 出度（指向其他表的关系数） */
  outDegree: number;

  /** 入度（被其他表指向的关系数） */
  inDegree: number;
}

/**
 * 关系图谱边
 */
export interface RelationshipGraphEdge {
  /** 源表 ID */
  sourceTableId: number;

  /** 目标表 ID */
  targetTableId: number;

  /** 源字段 */
  sourceColumn: string;

  /** 目标字段 */
  targetColumn: string;

  /** 置信度 */
  confidence: number;

  /** 关系类型 */
  type: 'explicit' | 'inferred' | 'verified';

  /** 关系模式 */
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/**
 * 关系图谱
 */
export interface RelationshipGraph {
  /** 节点列表 */
  nodes: RelationshipGraphNode[];

  /** 边列表 */
  edges: RelationshipGraphEdge[];

  /** 统计信息 */
  stats: {
    nodeCount: number;
    edgeCount: number;
    avgDegree: number;
    maxInDegree: number;
    maxOutDegree: number;
  };
}

/**
 * RelationshipGraphService
 *
 * 关系图谱服务，负责构建和查询表关系图谱
 */
@injectable()
export class RelationshipGraphService {
  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService
  ) {}

  /**
   * 构建关系图谱
   *
   * @param dataSourceId - 数据源 ID
   * @param databases - 可选的数据库列表
   * @param minConfidence - 最小置信度
   * @param tableId - 可选的中心表 ID
   * @param depth - 关系深度
   * @param databaseId - 可选的数据库 ID
   * @returns 关系图谱
   */
  async buildRelationshipGraph(
    dataSourceId: number,
    databases?: string[],
    minConfidence: number = 0.70,
    tableId?: number,
    depth: number = 2,
    databaseId?: number
  ): Promise<RelationshipGraph> {
    try {
      console.log(`[RelationshipGraphService] Building relationship graph for data source ${dataSourceId}, table ${tableId || 'all'}, depth ${depth}...`);

      // 如果提供了 databaseId，则查询数据库名称
      let databaseFilter: { databaseName?: { in: string[] } } = {};
      if (databaseId) {
        const db = await this.dbService.prisma.databaseMeta.findUnique({
          where: { id: databaseId },
          select: { databaseName: true },
        });
        if (db) {
          databaseFilter = { databaseName: { in: [db.databaseName] } };
        }
      } else if (databases && databases.length > 0) {
        databaseFilter = { databaseName: { in: databases } };
      }

      // 获取数据库和表
      const dbMetas = await this.dbService.prisma.databaseMeta.findMany({
        where: {
          sourceId: dataSourceId,
          ...databaseFilter,
        },
        include: {
          tables: {
            include: {
              sourceRelationships: {
                include: {
                  sourceColumn: true,
                  targetColumn: true,
                },
              },
              targetRelationships: {
                include: {
                  sourceColumn: true,
                  targetColumn: true,
                },
              },
            },
          },
        },
      });

      // 构建所有节点
      const allNodes: RelationshipGraphNode[] = [];
      const allEdges: RelationshipGraphEdge[] = [];

      for (const db of dbMetas) {
        for (const table of db.tables) {
          const outDegree = table.sourceRelationships.length;
          const inDegree = table.targetRelationships.length;

          allNodes.push({
            tableId: table.id,
            tableName: table.tableName,
            databaseName: db.databaseName,
            outDegree,
            inDegree,
          });

          // 添加显式关系边
          for (const rel of table.sourceRelationships) {
            allEdges.push({
              sourceTableId: rel.sourceTableId,
              targetTableId: rel.targetTableId,
              sourceColumn: rel.sourceColumn.columnName,
              targetColumn: rel.targetColumn.columnName,
              confidence: 1.0,
              type: 'explicit',
              relationshipType: this.convertRelationshipType(rel.relationshipType),
            });
          }
        }
      }

      // 添加推断关系边
      const allTableIds = allNodes.map(n => n.tableId);
      const inferredRels = await this.dbService.prisma.inferredRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: allTableIds } },
            { targetTableId: { in: allTableIds } },
          ],
          confidenceScore: { gte: minConfidence },
        },
        include: {
          sourceColumn: true,
          targetColumn: true,
        },
      });

      for (const rel of inferredRels) {
        allEdges.push({
          sourceTableId: rel.sourceTableId,
          targetTableId: rel.targetTableId,
          sourceColumn: rel.sourceColumn.columnName,
          targetColumn: rel.targetColumn.columnName,
          confidence: rel.confidenceScore.toNumber(),
          type: rel.isVerified ? 'verified' : 'inferred',
          relationshipType: this.convertRelationshipType(rel.relationshipType),
        });
      }

      // 如果指定了中心表，则过滤出相关节点和边
      let filteredNodes = allNodes;
      let filteredEdges = allEdges;

      if (tableId) {
        const relatedTableIds = this.findRelatedTables(tableId, allEdges, depth);
        filteredNodes = allNodes.filter(n => relatedTableIds.has(n.tableId));
        filteredEdges = allEdges.filter(e =>
          relatedTableIds.has(e.sourceTableId) && relatedTableIds.has(e.targetTableId)
        );
      }

      // 计算统计
      const avgDegree = filteredNodes.reduce((sum, n) => sum + n.inDegree + n.outDegree, 0) / (filteredNodes.length || 1);
      const maxInDegree = Math.max(...filteredNodes.map(n => n.inDegree), 0);
      const maxOutDegree = Math.max(...filteredNodes.map(n => n.outDegree), 0);

      const graph: RelationshipGraph = {
        nodes: filteredNodes,
        edges: filteredEdges,
        stats: {
          nodeCount: filteredNodes.length,
          edgeCount: filteredEdges.length,
          avgDegree,
          maxInDegree,
          maxOutDegree,
        },
      };

      console.log(
        `[RelationshipGraphService] Graph built: ${graph.stats.nodeCount} nodes, ${graph.stats.edgeCount} edges`
      );
      return graph;

    } catch (error) {
      console.error(`[RelationshipGraphService] Build relationship graph failed:`, error);

      return {
        nodes: [],
        edges: [],
        stats: {
          nodeCount: 0,
          edgeCount: 0,
          avgDegree: 0,
          maxInDegree: 0,
          maxOutDegree: 0,
        },
      };
    }
  }

  /**
   * 查找与中心表相关的所有表（使用 BFS 算法）
   *
   * @param centerTableId - 中心表 ID
   * @param edges - 所有边
   * @param maxDepth - 最大深度
   * @returns 相关表 ID 集合
   * @private
   */
  private findRelatedTables(
    centerTableId: number,
    edges: RelationshipGraphEdge[],
    maxDepth: number
  ): Set<number> {
    const relatedTables = new Set<number>([centerTableId]);
    const queue: { tableId: number; depth: number }[] = [{ tableId: centerTableId, depth: 0 }];
    const visited = new Set<number>([centerTableId]);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) {
        continue;
      }

      // 查找所有相关的边
      for (const edge of edges) {
        let nextTableId: number | null = null;

        if (edge.sourceTableId === current.tableId) {
          nextTableId = edge.targetTableId;
        } else if (edge.targetTableId === current.tableId) {
          nextTableId = edge.sourceTableId;
        }

        if (nextTableId !== null && !visited.has(nextTableId)) {
          visited.add(nextTableId);
          relatedTables.add(nextTableId);
          queue.push({ tableId: nextTableId, depth: current.depth + 1 });
        }
      }
    }

    return relatedTables;
  }

  /**
   * 查找表的直接关系
   *
   * @param tableId - 表 ID
   * @returns 直接关系的表 ID 列表
   */
  async findDirectRelationships(tableId: number): Promise<{
    outgoing: number[];
    incoming: number[];
  }> {
    try {
      console.log(`[RelationshipGraphService] Finding direct relationships for table ${tableId}...`);

      // 查找显式关系
      const explicitRels = await this.dbService.prisma.explicitRelationship.findMany({
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

      // 查找推断关系
      const inferredRels = await this.dbService.prisma.inferredRelationship.findMany({
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

      const allRels = [...explicitRels, ...inferredRels];

      const outgoing = [...new Set(
        allRels
          .filter(r => r.sourceTableId === tableId)
          .map(r => r.targetTableId)
      )];

      const incoming = [...new Set(
        allRels
          .filter(r => r.targetTableId === tableId)
          .map(r => r.sourceTableId)
      )];

      console.log(`[RelationshipGraphService] Found ${outgoing.length} outgoing, ${incoming.length} incoming relationships`);
      return { outgoing, incoming };

    } catch (error) {
      console.error(`[RelationshipGraphService] Find direct relationships failed:`, error);
      return { outgoing: [], incoming: [] };
    }
  }

  /**
   * 查找两个表之间的路径
   *
   * @param sourceTableId - 源表 ID
   * @param targetTableId - 目标表 ID
   * @param maxDepth - 最大深度
   * @returns 路径列表（每个路径是表 ID 数组）
   */
  async findPaths(
    sourceTableId: number,
    targetTableId: number,
    maxDepth: number = 3
  ): Promise<number[][]> {
    try {
      console.log(`[RelationshipGraphService] Finding paths from table ${sourceTableId} to ${targetTableId}...`);

      // 使用 BFS 查找路径
      const paths: number[][] = [];
      const queue: { tableId: number; path: number[] }[] = [
        { tableId: sourceTableId, path: [sourceTableId] }
      ];
      const visited = new Set<number>();

      while (queue.length > 0) {
        const current = queue.shift()!;

        if (current.path.length > maxDepth) {
          continue;
        }

        if (current.tableId === targetTableId) {
          paths.push(current.path);
          continue;
        }

        if (visited.has(current.tableId)) {
          continue;
        }
        visited.add(current.tableId);

        // 获取直接关系
        const { outgoing } = await this.findDirectRelationships(current.tableId);

        for (const nextTableId of outgoing) {
          if (!current.path.includes(nextTableId)) {
            queue.push({
              tableId: nextTableId,
              path: [...current.path, nextTableId],
            });
          }
        }
      }

      console.log(`[RelationshipGraphService] Found ${paths.length} paths`);
      return paths;

    } catch (error) {
      console.error(`[RelationshipGraphService] Find paths failed:`, error);
      return [];
    }
  }

  /**
   * 获取图谱中心节点（入度+出度最高的节点）
   *
   * @param dataSourceId - 数据源 ID
   * @param limit - 限制数量
   * @returns 中心节点列表
   */
  async getCentralNodes(
    dataSourceId: number,
    limit: number = 10
  ): Promise<RelationshipGraphNode[]> {
    try {
      console.log(`[RelationshipGraphService] Getting central nodes for data source ${dataSourceId}...`);

      const graph = await this.buildRelationshipGraph(dataSourceId);

      // 按总度数排序
      const centralNodes = graph.nodes
        .sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree))
        .slice(0, limit);

      console.log(`[RelationshipGraphService] Found ${centralNodes.length} central nodes`);
      return centralNodes;

    } catch (error) {
      console.error(`[RelationshipGraphService] Get central nodes failed:`, error);
      return [];
    }
  }

  /**
   * 转换关系类型枚举
   *
   * @param type - Prisma 枚举类型
   * @returns 接口使用的关系类型
   * @private
   */
  private convertRelationshipType(type: string): 'one-to-one' | 'one-to-many' | 'many-to-many' {
    switch (type) {
      case 'ONE_TO_ONE':
        return 'one-to-one';
      case 'ONE_TO_MANY':
        return 'one-to-many';
      case 'MANY_TO_MANY':
        return 'many-to-many';
      default:
        return 'one-to-many'; // 默认值
    }
  }
}
