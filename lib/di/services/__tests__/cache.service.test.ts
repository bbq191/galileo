/**
 * CacheService 单元测试
 * 测试双层缓存服务的核心功能
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import { CacheService } from '../cache.service';
import { DI_TOKENS } from '../../tokens';
import type { Redis } from 'ioredis';

/**
 * 创建 Mock Redis 客户端
 */
function createMockRedis(): jest.Mocked<Redis> {
  return {
    get: jest.fn(),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    flushdb: jest.fn().mockResolvedValue('OK'),
  } as any;
}

describe('CacheService', () => {
  let mockRedis: jest.Mocked<Redis>;
  let cacheService: CacheService;

  beforeEach(() => {
    // 清理容器
    container.clearInstances();

    // 创建 mock Redis
    mockRedis = createMockRedis();

    // 注册 mock 到容器
    container.register(DI_TOKENS.RedisClient, {
      useValue: mockRedis,
    });

    // 解析服务
    cacheService = container.resolve(CacheService);
  });

  afterEach(() => {
    container.clearInstances();
  });

  describe('构造器注入', () => {
    test('应该正确注入 RedisClient', () => {
      expect((cacheService as any).redis).toBe(mockRedis);
    });
  });

  describe('get() - L1 缓存', () => {
    test('应该从 L1 缓存获取数据', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      // 先设置缓存
      await cacheService.set(key, value);

      // 清空 Redis mock 调用记录
      mockRedis.get.mockClear();

      // 从 L1 获取
      const result = await cacheService.get(key);

      expect(result).toEqual(value);
      expect(mockRedis.get).not.toHaveBeenCalled(); // 不应该调用 Redis
    });

    test('L1 缓存过期后应该返回 null', async () => {
      const key = 'expire-key';
      const value = { data: 'test-value' };

      // 设置 1 秒过期的缓存
      await cacheService.set(key, value, 1);

      // 等待 1.5 秒
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 尝试获取
      const result = await cacheService.get(key);

      expect(result).toBeNull();
    });
  });

  describe('get() - L2 缓存', () => {
    test('L1 miss 时应该从 L2 获取并回填 L1', async () => {
      const key = 'l2-key';
      const value = { data: 'l2-value' };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(value));

      const result = await cacheService.get(key);

      expect(result).toEqual(value);
      expect(mockRedis.get).toHaveBeenCalledWith(key);

      // 验证回填到 L1
      mockRedis.get.mockClear();
      const secondResult = await cacheService.get(key);
      expect(secondResult).toEqual(value);
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    test('L2 miss 时应该返回 null', async () => {
      const key = 'nonexistent-key';

      mockRedis.get.mockResolvedValueOnce(null);

      const result = await cacheService.get(key);

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith(key);
    });

    test('应该处理 L2 读取错误', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const key = 'error-key';

      mockRedis.get.mockRejectedValueOnce(new Error('Redis error'));

      const result = await cacheService.get(key);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('set()', () => {
    test('应该同时写入 L1 和 L2 缓存', async () => {
      const key = 'set-key';
      const value = { data: 'set-value' };
      const ttl = 3600;

      await cacheService.set(key, value, ttl);

      // 验证 L2 写入
      expect(mockRedis.setex).toHaveBeenCalledWith(key, ttl, JSON.stringify(value));

      // 验证 L1 写入
      const result = await cacheService.get(key);
      expect(result).toEqual(value);
    });

    test('应该使用默认 TTL', async () => {
      const key = 'default-ttl-key';
      const value = { data: 'value' };

      await cacheService.set(key, value);

      expect(mockRedis.setex).toHaveBeenCalledWith(key, 3600, JSON.stringify(value));
    });

    test('应该处理 L2 写入错误', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const key = 'error-set-key';
      const value = { data: 'value' };

      mockRedis.setex.mockRejectedValueOnce(new Error('Redis write error'));

      await cacheService.set(key, value);

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('delete()', () => {
    test('应该同时删除 L1 和 L2 缓存', async () => {
      const key = 'delete-key';
      const value = { data: 'value' };

      // 先设置缓存
      await cacheService.set(key, value);

      // 删除缓存
      await cacheService.delete(key);

      // 验证 L2 删除
      expect(mockRedis.del).toHaveBeenCalledWith(key);

      // 验证 L1 删除
      mockRedis.get.mockResolvedValueOnce(null);
      const result = await cacheService.get(key);
      expect(result).toBeNull();
    });

    test('应该处理 L2 删除错误', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const key = 'error-delete-key';

      mockRedis.del.mockRejectedValueOnce(new Error('Redis delete error'));

      await cacheService.delete(key);

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('clear()', () => {
    test('应该清空 L1 和 L2 缓存', async () => {
      // 设置多个缓存项
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');

      // 清空缓存
      await cacheService.clear();

      // 验证 L2 清空
      expect(mockRedis.flushdb).toHaveBeenCalled();

      // 验证 L1 清空
      mockRedis.get.mockResolvedValue(null);
      const result1 = await cacheService.get('key1');
      const result2 = await cacheService.get('key2');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    test('应该处理 L2 清空错误', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockRedis.flushdb.mockRejectedValueOnce(new Error('Redis flush error'));

      await cacheService.clear();

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('L1 缓存容量限制', () => {
    test('应该在达到容量限制时删除最旧条目', async () => {
      const L1_MAX = 1000;

      // 填充超过限制的条目
      for (let i = 0; i < L1_MAX + 10; i++) {
        await cacheService.set(`key-${i}`, `value-${i}`);
      }

      // 清空 Redis mock，只测试 L1
      mockRedis.get.mockClear();

      // 最早的条目应该被删除
      mockRedis.get.mockResolvedValueOnce(null);
      const oldResult = await cacheService.get('key-0');
      expect(oldResult).toBeNull();

      // 最新的条目应该存在
      const newResult = await cacheService.get(`key-${L1_MAX + 9}`);
      expect(newResult).toBe(`value-${L1_MAX + 9}`);
    });
  });

  describe('并发操作', () => {
    test('应该能处理并发读写', async () => {
      const promises = [];

      // 并发写入
      for (let i = 0; i < 10; i++) {
        promises.push(cacheService.set(`concurrent-${i}`, `value-${i}`));
      }

      await Promise.all(promises);

      // 并发读取
      const readPromises = [];
      for (let i = 0; i < 10; i++) {
        readPromises.push(cacheService.get(`concurrent-${i}`));
      }

      const results = await Promise.all(readPromises);

      results.forEach((result, i) => {
        expect(result).toBe(`value-${i}`);
      });
    });
  });
});

/**
 * 运行测试
 */
async function runTests() {
  console.log('🧪 开始运行 CacheService 单元测试...\n');

  try {
    const tests = [
      { name: '构造器注入测试', fn: testConstructorInjection },
      { name: 'L1 缓存读取测试', fn: testL1Cache },
      { name: 'L2 缓存读取测试', fn: testL2Cache },
      { name: 'set() 测试', fn: testSet },
      { name: 'delete() 测试', fn: testDelete },
      { name: 'clear() 测试', fn: testClear },
      { name: '并发操作测试', fn: testConcurrency },
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name} - 通过`);
        passed++;
      } catch (error) {
        console.error(`❌ ${test.name} - 失败:`, error);
        failed++;
      }
    }

    console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ 测试执行失败:', error);
    process.exit(1);
  }
}

/**
 * 简化的测试函数
 */
async function testConstructorInjection() {
  container.clearInstances();
  const mockRedis = createMockRedis();
  container.register(DI_TOKENS.RedisClient, { useValue: mockRedis });
  const service = container.resolve(CacheService);

  if ((service as any).redis !== mockRedis) {
    throw new Error('RedisClient 注入失败');
  }
}

async function testL1Cache() {
  container.clearInstances();
  const mockRedis = createMockRedis();
  container.register(DI_TOKENS.RedisClient, { useValue: mockRedis });
  const service = container.resolve(CacheService);

  const key = 'test-key';
  const value = { data: 'test-value' };

  await service.set(key, value);
  mockRedis.get.mockClear();

  const result = await service.get(key);

  if (JSON.stringify(result) !== JSON.stringify(value)) {
    throw new Error('L1 缓存读取失败');
  }

  if (mockRedis.get.mock.calls.length > 0) {
    throw new Error('不应该调用 Redis');
  }
}

async function testL2Cache() {
  container.clearInstances();
  const mockRedis = createMockRedis();
  container.register(DI_TOKENS.RedisClient, { useValue: mockRedis });
  const service = container.resolve(CacheService);

  const key = 'l2-key';
  const value = { data: 'l2-value' };

  mockRedis.get.mockResolvedValueOnce(JSON.stringify(value));

  const result = await service.get(key);

  if (JSON.stringify(result) !== JSON.stringify(value)) {
    throw new Error('L2 缓存读取失败');
  }
}

async function testSet() {
  container.clearInstances();
  const mockRedis = createMockRedis();
  container.register(DI_TOKENS.RedisClient, { useValue: mockRedis });
  const service = container.resolve(CacheService);

  const key = 'set-key';
  const value = { data: 'set-value' };
  const ttl = 3600;

  await service.set(key, value, ttl);

  if (mockRedis.setex.mock.calls.length !== 1) {
    throw new Error('setex 未被调用');
  }

  const result = await service.get(key);
  if (JSON.stringify(result) !== JSON.stringify(value)) {
    throw new Error('设置缓存后无法读取');
  }
}

async function testDelete() {
  container.clearInstances();
  const mockRedis = createMockRedis();
  container.register(DI_TOKENS.RedisClient, { useValue: mockRedis });
  const service = container.resolve(CacheService);

  const key = 'delete-key';
  await service.set(key, 'value');
  await service.delete(key);

  if (mockRedis.del.mock.calls.length !== 1) {
    throw new Error('del 未被调用');
  }
}

async function testClear() {
  container.clearInstances();
  const mockRedis = createMockRedis();
  container.register(DI_TOKENS.RedisClient, { useValue: mockRedis });
  const service = container.resolve(CacheService);

  await service.set('key1', 'value1');
  await service.set('key2', 'value2');
  await service.clear();

  if (mockRedis.flushdb.mock.calls.length !== 1) {
    throw new Error('flushdb 未被调用');
  }
}

async function testConcurrency() {
  container.clearInstances();
  const mockRedis = createMockRedis();
  container.register(DI_TOKENS.RedisClient, { useValue: mockRedis });
  const service = container.resolve(CacheService);

  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(service.set(`concurrent-${i}`, `value-${i}`));
  }

  await Promise.all(promises);

  const readPromises = [];
  for (let i = 0; i < 10; i++) {
    readPromises.push(service.get(`concurrent-${i}`));
  }

  const results = await Promise.all(readPromises);

  for (let i = 0; i < results.length; i++) {
    if (results[i] !== `value-${i}`) {
      throw new Error(`并发操作失败: key concurrent-${i}`);
    }
  }
}

/**
 * Mock Jest 接口
 */
if (typeof jest === 'undefined') {
  (global as any).jest = {
    fn: (impl?: any) => {
      const mockFn = impl || (() => {});
      const mock = Object.assign(mockFn, {
        mock: {
          calls: [] as any[],
          results: [] as any[],
        },
        mockResolvedValue: (value: any) => {
          mockFn.mockImplementation = () => Promise.resolve(value);
          return mockFn;
        },
        mockResolvedValueOnce: (value: any) => {
          const original = mockFn.mockImplementation;
          let called = false;
          mockFn.mockImplementation = (...args: any[]) => {
            if (!called) {
              called = true;
              return Promise.resolve(value);
            }
            return original ? original(...args) : Promise.resolve(undefined);
          };
          return mockFn;
        },
        mockRejectedValueOnce: (error: any) => {
          const original = mockFn.mockImplementation;
          let called = false;
          mockFn.mockImplementation = (...args: any[]) => {
            if (!called) {
              called = true;
              return Promise.reject(error);
            }
            return original ? original(...args) : Promise.resolve(undefined);
          };
          return mockFn;
        },
        mockClear: () => {
          mock.mock.calls = [];
          mock.mock.results = [];
        },
        mockImplementation: undefined as any,
      });

      return new Proxy(mock, {
        apply(target, thisArg, args) {
          target.mock.calls.push(args);
          const result = target.mockImplementation
            ? target.mockImplementation(...args)
            : impl
            ? impl(...args)
            : undefined;
          target.mock.results.push({ type: 'return', value: result });
          return result;
        },
      });
    },
    spyOn: (obj: any, method: string) => {
      const original = obj[method];
      const spy = (global as any).jest.fn(original);
      obj[method] = spy;
      spy.mockRestore = () => {
        obj[method] = original;
      };
      return spy;
    },
  };
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  runTests().catch(console.error);
}
