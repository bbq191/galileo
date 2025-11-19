/**
 * 分表感知的关系推断器
 * 在关系推断时考虑分表组，优化推断性能
 */

import type { ColumnInfo } from '../types';
import type { InferenceResult } from './types';
import { RelationshipInferencer, type RelationshipInferencerConfig } from './relationship-inferencer';

/**
 * 分表组信息（简化版）
 */
export interface ShardGroupMeta {
  groupId: number;
  groupName: string;
  tableIds: number[];
  representativeTableId: number; // 代表表ID，用于推断
}

/**
 * 分表感知的关系推断器配置
 */
export interface ShardAwareInferencerConfig extends RelationshipInferencerConfig {
  /** 是否启用分表优化 */
  enableShardOptimization?: boolean;
}

/**
 * 增强的推断结果（包含分表信息）
 */
export interface ShardAwareInferenceResult extends InferenceResult {
  shardGroupsProcessed?: number;
  tablesSkippedDueToSharding?: number;
  relationshipsReplicatedToShards?: number;
}

/**
 * 分表感知的关系推断器
 * 包装基础推断器，添加分表优化逻辑
 */
export class ShardAwareRelationshipInferencer {
  private baseInferencer: RelationshipInferencer;
  private enableShardOptimization: boolean;

  constructor(config: ShardAwareInferencerConfig = {}) {
    const { enableShardOptimization = true, ...baseConfig } = config;
    this.baseInferencer = new RelationshipInferencer(baseConfig);
    this.enableShardOptimization = enableShardOptimization;
  }

  /**
   * 推断单个数据库内的关系（支持分表优化）
   *
   * @param databaseName - 数据库名称
   * @param allColumns - 所有列信息
   * @param shardGroups - 分表组信息（可选）
   * @param changedColumnIds - 变更的列 ID 集合（用于增量推断）
   */
  async inferRelationships(
    databaseName: string,
    allColumns: ColumnInfo[],
    shardGroups?: ShardGroupMeta[],
    changedColumnIds?: Set<number>
  ): Promise<ShardAwareInferenceResult> {
    if (!this.enableShardOptimization || !shardGroups || shardGroups.length === 0) {
      // 不使用分表优化，直接调用基础推断器
      return await this.baseInferencer.inferRelationships(
        databaseName,
        allColumns,
        changedColumnIds
      );
    }

    console.log(`\n========================================`);
    console.log(`分表优化推断 - ${databaseName}`);
    console.log(`========================================`);
    console.log(`分表组数量: ${shardGroups.length}`);

    // 1. 识别分表组中的表和非分表表
    const shardedTableIds = new Set<number>();
    const representativeTableIds = new Set<number>();

    for (const group of shardGroups) {
      group.tableIds.forEach(id => shardedTableIds.add(id));
      representativeTableIds.add(group.representativeTableId);
    }

    console.log(`分表总数: ${shardedTableIds.size}`);
    console.log(`代表表数量: ${representativeTableIds.size}`);

    // 2. 过滤列：只保留代表表的列和非分表表的列
    const filteredColumns = allColumns.filter(col => {
      // 如果列没有tableId（某些情况下），保留它
      if (col.tableId === undefined) {
        return true;
      }

      // 如果是分表，只保留代表表
      if (shardedTableIds.has(col.tableId)) {
        return representativeTableIds.has(col.tableId);
      }

      // 非分表表，保留
      return true;
    });

    const skippedTables = shardedTableIds.size - representativeTableIds.size;
    console.log(`优化后列数: ${filteredColumns.length} (原始: ${allColumns.length})`);
    console.log(`跳过的分表: ${skippedTables}`);
    console.log(`========================================\n`);

    // 3. 对过滤后的列进行推断
    const baseResult = await this.baseInferencer.inferRelationships(
      databaseName,
      filteredColumns,
      changedColumnIds
    );

    // 4. 复制关系到分表组的其他表
    const replicatedRelationships = await this.replicateRelationshipsToShards(
      baseResult.relationships,
      shardGroups,
      allColumns
    );

    console.log(`\n========================================`);
    console.log(`分表关系复制`);
    console.log(`========================================`);
    console.log(`复制的关系数: ${replicatedRelationships.length}`);
    console.log(`========================================\n`);

    // 5. 合并原始关系和复制的关系
    const allRelationships = [
      ...baseResult.relationships,
      ...replicatedRelationships,
    ];

    // 6. 更新统计信息
    const enhancedStats = {
      ...baseResult.stats,
      inferredCount: allRelationships.length,
      highConfidenceCount: allRelationships.filter((r) => r.confidenceScore >= 0.8).length,
      mediumConfidenceCount: allRelationships.filter(
        (r) => r.confidenceScore >= 0.6 && r.confidenceScore < 0.8
      ).length,
      lowConfidenceCount: allRelationships.filter((r) => r.confidenceScore < 0.6).length,
    };

    return {
      relationships: allRelationships,
      stats: enhancedStats,
      rulesUsed: baseResult.rulesUsed,
      shardGroupsProcessed: shardGroups.length,
      tablesSkippedDueToSharding: skippedTables,
      relationshipsReplicatedToShards: replicatedRelationships.length,
    };
  }

