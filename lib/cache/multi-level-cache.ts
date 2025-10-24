/**
 * 多级缓存实现
 * L1: 内存缓存（最快，容量小）
 * L2: Redis 缓存（快，容量大）
 * L3: 数据库（最慢，容量无限）
 */

import { getRedisClient } from './redis-client';
import { CACHE_CONFIGS, generateCacheKey, cacheStats } from './cache-config';
import type { CacheConfig } from './cache-config';

/**
 * L1 缓存条目
 */
interface L1CacheEntry<T> {
  value: T;
  expiry: number; // 过期时间戳（毫秒）
}

/**
 * 多级缓存管理器
 */
export class MultiLevelCache {
  // L1 内存缓存
  private l1Cache: Map<string, L1CacheEntry<any>> = new Map();

  // L1 缓存最大条目数（防止内存溢出）
  private readonly L1_MAX_ENTRIES = 1000;

  constructor() {
    // 定期清理过期的 L1 缓存
    setInterval(() => this.cleanupL1(), 60000); // 每分钟清理一次
  }

  /**
   * 获取缓存数据
   * @param configKey 配置键（如 'table_meta'）
   * @param params 参数对象（如 { id: 1, version: 'v1' }）
   * @param fetchFn 缓存未命中时的数据获取函数
   */
  async get<T>(
    configKey: string,
    params: Record<string, any>,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const config = CACHE_CONFIGS[configKey];
    if (!config) {
      // 如果没有配置，直接调用获取函数
      return await fetchFn();
    }

    const cacheKey = generateCacheKey(configKey, params);

    // 1. 尝试从 L1 缓存获取
    if (config.L1.enabled) {
      const l1Hit = this.getL1<T>(cacheKey);
      if (l1Hit !== null) {
        cacheStats.recordHit('L1');
        return l1Hit;
      }
    }

    // 2. 尝试从 L2 缓存获取
    if (config.L2.enabled) {
      const l2Hit = await this.getL2<T>(cacheKey);
      if (l2Hit !== null) {
        cacheStats.recordHit('L2');

        // 回填 L1 缓存
        if (config.L1.enabled) {
          this.setL1(cacheKey, l2Hit, config.L1.ttl);
        }

        return l2Hit;
      }
    }

    // 3. 缓存未命中，调用获取函数
    cacheStats.recordMiss();
    const data = await fetchFn();

    // 4. 写入缓存
    await this.set(configKey, params, data);

    return data;
  }

  /**
   * 设置缓存数据
   */
  async set(configKey: string, params: Record<string, any>, value: any): Promise<void> {
    const config = CACHE_CONFIGS[configKey];
    if (!config) {
      return;
    }

    const cacheKey = generateCacheKey(configKey, params);
    cacheStats.recordSet();

    // 写入 L1 缓存
    if (config.L1.enabled) {
      this.setL1(cacheKey, value, config.L1.ttl);
    }

    // 写入 L2 缓存
    if (config.L2.enabled) {
      await this.setL2(cacheKey, value, config.L2.ttl);
    }
  }

  /**
   * 删除缓存
   */
  async delete(configKey: string, params: Record<string, any>): Promise<void> {
    const config = CACHE_CONFIGS[configKey];
    if (!config) {
      return;
    }

    const cacheKey = generateCacheKey(configKey, params);

    // 删除 L1 缓存
    if (config.L1.enabled) {
      this.l1Cache.delete(cacheKey);
    }

    // 删除 L2 缓存
    if (config.L2.enabled) {
      try {
        const redis = getRedisClient();
        await redis.del(cacheKey);
      } catch (error) {
        console.error('[Cache] 删除 L2 缓存失败:', error);
      }
    }
  }

