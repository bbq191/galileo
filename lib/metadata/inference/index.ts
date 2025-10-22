/**
 * 关系推断模块
 * 导出所有公共接口和类
 */

// 类型定义
export type {
  RelationshipType,
  InferenceMethod,
  InferredRelationship,
  InferenceRule,
  NamingPattern,
  InferenceResult,
} from './types';

// 核心类
export { RelationshipInferencer } from './relationship-inferencer';
export type { RelationshipInferencerConfig } from './relationship-inferencer';

export { NamingAnalyzer, BUILTIN_NAMING_PATTERNS } from './naming-analyzer';
export { RulesEngine, BUILTIN_INFERENCE_RULES } from './rules-engine';
export { AIInferencer } from './ai-inferencer';
