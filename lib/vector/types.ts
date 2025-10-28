/**
 * 向量搜索相关的类型定义
 */

/**
 * 向量（数值数组）
 */
export type Vector = number[];

/**
 * 向量化选项
 */
export interface EmbeddingOptions {
  /** 模型名称 */
  model?: string;
  /** 最大输入长度 */
  maxLength?: number;
  /** 批处理大小 */
  batchSize?: number;
}

/**
 * 向量化结果
 */
export interface EmbeddingResult {
  /** 原始文本 */
  text: string;
  /** 向量 */
  vector: Vector;
  /** 向量维度 */
  dimension: number;
  /** 生成时间 */
  timestamp: Date;
}

/**
 * 向量搜索选项
 */
export interface VectorSearchOptions {
  /** 返回结果数量 */
  limit?: number;
  /** 相似度阈值（0-1） */
  threshold?: number;
  /** 是否返回向量 */
  includeVector?: boolean;
  /** 过滤条件 */
  filter?: Record<string, any>;
}

/**
 * 向量搜索结果
 */
export interface VectorSearchResult<T = any> {
  /** 匹配的数据 */
  item: T;
  /** 相似度分数（0-1，1 表示完全相同） */
  score: number;
  /** 向量（如果 includeVector=true） */
  vector?: Vector;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 向量存储项
 */
export interface VectorStoreItem {
  /** 唯一标识 */
  id: string;
  /** 向量 */
  vector: Vector;
  /** 关联的数据 */
  data: any;
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 向量索引统计信息
 */
export interface VectorIndexStats {
  /** 总条目数 */
  totalItems: number;
  /** 向量维度 */
  dimension: number;
  /** 索引大小（字节） */
  sizeBytes: number;
  /** 最后更新时间 */
  lastUpdated: Date;
}

/**
 * 相似度计算方法
 */
export enum SimilarityMetric {
  /** 余弦相似度（默认） */
  COSINE = 'cosine',
  /** 欧氏距离 */
  EUCLIDEAN = 'euclidean',
  /** 点积 */
  DOT_PRODUCT = 'dot_product',
}

/**
 * 向量索引配置
 */
export interface VectorIndexConfig {
  /** 索引名称 */
  name: string;
  /** 向量维度 */
  dimension: number;
  /** 相似度度量方法 */
  metric?: SimilarityMetric;
  /** 是否使用 Redis 持久化 */
  persistent?: boolean;
  /** Redis key 前缀 */
  redisPrefix?: string;
}

/**
 * 批量向量化任务
 */
export interface BatchEmbeddingTask {
  /** 任务 ID */
  id: string;
  /** 文本列表 */
  texts: string[];
  /** 任务状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** 进度（0-100） */
  progress: number;
  /** 结果 */
  results?: EmbeddingResult[];
  /** 错误信息 */
  error?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 完成时间 */
  completedAt?: Date;
}
