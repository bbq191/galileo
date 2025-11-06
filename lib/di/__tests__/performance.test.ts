/**
 * DI 容器性能测试
 * 测试 DI 容器的性能指标，包括初始化、解析和依赖注入速度
 */

import 'reflect-metadata';
import {
  createContainer,
  resetContainer,
  initializeContainer,
  resolve,
  registerSingleton,
  registerTransient,
  registerValue,
} from '../container';
import { DI_TOKENS } from '../tokens';
import { DatabaseService } from '../services/database.service';
import { CacheService } from '../services/cache.service';

/**
 * 性能测试结果
 */
interface PerformanceResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

/**
 * 性能测试基准
 */
const PERFORMANCE_BASELINES = {
  containerInit: 100, // ms
  singletonResolve: 1, // ms
  transientResolve: 2, // ms
  dependencyInjection: 5, // ms
};

/**
 * 运行性能测试
 */
async function runPerformanceTest(
  name: string,
  fn: () => void | Promise<void>,
  iterations: number = 1000
): Promise<PerformanceResult> {
  const times: number[] = [];

  // 预热
  for (let i = 0; i < Math.min(100, iterations); i++) {
    await fn();
  }

  // 正式测试
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / avgTime;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    opsPerSecond,
  };
}

/**
 * 格式化性能结果
 */
function formatResult(result: PerformanceResult): string {
  return `
📊 ${result.name}
   迭代次数: ${result.iterations}
   总耗时: ${result.totalTime.toFixed(2)} ms
   平均耗时: ${result.avgTime.toFixed(3)} ms
   最小耗时: ${result.minTime.toFixed(3)} ms
   最大耗时: ${result.maxTime.toFixed(3)} ms
   每秒操作数: ${result.opsPerSecond.toFixed(0)} ops/s
`;
}

/**
 * Mock 服务
 */
function createMockPrismaClient(): any {
  return {
    $disconnect: async () => {},
    $queryRaw: async () => [{ '1': 1 }],
    dataSource: { count: async () => 5 },
    databaseMeta: { count: async () => 10 },
    tableMeta: { count: async () => 50 },
    columnMeta: { count: async () => 500 },
  };
}

function createMockRedis(): any {
  return {
    get: async () => null,
    setex: async () => 'OK',
    del: async () => 1,
    flushdb: async () => 'OK',
  };
}

/**
 * 性能测试套件
 */
