/**
 * Redis 不可用时的降级：不等待重连，直接跳过 L2 缓存与分布式锁
 */
import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { isRedisReady } from '@/lib/cache/redis-availability';
import { CacheBreakthroughGuard } from '@/lib/cache/cache-breakthrough-guard';
import { encryptPassword, decryptPassword } from '@/lib/database/encryption';

function fakeRedis(status: string) {
  return {
    status,
    connect: jest.fn(async () => undefined),
    set: jest.fn(async (..._args: any[]) => 'OK'),
    get: jest.fn(async (..._args: any[]) => null),
    eval: jest.fn(async (..._args: any[]) => 1),
    del: jest.fn(async (..._args: any[]) => 1),
  };
}

describe('isRedisReady', () => {
  it('只有 ready 时可用；尚未连接（lazyConnect）时触发后台连接', () => {
    expect(isRedisReady(fakeRedis('ready') as any)).toBe(true);

    const waiting = fakeRedis('wait');
    expect(isRedisReady(waiting as any)).toBe(false);
    expect(waiting.connect).toHaveBeenCalledTimes(1);

    const reconnecting = fakeRedis('reconnecting');
    expect(isRedisReady(reconnecting as any)).toBe(false);
    expect(reconnecting.connect).not.toHaveBeenCalled();
    expect(isRedisReady(null)).toBe(false);
  });
});

describe('CacheBreakthroughGuard', () => {
  it('Redis 不可用：不加锁、不轮询等待，直接获取数据并写缓存', async () => {
    const redis = fakeRedis('reconnecting');
    const guard = new CacheBreakthroughGuard(redis as any);
    const fetchFn = jest.fn(async () => ({ rows: 1 }));
    const cacheFn = jest.fn(async (..._args: any[]) => undefined);

    const started = Date.now();
    await expect(guard.getWithGuard('k', fetchFn, cacheFn)).resolves.toEqual({ rows: 1 });

    expect(Date.now() - started).toBeLessThan(500);
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(cacheFn).toHaveBeenCalledWith({ rows: 1 });
  });

  it('Redis 可用：加分布式锁后获取数据', async () => {
    const redis = fakeRedis('ready');
    const guard = new CacheBreakthroughGuard(redis as any);

    await guard.getWithGuard('k', async () => 1, async () => undefined);

    expect(redis.set).toHaveBeenCalledWith('lock:k', expect.any(String), 'EX', expect.any(Number), 'NX');
  });
});

describe('数据源密码加密', () => {
  it('空密码原样保存与读取；非空密码可往返', () => {
    expect(encryptPassword('')).toBe('');
    expect(decryptPassword('')).toBe('');

    const encrypted = encryptPassword('Reader-Pass-2026');
    expect(encrypted).not.toBe('Reader-Pass-2026');
    expect(decryptPassword(encrypted)).toBe('Reader-Pass-2026');
  });
});