  /**
   * 推断跨数据库关系（支持分表优化）
   *
   * @param databases - 数据库列表（包含列信息）
   * @param shardGroupsByDatabase - 按数据库分组的分表组信息
   * @param changedColumnIds - 变更的列 ID 集合
   */
  async inferCrossDatabaseRelationships(
    databases: Map<string, ColumnInfo[]>,
    shardGroupsByDatabase?: Map<string, ShardGroupMeta[]>,
    changedColumnIds?: Set<number>
  ): Promise<ShardAwareInferenceResult> {
    if (!this.enableShardOptimization || !shardGroupsByDatabase) {
      // 不使用分表优化，直接调用基础推断器
      return await this.baseInferencer.inferCrossDatabaseRelationships(
        databases,
        changedColumnIds
      );
    }

    console.log(`\n========================================`);
    console.log(`跨库分表优化推断`);
    console.log(`========================================`);

    // 1. 为每个数据库过滤列
    const filteredDatabases = new Map<string, ColumnInfo[]>();
    let totalSkippedTables = 0;
    let totalShardGroups = 0;

    for (const [dbName, columns] of databases) {
      const shardGroups = shardGroupsByDatabase.get(dbName) || [];
      totalShardGroups += shardGroups.length;

      if (shardGroups.length === 0) {
        // 没有分表组，直接使用原始列
        filteredDatabases.set(dbName, columns);
        continue;
      }

      // 识别分表组中的表
      const shardedTableIds = new Set<number>();
      const representativeTableIds = new Set<number>();

      for (const group of shardGroups) {
        group.tableIds.forEach(id => shardedTableIds.add(id));
        representativeTableIds.add(group.representativeTableId);
      }

      // 过滤列
      const filteredColumns = columns.filter(col => {
        if (col.tableId === undefined) {
          return true;
        }

        if (shardedTableIds.has(col.tableId)) {
          return representativeTableIds.has(col.tableId);
        }

        return true;
      });

      filteredDatabases.set(dbName, filteredColumns);
      totalSkippedTables += shardedTableIds.size - representativeTableIds.size;

      console.log(`${dbName}: ${filteredColumns.length}/${columns.length} 列 (${shardGroups.length} 个分表组)`);
    }

    console.log(`总分表组: ${totalShardGroups}`);
    console.log(`跳过的分表: ${totalSkippedTables}`);
    console.log(`========================================\n`);

    // 2. 对过滤后的列进行跨库推断
    const baseResult = await this.baseInferencer.inferCrossDatabaseRelationships(
      filteredDatabases,
      changedColumnIds
    );

    // 3. 复制关系到所有数据库的分表
    const allColumns = Array.from(databases.values()).flat();
    const allShardGroups = Array.from(shardGroupsByDatabase.values()).flat();

    const replicatedRelationships = await this.replicateRelationshipsToShards(
      baseResult.relationships,
      allShardGroups,
      allColumns
    );

    console.log(`\n复制到分表的关系数: ${replicatedRelationships.length}\n`);

    // 4. 合并关系
    const allRelationships = [
      ...baseResult.relationships,
      ...replicatedRelationships,
    ];

    // 5. 更新统计信息
    const enhancedStats = {
      ...baseResult.stats,
      inferredCount: allRelationships.length,
      highConfidenceCount: allRelationships.filter((r) => r.confidenceScore >= 0.8).length,
      mediumConfidenceCount: allRelationships.filter(
        (r) => r.confidenceScore >= 0.6 && r.confidenceScore < 0.8
      ).length,
      lowConfidenceCount: allRelationships.filter((r) => r.confidenceScore < 0.6).length,
    };

    return {
      relationships: allRelationships,
      stats: enhancedStats,
      rulesUsed: baseResult.rulesUsed,
      shardGroupsProcessed: totalShardGroups,
      tablesSkippedDueToSharding: totalSkippedTables,
      relationshipsReplicatedToShards: replicatedRelationships.length,
    };
  }

