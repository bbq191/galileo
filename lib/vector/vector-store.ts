/**
 * 向量存储
 * 负责向量的存储、检索和持久化
 */

import Redis from 'ioredis';
import {
  Vector,
  VectorStoreItem,
  VectorSearchOptions,
  VectorSearchResult,
  VectorIndexConfig,
  VectorIndexStats,
  SimilarityMetric,
} from './types';
import { EmbeddingGenerator } from './embedding-generator';

/**
 * 向量存储
 */
export class VectorStore {
  private indexName: string;
  private dimension: number;
  private metric: SimilarityMetric;
  private persistent: boolean;
  private redisPrefix: string;

  // 内存索引
  private items: Map<string, VectorStoreItem> = new Map();

  // Redis 客户端（可选）
  private redis?: Redis;

  // 向量生成器
  private embedder: EmbeddingGenerator;

  constructor(config: VectorIndexConfig, redis?: Redis) {
    this.indexName = config.name;
    this.dimension = config.dimension;
    this.metric = config.metric || SimilarityMetric.COSINE;
    this.persistent = config.persistent !== false;
    this.redisPrefix = config.redisPrefix || `vector:${config.name}`;
    this.redis = redis;

    this.embedder = new EmbeddingGenerator();
  }

  /**
   * 初始化索引
   */
  async initialize(): Promise<void> {
    console.log(`初始化向量索引: ${this.indexName}`);

    // 从 Redis 加载已有数据
    if (this.persistent && this.redis) {
      await this.loadFromRedis();
    }

    console.log(`✓ 向量索引已初始化: ${this.items.size} 条记录`);
  }

  /**
   * 添加向量项
   */
  async add(id: string, vector: Vector, data: any, metadata?: Record<string, any>): Promise<void> {
    if (vector.length !== this.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`
      );
    }

    const item: VectorStoreItem = {
      id,
      vector,
      data,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.items.set(id, item);

    // 持久化到 Redis
    if (this.persistent && this.redis) {
      await this.saveToRedis(item);
    }
  }

  /**
   * 批量添加向量项
   */
  async addBatch(items: Array<{ id: string; vector: Vector; data: any; metadata?: Record<string, any> }>): Promise<void> {
    for (const item of items) {
      await this.add(item.id, item.vector, item.data, item.metadata);
    }
  }

  /**
   * 更新向量项
   */
  async update(id: string, vector?: Vector, data?: any, metadata?: Record<string, any>): Promise<void> {
    const existing = this.items.get(id);
    if (!existing) {
      throw new Error(`Item not found: ${id}`);
    }

    if (vector && vector.length !== this.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`
      );
    }

    const updated: VectorStoreItem = {
      ...existing,
      vector: vector || existing.vector,
      data: data !== undefined ? data : existing.data,
      metadata: metadata !== undefined ? metadata : existing.metadata,
      updatedAt: new Date(),
    };

    this.items.set(id, updated);

    if (this.persistent && this.redis) {
      await this.saveToRedis(updated);
    }
  }

  /**
   * 删除向量项
   */
  async delete(id: string): Promise<void> {
    this.items.delete(id);

    if (this.persistent && this.redis) {
      await this.redis.del(`${this.redisPrefix}:item:${id}`);
    }
  }

  /**
   * 获取向量项
   */
  async get(id: string): Promise<VectorStoreItem | null> {
    return this.items.get(id) || null;
  }

  /**
   * 搜索相似向量
   */
  async search<T = any>(
    queryVector: Vector,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<T>[]> {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.0;

    // 计算所有项的相似度
    const results: VectorSearchResult<T>[] = [];

    for (const [id, item] of this.items.entries()) {
      // 应用过滤器
      if (options.filter && !this.matchFilter(item, options.filter)) {
        continue;
      }

      const score = this.calculateSimilarity(queryVector, item.vector);

      if (score >= threshold) {
        results.push({
          item: item.data as T,
          score,
          vector: options.includeVector ? item.vector : undefined,
          metadata: item.metadata,
        });
      }
    }

    // 按分数降序排序
    results.sort((a, b) => b.score - a.score);

    // 返回前 N 个结果
    return results.slice(0, limit);
  }

  /**
   * 根据文本搜索（自动向量化）
   */
  async searchByText<T = any>(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<T>[]> {
    const { vector } = await this.embedder.generate(query);
    return this.search<T>(vector, options);
  }

  /**
   * 计算相似度
   */
  private calculateSimilarity(vectorA: Vector, vectorB: Vector): number {
    switch (this.metric) {
      case SimilarityMetric.COSINE:
        return EmbeddingGenerator.cosineSimilarity(vectorA, vectorB);

      case SimilarityMetric.EUCLIDEAN:
        const distance = EmbeddingGenerator.euclideanDistance(vectorA, vectorB);
        return EmbeddingGenerator.euclideanToSimilarity(distance);

      case SimilarityMetric.DOT_PRODUCT:
        return vectorA.reduce((sum, a, i) => sum + a * vectorB[i], 0);

      default:
        return EmbeddingGenerator.cosineSimilarity(vectorA, vectorB);
    }
  }

  /**
   * 检查是否匹配过滤器
   */
  private matchFilter(item: VectorStoreItem, filter: Record<string, any>): boolean {
    if (!item.metadata) {
      return false;
    }

    for (const [key, value] of Object.entries(filter)) {
      if (item.metadata[key] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取索引统计信息
   */
  async getStats(): Promise<VectorIndexStats> {
    let sizeBytes = 0;
    let lastUpdated = new Date(0);

    for (const item of this.items.values()) {
      // 估算大小（向量 + 数据）
      sizeBytes += item.vector.length * 8; // 每个 number 8 字节
      // 使用自定义 replacer 处理 BigInt 序列化
      sizeBytes += JSON.stringify(item.data, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ).length;

      if (item.updatedAt > lastUpdated) {
        lastUpdated = item.updatedAt;
      }
    }

    return {
      totalItems: this.items.size,
      dimension: this.dimension,
      sizeBytes,
      lastUpdated,
    };
  }

  /**
   * 清空索引
   */
  async clear(): Promise<void> {
    this.items.clear();

    if (this.persistent && this.redis) {
      const keys = await this.redis.keys(`${this.redisPrefix}:item:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * 从 Redis 加载数据
   */
  private async loadFromRedis(): Promise<void> {
    if (!this.redis) return;

    try {
      const keys = await this.redis.keys(`${this.redisPrefix}:item:*`);

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const item: VectorStoreItem = JSON.parse(data);
          this.items.set(item.id, item);
        }
      }

      console.log(`从 Redis 加载了 ${keys.length} 条向量记录`);
    } catch (error) {
      console.error('从 Redis 加载向量数据失败:', error);
    }
  }

  /**
   * 保存到 Redis
   */
  private async saveToRedis(item: VectorStoreItem): Promise<void> {
    if (!this.redis) return;

    try {
      const key = `${this.redisPrefix}:item:${item.id}`;
      // 使用自定义 replacer 处理 BigInt 序列化
      const serialized = JSON.stringify(item, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
      await this.redis.set(key, serialized);
    } catch (error) {
      console.error('保存向量数据到 Redis 失败:', error);
    }
  }

  /**
   * 获取所有项的 ID
   */
  getAllIds(): string[] {
    return Array.from(this.items.keys());
  }

  /**
   * 获取索引大小
   */
  size(): number {
    return this.items.size;
  }

  /**
   * 检查项是否存在
   */
  has(id: string): boolean {
    return this.items.has(id);
  }
}
