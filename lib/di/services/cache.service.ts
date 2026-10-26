/**
 * 缓存服务
 * 提供统一的缓存接口，支持依赖注入
 */

import { injectable, inject } from 'tsyringe';
import { Redis } from 'ioredis';
import { DI_TOKENS } from '../tokens';
import type { ICacheService } from '../types';

@injectable()
export class CacheService implements ICacheService {
  // L1 内存缓存
  private l1Cache: Map<string, { value: any; expiry: number }> = new Map();
  private readonly L1_MAX_ENTRIES = 1000;

  constructor(@inject(DI_TOKENS.RedisClient) private readonly redis: Redis) {
    // 定期清理过期的 L1 缓存
    setInterval(() => this.cleanupL1(), 60000).unref(); // 每分钟清理一次；unref 防止定时器阻止进程退出
  }

  /**
   * 获取缓存数据
   */
  async get<T>(key: string): Promise<T | null> {
    // 1. 尝试从 L1 缓存获取
    const l1Hit = this.getL1<T>(key);
    if (l1Hit !== null) {
      return l1Hit;
    }

    // 2. 尝试从 L2 (Redis) 获取
    const l2Hit = await this.getL2<T>(key);
    if (l2Hit !== null) {
      // 回填 L1 缓存
      this.setL1(key, l2Hit, 300); // 默认 5 分钟
      return l2Hit;
    }

    return null;
  }

  /**
   * 设置缓存数据
   */
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    // 写入 L1 缓存
    this.setL1(key, value, ttl);

    // 写入 L2 缓存
    await this.setL2(key, value, ttl);
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    // 删除 L1 缓存
    this.l1Cache.delete(key);

    // 删除 L2 缓存
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('[CacheService] 删除 L2 缓存失败:', error);
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    // 清空 L1 缓存
    this.l1Cache.clear();

    // 清空 L2 缓存（谨慎使用）
    try {
      await this.redis.flushdb();
    } catch (error) {
      console.error('[CacheService] 清空 L2 缓存失败:', error);
    }
  }

  /**
   * L1 缓存操作
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

  private setL1(key: string, value: any, ttl: number): void {
    // 如果缓存已满，删除最旧的条目
    if (this.l1Cache.size >= this.L1_MAX_ENTRIES) {
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
   * L2 缓存操作
   */
  private async getL2<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as T;
    } catch (error) {
      console.error('[CacheService] L2 缓存读取失败:', error);
      return null;
    }
  }

  private async setL2(key: string, value: any, ttl: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
    } catch (error) {
      console.error('[CacheService] L2 缓存写入失败:', error);
    }
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
      console.log(`[CacheService] 清理了 ${keysToDelete.length} 个过期的 L1 缓存条目`);
    }
  }
}
