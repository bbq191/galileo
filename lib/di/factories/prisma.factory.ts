/**
 * PrismaClient 工厂
 * 提供单例 PrismaClient 实例，支持热重载
 */

import { PrismaClient } from '@prisma/client';
import { createLazyMariaDbAdapter } from '@/lib/prisma/mariadb-config';

/**
 * 全局类型扩展
 */
declare global {
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * 创建 PrismaClient 单例
 *
 * 所有环境都复用同一个实例：DI 容器每次解析都会调用本函数，若生产环境每次新建，
 * 每个实例都会创建自己的连接池（驱动适配器的连接池会预先建满 connectionLimit 个连接），
 * 很快超过 MySQL 的 max_connections。开发环境热重载时模块会重新执行，同样依赖 globalThis 复用。
 */
export function createPrismaClient(): PrismaClient {
  if (globalThis.prismaGlobal) {
    return globalThis.prismaGlobal;
  }

  const prisma = new PrismaClient({
    // Prisma 7 起必须通过驱动适配器连接数据库，见 lib/prisma/mariadb-config.ts
    adapter: createLazyMariaDbAdapter(),
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
  globalThis.prismaGlobal = prisma;

  // 注册清理钩子（仅首次创建时注册一次）
  const cleanup = async () => {
    await prisma.$disconnect();
  };

  if (typeof process !== 'undefined') {
    process.on('beforeExit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  return prisma;
}

/**
 * 获取 PrismaClient 实例（向后兼容）
 */
export function getPrismaClient(): PrismaClient {
  return createPrismaClient();
}
