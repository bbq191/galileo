/**
 * 多级缓存实现
 * L1: 内存缓存（最快，容量小）
 * L2: Redis 缓存（快，容量大）
 * L3: 数据库（最慢，容量无限）
 */

import { injectable, inject } from 'tsyringe';
import type { Redis } from 'ioredis';
import { getRedisClient } from './redis-client';
import { CACHE_CONFIGS, generateCacheKey, cacheStats } from './cache-config';
import type { CacheConfig } from './cache-config';
import { DI_TOKENS } from '@/lib/di/tokens';
import { CacheBreakthroughGuard } from './cache-breakthrough-guard';

/**
 * 自定义 JSON 序列化，支持 BigInt
 */
function serializeJSON(value: any): string {
  return JSON.stringify(value, (_, val) => {
    // 将 BigInt 转换为字符串并标记
    if (typeof val === 'bigint') {
      return { __type: 'bigint', value: val.toString() };
    }
    return val;
  });
}

/**
 * 自定义 JSON 反序列化，还原 BigInt
 */
function deserializeJSON<T>(json: string): T {
  return JSON.parse(json, (_, val) => {
    // 还原 BigInt
    if (val && typeof val === 'object' && val.__type === 'bigint') {
      return BigInt(val.value);
    }
    return val;
  });
}

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
@injectable()
export class MultiLevelCache {
  // L1 内存缓存
  private l1Cache: Map<string, L1CacheEntry<any>> = new Map();

  // L1 缓存最大条目数（防止内存溢出）
  private readonly L1_MAX_ENTRIES = parseInt(process.env.L1_CACHE_MAX_SIZE || '1000', 10);

  // Redis 客户端
  private redis: Redis | null = null;

  // 防击穿守卫
  private guard: CacheBreakthroughGuard | null = null;

