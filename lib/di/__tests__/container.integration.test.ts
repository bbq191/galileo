/**
 * DI 容器集成测试
 * 测试 DI 容器的核心功能和服务集成
 */

import 'reflect-metadata';
import { container as tsyringeContainer, injectable, inject } from 'tsyringe';
import {
  getContainer,
  createContainer,
  resetContainer,
  initializeContainer,
  resolve,
  isRegistered,
  registerSingleton,
  registerTransient,
  registerValue,
} from '../container';
import { DI_TOKENS } from '../tokens';
import { DatabaseService } from '../services/database.service';
import { CacheService } from '../services/cache.service';
import type { PrismaClient } from '@/app/generated/prisma';
import type { Redis } from 'ioredis';

/**
 * Mock PrismaClient
 */
function createMockPrismaClient(): jest.Mocked<PrismaClient> {
  return {
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
    dataSource: { count: jest.fn().mockResolvedValue(5) },
    databaseMeta: { count: jest.fn().mockResolvedValue(10) },
    tableMeta: { count: jest.fn().mockResolvedValue(50) },
    columnMeta: { count: jest.fn().mockResolvedValue(500) },
  } as any;
}

/**
 * Mock Redis
 */
function createMockRedis(): jest.Mocked<Redis> {
  return {
    get: jest.fn(),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    flushdb: jest.fn().mockResolvedValue('OK'),
  } as any;
}

