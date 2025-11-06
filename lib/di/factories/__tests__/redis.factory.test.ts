/**
 * RedisClient 工厂测试
 * 测试 Redis 客户端的单例模式和配置管理
 */

import { createRedisClient, checkRedisHealth, type RedisFactoryConfig } from '../redis.factory';
import type { Redis } from 'ioredis';

describe('RedisClient 工厂', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      REDIS_DB: process.env.REDIS_DB,
    };

    // 清理 global redis 实例
    (globalThis as any).redisGlobal = undefined;
  });

  afterEach(() => {
    // 恢复环境变量
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });

    // 清理 global redis 实例
    (globalThis as any).redisGlobal = undefined;
  });

  describe('createRedisClient()', () => {
    test('应该创建 Redis 客户端实例', () => {
      const redis = createRedisClient();

      expect(redis).toBeDefined();
      expect(redis.get).toBeDefined();
      expect(redis.set).toBeDefined();
      expect(redis.quit).toBeDefined();
    });

    test('应该使用默认配置', () => {
      const redis = createRedisClient();

      expect(redis).toBeDefined();
      // 验证连接配置（通过 options 属性）
      const options = (redis as any).options;
      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
    });

    test('应该使用自定义配置', () => {
      const config: RedisFactoryConfig = {
        host: '192.168.1.100',
        port: 6380,
        password: 'test-password',
        db: 2,
      };

      const redis = createRedisClient(config);

      expect(redis).toBeDefined();
      const options = (redis as any).options;
      expect(options.host).toBe('192.168.1.100');
      expect(options.port).toBe(6380);
    });

    test('应该使用环境变量配置', () => {
      process.env.REDIS_HOST = 'redis.example.com';
      process.env.REDIS_PORT = '6381';
      process.env.REDIS_PASSWORD = 'env-password';
      process.env.REDIS_DB = '3';

      const redis = createRedisClient();

      const options = (redis as any).options;
      expect(options.host).toBe('redis.example.com');
      expect(options.port).toBe(6381);
    });

    test('自定义配置应该覆盖环境变量', () => {
      process.env.REDIS_HOST = 'env-host';
      process.env.REDIS_PORT = '6379';

      const config: RedisFactoryConfig = {
        host: 'custom-host',
        port: 6380,
      };

      const redis = createRedisClient(config);

      const options = (redis as any).options;
      expect(options.host).toBe('custom-host');
      expect(options.port).toBe(6380);
    });

    test('应该配置重试策略', () => {
      const redis = createRedisClient();

      const options = (redis as any).options;
      expect(options.retryStrategy).toBeDefined();
      expect(typeof options.retryStrategy).toBe('function');

      // 测试重试延迟计算
      const delay1 = options.retryStrategy(1);
      const delay2 = options.retryStrategy(10);
      const delay3 = options.retryStrategy(100);

      expect(delay1).toBe(50); // 1 * 50
      expect(delay2).toBe(500); // 10 * 50
      expect(delay3).toBe(2000); // Math.min(100 * 50, 2000)
    });

    test('应该配置最大重试次数', () => {
      const redis = createRedisClient();

      const options = (redis as any).options;
      expect(options.maxRetriesPerRequest).toBe(3);
    });
  });

  describe('单例模式', () => {
    test('多次调用应该返回相同实例（开发环境）', () => {
      process.env.NODE_ENV = 'development';

      const redis1 = createRedisClient();
      const redis2 = createRedisClient();

      expect(redis1).toBe(redis2);
      expect((globalThis as any).redisGlobal).toBe(redis1);
    });

    test('清除 globalThis 后应该创建新实例', () => {
      process.env.NODE_ENV = 'development';

      const redis1 = createRedisClient();
      (globalThis as any).redisGlobal = undefined;
      const redis2 = createRedisClient();

      expect(redis1).not.toBe(redis2);
    });

    test('生产环境不应该使用 globalThis 缓存', () => {
      process.env.NODE_ENV = 'production';

      const redis = createRedisClient();

      expect((globalThis as any).redisGlobal).toBeUndefined();
    });
  });

  describe('事件监听', () => {
    test('应该监听连接事件', () => {
      const redis = createRedisClient();

      // 验证事件监听器已注册
      const connectListeners = redis.listeners('connect');
      const errorListeners = redis.listeners('error');
      const readyListeners = redis.listeners('ready');

      expect(connectListeners.length).toBeGreaterThan(0);
      expect(errorListeners.length).toBeGreaterThan(0);
      expect(readyListeners.length).toBeGreaterThan(0);
    });

    test('connect 事件应该记录日志', () => {
      const consoleLogSpy = jest.fn();
      const originalLog = console.log;
      console.log = consoleLogSpy;

      const redis = createRedisClient();
      redis.emit('connect');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('已连接到 Redis'));

      console.log = originalLog;
    });

    test('error 事件应该记录日志', () => {
      const consoleErrorSpy = jest.fn();
      const originalError = console.error;
      console.error = consoleErrorSpy;

      const redis = createRedisClient();
      const testError = new Error('Test error');
      redis.emit('error', testError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('连接错误'),
        testError
      );

      console.error = originalError;
    });

    test('ready 事件应该记录日志', () => {
      const consoleLogSpy = jest.fn();
      const originalLog = console.log;
      console.log = consoleLogSpy;

      const redis = createRedisClient();
      redis.emit('ready');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('客户端就绪'));

      console.log = originalLog;
    });
  });

  describe('生命周期管理', () => {
    test('应该注册清理钩子', () => {
      const beforeListenerCount = process.listenerCount('beforeExit');

      const redis = createRedisClient();

      const afterListenerCount = process.listenerCount('beforeExit');

      expect(afterListenerCount).toBeGreaterThan(beforeListenerCount);
    });

    test('清理钩子应该调用 quit', async () => {
      const redis = createRedisClient();

      // Mock quit
      const quitSpy = jest.fn().mockResolvedValue('OK');
      redis.quit = quitSpy;

      // 触发 beforeExit 事件
      const beforeExitListeners = process.listeners('beforeExit');
      const cleanup = beforeExitListeners[beforeExitListeners.length - 1];

      if (typeof cleanup === 'function') {
        await cleanup();
      }

      expect(quitSpy).toHaveBeenCalled();
    });
  });

  describe('checkRedisHealth()', () => {
    test('应该在 Redis 正常时返回 true', async () => {
      const mockRedis = {
        ping: jest.fn().mockResolvedValue('PONG'),
      } as any;

      const result = await checkRedisHealth(mockRedis);

      expect(result).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    test('应该在 Redis 异常时返回 false', async () => {
      const consoleErrorSpy = jest.fn();
      const originalError = console.error;
      console.error = consoleErrorSpy;

      const mockRedis = {
        ping: jest.fn().mockRejectedValue(new Error('Connection failed')),
      } as any;

      const result = await checkRedisHealth(mockRedis);

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      console.error = originalError;
    });
  });
});

