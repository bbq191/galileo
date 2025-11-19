/**
 * 缓存击穿防护服务
 *
 * 实现 SingleFlight 模式 + Redis 分布式锁
 * 防止热点数据缓存失效时大量请求同时打到数据库
 *
 * 工作原理：
 * 1. 进程内：同一 key 的并发请求，只允许一个执行 fetchFn
 * 2. 跨进程：使用 Redis 分布式锁协调多进程
 * 3. 等待策略：未获取锁的请求轮询等待缓存，超时后降级执行
 */

import { injectable, inject } from 'tsyringe';
import type { Redis } from 'ioredis';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * SingleFlight 飞行记录
 * 用于追踪正在进行的请求
 */
interface FlightRecord<T> {
  promise: Promise<T>;
  startTime: number;
}

/**
 * 防击穿统计指标
 */
interface GuardMetrics {
  // 进程内防抖
  singleFlightHits: number; // SingleFlight 命中次数（等待了其他请求）
  singleFlightMisses: number; // SingleFlight 未命中次数（首个请求）

  // 分布式锁
  lockAcquired: number; // 成功获取锁次数
  lockWaited: number; // 等待锁次数
  lockTimeout: number; // 锁等待超时次数

  // 性能
  totalWaitTime: number; // 总等待时间（毫秒）
  avgWaitTime: number; // 平均等待时间（毫秒）
}

/**
 * 等待策略配置
 */
interface WaitStrategy {
  maxWaitTime: number; // 最大等待时间（毫秒）
  pollInterval: number; // 轮询间隔（毫秒）
  lockTTL: number; // 分布式锁 TTL（秒）
}

/**
 * 缓存击穿防护服务
 */
@injectable()
export class CacheBreakthroughGuard {
  // SingleFlight 飞行记录（进程内）
  private flights = new Map<string, FlightRecord<any>>();

  // 统计指标
  private metrics: GuardMetrics = {
    singleFlightHits: 0,
    singleFlightMisses: 0,
    lockAcquired: 0,
    lockWaited: 0,
    lockTimeout: 0,
    totalWaitTime: 0,
    avgWaitTime: 0,
  };

  // 等待策略配置
  private waitStrategy: WaitStrategy = {
    maxWaitTime: 10000, // 最大等待 10 秒
    pollInterval: 100, // 每 100ms 轮询一次
    lockTTL: 30, // 锁超时 30 秒（防止死锁）
  };

  // Lua 脚本支持检测
  private luaScriptSupported: boolean | null = null;

  constructor(@inject(DI_TOKENS.RedisClient) private redis: Redis) {}

  /**
   * 带防击穿保护的数据获取
   *
   * @param key 缓存键
   * @param fetchFn 数据获取函数
   * @param cacheFn 缓存写入函数
   * @returns 数据
   */
  async getWithGuard<T>(
    key: string,
    fetchFn: () => Promise<T>,
    cacheFn: (data: T) => Promise<void>
  ): Promise<T> {
    // 第一层：进程内 SingleFlight 防抖
    const flight = this.flights.get(key);
    if (flight) {
      // 已有请求正在处理，等待其结果
      this.metrics.singleFlightHits++;
      const startWait = Date.now();
      try {
        const result = await flight.promise;
        const waitTime = Date.now() - startWait;
        this.updateWaitTime(waitTime);
        return result;
      } catch (error) {
        // 如果等待的请求失败，清除飞行记录并重试
        this.flights.delete(key);
        throw error;
      }
    }

    // 首个请求，执行获取逻辑
    this.metrics.singleFlightMisses++;

    // 创建飞行记录
    const promise = this.executeWithDistributedLock(key, fetchFn, cacheFn);
    const record: FlightRecord<T> = {
      promise,
      startTime: Date.now(),
    };

    this.flights.set(key, record);

    try {
      const result = await promise;
      return result;
    } finally {
      // 清理飞行记录
      this.flights.delete(key);
    }
  }

  /**
   * 第二层：使用分布式锁执行获取逻辑
   */
  private async executeWithDistributedLock<T>(
    key: string,
    fetchFn: () => Promise<T>,
    cacheFn: (data: T) => Promise<void>
  ): Promise<T> {
    const lockKey = `lock:${key}`;
    const lockValue = this.generateLockValue();

    // 尝试获取分布式锁
    const lockAcquired = await this.acquireLock(lockKey, lockValue);

    if (lockAcquired) {
      // 成功获取锁，执行数据获取
      this.metrics.lockAcquired++;
      try {
        const data = await fetchFn();
        await cacheFn(data);
        return data;
      } finally {
        // 释放锁
        await this.releaseLock(lockKey, lockValue);
      }
    } else {
      // 未获取到锁，等待其他进程完成并写入缓存
      this.metrics.lockWaited++;
      return await this.waitForCache(key, fetchFn);
    }
  }

  /**
   * 获取分布式锁（原子操作）
   * 使用 SET key value EX ttl NX 命令
   */
  private async acquireLock(lockKey: string, lockValue: string): Promise<boolean> {
    try {
      const result = await this.redis.set(
        lockKey,
        lockValue,
        'EX',
        this.waitStrategy.lockTTL,
        'NX'
      );
      return result === 'OK';
    } catch (error) {
      console.error('[CacheBreakthroughGuard] 获取锁失败:', error);
      return false;
    }
  }

