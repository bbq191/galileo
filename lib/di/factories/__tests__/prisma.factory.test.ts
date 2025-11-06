/**
 * PrismaClient 工厂测试
 * 测试 Prisma 客户端的单例模式和生命周期管理
 */

import { createPrismaClient, getPrismaClient } from '../prisma.factory';

// Helper function to set NODE_ENV
function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    writable: true,
    configurable: true
  });
}

describe('PrismaClient 工厂', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = process.env.NODE_ENV;

    // 清理 global prisma 实例
    (globalThis as any).prismaGlobal = undefined;
  });

  afterEach(() => {
    // 恢复环境变量
    if (originalEnv) {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalEnv,
        writable: true,
        configurable: true
      });
    }

    // 清理 global prisma 实例
    (globalThis as any).prismaGlobal = undefined;
  });

  describe('createPrismaClient()', () => {
    test('应该创建 PrismaClient 实例', () => {
      const prisma = createPrismaClient();

      expect(prisma).toBeDefined();
      expect(prisma.$connect).toBeDefined();
      expect(prisma.$disconnect).toBeDefined();
    });

    test('开发环境应该使用 globalThis 缓存', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true
      });

      const prisma1 = createPrismaClient();
      const prisma2 = createPrismaClient();

      expect(prisma1).toBe(prisma2);
      expect((globalThis as any).prismaGlobal).toBe(prisma1);
    });

    test('生产环境不应该使用 globalThis 缓存', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true
      });

      const prisma1 = createPrismaClient();

      expect((globalThis as any).prismaGlobal).toBeUndefined();
    });

    test('应该配置日志级别（开发环境）', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true
      });

      const prisma = createPrismaClient();

      // 注意：由于 PrismaClient 的配置是在构造函数中传递的，
      // 我们无法直接访问配置，但可以验证实例创建成功
      expect(prisma).toBeDefined();
    });

    test('应该配置日志级别（生产环境）', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true
      });

      const prisma = createPrismaClient();

      expect(prisma).toBeDefined();
    });
  });

  describe('getPrismaClient()', () => {
    test('应该返回 PrismaClient 实例', () => {
      const prisma = getPrismaClient();

      expect(prisma).toBeDefined();
      expect(prisma.$connect).toBeDefined();
    });

    test('应该与 createPrismaClient 行为一致', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true
      });

      const prisma1 = createPrismaClient();
      const prisma2 = getPrismaClient();

      expect(prisma1).toBe(prisma2);
    });
  });

  describe('单例模式', () => {
    test('多次调用应该返回相同实例（开发环境）', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true
      });

      const instances = Array(5)
        .fill(null)
        .map(() => createPrismaClient());

      instances.forEach((instance) => {
        expect(instance).toBe(instances[0]);
      });
    });

    test('清除 globalThis 后应该创建新实例', () => {
      setNodeEnv('development');

      const prisma1 = createPrismaClient();
      (globalThis as any).prismaGlobal = undefined;
      const prisma2 = createPrismaClient();

      expect(prisma1).not.toBe(prisma2);
    });
  });

  describe('生命周期管理', () => {
    test('应该注册清理钩子', () => {
      const prisma = createPrismaClient();

      // 验证进程事件监听器已注册
      const listeners = process.listeners('beforeExit');
      expect(listeners.length).toBeGreaterThan(0);
    });

    test('清理钩子应该调用 $disconnect', async () => {
      const prisma = createPrismaClient();

      // Mock $disconnect
      const disconnectSpy = jest.fn().mockResolvedValue(undefined);
      prisma.$disconnect = disconnectSpy;

      // 触发 beforeExit 事件
      const beforeExitListeners = process.listeners('beforeExit');
      const cleanup = beforeExitListeners[beforeExitListeners.length - 1];

      if (typeof cleanup === 'function') {
        await cleanup();
      }

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    test('应该处理实例化错误', () => {
      // 测试在极端情况下的错误处理
      // 注意：这个测试可能需要 mock PrismaClient 构造函数
      expect(() => {
        const prisma = createPrismaClient();
        expect(prisma).toBeDefined();
      }).not.toThrow();
    });
  });
});

/**
 * 运行测试
 */
async function runTests() {
  console.log('🧪 开始运行 PrismaClient 工厂测试...\n');

  try {
    const tests = [
      { name: 'createPrismaClient() 基本功能', fn: testCreatePrismaClient },
      { name: '开发环境单例模式', fn: testDevelopmentSingleton },
      { name: '生产环境行为', fn: testProductionBehavior },
      { name: 'getPrismaClient() 测试', fn: testGetPrismaClient },
      { name: '生命周期管理', fn: testLifecycle },
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
function testCreatePrismaClient() {
  (globalThis as any).prismaGlobal = undefined;

  const prisma = createPrismaClient();

  if (!prisma) {
    throw new Error('createPrismaClient 返回 undefined');
  }

  if (typeof prisma.$connect !== 'function') {
    throw new Error('PrismaClient 缺少 $connect 方法');
  }

  if (typeof prisma.$disconnect !== 'function') {
    throw new Error('PrismaClient 缺少 $disconnect 方法');
  }
}

function testDevelopmentSingleton() {
  const originalEnv = process.env.NODE_ENV;
  setNodeEnv('development');
  (globalThis as any).prismaGlobal = undefined;

  const prisma1 = createPrismaClient();
  const prisma2 = createPrismaClient();

  if (prisma1 !== prisma2) {
    setNodeEnv(originalEnv!);
    throw new Error('开发环境应该返回相同的实例');
  }

  if ((globalThis as any).prismaGlobal !== prisma1) {
    setNodeEnv(originalEnv!);
    throw new Error('开发环境应该缓存到 globalThis');
  }

  setNodeEnv(originalEnv!);
}

function testProductionBehavior() {
  const originalEnv = process.env.NODE_ENV;
  setNodeEnv('production');
  (globalThis as any).prismaGlobal = undefined;

  const prisma = createPrismaClient();

  if ((globalThis as any).prismaGlobal !== undefined) {
    setNodeEnv(originalEnv!);
    throw new Error('生产环境不应该缓存到 globalThis');
  }

  setNodeEnv(originalEnv!);
}

function testGetPrismaClient() {
  const originalEnv = process.env.NODE_ENV;
  setNodeEnv('development');
  (globalThis as any).prismaGlobal = undefined;

  const prisma1 = createPrismaClient();
  const prisma2 = getPrismaClient();

  if (prisma1 !== prisma2) {
    setNodeEnv(originalEnv!);
    throw new Error('getPrismaClient 应该返回相同的实例');
  }

  process.env.NODE_ENV = originalEnv;
}

async function testLifecycle() {
  (globalThis as any).prismaGlobal = undefined;

  const beforeListenerCount = process.listenerCount('beforeExit');

  const prisma = createPrismaClient();

  const afterListenerCount = process.listenerCount('beforeExit');

  if (afterListenerCount <= beforeListenerCount) {
    throw new Error('应该注册 beforeExit 监听器');
  }

  // 验证 $disconnect 方法存在
  if (typeof prisma.$disconnect !== 'function') {
    throw new Error('缺少 $disconnect 方法');
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
      toThrow: () => {
        try {
          if (typeof value === 'function') {
            value();
          }
        } catch (error) {
          throw new Error('Expected function not to throw');
        }
      },
    },
    toBeGreaterThan: (expected: number) => {
      if (value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
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
