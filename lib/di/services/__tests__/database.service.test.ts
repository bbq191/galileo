/**
 * DatabaseService 单元测试
 * 测试数据库服务的核心功能
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import { DatabaseService } from '../database.service';
import { DI_TOKENS } from '../../tokens';
import type { PrismaClient } from '@/app/generated/prisma';

/**
 * 创建 Mock PrismaClient
 */
function createMockPrismaClient(): jest.Mocked<PrismaClient> {
  return {
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
    dataSource: {
      count: jest.fn().mockResolvedValue(5),
    },
    databaseMeta: {
      count: jest.fn().mockResolvedValue(10),
    },
    tableMeta: {
      count: jest.fn().mockResolvedValue(50),
    },
    columnMeta: {
      count: jest.fn().mockResolvedValue(500),
    },
  } as any;
}

describe('DatabaseService', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let databaseService: DatabaseService;

  beforeEach(() => {
    // 清理容器
    container.clearInstances();

    // 创建 mock Prisma
    mockPrisma = createMockPrismaClient();

    // 注册 mock 到容器
    container.register(DI_TOKENS.PrismaClient, {
      useValue: mockPrisma,
    });

    // 解析服务
    databaseService = container.resolve(DatabaseService);
  });

  afterEach(() => {
    container.clearInstances();
  });

  describe('构造器注入', () => {
    test('应该正确注入 PrismaClient', () => {
      expect(databaseService.prisma).toBe(mockPrisma);
    });
  });

  describe('disconnect()', () => {
    test('应该调用 prisma.$disconnect()', async () => {
      await databaseService.disconnect();
      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
    });

    test('应该处理断开连接错误', async () => {
      const error = new Error('Disconnect failed');
      mockPrisma.$disconnect.mockRejectedValueOnce(error);

      await expect(databaseService.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('healthCheck()', () => {
    test('应该在数据库正常时返回 true', async () => {
      const result = await databaseService.healthCheck();
      expect(result).toBe(true);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    test('应该在数据库异常时返回 false', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await databaseService.healthCheck();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getStats()', () => {
    test('应该返回数据库统计信息', async () => {
      const stats = await databaseService.getStats();

      expect(stats).toEqual({
        dataSources: 5,
        databases: 10,
        tables: 50,
        columns: 500,
      });

      expect(mockPrisma.dataSource.count).toHaveBeenCalledTimes(1);
      expect(mockPrisma.databaseMeta.count).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tableMeta.count).toHaveBeenCalledTimes(1);
      expect(mockPrisma.columnMeta.count).toHaveBeenCalledTimes(1);
    });

    test('应该处理统计查询错误', async () => {
      const error = new Error('Query failed');
      mockPrisma.dataSource.count.mockRejectedValueOnce(error);

      await expect(databaseService.getStats()).rejects.toThrow('Query failed');
    });
  });

  describe('并发操作', () => {
    test('应该能处理并发的健康检查', async () => {
      const promises = Array(10)
        .fill(null)
        .map(() => databaseService.healthCheck());

      const results = await Promise.all(promises);

      expect(results.every((r) => r === true)).toBe(true);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(10);
    });

    test('应该能处理并发的统计查询', async () => {
      const promises = Array(5)
        .fill(null)
        .map(() => databaseService.getStats());

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((stats) => {
        expect(stats).toEqual({
          dataSources: 5,
          databases: 10,
          tables: 50,
          columns: 500,
        });
      });
    });
  });
});

/**
 * 运行测试
 */
async function runTests() {
  console.log('🧪 开始运行 DatabaseService 单元测试...\n');

  try {
    // 这里使用简化的测试运行器（不依赖 Jest）
    const tests = [
      { name: '构造器注入测试', fn: testConstructorInjection },
      { name: 'disconnect() 测试', fn: testDisconnect },
      { name: 'healthCheck() 测试', fn: testHealthCheck },
      { name: 'getStats() 测试', fn: testGetStats },
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
 * 简化的测试函数（不依赖 Jest）
 */
async function testConstructorInjection() {
  container.clearInstances();
  const mockPrisma = createMockPrismaClient();
  container.register(DI_TOKENS.PrismaClient, { useValue: mockPrisma });
  const service = container.resolve(DatabaseService);

  if (service.prisma !== mockPrisma) {
    throw new Error('PrismaClient 注入失败');
  }
}

async function testDisconnect() {
  container.clearInstances();
  const mockPrisma = createMockPrismaClient();
  container.register(DI_TOKENS.PrismaClient, { useValue: mockPrisma });
  const service = container.resolve(DatabaseService);

  await service.disconnect();

  if (mockPrisma.$disconnect.mock.calls.length !== 1) {
    throw new Error('$disconnect 未被正确调用');
  }
}

async function testHealthCheck() {
  container.clearInstances();
  const mockPrisma = createMockPrismaClient();
  container.register(DI_TOKENS.PrismaClient, { useValue: mockPrisma });
  const service = container.resolve(DatabaseService);

  const result = await service.healthCheck();

  if (!result) {
    throw new Error('健康检查应该返回 true');
  }

  // 测试失败情况
  mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Connection failed'));
  const failedResult = await service.healthCheck();

  if (failedResult) {
    throw new Error('健康检查失败时应该返回 false');
  }
}

async function testGetStats() {
  container.clearInstances();
  const mockPrisma = createMockPrismaClient();
  container.register(DI_TOKENS.PrismaClient, { useValue: mockPrisma });
  const service = container.resolve(DatabaseService);

  const stats = await service.getStats();

  if (
    stats.dataSources !== 5 ||
    stats.databases !== 10 ||
    stats.tables !== 50 ||
    stats.columns !== 500
  ) {
    throw new Error('统计数据不正确');
  }
}

/**
 * Mock Jest 接口（用于不依赖 Jest 运行）
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
