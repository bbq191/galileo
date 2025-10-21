/**
 * 关系推断类型定义
 */

import type { ColumnInfo } from '../types';

/**
 * 关系类型
 */
export type RelationshipType = 'one-to-one' | 'one-to-many' | 'many-to-many';

/**
 * 推断方法
 */
export type InferenceMethod = 'rule' | 'ai' | 'hybrid';

/**
 * 推断的关系信息
 */
export interface InferredRelationship {
  /** 源表名 */
  sourceTable: string;

  /** 源字段名 */
  sourceColumn: string;

  /** 源数据库名 */
  sourceDatabaseName: string;

  /** 目标表名 */
  targetTable: string;

  /** 目标字段名 */
  targetColumn: string;

  /** 目标数据库名 */
  targetDatabaseName: string;

  /** 置信度分数 (0.00-1.00) */
  confidenceScore: number;

  /** 关系类型 */
  relationshipType: RelationshipType;

  /** 推断方法 */
  inferenceMethod: InferenceMethod;

  /** 推断理由 */
  reasoning: string;

  /** 匹配的规则名称 */
  ruleName?: string;
}

/**
 * 推断规则
 */
export interface InferenceRule {
  /** 规则名称 */
  name: string;

  /** 规则权重 (0-1) */
  weight: number;

  /** 规则描述 */
  description: string;

  /** 最小置信度 */
  minConfidence: number;

  /** 评估函数 */
  evaluate: (
    sourceColumn: ColumnInfo,
    targetColumn: ColumnInfo
  ) => {
    match: boolean;
    confidence: number;
    reasoning: string;
  };
}

/**
 * 命名模式
 */
export interface NamingPattern {
  /** 模式正则表达式 */
  pattern: RegExp;

  /** 目标表名提取函数 */
  extractTableName?: (columnName: string) => string | null;

  /** 目标字段名（通常是 id） */
  targetColumnName: string;

  /** 置信度 */
  confidence: number;

  /** 描述 */
  description: string;
}

/**
 * 关系推断结果
 */
export interface InferenceResult {
  /** 推断出的关系列表 */
  relationships: InferredRelationship[];

  /** 统计信息 */
  stats: {
    /** 总字段数 */
    totalColumns: number;

    /** 检查的字段对数 */
    checkedPairs: number;

    /** 推断出的关系数 */
    inferredCount: number;

    /** 高置信度关系数 (>= 0.8) */
    highConfidenceCount: number;

    /** 中置信度关系数 (0.6-0.8) */
    mediumConfidenceCount: number;

    /** 低置信度关系数 (< 0.6) */
    lowConfidenceCount: number;

    /** 推断耗时（毫秒） */
    duration: number;
  };

  /** 使用的规则统计 */
  rulesUsed: {
    ruleName: string;
    matchCount: number;
  }[];
}
