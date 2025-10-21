/**
 * 关系推断器
 * 整合命名分析和规则引擎，推断表之间的隐式关系
 */

import type { ColumnInfo } from '../types';
import type { InferredRelationship, InferenceResult, RelationshipType } from './types';
import { NamingAnalyzer } from './naming-analyzer';
import { RulesEngine } from './rules-engine';

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

  /** 是否跨数据库推断 */
  crossDatabase?: boolean;

  /** 最大检查字段对数（性能优化） */
  maxPairsToCheck?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<RelationshipInferencerConfig> = {
  minConfidence: 0.70,
  enableNamingAnalysis: true,
  enableRulesEngine: true,
  crossDatabase: true,
  maxPairsToCheck: 10000,
};

/**
 * 关系推断器
 */
export class RelationshipInferencer {
  private config: Required<RelationshipInferencerConfig>;
  private namingAnalyzer: NamingAnalyzer;
  private rulesEngine: RulesEngine;

  constructor(config: RelationshipInferencerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.namingAnalyzer = new NamingAnalyzer();
    this.rulesEngine = new RulesEngine();
  }

  /**
   * 推断单个数据库内的关系
   */
  async inferRelationships(
    databaseName: string,
    allColumns: ColumnInfo[]
  ): Promise<InferenceResult> {
    const startTime = Date.now();

    console.log(`\n========================================`);
    console.log(`开始推断关系: ${databaseName}`);
    console.log(`========================================`);
    console.log(`总字段数: ${allColumns.length}`);

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

              // 使用规则引擎验证
              const evaluation = this.config.enableRulesEngine
                ? this.rulesEngine.evaluate(sourceColumn, targetColumn)
                : { isRelated: true, confidence: analysis.confidence, reasoning: [], matchedRules: [] };

              if (evaluation.isRelated && evaluation.confidence >= this.config.minConfidence) {
                const relationship = this.createInferredRelationship(
                  sourceColumn,
                  targetColumn,
                  evaluation.confidence,
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
                  `✓ 发现关系: ${sourceColumn.tableName}.${sourceColumn.columnName} → ${targetColumn.tableName}.${targetColumn.columnName} (自引用, 置信度: ${evaluation.confidence})`
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

                // 使用规则引擎验证
                const evaluation = this.config.enableRulesEngine
                  ? this.rulesEngine.evaluate(sourceColumn, targetColumn)
                  : { isRelated: true, confidence: analysis.confidence, reasoning: [], matchedRules: [] };

                if (evaluation.isRelated && evaluation.confidence >= this.config.minConfidence) {
                  const relationship = this.createInferredRelationship(
                    sourceColumn,
                    targetColumn,
                    evaluation.confidence,
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
                    `✓ 发现关系: ${sourceColumn.tableName}.${sourceColumn.columnName} → ${targetColumn.tableName}.${targetColumn.columnName} (置信度: ${evaluation.confidence})`
                  );
                }
              }
            }
          }
        }

        // 限制检查数量
        if (checkedPairs >= this.config.maxPairsToCheck) {
          console.log(`\n⚠️  达到最大检查数量限制: ${this.config.maxPairsToCheck}`);
          break;
        }
      }

      if (checkedPairs >= this.config.maxPairsToCheck) {
        break;
      }
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
   */
  async inferCrossDatabaseRelationships(
    databases: Map<string, ColumnInfo[]>
  ): Promise<InferenceResult> {
    if (!this.config.crossDatabase) {
      throw new Error('Cross-database inference is disabled');
    }

    const startTime = Date.now();
    const relationships: InferredRelationship[] = [];

    console.log(`\n========================================`);
    console.log(`开始推断跨数据库关系`);
    console.log(`========================================`);

    // 收集所有表名和字段
    const allTableNames: string[] = [];
    const allColumns: ColumnInfo[] = [];

    for (const [dbName, columns] of databases) {
      allColumns.push(...columns);
      const tables = this.groupColumnsByTable(columns);
      allTableNames.push(...Object.keys(tables));
    }

    console.log(`数据库数: ${databases.size}`);
    console.log(`总表数: ${allTableNames.length}`);
    console.log(`总字段数: ${allColumns.length}\n`);

    // 使用相同的推断逻辑，但允许跨数据库匹配
    // TODO: 实现跨数据库推断逻辑

    const endTime = Date.now();
    const duration = endTime - startTime;

    return {
      relationships,
      stats: {
        totalColumns: allColumns.length,
        checkedPairs: 0,
        inferredCount: relationships.length,
        highConfidenceCount: 0,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
        duration,
      },
      rulesUsed: [],
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
