/**
 * SQL 生成模块类型定义
 */

import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

/**
 * SQL 生成结果
 */
export interface SQLGenerationResult {
  /** 生成的 SQL 语句 */
  sql: string;
  /** SQL 解释说明 */
  explanation: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 使用的表列表 */
  usedTables: string[];
  /** 使用的字段列表 */
  usedColumns: string[];
  /** 预估返回行数 */
  estimatedRows?: number;
  /** 警告信息 */
  warnings?: string[];
}

/**
 * SQL 生成选项
 */
export interface SQLGenerationOptions {
  /** 是否启用详细模式（返回更详细的信息） */
  verbose?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否启用查询优化建议 */
  enableOptimization?: boolean;
  /** 是否使用缓存（默认 true） */
  useCache?: boolean;
  /** 追加到生成 Prompt 末尾的内容（如业务规则） */
  promptAppendix?: string;
  /** promptAppendix 的摘要，参与 SQL 缓存 key，规则变化时不复用旧 SQL */
  promptAppendixDigest?: string;
}

/**
 * Prompt 构建器接口
 */
export interface PromptBuilder {
  buildSQLGenerationPrompt(intent: QueryIntent, context: MetadataContext): string;
  describeIntent(intent: QueryIntent): string;
  describeConditions(conditions: any): string;
}

/**
 * SQL 格式化器接口
 */
export interface SQLFormatter {
  format(sql: string): string;
  validate(sql: string): boolean;
}

/**
 * 查询步骤定义
 */
export interface QueryStep {
  /** 步骤名称 */
  stepName: string;
  /** 步骤说明 */
  description: string;
  /** 涉及的表 */
  tables: string[];
  /** 输出的列 */
  outputColumns: string[];
  /** 步骤类型 */
  stepType?: 'filter' | 'join' | 'aggregate' | 'sort' | 'limit';
  /** 该步骤的查询意图 */
  intent?: Partial<QueryIntent>;
}

/**
 * 步骤生成结果
 */
export interface StepGenerationResult {
  /** 步骤信息 */
  step: QueryStep;
  /** 生成的 SQL */
  sql: string;
  /** 置信度 */
  confidence: number;
  /** 使用的表 */
  usedTables: string[];
  /** 使用的字段 */
  usedColumns: string[];
}
