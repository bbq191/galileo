/**
 * AI 模块配置管理
 */

import type { DeepseekConfig } from './types';

/**
 * Deepseek API 配置
 */
export const deepseekConfig: DeepseekConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  timeout: parseInt(process.env.DEEPSEEK_TIMEOUT || '30000'),
  maxRetries: parseInt(process.env.DEEPSEEK_MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.DEEPSEEK_RETRY_DELAY || '1000'),
};

/**
 * 验证配置
 */
export function validateConfig(): void {
  if (!deepseekConfig.apiKey) {
    throw new Error(
      'Deepseek API Key 未配置。请在 .env 文件中设置 DEEPSEEK_API_KEY'
    );
  }

  if (!deepseekConfig.apiUrl) {
    throw new Error(
      'Deepseek API URL 未配置。请在 .env 文件中设置 DEEPSEEK_API_URL'
    );
  }

  if (deepseekConfig.timeout !== undefined && deepseekConfig.timeout < 1000) {
    throw new Error('超时时间不能小于 1000ms');
  }

  if (deepseekConfig.maxRetries !== undefined && deepseekConfig.maxRetries < 0) {
    throw new Error('最大重试次数不能为负数');
  }
}

/**
 * 批量处理配置
 */
export const batchConfig = {
  /** 每批次处理数量 */
  batchSize: parseInt(process.env.BATCH_SIZE || '50'),

  /** 批次间延迟（毫秒） */
  delayBetweenBatches: parseInt(process.env.BATCH_DELAY || '1000'),

  /** 最大并发数 */
  maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '10'),
};

/**
 * 语义标注配置
 */
export const semanticConfig = {
  /** 是否启用语义标注 */
  enabled: process.env.SEMANTIC_ANNOTATION_ENABLED !== 'false',

  /** 默认温度参数 */
  temperature: parseFloat(process.env.SEMANTIC_TEMPERATURE || '0.3'),

  /** 最大 token 数 */
  maxTokens: parseInt(process.env.SEMANTIC_MAX_TOKENS || '500'),

  /** Top P 参数 */
  topP: parseFloat(process.env.SEMANTIC_TOP_P || '0.9'),
};

/**
 * 关系推断配置
 */
export const inferenceConfig = {
  /** 是否启用 AI 推断 */
  aiEnabled: process.env.AI_INFERENCE_ENABLED !== 'false',

  /** 最小置信度阈值 */
  minConfidence: parseFloat(process.env.MIN_CONFIDENCE || '0.7'),

  /** 默认温度参数 */
  temperature: parseFloat(process.env.INFERENCE_TEMPERATURE || '0.2'),

  /** 最大 token 数 */
  maxTokens: parseInt(process.env.INFERENCE_MAX_TOKENS || '1000'),

  /** Top P 参数 */
  topP: parseFloat(process.env.INFERENCE_TOP_P || '0.9'),
};

/**
 * 向量嵌入配置
 */
export const embeddingConfig = {
  /** 向量模型类型 */
  modelType: process.env.EMBEDDING_MODEL_TYPE || 'simple-hash', // simple-hash | ai-model

  /** AI 嵌入模型名称（当 modelType 为 ai-model 时使用） */
  aiModel: process.env.EMBEDDING_AI_MODEL || 'deepseek-embedding-v1',

  /** 向量维度（根据模型自动调整） */
  dimension: parseInt(process.env.EMBEDDING_DIMENSION || '384'),

  /** 相似度阈值 */
  similarityThreshold: parseFloat(process.env.EMBEDDING_SIMILARITY_THRESHOLD || '0.85'),

  /** 批处理大小 */
  batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '50'),

  /** 是否自动更新向量索引 */
  autoUpdateIndex: process.env.AUTO_UPDATE_VECTOR_INDEX !== 'false',

  /** 向量索引重建 Cron 表达式 */
  indexRebuildCron: process.env.VECTOR_INDEX_REBUILD_CRON || '0 2 * * *', // 每日凌晨2点

  /** 是否启用向量缓存 */
  cacheEnabled: process.env.VECTOR_CACHE_ENABLED !== 'false',

  /** 向量缓存 TTL（秒） */
  cacheTTL: parseInt(process.env.VECTOR_CACHE_TTL || '86400'), // 24小时
};

/**
 * 导出所有配置
 */
export const aiConfig = {
  deepseek: deepseekConfig,
  batch: batchConfig,
  semantic: semanticConfig,
  inference: inferenceConfig,
  embedding: embeddingConfig,
};