  /**
   * 根据事件失效缓存
   * @param event 失效事件（如 'table_structure_changed'）
   * @param pattern 可选的模式匹配（如 'metadata:table:*'）
   */
  async invalidate(event: string, pattern?: string): Promise<void> {
    cacheStats.recordInvalidation();

    // 查找所有受影响的缓存配置
    const affectedConfigs = Object.entries(CACHE_CONFIGS).filter(([_, config]) =>
      config.invalidateOn.includes(event)
    );

    if (affectedConfigs.length === 0) {
      return;
    }

    // 失效 L1 缓存
    if (pattern) {
      this.invalidateL1Pattern(pattern);
    } else {
      // 如果没有提供模式，清空所有相关的 L1 缓存
      affectedConfigs.forEach(([configKey, config]) => {
        if (config.L1.enabled) {
          this.invalidateL1Pattern(config.key.split(':')[0]);
        }
      });
    }

    // 失效 L2 缓存
    for (const [_, config] of affectedConfigs) {
      if (config.L2.enabled) {
        await this.invalidateL2Pattern(pattern || config.key.split(':')[0] + ':*');
      }
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    // 清空 L1
    this.l1Cache.clear();

    // 清空 L2
    try {
      const redis = getRedisClient();
      // 仅清空元数据相关的缓存（以 'metadata:' 或 'graph:' 开头）
      const keys = await redis.keys('metadata:*');
      const graphKeys = await redis.keys('graph:*');
      const searchKeys = await redis.keys('search:*');
      const tableKeys = await redis.keys('tables:*');
      const dbKeys = await redis.keys('databases:*');
      const relKeys = await redis.keys('relationships:*');

      const allKeys = [
        ...keys,
        ...graphKeys,
        ...searchKeys,
        ...tableKeys,
        ...dbKeys,
        ...relKeys,
      ];

      if (allKeys.length > 0) {
        await redis.del(...allKeys);
      }
    } catch (error) {
      console.error('[Cache] 清空 L2 缓存失败:', error);
    }
  }

  // ==================== L1 缓存操作 ====================

  /**
   * 从 L1 缓存获取数据
   */
  private getL1<T>(key: string): T | null {
    const entry = this.l1Cache.get(key);
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiry) {
      this.l1Cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * 写入 L1 缓存
   */
  private setL1(key: string, value: any, ttl: number): void {
    // 检查缓存大小，防止内存溢出
    if (this.l1Cache.size >= this.L1_MAX_ENTRIES) {
      // 删除最旧的条目（FIFO）
      const firstKey = this.l1Cache.keys().next().value;
      if (firstKey) {
        this.l1Cache.delete(firstKey);
      }
    }

    this.l1Cache.set(key, {
      value,
      expiry: Date.now() + ttl * 1000,
    });
  }

  /**
   * 根据模式失效 L1 缓存
   */
  private invalidateL1Pattern(pattern: string): void {
    const regex = new RegExp('^' + pattern.replace('*', '.*'));
    const keysToDelete: string[] = [];

    for (const key of this.l1Cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.l1Cache.delete(key));
  }

  /**
   * 清理过期的 L1 缓存
   */
  private cleanupL1(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.l1Cache.entries()) {
      if (now > entry.expiry) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.l1Cache.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`[Cache] L1 清理了 ${keysToDelete.length} 个过期条目`);
    }
  }

  // ==================== L2 缓存操作 ====================

  /**
   * 从 L2 缓存获取数据
   */
  private async getL2<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedisClient();
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as T;
    } catch (error) {
      console.error('[Cache] L2 缓存读取失败:', error);
      return null;
    }
  }

  /**
   * 写入 L2 缓存
   */
  private async setL2(key: string, value: any, ttl: number): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('[Cache] L2 缓存写入失败:', error);
    }
  }

  /**
   * 根据模式失效 L2 缓存
   */
  private async invalidateL2Pattern(pattern: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[Cache] L2 失效了 ${keys.length} 个缓存条目`);
      }
    } catch (error) {
      console.error('[Cache] L2 缓存失效失败:', error);
    }
  }

  // ==================== 统计信息 ====================

  /**
   * 获取 L1 缓存大小
   */
  getL1Size(): number {
    return this.l1Cache.size;
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      l1Size: this.l1Cache.size,
      l1MaxSize: this.L1_MAX_ENTRIES,
      metrics: cacheStats.getMetrics(),
      hitRate: cacheStats.getHitRate(),
    };
  }
}

// 导出单例
export const multiLevelCache = new MultiLevelCache();
