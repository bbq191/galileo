/**
 * RelationshipInferenceService - 关系推断服务
 *
 * 职责：
 * - 管理表关系的推断逻辑
 * - 执行基于规则和 AI 的关系推断
 * - 保存推断结果到数据库
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import { InvalidationEvent } from '@/lib/cache/cache-invalidation';
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
 * RelationshipInferenceService
 *
 * 关系推断服务，负责表关系的推断和保存
 */
@injectable()
export class RelationshipInferenceService {
  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService,

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
      console.log(`[RelationshipInferenceService] Starting relationship inference for data source ${options.dataSourceId}...`);

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
        console.log(`[RelationshipInferenceService] Inferring relationships for database ${db.databaseName}...`);

        // 准备列信息
        const columns: ColumnInfo[] = db.tables.flatMap(table =>
          table.columns.map(col => ({
            id: col.id,
            tableName: table.tableName,
            tableId: table.id,
            columnName: col.columnName,
            dataType: col.dataType,
            columnType: col.columnType,
            isNullable: col.isNullable,
            columnKey: this.deriveColumnKey(col.isPrimaryKey, col.isUnique),
            isPrimaryKey: col.isPrimaryKey,
            isUnique: col.isUnique,
            isForeignKey: false,
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
      await this.cacheInvalidation.invalidate(InvalidationEvent.METADATA_SYNCED, {
        reason: `Relationship inference completed for data source ${options.dataSourceId}`,
      });

      const duration = Date.now() - startTime;

      console.log(
        `[RelationshipInferenceService] Inference completed: ${allRelationships.length} relationships ` +
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

      console.error(`[RelationshipInferenceService] Inference failed:`, error);

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
        `[RelationshipInferenceService] Removing low confidence relationships (< ${maxConfidence}) ` +
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

      console.log(`[RelationshipInferenceService] Removed ${result.count} low confidence relationships`);
      return result.count;

    } catch (error) {
      console.error(`[RelationshipInferenceService] Remove low confidence relationships failed:`, error);
      return 0;
    }
  }

  /**
   * 保存推断的关系到数据库
   *
   * @param relationship - 推断的关系
   * @param dataSourceId - 数据源 ID
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
          include: {
            columns: true,
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
          include: {
            columns: true,
          },
        }),
      ]);

      if (!sourceTable || !targetTable) {
        console.warn(
          `[RelationshipInferenceService] Cannot save relationship: table not found ` +
          `(${relationship.sourceTable} or ${relationship.targetTable})`
        );
        return;
      }

      // 查找源列和目标列
      const sourceColumn = sourceTable.columns.find(c => c.columnName === relationship.sourceColumn);
      const targetColumn = targetTable.columns.find(c => c.columnName === relationship.targetColumn);

      if (!sourceColumn || !targetColumn) {
        console.warn(
          `[RelationshipInferenceService] Cannot save relationship: column not found ` +
          `(${relationship.sourceColumn} or ${relationship.targetColumn})`
        );
        return;
      }

      // 检查关系是否已存在
      const existing = await this.dbService.prisma.inferredRelationship.findFirst({
        where: {
          sourceTableId: sourceTable.id,
          targetTableId: targetTable.id,
          sourceColumnId: sourceColumn.id,
          targetColumnId: targetColumn.id,
        },
      });

      // 转换关系类型
      const relationshipType = this.convertRelationshipType(relationship.relationshipType);
      const inferenceMethod = this.convertInferenceMethod(relationship.inferenceMethod);

      if (existing) {
        // 更新置信度
        await this.dbService.prisma.inferredRelationship.update({
          where: { id: existing.id },
          data: {
            confidenceScore: relationship.confidenceScore,
            inferenceMethod,
            reasoning: relationship.reasoning,
          },
        });
      } else {
        // 创建新关系
        await this.dbService.prisma.inferredRelationship.create({
          data: {
            sourceTableId: sourceTable.id,
            sourceColumnId: sourceColumn.id,
            targetTableId: targetTable.id,
            targetColumnId: targetColumn.id,
            relationshipType,
            confidenceScore: relationship.confidenceScore,
            inferenceMethod,
            reasoning: relationship.reasoning,
            isVerified: false,
          },
        });
      }

    } catch (error) {
      console.error(`[RelationshipInferenceService] Save inferred relationship failed:`, error);
    }
  }

  /**
   * 推导 columnKey（兼容旧代码）
   *
   * @param isPrimaryKey - 是否为主键
   * @param isUnique - 是否唯一
   * @returns columnKey 值
   * @private
   */
  private deriveColumnKey(isPrimaryKey: boolean, isUnique: boolean): 'PRI' | 'UNI' | 'MUL' | '' {
    if (isPrimaryKey) return 'PRI';
    if (isUnique) return 'UNI';
    return '';
  }

  /**
   * 转换关系类型
   *
   * @param type - 类型字符串
   * @returns Prisma 枚举值
   * @private
   */
  private convertRelationshipType(type: string): 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY' {
    switch (type) {
      case 'one-to-one':
        return 'ONE_TO_ONE';
      case 'one-to-many':
        return 'ONE_TO_MANY';
      case 'many-to-many':
        return 'MANY_TO_MANY';
      default:
        return 'ONE_TO_MANY'; // 默认值
    }
  }

  /**
   * 转换推断方法
   *
   * @param method - 方法字符串
   * @returns Prisma 枚举值
   * @private
   */
  private convertInferenceMethod(method: string): 'rule' | 'ai' | 'hybrid' {
    switch (method) {
      case 'rule':
        return 'rule';
      case 'ai':
        return 'ai';
      case 'hybrid':
        return 'hybrid';
      default:
        return 'rule'; // 默认值
    }
  }
}
