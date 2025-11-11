/**
 * CacheBreakthroughGuard 单元测试
 * 测试防缓存击穿机制的各种场景
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CacheBreakthroughGuard } from '../cache-breakthrough-guard';
import Redis from 'ioredis';

// Mock Redis
jest.mock('ioredis');

describe('CacheBreakthroughGuard', () => {
  let guard: CacheBreakthroughGuard;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    // 创建 Redis mock
    mockRedis = {
      set: jest.fn(),
      get: jest.fn(),
      eval: jest.fn(),
      del: jest.fn(),
    } as any;

    // 创建守卫实例
    guard = new CacheBreakthroughGuard(mockRedis);
  });

  afterEach(() => {
    // 清理飞行记录
    guard.clearFlights();
    guard.resetMetrics();
  });

  describe('SingleFlight 机制', () => {
    it('应该只执行一次 fetchFn（多个并发请求）', async () => {
      const fetchFn = jest.fn(async () => {
        await sleep(100);
        return 'test-data';
      });

      const cacheFn = jest.fn(async (data: any) => {});

      // 模拟分布式锁成功获取
      mockRedis.set.mockResolvedValue('OK' as any);

      // 同时发起 5 个请求
      const promises = Array(5)
        .fill(null)
        .map(() => guard.getWithGuard('test-key', fetchFn, cacheFn));

      const results = await Promise.all(promises);

      // 验证：fetchFn 只被调用一次
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // 验证：所有请求都获得了相同的结果
      results.forEach((result) => {
        expect(result).toBe('test-data');
      });

      // 验证：cacheFn 只被调用一次
      expect(cacheFn).toHaveBeenCalledTimes(1);

      // 验证指标
      const metrics = guard.getMetrics();
      expect(metrics.singleFlightMisses).toBe(1); // 首个请求
      expect(metrics.singleFlightHits).toBe(4); // 其余 4 个请求等待
    });

    it('应该处理 fetchFn 失败的情况', async () => {
      const fetchFn = jest.fn(async () => {
        throw new Error('Fetch failed');
      });

      const cacheFn = jest.fn(async (data: any) => {});

      // 模拟分布式锁成功获取
      mockRedis.set.mockResolvedValue('OK' as any);

      // 期望抛出异常
      await expect(guard.getWithGuard('test-key', fetchFn, cacheFn)).rejects.toThrow(
        'Fetch failed'
      );

      // 验证飞行记录被清理
      expect(guard.getFlightCount()).toBe(0);
    });
  });

  describe('分布式锁机制', () => {
    it('应该成功获取锁并执行 fetchFn', async () => {
      const fetchFn = jest.fn(async () => 'locked-data');
      const cacheFn = jest.fn(async (data: any) => {});

      // 模拟锁获取成功
      mockRedis.set.mockResolvedValue('OK' as any);
      mockRedis.eval.mockResolvedValue(1 as any); // 锁释放成功

      const result = await guard.getWithGuard('lock-key', fetchFn, cacheFn);

      expect(result).toBe('locked-data');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(cacheFn).toHaveBeenCalledTimes(1);
      expect(cacheFn).toHaveBeenCalledWith('locked-data');

      // 验证锁获取（使用 toHaveBeenCalled 而不是严格匹配参数）
      expect(mockRedis.set).toHaveBeenCalled();

      // 验证锁释放
      expect(mockRedis.eval).toHaveBeenCalled();

      // 验证指标
      const metrics = guard.getMetrics();
      expect(metrics.lockAcquired).toBe(1);
    });

    it('应该等待锁释放并从缓存读取', async () => {
      const fetchFn = jest.fn(async () => 'should-not-call');
      const cacheFn = jest.fn(async (data: any) => {});

      // 模拟锁获取失败（其他进程持有锁）
      mockRedis.set.mockResolvedValue(null as any);

      // 模拟缓存读取（其他进程已写入缓存）
      mockRedis.get
        .mockResolvedValueOnce(null) // 第一次轮询：缓存还未写入
        .mockResolvedValueOnce(null) // 第二次轮询：缓存还未写入
        .mockResolvedValueOnce(JSON.stringify('cached-data')); // 第三次轮询：缓存已写入

      const result = await guard.getWithGuard('wait-key', fetchFn, cacheFn);

      expect(result).toBe('cached-data');
      expect(fetchFn).not.toHaveBeenCalled(); // 未执行 fetchFn
      expect(cacheFn).not.toHaveBeenCalled(); // 未执行 cacheFn

      // 验证指标
      const metrics = guard.getMetrics();
      expect(metrics.lockWaited).toBe(1);
    });

    it('应该在等待超时后降级执行 fetchFn', async () => {
      const fetchFn = jest.fn(async () => 'fallback-data');
      const cacheFn = jest.fn(async (data: any) => {});

      // 更新等待策略：缩短超时时间
      guard.updateWaitStrategy({ maxWaitTime: 200, pollInterval: 50 });

      // 模拟锁获取失败
      mockRedis.set.mockResolvedValue(null as any);

      // 模拟缓存始终未写入
      mockRedis.get.mockResolvedValue(null);

      const result = await guard.getWithGuard('timeout-key', fetchFn, cacheFn);

      expect(result).toBe('fallback-data');
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // 验证指标
      const metrics = guard.getMetrics();
      expect(metrics.lockWaited).toBe(1);
      expect(metrics.lockTimeout).toBe(1);
    });
  });

  describe('统计指标', () => {
    it('应该正确记录各项指标', async () => {
      const fetchFn = jest.fn(async () => 'data');
      const cacheFn = jest.fn(async (data: any) => {});

      mockRedis.set.mockResolvedValue('OK' as any);

      // 执行多次请求
      await guard.getWithGuard('key-1', fetchFn, cacheFn);
      await guard.getWithGuard('key-2', fetchFn, cacheFn);

      const metrics = guard.getMetrics();

      expect(metrics.singleFlightMisses).toBeGreaterThan(0);
      expect(metrics.lockAcquired).toBeGreaterThan(0);
    });

    it('应该计算平均等待时间', async () => {
      const fetchFn = jest.fn(async () => {
        await sleep(50);
        return 'data';
      });
      const cacheFn = jest.fn(async (data: any) => {});

      mockRedis.set.mockResolvedValue('OK' as any);

      // 首个请求执行 fetchFn
      const promise1 = guard.getWithGuard('key', fetchFn, cacheFn);

      // 等待一小段时间确保首个请求已开始
      await sleep(10);

      // 第二个请求等待首个请求
      const promise2 = guard.getWithGuard('key', fetchFn, cacheFn);

      await Promise.all([promise1, promise2]);

      const metrics = guard.getMetrics();
      expect(metrics.avgWaitTime).toBeGreaterThan(0);
    });

    it('应该能够重置指标', () => {
      guard.resetMetrics();
      const metrics = guard.getMetrics();

      expect(metrics.singleFlightHits).toBe(0);
      expect(metrics.singleFlightMisses).toBe(0);
      expect(metrics.lockAcquired).toBe(0);
      expect(metrics.lockWaited).toBe(0);
      expect(metrics.lockTimeout).toBe(0);
      expect(metrics.totalWaitTime).toBe(0);
      expect(metrics.avgWaitTime).toBe(0);
    });
  });

  describe('等待策略配置', () => {
    it('应该能够获取等待策略', () => {
      const strategy = guard.getWaitStrategy();

      expect(strategy.maxWaitTime).toBe(10000); // 默认 10 秒
      expect(strategy.pollInterval).toBe(100); // 默认 100ms
      expect(strategy.lockTTL).toBe(30); // 默认 30 秒
    });

    it('应该能够更新等待策略', () => {
      guard.updateWaitStrategy({
        maxWaitTime: 5000,
        pollInterval: 200,
        lockTTL: 60,
      });

      const strategy = guard.getWaitStrategy();

      expect(strategy.maxWaitTime).toBe(5000);
      expect(strategy.pollInterval).toBe(200);
      expect(strategy.lockTTL).toBe(60);
    });

    it('应该能够部分更新等待策略', () => {
      guard.updateWaitStrategy({ maxWaitTime: 8000 });

      const strategy = guard.getWaitStrategy();

      expect(strategy.maxWaitTime).toBe(8000);
      expect(strategy.pollInterval).toBe(100); // 保持默认
      expect(strategy.lockTTL).toBe(30); // 保持默认
    });
  });

  describe('飞行记录管理', () => {
    it('应该能够获取当前飞行记录数量', async () => {
      const fetchFn = jest.fn(async () => {
        await sleep(100);
        return 'data';
      });
      const cacheFn = jest.fn(async (data: any) => {});

      mockRedis.set.mockResolvedValue('OK' as any);

      // 启动一个长时间运行的请求
      const promise = guard.getWithGuard('key', fetchFn, cacheFn);

      // 检查飞行记录数量
      expect(guard.getFlightCount()).toBe(1);

      // 等待请求完成
      await promise;

      // 飞行记录应该被清理
      expect(guard.getFlightCount()).toBe(0);
    });

    it('应该能够手动清理所有飞行记录', async () => {
      const fetchFn = jest.fn(async () => {
        await sleep(100);
        return 'data';
      });
      const cacheFn = jest.fn(async (data: any) => {});

      mockRedis.set.mockResolvedValue('OK' as any);

      // 启动请求
      guard.getWithGuard('key', fetchFn, cacheFn);

      // 手动清理
      guard.clearFlights();

      // 验证清理成功
      expect(guard.getFlightCount()).toBe(0);
    });
  });
});

// 辅助函数：睡眠
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