  // 清理定时器
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    @inject(DI_TOKENS.RedisClient) redis?: Redis,
    @inject(DI_TOKENS.CacheBreakthroughGuard) guard?: CacheBreakthroughGuard
  ) {
    // 如果通过 DI 注入了 Redis，使用注入的实例
    if (redis) {
      this.redis = redis;
    }
    // 如果通过 DI 注入了防击穿守卫，使用注入的实例
    if (guard) {
      this.guard = guard;
    }
    // 否则使用全局函数（向后兼容）
  }

  /**
   * 启动 L1 缓存自动清理
   */
  startCleanup(): void {
    if (!this.cleanupInterval) {
      const cleanupInterval = parseInt(process.env.L1_CACHE_CLEANUP_INTERVAL || '60000', 10);
      this.cleanupInterval = setInterval(() => this.cleanupL1(), cleanupInterval);
      console.log('[MultiLevelCache] 自动清理已启动');
    }
  }

  /**
   * 停止 L1 缓存自动清理
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      console.log('[MultiLevelCache] 自动清理已停止');
    }
  }

  /**
   * 获取 Redis 客户端（支持 DI 和全局函数两种方式）
   */
  private getRedis(): Redis {
    if (this.redis) {
      return this.redis;
    }
    // 向后兼容：使用全局函数
    return getRedisClient();
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

    // 3. 缓存未命中，使用防击穿保护获取数据
    cacheStats.recordMiss();

    if (this.guard) {
      // 使用防击穿守卫
      return await this.guard.getWithGuard(
        cacheKey,
        fetchFn,
        async (data: T) => {
          await this.set(configKey, params, data);
        }
      );
    } else {
      // 向后兼容：直接调用获取函数（无防护）
      const data = await fetchFn();
      await this.set(configKey, params, data);
      return data;
    }
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
        const redis = this.getRedis();
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
    console.log(`[Cache] MultiLevelCache.invalidate 开始: event=${event}, pattern=${pattern}`);
    cacheStats.recordInvalidation();

    // 查找所有受影响的缓存配置
    const affectedConfigs = Object.entries(CACHE_CONFIGS).filter(([_, config]) =>
      config.invalidateOn.includes(event)
    );
    console.log(`[Cache] 找到 ${affectedConfigs.length} 个受影响的缓存配置`);

    if (affectedConfigs.length === 0) {
      console.log('[Cache] 没有受影响的缓存配置，跳过失效');
      return;
    }

    // 失效 L1 缓存
    console.log('[Cache] 开始失效 L1 缓存...');
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
    console.log('[Cache] L1 缓存失效完成');

    // 失效 L2 缓存
    console.log('[Cache] 开始失效 L2 缓存...');
    for (const [configKey, config] of affectedConfigs) {
      if (config.L2.enabled) {
        const patternToUse = pattern || config.key.split(':')[0] + ':*';
        console.log(`[Cache] 处理配置: ${configKey}, pattern: ${patternToUse}`);
        await this.invalidateL2Pattern(patternToUse);
      }
    }
    console.log('[Cache] L2 缓存失效完成');
    console.log('[Cache] MultiLevelCache.invalidate 完成');
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    // 清空 L1
    this.l1Cache.clear();

    // 清空 L2
    try {
      console.log('[Cache] 开始清空 L2 缓存...');
      // 仅清空元数据相关的缓存（以 'metadata:' 或 'graph:' 开头）
      const patterns = [
        'metadata:*',
        'graph:*',
        'search:*',
        'tables:*',
        'databases:*',
        'relationships:*',
        'query:*', // 添加查询缓存
      ];

      const allKeys: string[] = [];
      for (const pattern of patterns) {
        const keys = await this.scanKeys(pattern);
        allKeys.push(...keys);
        console.log(`[Cache] 找到 ${keys.length} 个 ${pattern} 键`);
      }

      if (allKeys.length > 0) {
        // 批量删除
        const batchSize = 1000;
        for (let i = 0; i < allKeys.length; i += batchSize) {
          const batch = allKeys.slice(i, i + batchSize);
          const redis = this.getRedis();
          await redis.del(...batch);
        }
        console.log(`[Cache] 已清空 ${allKeys.length} 个 L2 缓存条目`);
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
      const redis = this.getRedis();
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return deserializeJSON<T>(data);
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
      const redis = this.getRedis();
      await redis.setex(key, ttl, serializeJSON(value));
    } catch (error) {
      console.error('[Cache] L2 缓存写入失败:', error);
    }
  }

  /**
   * 根据模式失效 L2 缓存
   */
  /**
   * 超时包装器：为异步操作添加超时限制
   * @param promise 要执行的 Promise
   * @param timeoutMs 超时时间（毫秒）
   * @param timeoutError 超时错误信息
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutError: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
      ),
    ]);
  }

  /**
   * 使用 SCAN 命令查找匹配的键（避免阻塞）
   * @param pattern 匹配模式
   * @returns 匹配的键列表
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const redis = this.getRedis();
    const keys: string[] = [];
    let cursor = '0';
    const maxIterations = 1000; // 防止无限循环
    let iterations = 0;

    try {
      do {
        iterations++;
        if (iterations > maxIterations) {
          console.warn(`[Cache] SCAN 达到最大迭代次数 ${maxIterations}，停止扫描`);
          break;
        }

        // SCAN 命令：每次返回部分键，不会阻塞 Redis
        // 添加 2 秒超时保护
        const [nextCursor, matchedKeys] = await this.withTimeout(
          redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100),
          2000,
          `Redis SCAN 命令超时 (pattern: ${pattern}, iteration: ${iterations})`
        );

        cursor = nextCursor;
        keys.push(...matchedKeys);

        // 如果找到了很多键，打印进度
        if (keys.length > 0 && keys.length % 1000 === 0) {
          console.log(`[Cache] 已扫描 ${keys.length} 个键...`);
        }
      } while (cursor !== '0');

      return keys;
    } catch (error) {
      console.error(`[Cache] scanKeys 失败:`, error);
      // 即使失败也返回已扫描的键
      console.warn(`[Cache] 返回已扫描的 ${keys.length} 个键`);
      return keys;
    }
  }

  private async invalidateL2Pattern(pattern: string): Promise<void> {
    try {
      console.log(`[Cache] 开始查找 L2 缓存键: ${pattern}`);
      const redis = this.getRedis();

      // 使用 SCAN 代替 KEYS，避免阻塞
      // 为整个操作添加 5 秒总超时
      const keys = await this.withTimeout(
        this.scanKeys(pattern),
        5000,
        `Redis scanKeys 总超时 (pattern: ${pattern})`
      );
      console.log(`[Cache] 找到 ${keys.length} 个 L2 缓存键`);

      if (keys.length > 0) {
        // 批量删除，每次最多删除 1000 个键
        const batchSize = 1000;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          // 为每批删除添加 2 秒超时
          await this.withTimeout(
            redis.del(...batch),
            2000,
            `Redis DEL 命令超时 (batch: ${i / batchSize + 1})`
          );
          console.log(`[Cache] 删除了 ${batch.length} 个缓存条目 (${i + batch.length}/${keys.length})`);
        }
        console.log(`[Cache] L2 失效了 ${keys.length} 个缓存条目`);
      } else {
        console.log(`[Cache] 没有找到匹配的缓存键`);
      }
    } catch (error) {
      console.error('[Cache] L2 缓存失效失败:', error);
      console.warn('[Cache] 跳过 L2 缓存失效，继续执行');
      // 不抛出错误，让主流程继续
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
    const stats = {
      l1Size: this.l1Cache.size,
      l1MaxSize: this.L1_MAX_ENTRIES,
      metrics: cacheStats.getMetrics(),
      hitRate: cacheStats.getHitRate(),
      breakthroughGuard: this.guard ? this.guard.getMetrics() : null,
    };

    return stats;
  }

  /**
   * 获取防击穿守卫实例（用于监控和管理）
   */
  getBreakthroughGuard(): CacheBreakthroughGuard | null {
    return this.guard;
  }
}

// 导出单例（向后兼容）
// 注意：通过 DI 使用时，应该注入 MultiLevelCache 类而不是使用此单例
export const multiLevelCache = new MultiLevelCache();
// 启动自动清理（仅全局单例）
multiLevelCache.startCleanup();
