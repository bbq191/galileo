/**
 * PrismaClient 工厂
 * 提供单例 PrismaClient 实例，支持热重载
 */

import { PrismaClient } from '@prisma/client';

/**
 * 全局类型扩展
 */
declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * 创建 PrismaClient 单例
 * 避免开发环境热重载时创建多个实例
 */
export function createPrismaClient(): PrismaClient {
  const prismaClientSingleton = () => {
    return new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  };

  const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

  // 在开发环境中保存到 global，避免热重载时重复创建
  if (process.env.NODE_ENV !== 'production') {
    globalThis.prismaGlobal = prisma;
  }

  // 注册清理钩子
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