/**
 * 运行测试
 */
async function runTests() {
  console.log('🧪 开始运行 RedisClient 工厂测试...\n');

  try {
    const tests = [
      { name: 'createRedisClient() 基本功能', fn: testCreateRedisClient },
      { name: '默认配置测试', fn: testDefaultConfig },
      { name: '自定义配置测试', fn: testCustomConfig },
      { name: '环境变量配置测试', fn: testEnvConfig },
      { name: '单例模式测试', fn: testSingleton },
      { name: '重试策略测试', fn: testRetryStrategy },
      { name: 'checkRedisHealth() 测试', fn: testHealthCheck },
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
function testCreateRedisClient() {
  (globalThis as any).redisGlobal = undefined;

  const redis = createRedisClient();

  if (!redis) {
    throw new Error('createRedisClient 返回 undefined');
  }

  if (typeof redis.get !== 'function') {
    throw new Error('Redis 缺少 get 方法');
  }

  if (typeof redis.quit !== 'function') {
    throw new Error('Redis 缺少 quit 方法');
  }
}

function testDefaultConfig() {
  (globalThis as any).redisGlobal = undefined;
  delete process.env.REDIS_HOST;
  delete process.env.REDIS_PORT;

  const redis = createRedisClient();
  const options = (redis as any).options;

  if (options.host !== 'localhost') {
    throw new Error(`期望 host 为 localhost，实际为 ${options.host}`);
  }

  if (options.port !== 6379) {
    throw new Error(`期望 port 为 6379，实际为 ${options.port}`);
  }
}

function testCustomConfig() {
  (globalThis as any).redisGlobal = undefined;

  const config: RedisFactoryConfig = {
    host: '192.168.1.100',
    port: 6380,
  };

  const redis = createRedisClient(config);
  const options = (redis as any).options;

  if (options.host !== '192.168.1.100') {
    throw new Error(`期望 host 为 192.168.1.100，实际为 ${options.host}`);
  }

  if (options.port !== 6380) {
    throw new Error(`期望 port 为 6380，实际为 ${options.port}`);
  }
}

function testEnvConfig() {
  (globalThis as any).redisGlobal = undefined;
  process.env.REDIS_HOST = 'env-host';
  process.env.REDIS_PORT = '6381';

  const redis = createRedisClient();
  const options = (redis as any).options;

  if (options.host !== 'env-host') {
    throw new Error(`期望 host 为 env-host，实际为 ${options.host}`);
  }

  if (options.port !== 6381) {
    throw new Error(`期望 port 为 6381，实际为 ${options.port}`);
  }

  delete process.env.REDIS_HOST;
  delete process.env.REDIS_PORT;
}

function testSingleton() {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  (globalThis as any).redisGlobal = undefined;

  const redis1 = createRedisClient();
  const redis2 = createRedisClient();

  if (redis1 !== redis2) {
    process.env.NODE_ENV = originalEnv;
    throw new Error('开发环境应该返回相同的实例');
  }

  if ((globalThis as any).redisGlobal !== redis1) {
    process.env.NODE_ENV = originalEnv;
    throw new Error('开发环境应该缓存到 globalThis');
  }

  process.env.NODE_ENV = originalEnv;
}

function testRetryStrategy() {
  (globalThis as any).redisGlobal = undefined;

  const redis = createRedisClient();
  const options = (redis as any).options;

  if (typeof options.retryStrategy !== 'function') {
    throw new Error('retryStrategy 应该是函数');
  }

  const delay1 = options.retryStrategy(1);
  const delay2 = options.retryStrategy(10);
  const delay3 = options.retryStrategy(100);

  if (delay1 !== 50) {
    throw new Error(`期望 delay1 为 50，实际为 ${delay1}`);
  }

  if (delay2 !== 500) {
    throw new Error(`期望 delay2 为 500，实际为 ${delay2}`);
  }

  if (delay3 !== 2000) {
    throw new Error(`期望 delay3 为 2000，实际为 ${delay3}`);
  }
}

async function testHealthCheck() {
  const mockRedis = {
    ping: (global as any).jest.fn().mockResolvedValue('PONG'),
  } as any;

  const result = await checkRedisHealth(mockRedis);

  if (!result) {
    throw new Error('健康检查应该返回 true');
  }

  if (mockRedis.ping.mock.calls.length !== 1) {
    throw new Error('ping 应该被调用一次');
  }

  // 测试失败情况
  const mockRedisError = {
    ping: (global as any).jest.fn().mockRejectedValue(new Error('Connection failed')),
  } as any;

  const failedResult = await checkRedisHealth(mockRedisError);

  if (failedResult) {
    throw new Error('健康检查失败时应该返回 false');
  }
}

/**
 * Mock Jest 和 expect
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
        mockRejectedValue: (error: any) => {
          mockFn.mockImplementation = () => Promise.reject(error);
          return mockFn;
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
  };

  (global as any).expect = (value: any) => ({
    toBeDefined: () => {
      if (value === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeUndefined: () => {
      if (value !== undefined) {
        throw new Error(`Expected value to be undefined, got ${value}`);
      }
    },
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${value} to be ${expected}`);
      }
    },
    not: {
      toBe: (expected: any) => {
        if (value === expected) {
          throw new Error(`Expected ${value} not to be ${expected}`);
        }
      },
    },
    toBeGreaterThan: (expected: number) => {
      if (value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toHaveBeenCalled: () => {
      if (!value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
    },
    toHaveBeenCalledWith: (...args: any[]) => {
      if (!value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
      const lastCall = value.mock.calls[value.mock.calls.length - 1];
      if (!args.every((arg, i) => typeof arg === 'object' && arg.asymmetricMatch ? arg.asymmetricMatch(lastCall[i]) : lastCall[i] === arg)) {
        throw new Error(`Expected function to have been called with ${JSON.stringify(args)}`);
      }
    },
  });

  (global as any).expect.stringContaining = (str: string) => ({
    asymmetricMatch: (other: any) => typeof other === 'string' && other.includes(str),
  });

  (global as any).describe = (name: string, fn: () => void) => fn();
  (global as any).test = (name: string, fn: () => void) => fn;
  (global as any).beforeEach = (fn: () => void) => fn;
  (global as any).afterEach = (fn: () => void) => fn;
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  runTests().catch(console.error);
}
