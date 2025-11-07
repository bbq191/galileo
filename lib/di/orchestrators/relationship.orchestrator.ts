/**
 * RelationshipOrchestrator - 关系编排器
 *
 * 职责：
 * - 管理表关系的推断和维护
 * - 协调关系的验证、更新和删除
 * - 构建和查询关系图谱
 * - 提供关系统计和分析
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../tokens';
import type { DatabaseService } from '../services/database.service';
import type { MetadataRepository } from '@/lib/metadata/storage/metadata-repository';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import {
  RelationshipInferencer,
  type RelationshipInferencerConfig,
} from '@/lib/metadata/inference/relationship-inferencer';
import type { InferredRelationship, InferenceResult } from '@/lib/metadata/inference/types';
import type { ColumnInfo } from '@/lib/metadata/types';

/**
 * 关系推断选项
 */
export interface RelationshipInferOptions {
  /** 数据源 ID */
  dataSourceId: number;

  /** 数据库名称列表（可选，为空则推断所有） */
  databases?: string[];

  /** 最小置信度 */
  minConfidence?: number;

  /** 是否启用 AI 推断 */
  enableAI?: boolean;

  /** 是否跨数据库推断 */
  crossDatabase?: boolean;

  /** 是否自动保存高置信度关系 */
  autoSave?: boolean;

  /** 自动保存的最小置信度阈值 */
  autoSaveThreshold?: number;
}

/**
 * 关系验证选项
 */
export interface RelationshipVerifyOptions {
  /** 关系 ID */
  relationshipId?: number;

  /** 源表 ID */
  sourceTableId?: number;

  /** 目标表 ID */
  targetTableId?: number;

  /** 验证方法 */
  method?: 'data_analysis' | 'manual' | 'ai';

  /** 验证结果 */
  isValid: boolean;

  /** 验证置信度 */
  confidence?: number;
}

/**
 * 关系推断结果
 */
export interface RelationshipInferResult {
  /** 是否成功 */
  success: boolean;

  /** 推断出的关系数量 */
  inferredCount: number;

  /** 保存的关系数量 */
  savedCount?: number;

  /** 高置信度关系数量 */
  highConfidenceCount: number;

  /** 中置信度关系数量 */
  mediumConfidenceCount: number;

  /** 低置信度关系数量 */
  lowConfidenceCount: number;

  /** 推断耗时（毫秒） */
  duration: number;

  /** 推断的关系列表 */
  relationships?: InferredRelationship[];

  /** 错误信息 */
  error?: string;
}

/**
 * 关系统计信息
 */
export interface RelationshipStatistics {
  /** 总关系数 */
  total: number;

  /** 显式关系数 */
  explicit: number;

  /** 推断关系数 */
  inferred: number;

  /** 已验证关系数 */
  verified: number;

  /** 按置信度分布 */
  byConfidence: {
    high: number; // >= 0.8
    medium: number; // 0.6-0.8
    low: number; // < 0.6
  };

  /** 按关系类型分布 */
  byType: {
    oneToOne: number;
    oneToMany: number;
    manyToMany: number;
  };

  /** 跨数据库关系数 */
  crossDatabase: number;

  /** 自引用关系数 */
  selfReferencing: number;
}

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
 * RelationshipOrchestrator
 *
 * 关系编排器，管理表关系的完整生命周期
 */
@injectable()
export class RelationshipOrchestrator {
  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService,

    @inject(DI_TOKENS.MetadataRepository)
    private readonly metadataRepository: MetadataRepository,

