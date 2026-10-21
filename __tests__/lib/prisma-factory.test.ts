/**
 * PrismaClient 单例：生产环境也只创建一个实例（每个实例各有一个连接池）
 */
import { describe, it, expect, jest } from '@jest/globals';

const constructed = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      constructed(options);
    }
    $disconnect = jest.fn();
  },
}));

import { createPrismaClient } from '@/lib/di/factories/prisma.factory';

describe('createPrismaClient', () => {
  it('多次调用返回同一实例，只注册一次退出清理', () => {
    const originalEnv = process.env.NODE_ENV;
    const listeners = process.listenerCount('SIGTERM');
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      const first = createPrismaClient();
      const second = createPrismaClient();
      createPrismaClient();

      expect(second).toBe(first);
      expect(constructed).toHaveBeenCalledTimes(1);
      expect(constructed.mock.calls[0][0]).toMatchObject({ adapter: expect.objectContaining({ provider: 'mysql' }) });
      expect(process.listenerCount('SIGTERM')).toBe(listeners + 1);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      delete globalThis.prismaGlobal;
    }
  });
});
