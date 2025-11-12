/**
 * SQL 生成管道类型定义
 *
 * 管道架构用于优化 SQL 生成流程，通过多个独立阶段处理请求：
 * 1. 模板匹配 - 快速生成常见查询
 * 2. Prompt 缓存检查 - 复用相似 Prompt 的结果
 * 3. SQL 缓存检查 - 复用已生成的 SQL
 * 4. AI 生成 - 使用批处理优化 AI 调用
 * 5. 质量增强 - 自动修正和优化 SQL
 * 6. 验证 - 确保 SQL 正确性和安全性
 */

import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { SQLGenerationResult, SQLGenerationOptions } from '../types';

/**
 * 管道上下文 - 在各阶段间传递数据
 */
export interface PipelineContext {
  /** 用户查询意图 */
  intent: QueryIntent;

  /** 元数据上下文 */
  metadata: MetadataContext;

  /** 生成选项 */
  options: SQLGenerationOptions;

  /** 当前生成结果（如果有） */
  result?: SQLGenerationResult;

  /** 是否应该停止管道 */
  shouldStop: boolean;

  /** 跳过的阶段（用于性能分析） */
  skippedStages: string[];

  /** 执行的阶段（用于性能分析） */
  executedStages: StageExecutionInfo[];

  /** 总开始时间 */
  startTime: number;

  /** 附加数据（各阶段可以添加自定义数据） */
  additionalData: Record<string, any>;
}

/**
 * 阶段执行信息
 */
export interface StageExecutionInfo {
  /** 阶段名称 */
  stageName: string;

  /** 开始时间 */
  startTime: number;

  /** 结束时间 */
  endTime: number;

  /** 执行时长（毫秒） */
  duration: number;

  /** 是否成功 */
  success: boolean;

  /** 是否命中（对缓存阶段） */
  hit?: boolean;

  /** 错误信息（如果有） */
  error?: string;

  /** 附加信息 */
  metadata?: Record<string, any>;
}

/**
 * 管道阶段接口
 */
export interface PipelineStage {
  /** 阶段名称 */
  readonly name: string;

  /** 阶段描述 */
  readonly description: string;

  /** 阶段优先级（数字越小优先级越高） */
  readonly priority: number;

  /**
   * 处理请求
   * @param context 管道上下文
   * @returns 更新后的上下文
   */
  process(context: PipelineContext): Promise<PipelineContext>;

  /**
   * 是否应该执行此阶段
   * @param context 管道上下文
   * @returns 是否执行
   */
  shouldExecute(context: PipelineContext): boolean;
}

/**
 * 管道配置
 */
export interface PipelineConfig {
  /** 是否启用详细日志 */
  verbose?: boolean;

  /** 是否启用性能监控 */
  enableMetrics?: boolean;

  /** 超时时间（毫秒） */
  timeout?: number;

  /** 禁用的阶段 */
  disabledStages?: string[];

  /** 自定义阶段顺序 */
  stageOrder?: string[];
}

/**
 * 管道执行结果
 */
export interface PipelineResult {
  /** SQL 生成结果 */
  result: SQLGenerationResult;

  /** 执行的阶段信息 */
  executedStages: StageExecutionInfo[];

  /** 跳过的阶段 */
  skippedStages: string[];

  /** 总执行时间（毫秒） */
  totalDuration: number;

  /** 是否使用了缓存 */
  cached: boolean;

  /** 缓存类型（如果有） */
  cacheType?: 'template' | 'prompt' | 'sql';
}

/**
 * 管道统计信息
 */
export interface PipelineStatistics {
  /** 总请求数 */
  totalRequests: number;

  /** 成功请求数 */
  successfulRequests: number;

  /** 失败请求数 */
  failedRequests: number;

  /** 平均执行时间（毫秒） */
  averageDuration: number;

  /** 各阶段统计 */
  stageStats: Map<string, StageStatistics>;

  /** 缓存命中统计 */
  cacheHitStats: {
    template: number;
    prompt: number;
    sql: number;
    total: number;
    hitRate: number;
  };
}

/**
 * 阶段统计信息
 */
export interface StageStatistics {
  /** 阶段名称 */
  stageName: string;

  /** 执行次数 */
  executionCount: number;

  /** 跳过次数 */
  skipCount: number;

  /** 成功次数 */
  successCount: number;

  /** 失败次数 */
  failureCount: number;

  /** 平均执行时间（毫秒） */
  averageDuration: number;

  /** 最小执行时间（毫秒） */
  minDuration: number;

  /** 最大执行时间（毫秒） */
  maxDuration: number;

  /** 命中次数（对缓存阶段） */
  hitCount?: number;

  /** 命中率（对缓存阶段） */
  hitRate?: number;
}
