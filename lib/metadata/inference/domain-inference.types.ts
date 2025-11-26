/**
 * 业务域推断类型定义
 */

import type { BusinessDomain } from '@prisma/client';

/**
 * 业务域推断结果
 */
export interface DomainInference {
  /** 建议的业务域 */
  suggestedDomain: BusinessDomain;

  /** 置信度 (0.0 - 1.0) */
  confidence: number;

  /** 推理依据 */
  reasoning: string;

  /** 推断策略 */
  strategies: StrategyResult[];

  /** 是否需要人工确认 */
  requiresReview: boolean;

  /** 其他候选域（按置信度排序） */
  alternativeDomains?: Array<{
    domain: BusinessDomain;
    confidence: number;
  }>;
}

/**
 * 策略推断结果
 */
export interface StrategyResult {
  /** 策略名称 */
  strategyName: 'naming_rule' | 'vector_similarity' | 'ai_reasoning';

  /** 推荐的业务域 ID */
  domainId: number;

  /** 策略得分 (0.0 - 1.0) */
  score: number;

  /** 匹配的特征 */
  features: string[];

  /** 权重 */
  weight: number;
}

/**
 * 推断选项
 */
export interface InferenceOptions {
  /** 最低置信度阈值 */
  minConfidence?: number;

  /** 是否启用 AI 推理（耗时较长） */
  enableAI?: boolean;

  /** 是否返回候选域 */
  includeAlternatives?: boolean;

  /** 最大候选域数量 */
  maxAlternatives?: number;
}

/**
 * 批量推断结果
 */
export interface BatchInferenceResult {
  /** 总数 */
  total: number;

  /** 成功推断数 */
  inferred: number;

  /** 需要人工确认数 */
  needsReview: number;

  /** 失败数 */
  failed: number;

  /** 详细结果 */
  results: Map<number, DomainInference | Error>;
}

/**
 * 数据库元数据（用于推断）
 */
export interface DatabaseMetadataForInference {
  id: number;
  databaseName: string;
  semanticDescription?: string | null;
  tables: Array<{
    tableName: string;
    semanticDescription?: string | null;
    tableComment?: string | null;
    columns?: Array<{
      columnName: string;
      columnComment?: string | null;
    }>;
  }>;
}