describe('DI 容器性能测试', () => {
  beforeEach(() => {
    resetContainer();
  });

  describe('容器初始化性能', () => {
    test('createContainer() 性能', async () => {
      const result = await runPerformanceTest(
        '创建容器',
        () => {
          createContainer();
        },
        1000
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(PERFORMANCE_BASELINES.containerInit);
    });

    test('initializeContainer() 性能', async () => {
      const result = await runPerformanceTest(
        '初始化容器（包含核心服务注册）',
        () => {
          resetContainer();
          initializeContainer();
        },
        100
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(PERFORMANCE_BASELINES.containerInit * 2);
    });
  });

  describe('服务注册性能', () => {
    test('registerValue() 性能', async () => {
      const result = await runPerformanceTest(
        '注册值服务',
        () => {
          const token = Symbol.for(`TestService${Math.random()}`);
          registerValue(token, { test: 'value' });
        },
        1000
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(1);
    });

    test('registerSingleton() 性能', async () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);

      const result = await runPerformanceTest(
        '注册单例服务',
        () => {
          resetContainer();
          registerValue(DI_TOKENS.PrismaClient, mockPrisma);
          registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);
        },
        1000
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(2);
    });
  });

  describe('服务解析性能', () => {
    test('单例服务解析性能（首次）', async () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

      const result = await runPerformanceTest(
        '单例服务首次解析',
        () => {
          resetContainer();
          registerValue(DI_TOKENS.PrismaClient, mockPrisma);
          registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);
          resolve<DatabaseService>(DI_TOKENS.DatabaseService);
        },
        1000
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(PERFORMANCE_BASELINES.singletonResolve * 5);
    });

    test('单例服务解析性能（缓存）', async () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

      // 预先解析一次
      resolve<DatabaseService>(DI_TOKENS.DatabaseService);

      const result = await runPerformanceTest(
        '单例服务缓存解析',
        () => {
          resolve<DatabaseService>(DI_TOKENS.DatabaseService);
        },
        10000
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(PERFORMANCE_BASELINES.singletonResolve);
    });

    test('瞬态服务解析性能', async () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerTransient(DI_TOKENS.DatabaseService, DatabaseService);

      const result = await runPerformanceTest(
        '瞬态服务解析',
        () => {
          resolve<DatabaseService>(DI_TOKENS.DatabaseService);
        },
        1000
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(PERFORMANCE_BASELINES.transientResolve);
    });
  });

  describe('依赖注入性能', () => {
    test('单层依赖注入性能', async () => {
      const mockPrisma = createMockPrismaClient();

      const result = await runPerformanceTest(
        '单层依赖注入（DatabaseService -> PrismaClient）',
        () => {
          resetContainer();
          registerValue(DI_TOKENS.PrismaClient, mockPrisma);
          registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);
          resolve<DatabaseService>(DI_TOKENS.DatabaseService);
        },
        1000
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(PERFORMANCE_BASELINES.dependencyInjection);
    });

    test('多层依赖注入性能', async () => {
      const mockPrisma = createMockPrismaClient();
      const mockRedis = createMockRedis();

      const result = await runPerformanceTest(
        '多层依赖注入（CacheService -> Redis）',
        () => {
          resetContainer();
          registerValue(DI_TOKENS.PrismaClient, mockPrisma);
          registerValue(DI_TOKENS.RedisClient, mockRedis);
          registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);
          registerSingleton(DI_TOKENS.CacheService, CacheService);
          resolve<DatabaseService>(DI_TOKENS.DatabaseService);
          resolve<CacheService>(DI_TOKENS.CacheService);
        },
        1000
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(PERFORMANCE_BASELINES.dependencyInjection * 2);
    });
  });

  describe('并发性能', () => {
    test('并发解析单例服务', async () => {
      const mockPrisma = createMockPrismaClient();
      registerValue(DI_TOKENS.PrismaClient, mockPrisma);
      registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

      const result = await runPerformanceTest(
        '并发解析单例服务（10个并发）',
        async () => {
          const promises = Array(10)
            .fill(null)
            .map(() => Promise.resolve(resolve<DatabaseService>(DI_TOKENS.DatabaseService)));
          await Promise.all(promises);
        },
        100
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(PERFORMANCE_BASELINES.singletonResolve * 10);
    });

    test('并发注册和解析', async () => {
      const result = await runPerformanceTest(
        '并发注册和解析（10个服务）',
        async () => {
          resetContainer();
          const tokens = Array(10)
            .fill(null)
            .map((_, i) => Symbol.for(`Service${i}`));
          tokens.forEach((token) => {
            registerValue(token, { id: Math.random() });
          });
          await Promise.all(tokens.map((token) => Promise.resolve(resolve(token))));
        },
        100
      );

      console.log(formatResult(result));

      expect(result.avgTime).toBeLessThan(50);
    });
  });

  describe('内存性能', () => {
    test('大量服务注册的内存影响', async () => {
      const memBefore = process.memoryUsage().heapUsed;

      resetContainer();

      // 注册 1000 个服务
      for (let i = 0; i < 1000; i++) {
        const token = Symbol.for(`Service${i}`);
        registerValue(token, { id: i, data: `data-${i}` });
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = (memAfter - memBefore) / 1024 / 1024; // MB

      console.log(`\n📊 内存使用情况:`);
      console.log(`   注册前: ${(memBefore / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   注册后: ${(memAfter / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   差异: ${memDiff.toFixed(2)} MB`);

      // 1000个服务不应该占用超过 10MB 内存
      expect(memDiff).toBeLessThan(10);
    });
  });
});

/**
 * 性能基准比较测试
 */
describe('性能基准比较', () => {
  test('DI 容器 vs 直接实例化', async () => {
    const mockPrisma = createMockPrismaClient();

    // 测试 DI 容器
    registerValue(DI_TOKENS.PrismaClient, mockPrisma);
    registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

    const diResult = await runPerformanceTest(
      'DI 容器解析',
      () => {
        resolve<DatabaseService>(DI_TOKENS.DatabaseService);
      },
      10000
    );

    // 测试直接实例化
    const directResult = await runPerformanceTest(
      '直接实例化',
      () => {
        new DatabaseService(mockPrisma);
      },
      10000
    );

    console.log('\n📊 性能对比:');
    console.log(formatResult(diResult));
    console.log(formatResult(directResult));

    const overhead = ((diResult.avgTime - directResult.avgTime) / directResult.avgTime) * 100;
    console.log(`\n⚡ DI 容器开销: ${overhead.toFixed(2)}%`);

    // DI 容器开销应该小于 500%
    expect(overhead).toBeLessThan(500);
  });
});

/**
 * 运行所有性能测试
 */
async function runAllPerformanceTests() {
  console.log('🚀 开始运行 DI 容器性能测试...\n');

  const startTime = performance.now();

  try {
    console.log('1️⃣ 容器初始化性能测试');
    await testContainerInitPerformance();

    console.log('\n2️⃣ 服务解析性能测试');
    await testServiceResolvePerformance();

    console.log('\n3️⃣ 依赖注入性能测试');
    await testDependencyInjectionPerformance();

    console.log('\n4️⃣ 并发性能测试');
    await testConcurrentPerformance();

    console.log('\n5️⃣ 性能基准对比测试');
    await testPerformanceBaseline();

    const endTime = performance.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n✅ 所有性能测试完成！总耗时: ${totalTime}s`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 性能测试失败:', error);
    process.exit(1);
  }
}

async function testContainerInitPerformance() {
  const result = await runPerformanceTest('容器初始化', () => {
    resetContainer();
    initializeContainer();
  }, 100);

  console.log(formatResult(result));

  if (result.avgTime >= PERFORMANCE_BASELINES.containerInit * 2) {
    throw new Error('容器初始化性能不达标');
  }
}

async function testServiceResolvePerformance() {
  const mockPrisma = createMockPrismaClient();
  registerValue(DI_TOKENS.PrismaClient, mockPrisma);
  registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

  const result = await runPerformanceTest('单例服务解析', () => {
    resolve<DatabaseService>(DI_TOKENS.DatabaseService);
  }, 10000);

  console.log(formatResult(result));

  if (result.avgTime >= PERFORMANCE_BASELINES.singletonResolve) {
    throw new Error('服务解析性能不达标');
  }
}

async function testDependencyInjectionPerformance() {
  const mockPrisma = createMockPrismaClient();

  const result = await runPerformanceTest('依赖注入', () => {
    resetContainer();
    registerValue(DI_TOKENS.PrismaClient, mockPrisma);
    registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);
    resolve<DatabaseService>(DI_TOKENS.DatabaseService);
  }, 1000);

  console.log(formatResult(result));

  if (result.avgTime >= PERFORMANCE_BASELINES.dependencyInjection) {
    throw new Error('依赖注入性能不达标');
  }
}

async function testConcurrentPerformance() {
  const mockPrisma = createMockPrismaClient();
  registerValue(DI_TOKENS.PrismaClient, mockPrisma);
  registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

  const result = await runPerformanceTest('并发解析', async () => {
    const promises = Array(10)
      .fill(null)
      .map(() => Promise.resolve(resolve<DatabaseService>(DI_TOKENS.DatabaseService)));
    await Promise.all(promises);
  }, 100);

  console.log(formatResult(result));

  if (result.avgTime >= PERFORMANCE_BASELINES.singletonResolve * 10) {
    throw new Error('并发解析性能不达标');
  }
}

async function testPerformanceBaseline() {
  const mockPrisma = createMockPrismaClient();
  registerValue(DI_TOKENS.PrismaClient, mockPrisma);
  registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

  const diResult = await runPerformanceTest('DI 容器', () => {
    resolve<DatabaseService>(DI_TOKENS.DatabaseService);
  }, 10000);

  const directResult = await runPerformanceTest('直接实例化', () => {
    new DatabaseService(mockPrisma);
  }, 10000);

  console.log('\n性能对比:');
  console.log(formatResult(diResult));
  console.log(formatResult(directResult));

  const overhead = ((diResult.avgTime - directResult.avgTime) / directResult.avgTime) * 100;
  console.log(`DI 容器开销: ${overhead.toFixed(2)}%`);
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  runAllPerformanceTests().catch(console.error);
}
