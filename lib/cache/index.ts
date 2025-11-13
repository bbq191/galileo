/**
 * 缓存模块导出
 */

export { getRedisClient, closeRedisClient, checkRedisHealth } from './redis-client';
export { multiLevelCache, MultiLevelCache } from './multi-level-cache';
export { CacheWarmer } from './cache-warmer';
export { CacheBreakthroughGuard } from './cache-breakthrough-guard';
export {
  CACHE_CONFIGS,
  generateCacheKey,
  cacheStats,
  type CacheConfig,
  type CacheMetrics,
} from './cache-config';

// 查询缓存
export {
  queryCacheManager,
  QueryCacheManager,
  type QueryCacheStatistics,
} from './query-cache-manager';

// 缓存失效
export {
  cacheInvalidationService,
  CacheInvalidationService,
  InvalidationEvent,
  onMetadataSynced,
  onTableStructureChanged,
  onDatabaseSynced,
  onRelationshipChanged,
  clearAllCaches,
  type InvalidationOptions,
} from './cache-invalidation';