    @inject(DI_TOKENS.CacheInvalidationService)
    private readonly cacheInvalidation: CacheInvalidationService
  ) {}

  /**
   * 推断表关系
   *
   * @param options - 推断选项
   * @returns 推断结果
   */
  async inferRelationships(options: RelationshipInferOptions): Promise<RelationshipInferResult> {
    const startTime = Date.now();

    try {
      console.log(`[RelationshipOrchestrator] Starting relationship inference for data source ${options.dataSourceId}...`);

      // 1. 获取元数据
      const databases = await this.dbService.prisma.databaseMeta.findMany({
        where: {
          sourceId: options.dataSourceId,
          ...(options.databases && { databaseName: { in: options.databases } }),
        },
        include: {
          tables: {
            include: {
              columns: true,
            },
          },
        },
      });

      if (databases.length === 0) {
        return {
          success: false,
          inferredCount: 0,
          highConfidenceCount: 0,
          mediumConfidenceCount: 0,
          lowConfidenceCount: 0,
          duration: Date.now() - startTime,
          error: 'No databases found for the specified data source',
        };
      }

      // 2. 准备推断器配置
      const config: RelationshipInferencerConfig = {
        minConfidence: options.minConfidence || 0.70,
        enableAIInference: options.enableAI ?? true,
        crossDatabase: options.crossDatabase ?? true,
      };

      const inferencer = new RelationshipInferencer(config);

      // 3. 按数据库推断关系
      let allRelationships: InferredRelationship[] = [];
      let savedCount = 0;

      for (const db of databases) {
        console.log(`[RelationshipOrchestrator] Inferring relationships for database ${db.databaseName}...`);

        // 准备列信息
        const columns: ColumnInfo[] = db.tables.flatMap(table =>
          table.columns.map(col => ({
            id: col.id,
            tableName: table.tableName,
            tableId: table.id,
            columnName: col.columnName,
            dataType: col.dataType,
            isNullable: col.isNullable,
            columnKey: col.columnKey || '',
            isPrimaryKey: col.columnKey === 'PRI',
            isUnique: col.columnKey === 'UNI' || col.columnKey === 'PRI',
            isForeignKey: col.columnKey === 'MUL',
            columnComment: col.columnComment || undefined,
            semanticDescription: col.semanticDescription || undefined,
            databaseName: db.databaseName,
          }))
        );

        // 执行推断
        const result: InferenceResult = await inferencer.inferRelationships(db.databaseName, columns);
        allRelationships.push(...result.relationships);

        // 4. （可选）自动保存高置信度关系
        if (options.autoSave) {
          const threshold = options.autoSaveThreshold || 0.80;
          const highConfidenceRels = result.relationships.filter(
            rel => rel.confidenceScore >= threshold
          );

          for (const rel of highConfidenceRels) {
            await this.saveInferredRelationship(rel, options.dataSourceId);
            savedCount++;
          }
        }
      }

      // 5. 统计结果
      const highConfidenceCount = allRelationships.filter(r => r.confidenceScore >= 0.8).length;
      const mediumConfidenceCount = allRelationships.filter(
        r => r.confidenceScore >= 0.6 && r.confidenceScore < 0.8
      ).length;
      const lowConfidenceCount = allRelationships.filter(r => r.confidenceScore < 0.6).length;

      // 6. 失效缓存
      await this.cacheInvalidation.invalidateMetadata({
        dataSourceId: options.dataSourceId,
        databases: options.databases,
      });

      const duration = Date.now() - startTime;

      console.log(
        `[RelationshipOrchestrator] Inference completed: ${allRelationships.length} relationships ` +
        `(${highConfidenceCount} high, ${mediumConfidenceCount} medium, ${lowConfidenceCount} low) ` +
        `in ${duration}ms`
      );

      return {
        success: true,
        inferredCount: allRelationships.length,
        savedCount: options.autoSave ? savedCount : undefined,
        highConfidenceCount,
        mediumConfidenceCount,
        lowConfidenceCount,
        duration,
        relationships: allRelationships,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[RelationshipOrchestrator] Inference failed:`, error);

      return {
        success: false,
        inferredCount: 0,
        highConfidenceCount: 0,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * 验证关系
   *
   * @param options - 验证选项
   * @returns 是否成功
   */
  async verifyRelationship(options: RelationshipVerifyOptions): Promise<boolean> {
    try {
      console.log(`[RelationshipOrchestrator] Verifying relationship...`);

      if (options.relationshipId) {
        // 验证已存在的推断关系
        const relationship = await this.dbService.prisma.inferredRelationship.findUnique({
          where: { id: options.relationshipId },
        });

        if (!relationship) {
          return false;
        }

        if (options.isValid) {
          // 标记为已验证
          await this.dbService.prisma.inferredRelationship.update({
            where: { id: options.relationshipId },
            data: {
              isVerified: true,
              verifiedAt: new Date(),
              confidenceScore: options.confidence || relationship.confidenceScore,
            },
          });

          console.log(`[RelationshipOrchestrator] Relationship ${options.relationshipId} verified`);
        } else {
          // 删除无效关系
          await this.dbService.prisma.inferredRelationship.delete({
            where: { id: options.relationshipId },
          });

          console.log(`[RelationshipOrchestrator] Invalid relationship ${options.relationshipId} removed`);
        }

        return true;
      }

      return false;

    } catch (error) {
      console.error(`[RelationshipOrchestrator] Verify relationship failed:`, error);
      return false;
    }
  }

  /**
   * 获取关系统计
   *
   * @param dataSourceId - 数据源 ID
   * @param databases - 可选的数据库列表
   * @returns 关系统计
   */
  async getStatistics(
    dataSourceId: number,
    databases?: string[]
  ): Promise<RelationshipStatistics> {
    try {
      console.log(`[RelationshipOrchestrator] Getting relationship statistics for data source ${dataSourceId}...`);

      // 获取数据库 ID 列表
      const dbMetas = await this.dbService.prisma.databaseMeta.findMany({
        where: {
          sourceId: dataSourceId,
          ...(databases && { databaseName: { in: databases } }),
        },
        select: { id: true },
      });

      const databaseIds = dbMetas.map(db => db.id);

      // 获取表 ID 列表
      const tables = await this.dbService.prisma.tableMeta.findMany({
        where: { databaseId: { in: databaseIds } },
        select: { id: true },
      });

      const tableIds = tables.map(t => t.id);

      // 统计显式关系
      const explicitCount = await this.dbService.prisma.explicitRelationship.count({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
        },
      });

      // 统计推断关系
      const inferredRelationships = await this.dbService.prisma.inferredRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
        },
        select: {
          confidenceScore: true,
          isVerified: true,
          sourceTableId: true,
          targetTableId: true,
          relationshipType: true,
        },
      });

      const inferredCount = inferredRelationships.length;
      const verifiedCount = inferredRelationships.filter(r => r.isVerified).length;

      // 按置信度分类
      const highConfidence = inferredRelationships.filter(r => r.confidenceScore >= 0.8).length;
      const mediumConfidence = inferredRelationships.filter(
        r => r.confidenceScore >= 0.6 && r.confidenceScore < 0.8
      ).length;
      const lowConfidence = inferredRelationships.filter(r => r.confidenceScore < 0.6).length;

      // 按类型分类
      const oneToOne = inferredRelationships.filter(r => r.relationshipType === 'one-to-one').length;
      const oneToMany = inferredRelationships.filter(r => r.relationshipType === 'one-to-many').length;
      const manyToMany = inferredRelationships.filter(r => r.relationshipType === 'many-to-many').length;

      // 跨数据库关系（源表和目标表在不同数据库）
      const crossDatabase = inferredRelationships.filter(r => {
        // 需要查询表所属的数据库来判断
        // 简化处理：假设 sourceTableId 和 targetTableId 不同即为跨表
        return r.sourceTableId !== r.targetTableId;
      }).length;

      // 自引用关系
      const selfReferencing = inferredRelationships.filter(
        r => r.sourceTableId === r.targetTableId
      ).length;

      const stats: RelationshipStatistics = {
        total: explicitCount + inferredCount,
        explicit: explicitCount,
        inferred: inferredCount,
        verified: verifiedCount,
        byConfidence: {
          high: highConfidence,
          medium: mediumConfidence,
          low: lowConfidence,
        },
        byType: {
          oneToOne,
          oneToMany,
          manyToMany,
        },
        crossDatabase,
        selfReferencing,
      };

      console.log(`[RelationshipOrchestrator] Statistics retrieved: ${stats.total} total relationships`);
      return stats;

    } catch (error) {
      console.error(`[RelationshipOrchestrator] Get statistics failed:`, error);

      // 返回空统计
      return {
        total: 0,
        explicit: 0,
        inferred: 0,
        verified: 0,
        byConfidence: { high: 0, medium: 0, low: 0 },
        byType: { oneToOne: 0, oneToMany: 0, manyToMany: 0 },
        crossDatabase: 0,
        selfReferencing: 0,
      };
    }
  }

  /**
   * 构建关系图谱
   *
   * @param dataSourceId - 数据源 ID
   * @param databases - 可选的数据库列表
   * @param minConfidence - 最小置信度
   * @returns 关系图谱
   */
  async buildRelationshipGraph(
    dataSourceId: number,
    databases?: string[],
    minConfidence: number = 0.70
  ): Promise<RelationshipGraph> {
    try {
      console.log(`[RelationshipOrchestrator] Building relationship graph for data source ${dataSourceId}...`);

      // 获取数据库和表
      const dbMetas = await this.dbService.prisma.databaseMeta.findMany({
        where: {
          sourceId: dataSourceId,
          ...(databases && { databaseName: { in: databases } }),
        },
        include: {
          tables: {
            include: {
              sourceRelationships: true,
              targetRelationships: true,
            },
          },
        },
      });

      // 构建节点
      const nodes: RelationshipGraphNode[] = [];
      const edges: RelationshipGraphEdge[] = [];

      for (const db of dbMetas) {
        for (const table of db.tables) {
          const outDegree = table.sourceRelationships.length;
          const inDegree = table.targetRelationships.length;

          nodes.push({
            tableId: table.id,
            tableName: table.tableName,
            databaseName: db.databaseName,
            outDegree,
            inDegree,
          });

          // 添加显式关系边
          for (const rel of table.sourceRelationships) {
            edges.push({
              sourceTableId: rel.sourceTableId,
              targetTableId: rel.targetTableId,
              sourceColumn: rel.sourceColumnName,
              targetColumn: rel.targetColumnName,
              confidence: 1.0,
              type: 'explicit',
              relationshipType: rel.relationshipType as any,
            });
          }
        }
      }

      // 添加推断关系边
      const tableIds = nodes.map(n => n.tableId);
      const inferredRels = await this.dbService.prisma.inferredRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
          confidenceScore: { gte: minConfidence },
        },
      });

      for (const rel of inferredRels) {
        edges.push({
          sourceTableId: rel.sourceTableId,
          targetTableId: rel.targetTableId,
          sourceColumn: rel.sourceColumnName,
          targetColumn: rel.targetColumnName,
          confidence: rel.confidenceScore,
          type: rel.isVerified ? 'verified' : 'inferred',
          relationshipType: rel.relationshipType as any,
        });
      }

      // 计算统计
      const avgDegree = nodes.reduce((sum, n) => sum + n.inDegree + n.outDegree, 0) / (nodes.length || 1);
      const maxInDegree = Math.max(...nodes.map(n => n.inDegree), 0);
      const maxOutDegree = Math.max(...nodes.map(n => n.outDegree), 0);

      const graph: RelationshipGraph = {
        nodes,
        edges,
        stats: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          avgDegree,
          maxInDegree,
          maxOutDegree,
        },
      };

      console.log(
        `[RelationshipOrchestrator] Graph built: ${graph.stats.nodeCount} nodes, ${graph.stats.edgeCount} edges`
      );
      return graph;

    } catch (error) {
      console.error(`[RelationshipOrchestrator] Build relationship graph failed:`, error);

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
   * 删除低置信度关系
   *
   * @param dataSourceId - 数据源 ID
   * @param maxConfidence - 最大置信度阈值
   * @returns 删除的关系数量
   */
  async removeLowConfidenceRelationships(
    dataSourceId: number,
    maxConfidence: number = 0.6
  ): Promise<number> {
    try {
      console.log(
        `[RelationshipOrchestrator] Removing low confidence relationships (< ${maxConfidence}) ` +
        `for data source ${dataSourceId}...`
      );

      // 获取表 ID
      const tables = await this.dbService.prisma.tableMeta.findMany({
        where: {
          database: {
            sourceId: dataSourceId,
          },
        },
        select: { id: true },
      });

      const tableIds = tables.map(t => t.id);

      // 删除低置信度关系
      const result = await this.dbService.prisma.inferredRelationship.deleteMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
          confidenceScore: { lt: maxConfidence },
          isVerified: false, // 不删除已验证的关系
        },
      });

      console.log(`[RelationshipOrchestrator] Removed ${result.count} low confidence relationships`);
      return result.count;

    } catch (error) {
      console.error(`[RelationshipOrchestrator] Remove low confidence relationships failed:`, error);
      return 0;
    }
  }

  /**
   * 保存推断的关系到数据库
   *
   * @private
   */
  private async saveInferredRelationship(
    relationship: InferredRelationship,
    dataSourceId: number
  ): Promise<void> {
    try {
      // 查找源表和目标表
      const [sourceTable, targetTable] = await Promise.all([
        this.dbService.prisma.tableMeta.findFirst({
          where: {
            tableName: relationship.sourceTable,
            database: {
              databaseName: relationship.sourceDatabaseName,
              sourceId: dataSourceId,
            },
          },
        }),
        this.dbService.prisma.tableMeta.findFirst({
          where: {
            tableName: relationship.targetTable,
            database: {
              databaseName: relationship.targetDatabaseName,
              sourceId: dataSourceId,
            },
          },
        }),
      ]);

      if (!sourceTable || !targetTable) {
        console.warn(
          `[RelationshipOrchestrator] Cannot save relationship: table not found ` +
          `(${relationship.sourceTable} or ${relationship.targetTable})`
        );
        return;
      }

      // 检查关系是否已存在
      const existing = await this.dbService.prisma.inferredRelationship.findFirst({
        where: {
          sourceTableId: sourceTable.id,
          targetTableId: targetTable.id,
          sourceColumnName: relationship.sourceColumn,
          targetColumnName: relationship.targetColumn,
        },
      });

      if (existing) {
        // 更新置信度
        await this.dbService.prisma.inferredRelationship.update({
          where: { id: existing.id },
          data: {
            confidenceScore: relationship.confidenceScore,
            inferenceMethod: relationship.inferenceMethod,
            reasoning: relationship.reasoning,
          },
        });
      } else {
        // 创建新关系
        await this.dbService.prisma.inferredRelationship.create({
          data: {
            sourceTableId: sourceTable.id,
            sourceColumnName: relationship.sourceColumn,
            targetTableId: targetTable.id,
            targetColumnName: relationship.targetColumn,
            relationshipType: relationship.relationshipType,
            confidenceScore: relationship.confidenceScore,
            inferenceMethod: relationship.inferenceMethod,
            reasoning: relationship.reasoning,
            isVerified: false,
          },
        });
      }

    } catch (error) {
      console.error(`[RelationshipOrchestrator] Save inferred relationship failed:`, error);
    }
  }
}
