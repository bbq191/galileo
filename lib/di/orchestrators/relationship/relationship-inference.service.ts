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
import {
  ShardAwareRelationshipInferencer,
  type ShardAwareInferencerConfig,
  type ShardGroupMeta,
} from '@/lib/metadata/inference/shard-aware-relationship-inferencer';
import { ShardGroupService } from '@/lib/metadata/shard/shard-group.service';
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

  /**
   * 增量推断模式
   * - true: 只推断自 sinceTimestamp 以来变更的表/列
   * - false: 全量推断（默认）
   */
  incrementalMode?: boolean;

  /**
   * 增量推断的起始时间
   * 只推断此时间之后变更的元数据
   * 如果未指定，则使用上次同步时间
   */
  sinceTimestamp?: Date;

  /**
   * 是否启用分表优化
   * 启用后会自动识别分表组并优化推断性能
   */
  enableShardOptimization?: boolean;

  /**
   * 是否自动识别分表组
   * 在推断前自动识别和创建分表组
   */
  autoDetectShardGroups?: boolean;
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

  /** 是否为增量推断 */
  isIncremental?: boolean;

  /** 处理的变更数量（仅增量模式） */
  changesProcessed?: number;

  /** 清理的旧关系数量（仅增量模式） */
  relationshipsCleanedUp?: number;

  /** 处理的分表组数量（仅分表优化模式） */
  shardGroupsProcessed?: number;

  /** 因分表优化跳过的表数量 */
  tablesSkippedDueToSharding?: number;

  /** 复制到分表的关系数量 */
  relationshipsReplicatedToShards?: number;
}

/**
 * RelationshipInferenceService
 *
 * 关系推断服务，负责表关系的推断和保存
 */
@injectable()
export class RelationshipInferenceService {
  private readonly shardGroupService: ShardGroupService;

  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService,

