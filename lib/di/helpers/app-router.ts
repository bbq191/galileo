/**
 * App Router DI 辅助函数
 * 用于在 Next.js App Router API 中简化依赖注入
 */

import 'reflect-metadata';
import '../setup'; // 确保 DI 容器已初始化
import { getContainer } from '../container';
import { DI_TOKENS } from '../tokens';
import type { PrismaClient } from '@prisma/client';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { MultiLevelCache } from '@/lib/cache/multi-level-cache';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';

/**
 * 从 DI 容器解析服务
 * 类型安全的辅助函数
 */
export function resolve<T>(token: symbol): T {
  const container = getContainer();
  return container.resolve<T>(token);
}

/**
 * 获取常用服务的便捷函数
 */
export const getServices = () => {
  const container = getContainer();

  return {
    prisma: container.resolve<PrismaClient>(DI_TOKENS.PrismaClient),
    connectionManager: container.resolve<ConnectionManager>(DI_TOKENS.ConnectionManager),
    multiLevelCache: container.resolve<MultiLevelCache>(DI_TOKENS.MultiLevelCache),
    queryCacheManager: container.resolve<QueryCacheManager>(DI_TOKENS.QueryCacheManager),
    cacheInvalidationService: container.resolve<CacheInvalidationService>(DI_TOKENS.CacheInvalidationService),
  };
};

/**
 * 获取单个服务的便捷函数
 */
export const getService = {
  prisma: () => resolve<PrismaClient>(DI_TOKENS.PrismaClient),
  connectionManager: () => resolve<ConnectionManager>(DI_TOKENS.ConnectionManager),
  multiLevelCache: () => resolve<MultiLevelCache>(DI_TOKENS.MultiLevelCache),
  queryCacheManager: () => resolve<QueryCacheManager>(DI_TOKENS.QueryCacheManager),
  cacheInvalidationService: () => resolve<CacheInvalidationService>(DI_TOKENS.CacheInvalidationService),
};
