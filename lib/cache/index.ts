/**
 * 缓存模块导出
 */

export { getRedisClient, closeRedisClient, checkRedisHealth } from './redis-client';
export { multiLevelCache, MultiLevelCache } from './multi-level-cache';
export { cacheWarmer, CacheWarmer } from './cache-warmer';
export {
  CACHE_CONFIGS,
  generateCacheKey,
  cacheStats,
  type CacheConfig,
  type CacheMetrics,
} from './cache-config';
