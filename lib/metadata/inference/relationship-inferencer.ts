/**
 * 关系推断器
 * 整合命名分析和规则引擎，推断表之间的隐式关系
 */

import type { ColumnInfo } from '../types';
import type { InferredRelationship, InferenceResult, RelationshipType } from './types';
import { NamingAnalyzer } from './naming-analyzer';
import { RulesEngine } from './rules-engine';
import { AIInferencer } from './ai-inferencer';

/**
 * 关系推断器配置
 */
export interface RelationshipInferencerConfig {
  /** 最小置信度阈值 */
  minConfidence?: number;

  /** 是否启用命名分析 */
  enableNamingAnalysis?: boolean;

  /** 是否启用规则引擎 */
  enableRulesEngine?: boolean;

  /** 是否启用 AI 推断 */
  enableAIInference?: boolean;

  /** AI 推断的最小置信度阈值 */
  aiMinConfidence?: number;

  /** 是否跨数据库推断 */
  crossDatabase?: boolean;

  /** 批量 AI 推断的批次大小 */
  aiBatchSize?: number;

  /** 是否启用业务域约束 */
  enableDomainConstraint?: boolean;

  /** 是否允许跨业务域推断 */
  crossDomain?: boolean;

  /** 跨业务域推断的置信度惩罚系数 (0-1，值越小惩罚越大) */
  crossDomainPenalty?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<RelationshipInferencerConfig> = {
  minConfidence: 0.70,
  enableNamingAnalysis: true,
  enableRulesEngine: true,
  enableAIInference: true,
  aiMinConfidence: 0.75,
  crossDatabase: true,
  aiBatchSize: 5,
  enableDomainConstraint: true,
  crossDomain: false,
  crossDomainPenalty: 0.7,
};

/**
 * 关系推断器
 */
export class RelationshipInferencer {
  private config: Required<RelationshipInferencerConfig>;
  private namingAnalyzer: NamingAnalyzer;
  private rulesEngine: RulesEngine;
  private aiInferencer: AIInferencer;

  constructor(config: RelationshipInferencerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.namingAnalyzer = new NamingAnalyzer();
    this.rulesEngine = new RulesEngine();
    this.aiInferencer = new AIInferencer();
  }