    @inject(DI_TOKENS.CacheInvalidationService)
    private readonly cacheInvalidation: CacheInvalidationService
  ) {
    this.shardGroupService = new ShardGroupService(this.dbService.prisma);
  }

  /**
   * 获取上次同步时间
   *
   * @param dataSourceId - 数据源 ID
   * @returns 上次同步时间，如果不存在则返回 null
   * @private
   */
  private async getLastSyncTime(dataSourceId: number): Promise<Date | null> {
    const database = await this.dbService.prisma.databaseMeta.findFirst({
      where: {
        sourceId: dataSourceId,
        lastSyncedAt: { not: null },
      },
      orderBy: {
        lastSyncedAt: 'desc',
      },
      select: {
        lastSyncedAt: true,
      },
    });

    return database?.lastSyncedAt ?? null;
  }

  /**
   * 获取元数据变更信息（用于增量推断）
   *
   * @param dataSourceId - 数据源 ID
   * @param sinceTimestamp - 起始时间
   * @returns 变更的表 ID 和列 ID 集合
   * @private
   */
  private async getMetadataChanges(
    dataSourceId: number,
    sinceTimestamp: Date
  ): Promise<{
    changedTableIds: Set<number>;
    changedColumnIds: Set<number>;
    deletedTableIds: Set<number>;
    deletedColumnIds: Set<number>;
  }> {
    // 1. 获取该数据源的所有表和列 ID（用于过滤变更）
    const databases = await this.dbService.prisma.databaseMeta.findMany({
      where: { sourceId: dataSourceId },
      include: {
        tables: {
          include: {
            columns: {
              select: { id: true },
            },
          },
        },
      },
    });

    const dataSourceTableIds = new Set<number>();
    const dataSourceColumnIds = new Set<number>();

    for (const db of databases) {
      for (const table of db.tables) {
        dataSourceTableIds.add(table.id);
        for (const column of table.columns) {
          dataSourceColumnIds.add(column.id);
        }
      }
    }

    console.log(`[RelationshipInferenceService] Data source has ${dataSourceTableIds.size} tables, ${dataSourceColumnIds.size} columns`);

    // 2. 查询变更记录
    const changes = await this.dbService.prisma.metadataChange.findMany({
      where: {
        changedAt: {
          gte: sinceTimestamp,
        },
      },
      orderBy: {
        changedAt: 'asc',
      },
    });

    console.log(`[RelationshipInferenceService] Found ${changes.length} total metadata changes since ${sinceTimestamp.toISOString()}`);

    // 3. 过滤出属于该数据源的变更
    const changedTableIds = new Set<number>();
    const changedColumnIds = new Set<number>();
    const deletedTableIds = new Set<number>();
    const deletedColumnIds = new Set<number>();

    for (const change of changes) {
      if (change.entityType === 'table') {
        // 只处理属于该数据源的表（包括已删除的）
        if (dataSourceTableIds.has(change.entityId) || change.changeType === 'table_removed') {
          if (change.changeType === 'table_removed') {
            deletedTableIds.add(change.entityId);
          } else {
            changedTableIds.add(change.entityId);
          }
        }
      } else if (change.entityType === 'column') {
        // 只处理属于该数据源的列（包括已删除的）
        if (dataSourceColumnIds.has(change.entityId) || change.changeType === 'column_removed') {
          if (change.changeType === 'column_removed') {
            deletedColumnIds.add(change.entityId);
          } else {
            changedColumnIds.add(change.entityId);
          }
        }
      }
    }

    console.log(`[RelationshipInferenceService] Filtered changes for this data source: ${changedTableIds.size} tables, ${changedColumnIds.size} columns`);

    return {
      changedTableIds,
      changedColumnIds,
      deletedTableIds,
      deletedColumnIds,
    };
  }

  /**
   * 清理已删除表/列的关系
   *
   * @param deletedTableIds - 已删除的表 ID
   * @param deletedColumnIds - 已删除的列 ID
   * @returns 清理的关系数量
   * @private
   */
  private async cleanupDeletedRelationships(
    deletedTableIds: Set<number>,
    deletedColumnIds: Set<number>
  ): Promise<number> {
    let cleanedCount = 0;

    // 清理已删除表的关系
    if (deletedTableIds.size > 0) {
      const tableIdsArray = Array.from(deletedTableIds);
      const result = await this.dbService.prisma.inferredRelationship.deleteMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIdsArray } },
            { targetTableId: { in: tableIdsArray } },
          ],
        },
      });
      cleanedCount += result.count;
      console.log(`[RelationshipInferenceService] Cleaned up ${result.count} relationships for deleted tables`);
    }

    // 清理已删除列的关系
    if (deletedColumnIds.size > 0) {
      const columnIdsArray = Array.from(deletedColumnIds);
      const result = await this.dbService.prisma.inferredRelationship.deleteMany({
        where: {
          OR: [
            { sourceColumnId: { in: columnIdsArray } },
            { targetColumnId: { in: columnIdsArray } },
          ],
        },
      });
      cleanedCount += result.count;
      console.log(`[RelationshipInferenceService] Cleaned up ${result.count} relationships for deleted columns`);
    }

    return cleanedCount;
  }

  /**
   * 清理已修改列的旧关系
   *
   * @param modifiedColumnIds - 已修改的列 ID
   * @returns 清理的关系数量
   * @private
   */
  private async cleanupModifiedColumnRelationships(modifiedColumnIds: Set<number>): Promise<number> {
    if (modifiedColumnIds.size === 0) {
      return 0;
    }

    const columnIdsArray = Array.from(modifiedColumnIds);
    const result = await this.dbService.prisma.inferredRelationship.deleteMany({
      where: {
        OR: [
          { sourceColumnId: { in: columnIdsArray } },
          { targetColumnId: { in: columnIdsArray } },
        ],
        isVerified: false, // 只删除未验证的关系
      },
    });

    console.log(`[RelationshipInferenceService] Cleaned up ${result.count} relationships for modified columns`);
    return result.count;
  }

  /**
   * 推断表关系
   *
   * @param options - 推断选项
   * @returns 推断结果
   */
  async inferRelationships(options: RelationshipInferOptions): Promise<RelationshipInferResult> {
    const startTime = Date.now();

    try {
      const isIncremental = options.incrementalMode ?? false;
      console.log(`[RelationshipInferenceService] Starting ${isIncremental ? 'incremental' : 'full'} relationship inference for data source ${options.dataSourceId}...`);

      // 增量模式：处理变更
      let changesInfo: {
        changedTableIds: Set<number>;
        changedColumnIds: Set<number>;
        deletedTableIds: Set<number>;
        deletedColumnIds: Set<number>;
      } | undefined;

      let relationshipsCleanedUp = 0;

      if (isIncremental) {
        // 确定起始时间
        const sinceTimestamp = options.sinceTimestamp ?? await this.getLastSyncTime(options.dataSourceId);

        if (!sinceTimestamp) {
          console.log(`[RelationshipInferenceService] No sync timestamp found, falling back to full inference`);
          // 没有同步时间，回退到全量推断
          options.incrementalMode = false;
        } else {
          console.log(`[RelationshipInferenceService] Incremental mode: processing changes since ${sinceTimestamp.toISOString()}`);

          // 获取变更信息
          changesInfo = await this.getMetadataChanges(options.dataSourceId, sinceTimestamp);

          // 清理已删除的关系
          relationshipsCleanedUp += await this.cleanupDeletedRelationships(
            changesInfo.deletedTableIds,
            changesInfo.deletedColumnIds
          );

          // 清理已修改列的旧关系
          relationshipsCleanedUp += await this.cleanupModifiedColumnRelationships(changesInfo.changedColumnIds);

          console.log(`[RelationshipInferenceService] Total changes: ${changesInfo.changedTableIds.size} tables, ${changesInfo.changedColumnIds.size} columns`);

          // 如果没有变更，直接返回
          if (changesInfo.changedTableIds.size === 0 && changesInfo.changedColumnIds.size === 0) {
            console.log(`[RelationshipInferenceService] No changes detected, skipping inference`);
            return {
              success: true,
              inferredCount: 0,
              highConfidenceCount: 0,
              mediumConfidenceCount: 0,
              lowConfidenceCount: 0,
              duration: Date.now() - startTime,
              isIncremental: true,
              changesProcessed: 0,
              relationshipsCleanedUp,
            };
          }
        }
      }

      // 1. 获取元数据
      // 注意：如果 options.databases 是空数组，不添加 in 条件（空数组会导致 IN () 查询失败）
      const hasValidDatabases = options.databases && options.databases.length > 0;
      console.log(`[RelationshipInferenceService] Querying databases with filter: ${hasValidDatabases ? options.databases?.join(', ') : 'all'}`);

      // 增量模式：需要加载所有表（源表需要与所有目标表进行推断）
      const databases = await this.dbService.prisma.databaseMeta.findMany({
        where: {
          sourceId: options.dataSourceId,
          ...(hasValidDatabases && { databaseName: { in: options.databases } }),
        },
        include: {
          tables: {
            include: {
              columns: true,
            },
          },
        },
      });

      console.log(`[RelationshipInferenceService] Found ${databases.length} databases`);

      if (databases.length === 0) {
        const errorMsg = hasValidDatabases
          ? `No databases found matching: ${options.databases?.join(', ')}`
          : 'No databases found for the specified data source';
        console.log(`[RelationshipInferenceService] ${errorMsg}`);
        return {
          success: false,
          inferredCount: 0,
          highConfidenceCount: 0,
          mediumConfidenceCount: 0,
          lowConfidenceCount: 0,
          duration: Date.now() - startTime,
          error: errorMsg,
        };
      }

      // 2. 准备分表组信息（如果启用分表优化）
      const enableShardOptimization = options.enableShardOptimization ?? true;
      const autoDetectShardGroups = options.autoDetectShardGroups ?? false; // 默认关闭，因为同步时已自动识别

      let shardGroupsByDatabase: Map<string, ShardGroupMeta[]> | undefined;

      if (enableShardOptimization) {
        shardGroupsByDatabase = new Map();

        for (const db of databases) {
          // 自动识别分表组
          if (autoDetectShardGroups) {
            await this.shardGroupService.identifyAndCreateShardGroups(db.id, {
              minShardCount: 2,
              validateStructure: true,
            });
          }

          // 获取分表组信息
          const shardGroups = await this.shardGroupService.getShardGroups(db.id);

          if (shardGroups.length > 0) {
            const shardGroupMetas: ShardGroupMeta[] = shardGroups.map((group) => ({
              groupId: group.id,
              groupName: group.groupName,
              tableIds: group.tables.map((t) => t.id),
              representativeTableId: group.tables[0]?.id || 0, // 使用第一个表作为代表
            }));

            shardGroupsByDatabase.set(db.databaseName, shardGroupMetas);
            console.log(`[RelationshipInferenceService] Found ${shardGroupMetas.length} shard groups in ${db.databaseName}`);
          }
        }
      }

      // 3. 准备推断器配置
      const config: ShardAwareInferencerConfig = {
        minConfidence: options.minConfidence || 0.70,
        enableAIInference: options.enableAI ?? true,
        crossDatabase: options.crossDatabase ?? true,
        enableShardOptimization,
        // AI 批量推断批次大小（从环境变量读取，默认为 3 以降低超时风险）
        aiBatchSize: process.env.AI_BATCH_SIZE
          ? parseInt(process.env.AI_BATCH_SIZE, 10)
          : 3,
        // 业务域约束配置
        enableDomainConstraint: process.env.ENABLE_DOMAIN_CONSTRAINT !== 'false', // 默认启用
        crossDomain: process.env.ALLOW_CROSS_DOMAIN_INFERENCE === 'true', // 默认关闭
        crossDomainPenalty: parseFloat(process.env.CROSS_DOMAIN_PENALTY || '0.7'),
      };

      const inferencer = new ShardAwareRelationshipInferencer(config);

      // 4. 推断关系
      let allRelationships: InferredRelationship[] = [];
      let savedCount = 0;
      let totalShardGroupsProcessed = 0;
      let totalTablesSkipped = 0;
      let totalRelationshipsReplicated = 0;

      // 增量模式：准备变更列的 ID 集合用于过滤
      const changedColumnIdsSet = isIncremental && changesInfo
        ? changesInfo.changedColumnIds
        : undefined;

      // 根据配置选择推断策略
      if (options.crossDatabase && databases.length > 1) {
        // 跨库推断：使用专门的跨库推断方法
        console.log(`[RelationshipInferenceService] Using cross-database inference for ${databases.length} databases...`);

        const result = await this.performCrossDatabaseInferenceWithShards(
          databases,
          inferencer,
          shardGroupsByDatabase,
          changedColumnIdsSet
        );

        allRelationships.push(...result.relationships);
        totalShardGroupsProcessed = result.shardGroupsProcessed || 0;
        totalTablesSkipped = result.tablesSkippedDueToSharding || 0;
        totalRelationshipsReplicated = result.relationshipsReplicatedToShards || 0;
      } else {
        // 单库推断：按数据库分别推断
        console.log(`[RelationshipInferenceService] Using single-database inference for ${databases.length} database(s)...`);

        for (const db of databases) {
          console.log(`[RelationshipInferenceService] Inferring relationships for database ${db.databaseName}...`);

          // 准备列信息
          const columns: ColumnInfo[] = this.prepareColumnInfo(db);

          // 获取该数据库的分表组
          const dbShardGroups = shardGroupsByDatabase?.get(db.databaseName);

          // 执行推断
          const result = await inferencer.inferRelationships(
            db.databaseName,
            columns,
            dbShardGroups,
            changedColumnIdsSet
          );

          allRelationships.push(...result.relationships);
          totalShardGroupsProcessed += result.shardGroupsProcessed || 0;
          totalTablesSkipped += result.tablesSkippedDueToSharding || 0;
          totalRelationshipsReplicated += result.relationshipsReplicatedToShards || 0;
        }
      }

      // 4. （可选）自动保存高置信度关系
      if (options.autoSave) {
        savedCount = await this.saveHighConfidenceRelationships(
          allRelationships,
          options.dataSourceId,
          options.autoSaveThreshold || 0.80
        );
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
        isIncremental,
        changesProcessed: isIncremental && changesInfo
          ? changesInfo.changedTableIds.size + changesInfo.changedColumnIds.size
          : undefined,
        relationshipsCleanedUp: isIncremental ? relationshipsCleanedUp : undefined,
        shardGroupsProcessed: enableShardOptimization ? totalShardGroupsProcessed : undefined,
        tablesSkippedDueToSharding: enableShardOptimization ? totalTablesSkipped : undefined,
        relationshipsReplicatedToShards: enableShardOptimization ? totalRelationshipsReplicated : undefined,
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

  /**
   * 准备列信息
   *
   * @param db - 数据库元数据
   * @returns 列信息数组
   * @private
   */
  private prepareColumnInfo(db: {
    databaseName: string;
    tables: Array<{
      id: number;
      tableName: string;
      columns: Array<{
        id: number;
        columnName: string;
        dataType: string;
        columnType: string;
        isNullable: boolean;
        isPrimaryKey: boolean;
        isUnique: boolean;
        columnComment: string | null;
        semanticDescription: string | null;
      }>;
    }>;
  }): ColumnInfo[] {
    return db.tables.flatMap(table =>
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
  }

  /**
   * 执行跨库推断
   *
   * @param databases - 数据库列表
   * @param inferencer - 推断器实例
   * @param changedColumnIds - 变更的列 ID 集合
   * @returns 推断结果
   * @private
   */
  /**
   * 执行支持分表优化的跨库推断
   *
   * @param databases - 数据库列表
   * @param inferencer - 分表感知的推断器
   * @param shardGroupsByDatabase - 分表组信息
   * @param changedColumnIds - 变更的列 ID 集合
   * @private
   */
  private async performCrossDatabaseInferenceWithShards(
    databases: Array<{
      databaseName: string;
      tables: Array<{
        id: number;
        tableName: string;
        columns: Array<{
          id: number;
          columnName: string;
          dataType: string;
          columnType: string;
          isNullable: boolean;
          isPrimaryKey: boolean;
          isUnique: boolean;
          columnComment: string | null;
          semanticDescription: string | null;
        }>;
      }>;
    }>,
    inferencer: ShardAwareRelationshipInferencer,
    shardGroupsByDatabase?: Map<string, ShardGroupMeta[]>,
    changedColumnIds?: Set<number>
  ) {
    // 准备跨库推断的数据结构
    const databasesMap = new Map<string, ColumnInfo[]>();

    for (const db of databases) {
      const columns = this.prepareColumnInfo(db);
      databasesMap.set(db.databaseName, columns);
    }

    // 执行跨库推断（支持增量模式和分表优化）
    return await inferencer.inferCrossDatabaseRelationships(
      databasesMap,
      shardGroupsByDatabase,
      changedColumnIds
    );
  }

  private async performCrossDatabaseInference(
    databases: Array<{
      databaseName: string;
      tables: Array<{
        id: number;
        tableName: string;
        columns: Array<{
          id: number;
          columnName: string;
          dataType: string;
          columnType: string;
          isNullable: boolean;
          isPrimaryKey: boolean;
          isUnique: boolean;
          columnComment: string | null;
          semanticDescription: string | null;
        }>;
      }>;
    }>,
    inferencer: RelationshipInferencer,
    changedColumnIds?: Set<number>
  ): Promise<InferenceResult> {
    // 准备跨库推断的数据结构
    const databasesMap = new Map<string, ColumnInfo[]>();

    for (const db of databases) {
      const columns = this.prepareColumnInfo(db);
      databasesMap.set(db.databaseName, columns);
    }

    // 执行跨库推断（支持增量模式）
    return await inferencer.inferCrossDatabaseRelationships(databasesMap, changedColumnIds);
  }

  /**
   * 保存高置信度关系
   *
   * @param relationships - 关系列表
   * @param dataSourceId - 数据源 ID
   * @param threshold - 置信度阈值
   * @returns 保存的关系数量
   * @private
   */
  private async saveHighConfidenceRelationships(
    relationships: InferredRelationship[],
    dataSourceId: number,
    threshold: number
  ): Promise<number> {
    const highConfidenceRels = relationships.filter(
      rel => rel.confidenceScore >= threshold
    );

    let savedCount = 0;
    for (const rel of highConfidenceRels) {
      await this.saveInferredRelationship(rel, dataSourceId);
      savedCount++;
    }

    return savedCount;
  }
}
