/**
 * AI 模块统一导出
 */

// 客户端
export {
  DeepseekClient,
  createDeepseekClient,
  getDeepseekClient,
} from './deepseek-client';

// 配置
export { aiConfig, deepseekConfig, batchConfig, semanticConfig, inferenceConfig } from './config';

// 类型
export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  DeepseekConfig,
} from './types';
export { APIError, RateLimitError } from './types';

// 规则引擎
export {
  RuleBasedAnnotator,
  ruleBasedAnnotator,
  BUILTIN_RULES,
  type NamingRule,
  type RuleAnnotationResult,
} from './rules/naming-rules';

// Prompt 模板
export * from './prompt-templates';

// 批量处理
export {
  BatchProcessor,
  batchProcessor,
  type BatchRequest,
  type BatchResult,
  type BatchProcessOptions,
  type BatchProgress,
} from './batch-processor';

// 语义标注
export {
  SemanticAnnotator,
  semanticAnnotator,
  type SemanticSource,
  type AnnotationResult,
  type AnnotationStats,
} from './semantic-annotator';

// 优先级处理
export {
  PriorityProcessor,
  priorityProcessor,
  SemanticPriority,
} from './priority-processor';