  /**
   * 推断单个数据库内的关系
   *
   * @param databaseName - 数据库名称
   * @param allColumns - 所有列信息
   * @param changedColumnIds - 变更的列 ID 集合（用于增量推断），如果提供则只推断这些列作为源列
   */
  async inferRelationships(
    databaseName: string,
    allColumns: ColumnInfo[],
    changedColumnIds?: Set<number>
  ): Promise<InferenceResult> {
    const startTime = Date.now();

    const isIncremental = changedColumnIds !== undefined && changedColumnIds.size > 0;

    console.log(`\n========================================`);
    console.log(`开始${isIncremental ? '增量' : '全量'}推断关系: ${databaseName}`);
    console.log(`========================================`);
    console.log(`总字段数: ${allColumns.length}`);
    if (isIncremental) {
      console.log(`变更字段数: ${changedColumnIds.size}`);
    }

    const relationships: InferredRelationship[] = [];
    const rulesUsedMap = new Map<string, number>();

    // 按表分组字段
    const columnsByTable = this.groupColumnsByTable(allColumns);
    const tableNames = Object.keys(columnsByTable);

    console.log(`表数量: ${tableNames.length}\n`);

    let checkedPairs = 0;
    let foundRelations = 0;

    // 遍历每个源表
    for (const sourceTable of tableNames) {
      const sourceColumns = columnsByTable[sourceTable];

      // 遍历源表的每个字段
      for (const sourceColumn of sourceColumns) {
        // 增量模式：只处理变更的列作为源列
        if (isIncremental && changedColumnIds && sourceColumn.id !== undefined && !changedColumnIds.has(sourceColumn.id)) {
          continue;
        }

        // 性能优化：跳过不太可能是外键的字段
        if (this.shouldSkipColumn(sourceColumn)) {
          continue;
        }

        // 使用命名分析获取可能的目标表
        if (this.config.enableNamingAnalysis) {
          const analysis = this.namingAnalyzer.analyze(sourceColumn.columnName);

          // 处理自引用关系（如 parent_id）
          if (analysis.targetTable === null && analysis.confidence > 0) {
            // 自引用：在同一表中查找目标字段
            const targetColumn = columnsByTable[sourceTable].find(
              (col) => col.columnName.toLowerCase() === analysis.targetColumn.toLowerCase()
            );

            if (targetColumn) {
              checkedPairs++;

              // 检查业务域约束
              if (!this.checkDomainConstraint(sourceColumn, targetColumn)) {
                continue;
              }

              // 使用规则引擎验证
              const evaluation = this.config.enableRulesEngine
                ? this.rulesEngine.evaluate(sourceColumn, targetColumn)
                : { isRelated: true, confidence: analysis.confidence, reasoning: [], matchedRules: [] };

              // 应用业务域置信度调整
              const adjustedConfidence = this.applyDomainConfidenceAdjustment(
                sourceColumn,
                targetColumn,
                evaluation.confidence
              );

              if (evaluation.isRelated && adjustedConfidence >= this.config.minConfidence) {
                const relationship = this.createInferredRelationship(
                  sourceColumn,
                  targetColumn,
                  adjustedConfidence,
                  analysis.pattern?.description || '自引用关系',
                  'rule'
                );

                relationships.push(relationship);
                foundRelations++;

                // 统计规则使用
                evaluation.matchedRules.forEach((ruleName) => {
                  rulesUsedMap.set(ruleName, (rulesUsedMap.get(ruleName) || 0) + 1);
                });

                console.log(
                  `✓ 发现关系: ${sourceColumn.tableName}.${sourceColumn.columnName} → ${targetColumn.tableName}.${targetColumn.columnName} (自引用, 置信度: ${adjustedConfidence.toFixed(2)})`
                );
              }
            }
          } else if (analysis.targetTable) {
            // 智能查找匹配的表
            const matchedTable = this.namingAnalyzer.findMatchingTable(
              analysis.targetTable,
              tableNames
            );

            if (matchedTable) {
              const targetColumns = columnsByTable[matchedTable];
              const targetColumn = targetColumns.find(
                (col) => col.columnName.toLowerCase() === analysis.targetColumn.toLowerCase()
              );

              if (targetColumn) {
                checkedPairs++;

                // 检查业务域约束
                if (!this.checkDomainConstraint(sourceColumn, targetColumn)) {
                  continue;
                }

                // 使用规则引擎验证
                const evaluation = this.config.enableRulesEngine
                  ? this.rulesEngine.evaluate(sourceColumn, targetColumn)
                  : { isRelated: true, confidence: analysis.confidence, reasoning: [], matchedRules: [] };

                // 应用业务域置信度调整
                const adjustedConfidence = this.applyDomainConfidenceAdjustment(
                  sourceColumn,
                  targetColumn,
                  evaluation.confidence
                );

                if (evaluation.isRelated && adjustedConfidence >= this.config.minConfidence) {
                  const relationship = this.createInferredRelationship(
                    sourceColumn,
                    targetColumn,
                    adjustedConfidence,
                    analysis.pattern?.description || '命名模式匹配',
                    'rule'
                  );

                  relationships.push(relationship);
                  foundRelations++;

                  // 统计规则使用
                  evaluation.matchedRules.forEach((ruleName) => {
                    rulesUsedMap.set(ruleName, (rulesUsedMap.get(ruleName) || 0) + 1);
                  });

                  console.log(
                    `✓ 发现关系: ${sourceColumn.tableName}.${sourceColumn.columnName} → ${targetColumn.tableName}.${targetColumn.columnName} (置信度: ${adjustedConfidence.toFixed(2)})`
                  );
                }
              }
            }
          }
        }
      }
    }

    // AI 推断阶段：对规则引擎未覆盖的字段进行 AI 推断
    if (this.config.enableAIInference) {
      console.log(`\n========================================`);
      console.log(`AI 推断阶段`);
      console.log(`========================================`);

      const aiRelationships = await this.performAIInference(
        allColumns,
        columnsByTable,
        tableNames,
        relationships,
        changedColumnIds // 传递变更列 ID
      );

      relationships.push(...aiRelationships);

      console.log(`AI 推断出关系: ${aiRelationships.length}`);
      console.log(`========================================\n`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 统计
    const stats = {
      totalColumns: allColumns.length,
      checkedPairs,
      inferredCount: relationships.length,
      highConfidenceCount: relationships.filter((r) => r.confidenceScore >= 0.8).length,
      mediumConfidenceCount: relationships.filter(
        (r) => r.confidenceScore >= 0.6 && r.confidenceScore < 0.8
      ).length,
      lowConfidenceCount: relationships.filter((r) => r.confidenceScore < 0.6).length,
      duration,
    };

    const rulesUsed = Array.from(rulesUsedMap.entries()).map(([ruleName, matchCount]) => ({
      ruleName,
      matchCount,
    }));

    console.log(`\n========================================`);
    console.log(`推断完成 - ${databaseName}`);
    console.log(`========================================`);
    console.log(`检查字段对: ${checkedPairs}`);
    console.log(`推断出关系: ${stats.inferredCount}`);
    console.log(`  - 高置信度 (≥0.8): ${stats.highConfidenceCount}`);
    console.log(`  - 中置信度 (0.6-0.8): ${stats.mediumConfidenceCount}`);
    console.log(`  - 低置信度 (<0.6): ${stats.lowConfidenceCount}`);
    console.log(`耗时: ${duration}ms`);
    console.log(`========================================\n`);

    return {
      relationships,
      stats,
      rulesUsed,
    };
  }

  /**
   * 推断跨数据库关系
   *
   * @param databases - 数据库列表
   * @param changedColumnIds - 变更的列 ID 集合（用于增量推断）
   */
  async inferCrossDatabaseRelationships(
    databases: Map<string, ColumnInfo[]>,
    changedColumnIds?: Set<number>
  ): Promise<InferenceResult> {
    if (!this.config.crossDatabase) {
      throw new Error('Cross-database inference is disabled');
    }

    const startTime = Date.now();
    const relationships: InferredRelationship[] = [];
    const rulesUsedMap = new Map<string, number>();

    console.log(`\n========================================`);
    console.log(`开始推断跨数据库关系`);
    console.log(`========================================`);

    // 收集所有表名和字段，按数据库分组
    const allColumns: ColumnInfo[] = [];
    const columnsByDatabase = new Map<string, Record<string, ColumnInfo[]>>();

    for (const [dbName, columns] of databases) {
      allColumns.push(...columns);
      const tableGroups = this.groupColumnsByTable(columns);
      columnsByDatabase.set(dbName, tableGroups);
    }

    // 增量模式：过滤出变更的列作为源列
    const sourceColumnsToCheck = changedColumnIds && changedColumnIds.size > 0
      ? allColumns.filter(col => col.id !== undefined && changedColumnIds.has(col.id))
      : allColumns;

    console.log(`数据库数: ${databases.size}`);
    console.log(`总字段数: ${allColumns.length}`);
    if (changedColumnIds && changedColumnIds.size > 0) {
      console.log(`增量模式: 只推断 ${sourceColumnsToCheck.length} 个变更字段`);
    }
    console.log();

    let checkedPairs = 0;

    // 构建变更列的快速查找集合
    const changedColumnIdsSet = changedColumnIds && changedColumnIds.size > 0
      ? changedColumnIds
      : undefined;

    // 遍历每个数据库作为源
    for (const [sourceDbName, sourceTableGroups] of columnsByDatabase) {
      const sourceTableNames = Object.keys(sourceTableGroups);

      // 遍历源数据库的每个表
      for (const sourceTable of sourceTableNames) {
        const sourceColumns = sourceTableGroups[sourceTable];

        // 遍历源表的每个字段
        for (const sourceColumn of sourceColumns) {
          // 增量模式：只处理变更的列
          if (changedColumnIdsSet && (sourceColumn.id === undefined || !changedColumnIdsSet.has(sourceColumn.id))) {
            continue;
          }

          // 性能优化：跳过不太可能是外键的字段
          if (this.shouldSkipColumn(sourceColumn)) {
            continue;
          }

          // 使用命名分析获取可能的目标表
          if (this.config.enableNamingAnalysis) {
            const analysis = this.namingAnalyzer.analyze(sourceColumn.columnName);

            if (analysis.targetTable) {
              // 在所有数据库中查找匹配的表
              for (const [targetDbName, targetTableGroups] of columnsByDatabase) {
                const targetTableNames = Object.keys(targetTableGroups);

                // 智能查找匹配的表
                const matchedTable = this.namingAnalyzer.findMatchingTable(
                  analysis.targetTable,
                  targetTableNames
                );

                if (matchedTable) {
                  const targetColumns = targetTableGroups[matchedTable];
                  const targetColumn = targetColumns.find(
                    (col) => col.columnName.toLowerCase() === analysis.targetColumn.toLowerCase()
                  );

                  if (targetColumn) {
                    checkedPairs++;

                    // 检查业务域约束
                    if (!this.checkDomainConstraint(sourceColumn, targetColumn)) {
                      continue;
                    }

                    // 使用规则引擎验证
                    const evaluation = this.config.enableRulesEngine
                      ? this.rulesEngine.evaluate(sourceColumn, targetColumn)
                      : { isRelated: true, confidence: analysis.confidence, reasoning: [], matchedRules: [] };

                    // 应用业务域置信度调整
                    const adjustedConfidence = this.applyDomainConfidenceAdjustment(
                      sourceColumn,
                      targetColumn,
                      evaluation.confidence
                    );

                    if (evaluation.isRelated && adjustedConfidence >= this.config.minConfidence) {
                      const relationship = this.createInferredRelationship(
                        sourceColumn,
                        targetColumn,
                        adjustedConfidence,
                        analysis.pattern?.description || '跨库命名模式匹配',
                        'rule'
                      );

                      relationships.push(relationship);

                      // 统计规则使用
                      evaluation.matchedRules.forEach((ruleName) => {
                        rulesUsedMap.set(ruleName, (rulesUsedMap.get(ruleName) || 0) + 1);
                      });

                      console.log(
                        `✓ 跨库关系: ${sourceDbName}.${sourceColumn.tableName}.${sourceColumn.columnName} → ${targetDbName}.${targetColumn.tableName}.${targetColumn.columnName} (置信度: ${adjustedConfidence.toFixed(2)})`
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // AI 推断阶段：对规则引擎未覆盖的字段进行 AI 推断
    if (this.config.enableAIInference) {
      console.log(`\n========================================`);
      console.log(`AI 跨库推断阶段`);
      console.log(`========================================`);

      // 构建所有表的字段映射
      const allTableColumns: Record<string, ColumnInfo[]> = {};
      const allTableNames: string[] = [];

      for (const [dbName, tableGroups] of columnsByDatabase) {
        for (const [tableName, columns] of Object.entries(tableGroups)) {
          const fullTableName = `${dbName}.${tableName}`;
          allTableColumns[fullTableName] = columns;
          allTableNames.push(fullTableName);
        }
      }

      const aiRelationships = await this.performAIInference(
        sourceColumnsToCheck, // 使用过滤后的源列
        allTableColumns,
        allTableNames,
        relationships,
        changedColumnIds // 传递变更列 ID，用于增量过滤
      );

      relationships.push(...aiRelationships);

      console.log(`AI 推断出跨库关系: ${aiRelationships.length}`);
      console.log(`========================================\n`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 统计
    const stats = {
      totalColumns: allColumns.length,
      checkedPairs,
      inferredCount: relationships.length,
      highConfidenceCount: relationships.filter((r) => r.confidenceScore >= 0.8).length,
      mediumConfidenceCount: relationships.filter(
        (r) => r.confidenceScore >= 0.6 && r.confidenceScore < 0.8
      ).length,
      lowConfidenceCount: relationships.filter((r) => r.confidenceScore < 0.6).length,
      duration,
    };

    const rulesUsed = Array.from(rulesUsedMap.entries()).map(([ruleName, matchCount]) => ({
      ruleName,
      matchCount,
    }));

    console.log(`\n========================================`);
    console.log(`跨库推断完成`);
    console.log(`========================================`);
    console.log(`检查字段对: ${checkedPairs}`);
    console.log(`推断出关系: ${stats.inferredCount}`);
    console.log(`  - 高置信度 (≥0.8): ${stats.highConfidenceCount}`);
    console.log(`  - 中置信度 (0.6-0.8): ${stats.mediumConfidenceCount}`);
    console.log(`  - 低置信度 (<0.6): ${stats.lowConfidenceCount}`);
    console.log(`耗时: ${duration}ms`);
    console.log(`========================================\n`);

    return {
      relationships,
      stats,
      rulesUsed,
    };
  }

  /**
   * 创建推断关系对象
   */
  private createInferredRelationship(
    sourceColumn: ColumnInfo,
    targetColumn: ColumnInfo,
    confidence: number,
    reasoning: string,
    method: 'rule' | 'ai' | 'hybrid'
  ): InferredRelationship {
    return {
      sourceTable: sourceColumn.tableName,
      sourceColumn: sourceColumn.columnName,
      sourceDatabaseName: sourceColumn.databaseName,
      targetTable: targetColumn.tableName,
      targetColumn: targetColumn.columnName,
      targetDatabaseName: targetColumn.databaseName,
      confidenceScore: confidence,
      relationshipType: this.inferRelationshipType(sourceColumn, targetColumn),
      inferenceMethod: method,
      reasoning,
    };
  }

  /**
   * 推断关系类型（一对一、一对多、多对多）
   */
  private inferRelationshipType(
    sourceColumn: ColumnInfo,
    targetColumn: ColumnInfo
  ): RelationshipType {
    // 如果源字段是唯一索引，可能是一对一
    if (sourceColumn.columnKey === 'UNI') {
      return 'one-to-one';
    }

    // 默认为一对多
    return 'one-to-many';
  }

  /**
   * 按表分组字段
   */
  private groupColumnsByTable(columns: ColumnInfo[]): Record<string, ColumnInfo[]> {
    const grouped: Record<string, ColumnInfo[]> = {};

    for (const column of columns) {
      if (!grouped[column.tableName]) {
        grouped[column.tableName] = [];
      }
      grouped[column.tableName].push(column);
    }

    return grouped;
  }

  /**
   * 判断是否应该跳过该字段
   * 性能优化：跳过不太可能是外键的字段
   */
  private shouldSkipColumn(column: ColumnInfo): boolean {
    // 跳过主键（除非是自引用）
    if (column.columnKey === 'PRI' && !column.columnName.toLowerCase().includes('parent')) {
      return true;
    }

    // 跳过明显不是外键的字段
    const nonForeignKeyPatterns = [
      /^(name|title|description|content|email|phone|address|password|hash|salt|token)$/i,
      /^(created_at|updated_at|deleted_at)$/i,
      /^is_/i,
      /^has_/i,
    ];

    return nonForeignKeyPatterns.some((pattern) => pattern.test(column.columnName));
  }

  /**
   * 检查两个字段是否满足业务域约束
   *
   * @param sourceColumn - 源字段
   * @param targetColumn - 目标字段
   * @returns 如果满足约束返回 true，否则返回 false
   */
  private checkDomainConstraint(sourceColumn: ColumnInfo, targetColumn: ColumnInfo): boolean {
    // 如果未启用业务域约束，直接返回 true
    if (!this.config.enableDomainConstraint) {
      return true;
    }

    // 如果字段没有业务域信息，允许推断（假设未分配业务域的数据库可以与任何域关联）
    if (sourceColumn.domainId === undefined || targetColumn.domainId === undefined) {
      return true;
    }

    // 如果两个字段都没有分配业务域（domainId 为 null），允许推断
    if (sourceColumn.domainId === null && targetColumn.domainId === null) {
      return true;
    }

    // 检查是否在同一业务域
    const isSameDomain = sourceColumn.domainId === targetColumn.domainId;

    // 如果在同一业务域，允许推断
    if (isSameDomain) {
      return true;
    }

    // 如果不在同一业务域，根据 crossDomain 配置决定
    return this.config.crossDomain;
  }

  /**
   * 应用业务域约束的置信度调整
   *
   * @param sourceColumn - 源字段
   * @param targetColumn - 目标字段
   * @param originalConfidence - 原始置信度
   * @returns 调整后的置信度
   */
  private applyDomainConfidenceAdjustment(
    sourceColumn: ColumnInfo,
    targetColumn: ColumnInfo,
    originalConfidence: number
  ): number {
    // 如果未启用业务域约束，返回原始置信度
    if (!this.config.enableDomainConstraint) {
      return originalConfidence;
    }

    // 如果字段没有业务域信息，返回原始置信度
    if (sourceColumn.domainId === undefined || targetColumn.domainId === undefined) {
      return originalConfidence;
    }

    // 如果两个字段都没有分配业务域，返回原始置信度
    if (sourceColumn.domainId === null && targetColumn.domainId === null) {
      return originalConfidence;
    }

    // 检查是否在同一业务域
    const isSameDomain = sourceColumn.domainId === targetColumn.domainId;

    // 如果在同一业务域，返回原始置信度
    if (isSameDomain) {
      return originalConfidence;
    }

    // 跨业务域：应用惩罚系数
    if (this.config.crossDomain) {
      const adjustedConfidence = originalConfidence * this.config.crossDomainPenalty;
      console.log(
        `  跨域惩罚: ${sourceColumn.domainName || sourceColumn.domainId} -> ${targetColumn.domainName || targetColumn.domainId}, 置信度 ${originalConfidence.toFixed(2)} -> ${adjustedConfidence.toFixed(2)}`
      );
      return adjustedConfidence;
    }

    // 不允许跨域且不在同一域，返回 0（这种情况不应该发生，因为 checkDomainConstraint 已经过滤了）
    return 0;
  }

  /**
   * 使用 AI 进行关系推断
   * 对规则引擎未覆盖或低置信度的字段对进行 AI 推断
   *
   * @param allColumns - 所有列信息
   * @param columnsByTable - 按表分组的列信息
   * @param tableNames - 表名列表
   * @param existingRelationships - 已存在的关系
   * @param changedColumnIds - 变更的列 ID 集合（用于增量推断）
   */
  private async performAIInference(
    allColumns: ColumnInfo[],
    columnsByTable: Record<string, ColumnInfo[]>,
    tableNames: string[],
    existingRelationships: InferredRelationship[],
    changedColumnIds?: Set<number>
  ): Promise<InferredRelationship[]> {
    const aiRelationships: InferredRelationship[] = [];

    // 收集潜在的外键候选字段（规则引擎未处理的）
    const candidatePairs: Array<{ source: ColumnInfo; target: ColumnInfo }> = [];

    // 构建已推断关系的查找表
    const existingRelationshipSet = new Set(
      existingRelationships.map(
        (r) => `${r.sourceTable}.${r.sourceColumn}->${r.targetTable}.${r.targetColumn}`
      )
    );

    // 遍历所有表，查找可能的外键候选
    for (const sourceTable of tableNames) {
      const sourceColumns = columnsByTable[sourceTable];

      for (const sourceColumn of sourceColumns) {
        // 增量模式：只处理变更的列作为源列
        if (changedColumnIds && changedColumnIds.size > 0) {
          // 如果列没有 ID 或者 ID 不在变更集合中，则跳过
          if (sourceColumn.id === undefined || !changedColumnIds.has(sourceColumn.id)) {
            continue;
          }
        }

        // 使用 AI 推断器判断是否为外键候选
        if (!this.aiInferencer.isForeignKeyCandidate(sourceColumn)) {
          continue;
        }

        // 遍历所有可能的目标表
        for (const targetTable of tableNames) {
          // 跳过同一张表（自引用由规则引擎处理）
          if (targetTable === sourceTable) {
            continue;
          }

          const targetColumns = columnsByTable[targetTable];

          // 查找主键或唯一键作为目标
          for (const targetColumn of targetColumns) {
            if (!this.aiInferencer.isPrimaryKeyCandidate(targetColumn)) {
              continue;
            }

            // 检查是否已被规则引擎处理
            const relationshipKey = `${sourceColumn.tableName}.${sourceColumn.columnName}->${targetColumn.tableName}.${targetColumn.columnName}`;
            if (existingRelationshipSet.has(relationshipKey)) {
              continue;
            }

            // 添加到候选列表
            candidatePairs.push({
              source: sourceColumn,
              target: targetColumn,
            });
          }
        }
      }
    }

    console.log(`AI 候选字段对: ${candidatePairs.length}`);

    if (candidatePairs.length === 0) {
      return aiRelationships;
    }

    // 批量处理
    const batchSize = this.config.aiBatchSize;
    for (let i = 0; i < candidatePairs.length; i += batchSize) {
      const batch = candidatePairs.slice(i, i + batchSize);
      console.log(`处理 AI 推断批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(candidatePairs.length / batchSize)} (${batch.length} 个字段对)...`);

      try {
        const results = await this.aiInferencer.inferRelationshipsBatch(batch);

        // 过滤有效结果
        for (const result of results) {
          if (
            result &&
            result.confidenceScore >= this.config.aiMinConfidence
          ) {
            aiRelationships.push(result);
            console.log(
              `✓ AI 推断: ${result.sourceTable}.${result.sourceColumn} → ${result.targetTable}.${result.targetColumn} (置信度: ${result.confidenceScore.toFixed(2)})`
            );
          }
        }
      } catch (error) {
        console.error(`AI 推断批次失败:`, error);
        // 继续处理下一批
      }

      // 批次间延迟
      if (i + batchSize < candidatePairs.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return aiRelationships;
  }

  /**
   * 获取配置
   */
  getConfig(): Required<RelationshipInferencerConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RelationshipInferencerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