  /**
   * 复制关系到分表组的其他表
   *
   * @param relationships - 原始推断的关系
   * @param shardGroups - 分表组信息
   * @param allColumns - 所有列信息
   */
  private async replicateRelationshipsToShards(
    relationships: any[],
    shardGroups: ShardGroupMeta[],
    allColumns: ColumnInfo[]
  ): Promise<any[]> {
    const replicatedRelationships: any[] = [];

    // 构建表ID到表名的映射
    const tableIdToName = new Map<number, string>();
    for (const col of allColumns) {
      if (col.tableId !== undefined && col.tableName) {
        tableIdToName.set(col.tableId, col.tableName);
      }
    }

    // 构建分表组映射：代表表ID -> 组内所有表ID
    const representativeToGroup = new Map<number, number[]>();
    for (const group of shardGroups) {
      representativeToGroup.set(group.representativeTableId, group.tableIds);
    }

    // 遍历每个关系
    for (const relationship of relationships) {
      const { sourceTable, targetTable } = relationship;

      // 查找源表和目标表对应的tableId
      const sourceTableId = Array.from(tableIdToName.entries()).find(
        ([, name]) => name === sourceTable
      )?.[0];

      const targetTableId = Array.from(tableIdToName.entries()).find(
        ([, name]) => name === targetTable
      )?.[0];

      if (!sourceTableId || !targetTableId) {
        continue;
      }

      // 检查源表是否是代表表
      const sourceShardGroup = representativeToGroup.get(sourceTableId);
      // 检查目标表是否是代表表
      const targetShardGroup = representativeToGroup.get(targetTableId);

      if (!sourceShardGroup && !targetShardGroup) {
        // 源表和目标表都不是代表表，无需复制
        continue;
      }

      // 获取所有需要复制的源表和目标表组合
      const sourceTables = sourceShardGroup
        ? sourceShardGroup.map(id => tableIdToName.get(id)!).filter(Boolean)
        : [sourceTable];

      const targetTables = targetShardGroup
        ? targetShardGroup.map(id => tableIdToName.get(id)!).filter(Boolean)
        : [targetTable];

      // 生成所有组合（排除原始关系）
      for (const srcTable of sourceTables) {
        for (const tgtTable of targetTables) {
          // 跳过原始关系
          if (srcTable === sourceTable && tgtTable === targetTable) {
            continue;
          }

          // 创建复制的关系
          replicatedRelationships.push({
            ...relationship,
            sourceTable: srcTable,
            targetTable: tgtTable,
            reasoning: `${relationship.reasoning} (从 ${sourceTable}->${targetTable} 复制)`,
          });
        }
      }
    }

    return replicatedRelationships;
  }

  /**
   * 获取配置
   */
  getConfig(): Required<ShardAwareInferencerConfig> {
    return {
      ...this.baseInferencer.getConfig(),
      enableShardOptimization: this.enableShardOptimization,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ShardAwareInferencerConfig>): void {
    const { enableShardOptimization, ...baseConfig } = config;

    if (enableShardOptimization !== undefined) {
      this.enableShardOptimization = enableShardOptimization;
    }

    if (Object.keys(baseConfig).length > 0) {
      this.baseInferencer.updateConfig(baseConfig);
    }
  }
}