  /**
   * 检测 Redis 是否支持 Lua 脚本
   */
  private async checkLuaScriptSupport(): Promise<boolean> {
    if (this.luaScriptSupported !== null) {
      return this.luaScriptSupported;
    }

    try {
      // 尝试执行一个简单的 Lua 脚本
      const testScript = 'return "OK"';
      await this.redis.eval(testScript, 0);
      this.luaScriptSupported = true;
      console.log('[CacheBreakthroughGuard] Redis 支持 Lua 脚本');
    } catch (error: any) {
      this.luaScriptSupported = false;
      console.warn(
        '[CacheBreakthroughGuard] Redis 不支持 Lua 脚本，使用降级策略:',
        error.message
      );
    }

    return this.luaScriptSupported;
  }

  /**
   * 释放分布式锁（使用 Lua 脚本确保原子性）
   * 如果 Redis 不支持 Lua 脚本，则使用降级策略
   */
  private async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    const luaSupported = await this.checkLuaScriptSupport();

    if (luaSupported) {
      // 策略 1：使用 Lua 脚本（原子操作）
      await this.releaseLockWithLua(lockKey, lockValue);
    } else {
      // 策略 2：使用 GET-DEL 两步操作（非原子，但可接受）
      await this.releaseLockWithGetDel(lockKey, lockValue);
    }
  }

  /**
   * 使用 Lua 脚本释放锁（原子操作）
   */
  private async releaseLockWithLua(lockKey: string, lockValue: string): Promise<void> {
    try {
      // Lua 脚本：只有持有锁的进程才能释放
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redis.eval(script, 1, lockKey, lockValue);
    } catch (error) {
      console.error('[CacheBreakthroughGuard] 使用 Lua 脚本释放锁失败:', error);
    }
  }

  /**
   * 使用 GET-DEL 两步操作释放锁（非原子，降级策略）
   * 虽然不是原子操作，但由于锁有 TTL，风险可控
   */
  private async releaseLockWithGetDel(lockKey: string, lockValue: string): Promise<void> {
    try {
      // 第 1 步：检查锁值是否匹配
      const currentValue = await this.redis.get(lockKey);
      if (currentValue === lockValue) {
        // 第 2 步：删除锁
        // 注意：这里存在竞态条件，但由于锁有 TTL，影响有限
        await this.redis.del(lockKey);
      }
    } catch (error) {
      console.error('[CacheBreakthroughGuard] 使用 GET-DEL 释放锁失败:', error);
    }
  }

  /**
   * 等待缓存被其他进程写入
   * 如果超时，降级执行 fetchFn
   */
  private async waitForCache<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const startWait = Date.now();
    const maxWaitTime = this.waitStrategy.maxWaitTime;
    const pollInterval = this.waitStrategy.pollInterval;

    while (Date.now() - startWait < maxWaitTime) {
      // 检查缓存是否已被写入
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const waitTime = Date.now() - startWait;
          this.updateWaitTime(waitTime);
          return JSON.parse(cached);
        }
      } catch (error) {
        console.warn('[CacheBreakthroughGuard] 检查缓存失败:', error);
      }

      // 等待一段时间后重试
      await this.sleep(pollInterval);
    }

    // 超时，降级执行 fetchFn
    this.metrics.lockTimeout++;
    const waitTime = Date.now() - startWait;
    this.updateWaitTime(waitTime);

    console.warn(
      `[CacheBreakthroughGuard] 等待缓存超时 (${waitTime}ms)，降级执行 fetchFn: ${key}`
    );

    return await fetchFn();
  }

  /**
   * 生成唯一的锁值（用于释放锁时验证）
   */
  private generateLockValue(): string {
    return `${process.pid}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 睡眠指定毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 更新等待时间统计
   */
  private updateWaitTime(waitTime: number): void {
    this.metrics.totalWaitTime += waitTime;
    const totalWaits = this.metrics.singleFlightHits + this.metrics.lockWaited;
    this.metrics.avgWaitTime = totalWaits > 0 ? this.metrics.totalWaitTime / totalWaits : 0;
  }

  /**
   * 获取统计指标
   */
  getMetrics(): GuardMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置统计指标
   */
  resetMetrics(): void {
    this.metrics = {
      singleFlightHits: 0,
      singleFlightMisses: 0,
      lockAcquired: 0,
      lockWaited: 0,
      lockTimeout: 0,
      totalWaitTime: 0,
      avgWaitTime: 0,
    };
  }

  /**
   * 获取等待策略配置
   */
  getWaitStrategy(): WaitStrategy {
    return { ...this.waitStrategy };
  }

  /**
   * 更新等待策略配置
   */
  updateWaitStrategy(strategy: Partial<WaitStrategy>): void {
    this.waitStrategy = {
      ...this.waitStrategy,
      ...strategy,
    };
  }

  /**
   * 清理所有飞行记录（用于测试或紧急情况）
   */
  clearFlights(): void {
    this.flights.clear();
    console.log('[CacheBreakthroughGuard] 已清理所有飞行记录');
  }

  /**
   * 获取当前飞行记录数量
   */
  getFlightCount(): number {
    return this.flights.size;
  }
}