describe('DI 容器集成测试', () => {
  beforeEach(() => {
    resetContainer();
    tsyringeContainer.clearInstances();
  });

  afterEach(() => {
    resetContainer();
    tsyringeContainer.clearInstances();
  });

  describe('容器生命周期', () => {
    test('getContainer() 应该返回全局容器', () => {
      const container1 = getContainer();
      const container2 = getContainer();

      expect(container1).toBe(container2);
    });

    test('createContainer() 应该创建新容器', () => {
      const container1 = createContainer();
      const container2 = createContainer();

      expect(container1).not.toBe(container2);
    });

    test('resetContainer() 应该清空容器', () => {
      const container1 = getContainer();
      resetContainer();
      const container2 = getContainer();

      expect(container1).not.toBe(container2);
    });

    test('initializeContainer() 应该初始化容器', () => {
      const container = initializeContainer();

      expect(container).toBeDefined();
      expect(isRegistered(DI_TOKENS.PrismaClient)).toBe(true);
    });

    test('initializeContainer() 多次调用应该返回同一实例', () => {
      const container1 = initializeContainer();
      const container2 = initializeContainer();

      expect(container1).toBe(container2);
    });

    test('initializeContainer() 支持调试模式', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      initializeContainer({ debug: true });

      expect(consoleLogSpy).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });

  describe('服务注册', () => {
    test('registerSingleton() 应该注册单例服务（使用类）', () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

      expect(isRegistered(DI_TOKENS.DatabaseService)).toBe(true);

      const service1 = resolve<DatabaseService>(DI_TOKENS.DatabaseService);
      const service2 = resolve<DatabaseService>(DI_TOKENS.DatabaseService);

      expect(service1).toBe(service2);
    });

    test('registerSingleton() 应该注册单例服务（使用工厂）', () => {
      let callCount = 0;
      const factory = () => {
        callCount++;
        return { id: callCount };
      };

      registerSingleton(DI_TOKENS.DatabaseService, undefined, factory);

      const service1 = resolve(DI_TOKENS.DatabaseService);
      const service2 = resolve(DI_TOKENS.DatabaseService);

      expect(service1).toBe(service2);
      expect(callCount).toBe(1); // 工厂只调用一次
    });

    test('registerTransient() 应该注册瞬态服务', () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerTransient(DI_TOKENS.DatabaseService, DatabaseService);

      const service1 = resolve<DatabaseService>(DI_TOKENS.DatabaseService);
      const service2 = resolve<DatabaseService>(DI_TOKENS.DatabaseService);

      expect(service1).not.toBe(service2);
    });

    test('registerValue() 应该注册值', () => {
      const value = { test: 'value' };
      registerValue(DI_TOKENS.DatabaseService, value);

      const resolved = resolve(DI_TOKENS.DatabaseService);

      expect(resolved).toBe(value);
    });

    test('注册时缺少参数应该抛出错误', () => {
      expect(() => {
        registerSingleton(DI_TOKENS.DatabaseService);
      }).toThrow();
    });
  });

  describe('服务解析', () => {
    test('resolve() 应该解析已注册的服务', () => {
      const value = { test: 'value' };
      registerValue(DI_TOKENS.DatabaseService, value);

      const resolved = resolve(DI_TOKENS.DatabaseService);

      expect(resolved).toBe(value);
    });

    test('resolve() 未注册的服务应该抛出错误', () => {
      expect(() => {
        resolve(Symbol.for('NonExistent'));
      }).toThrow();
    });

    test('isRegistered() 应该检查服务是否已注册', () => {
      expect(isRegistered(DI_TOKENS.DatabaseService)).toBe(false);

      registerValue(DI_TOKENS.DatabaseService, {});

      expect(isRegistered(DI_TOKENS.DatabaseService)).toBe(true);
    });
  });

  describe('依赖注入', () => {
    test('应该正确注入 PrismaClient 到 DatabaseService', () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

      const service = resolve<DatabaseService>(DI_TOKENS.DatabaseService);

      expect(service.prisma).toBe(mockPrisma);
    });

    test('应该正确注入 Redis 到 CacheService', () => {
      const mockRedis = createMockRedis();
      registerValue(DI_TOKENS.RedisClient, mockRedis);
      registerSingleton(DI_TOKENS.CacheService, CacheService);

      const service = resolve<CacheService>(DI_TOKENS.CacheService);

      expect((service as any).redis).toBe(mockRedis);
    });

    test('应该支持多级依赖注入', () => {
      // 注册依赖链: Value -> DatabaseService -> CustomService
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

      // 创建一个依赖 DatabaseService 的自定义服务
      @injectable()
      class CustomService {
        constructor(@inject(DI_TOKENS.DatabaseService) public db: DatabaseService) {}
      }

      const customToken = Symbol.for('CustomService');
      registerSingleton(customToken, CustomService as any);

      const service = resolve<CustomService>(customToken);

      expect(service.db).toBeInstanceOf(DatabaseService);
      expect(service.db.prisma).toBe(mockPrisma);
    });
  });

  describe('服务集成', () => {
    test('DatabaseService 应该能执行健康检查', async () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

      const service = resolve<DatabaseService>(DI_TOKENS.DatabaseService);
      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    test('DatabaseService 应该能获取统计信息', async () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

      const service = resolve<DatabaseService>(DI_TOKENS.DatabaseService);
      const stats = await service.getStats();

      expect(stats).toEqual({
        dataSources: 5,
        databases: 10,
        tables: 50,
        columns: 500,
      });
    });

    test('CacheService 应该能读写缓存', async () => {
      const mockRedis = createMockRedis();
      registerValue(DI_TOKENS.RedisClient, mockRedis);
      registerSingleton(DI_TOKENS.CacheService, CacheService);

      const service = resolve<CacheService>(DI_TOKENS.CacheService);

      const key = 'test-key';
      const value = { data: 'test-value' };

      await service.set(key, value);
      const result = await service.get(key);

      expect(result).toEqual(value);
    });

    test('多个服务应该能同时工作', async () => {
      const mockPrisma = createMockPrismaClient();
      const mockRedis = createMockRedis();

      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerValue(DI_TOKENS.RedisClient, mockRedis);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);
      registerSingleton(DI_TOKENS.CacheService, CacheService);

      const dbService = resolve<DatabaseService>(DI_TOKENS.DatabaseService);
      const cacheService = resolve<CacheService>(DI_TOKENS.CacheService);

      // 并发执行
      const [dbHealth, stats, _] = await Promise.all([
        dbService.healthCheck(),
        dbService.getStats(),
        cacheService.set('key', 'value'),
      ]);

      expect(dbHealth).toBe(true);
      expect(stats.dataSources).toBe(5);
    });
  });

  describe('容器隔离', () => {
    test('子容器应该独立于父容器', () => {
      const parentContainer = getContainer();
      const childContainer = createContainer();

      const value1 = { id: 1 };
      const value2 = { id: 2 };

      parentContainer.register(DI_TOKENS.DatabaseService, { useValue: value1 });
      childContainer.register(DI_TOKENS.DatabaseService, { useValue: value2 });

      const fromParent = parentContainer.resolve(DI_TOKENS.DatabaseService);
      const fromChild = childContainer.resolve(DI_TOKENS.DatabaseService);

      expect(fromParent).toBe(value1);
      expect(fromChild).toBe(value2);
    });
  });

  describe('错误处理', () => {
    test('解析未注册的服务应该提供清晰的错误信息', () => {
      const unknownToken = Symbol.for('Unknown');

      expect(() => {
        resolve(unknownToken);
      }).toThrow();
    });

    test('循环依赖应该被检测', () => {
      // 注意：tsyringe 会自动检测循环依赖
      // 这里只是验证容器的行为

      class ServiceA {
        constructor(public b: ServiceB) {}
      }

      class ServiceB {
        constructor(public a: ServiceA) {}
      }

      const tokenA = Symbol.for('ServiceA');
      const tokenB = Symbol.for('ServiceB');

      registerSingleton(tokenA, ServiceA as any);
      registerSingleton(tokenB, ServiceB as any);

      // 尝试解析会导致循环依赖错误
      expect(() => {
        resolve(tokenA);
      }).toThrow();
    });
  });
});

/**
 * 运行测试
 */
async function runTests() {
  console.log('🧪 开始运行 DI 容器集成测试...\n');

  try {
    const tests = [
      { name: '容器生命周期测试', fn: testContainerLifecycle },
      { name: '服务注册测试', fn: testServiceRegistration },
      { name: '服务解析测试', fn: testServiceResolution },
      { name: '依赖注入测试', fn: testDependencyInjection },
      { name: '服务集成测试', fn: testServiceIntegration },
      { name: '容器隔离测试', fn: testContainerIsolation },
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
async function testContainerLifecycle() {
  resetContainer();

  const container1 = getContainer();
  const container2 = getContainer();

  if (container1 !== container2) {
    throw new Error('getContainer 应该返回相同的实例');
  }

  resetContainer();
  const container3 = getContainer();

  if (container1 === container3) {
    throw new Error('resetContainer 后应该创建新实例');
  }
}

async function testServiceRegistration() {
  resetContainer();

  const value = { test: 'value' };
  registerValue(DI_TOKENS.DatabaseService, value);

  if (!isRegistered(DI_TOKENS.DatabaseService)) {
    throw new Error('服务应该已注册');
  }

  const resolved = resolve(DI_TOKENS.DatabaseService);

  if (resolved !== value) {
    throw new Error('解析的值不正确');
  }
}

async function testServiceResolution() {
  resetContainer();

  if (isRegistered(DI_TOKENS.DatabaseService)) {
    throw new Error('未注册的服务不应该返回 true');
  }

  registerValue(DI_TOKENS.DatabaseService, { test: 'value' });

  if (!isRegistered(DI_TOKENS.DatabaseService)) {
    throw new Error('已注册的服务应该返回 true');
  }
}

async function testDependencyInjection() {
  resetContainer();

  const mockPrisma = createMockPrismaClient();
  registerValue(DI_TOKENS.PrismaClient, mockPrisma);
  registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

  const service = resolve<DatabaseService>(DI_TOKENS.DatabaseService);

  if (service.prisma !== mockPrisma) {
    throw new Error('PrismaClient 注入失败');
  }
}

async function testServiceIntegration() {
  resetContainer();

  const mockPrisma = createMockPrismaClient();
  registerValue(DI_TOKENS.PrismaClient, mockPrisma);
  registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

  const service = resolve<DatabaseService>(DI_TOKENS.DatabaseService);
  const result = await service.healthCheck();

  if (!result) {
    throw new Error('健康检查应该返回 true');
  }

  const stats = await service.getStats();

  if (stats.dataSources !== 5) {
    throw new Error(`期望 dataSources 为 5，实际为 ${stats.dataSources}`);
  }
}

async function testContainerIsolation() {
  resetContainer();

  const parentContainer = getContainer();
  const childContainer = createContainer();

  const value1 = { id: 1 };
  const value2 = { id: 2 };

  parentContainer.register(DI_TOKENS.DatabaseService, { useValue: value1 });
  childContainer.register(DI_TOKENS.DatabaseService, { useValue: value2 });

  const fromParent = parentContainer.resolve(DI_TOKENS.DatabaseService);
  const fromChild = childContainer.resolve(DI_TOKENS.DatabaseService);

  if (fromParent !== value1) {
    throw new Error('父容器解析错误');
  }

  if (fromChild !== value2) {
    throw new Error('子容器解析错误');
  }
}

/**
 * Mock Jest
 */
if (typeof jest === 'undefined') {
  (global as any).jest = {
    fn: (impl?: any) => {
      const mockFn = impl || (() => {});
      const mock = Object.assign(mockFn, {
        mock: { calls: [], results: [] },
        mockResolvedValue: (value: any) => {
          mockFn.mockImplementation = () => Promise.resolve(value);
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

  (global as any).expect = (value: any) => ({
    toBeDefined: () => {
      if (value === undefined) throw new Error('Expected value to be defined');
    },
    toBe: (expected: any) => {
      if (value !== expected) throw new Error(`Expected ${value} to be ${expected}`);
    },
    not: {
      toBe: (expected: any) => {
        if (value === expected) throw new Error(`Expected ${value} not to be ${expected}`);
      },
    },
    toBeInstanceOf: (cls: any) => {
      if (!(value instanceof cls)) throw new Error(`Expected value to be instance of ${cls.name}`);
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toHaveBeenCalled: () => {
      if (!value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
    },
    toThrow: () => {
      let threw = false;
      try {
        if (typeof value === 'function') value();
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('Expected function to throw');
    },
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
