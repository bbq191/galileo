/**
 * 缓存配置
 * 定义不同数据类型的缓存策略
 */

export interface CacheLayerConfig {
  enabled: boolean;
  ttl: number; // 秒
}

export interface CacheConfig {
  key: string;
  L1: CacheLayerConfig; // 内存缓存
  L2: CacheLayerConfig; // Redis 缓存
  invalidateOn: string[]; // 失效事件
}

/**
 * 缓存配置映射
 */
export const CACHE_CONFIGS: Record<string, CacheConfig> = {
  // 表元数据（高频访问）
  table_meta: {
    key: 'metadata:table:{id}:{version}',
    L1: { enabled: true, ttl: 60 }, // 1分钟
    L2: { enabled: true, ttl: 600 }, // 10分钟
    invalidateOn: ['table_structure_changed', 'manual_sync'],
  },

  // 数据库元数据
  database_meta: {
    key: 'metadata:database:{id}',
    L1: { enabled: true, ttl: 120 }, // 2分钟
    L2: { enabled: true, ttl: 1800 }, // 30分钟
    invalidateOn: ['database_synced', 'manual_sync'],
  },

  // 字段元数据
  column_meta: {
    key: 'metadata:column:table:{tableId}',
    L1: { enabled: true, ttl: 60 },
    L2: { enabled: true, ttl: 600 },
    invalidateOn: ['table_structure_changed', 'manual_sync'],
  },

  // 关系图谱（计算密集）
  relationship_graph: {
    key: 'graph:table:{id}:depth:{depth}:inferred:{includeInferred}',
    L1: { enabled: true, ttl: 120 }, // 2分钟
    L2: { enabled: true, ttl: 1800 }, // 30分钟
    invalidateOn: ['relationship_verified', 'relationship_added', 'manual_sync'],
  },

  // 显式关系
  explicit_relationships: {
    key: 'relationships:explicit:table:{tableId}',
    L1: { enabled: true, ttl: 120 },
    L2: { enabled: true, ttl: 1800 },
    invalidateOn: ['relationship_added', 'manual_sync'],
  },

  // 推断关系
  inferred_relationships: {
    key: 'relationships:inferred:table:{tableId}:minConf:{minConfidence}',
    L1: { enabled: true, ttl: 60 },
    L2: { enabled: true, ttl: 600 },
    invalidateOn: ['relationship_inferred', 'relationship_verified', 'manual_sync'],
  },

  // AI语义标注（昂贵，长期缓存）
  semantic_annotation: {
    key: 'semantic:column:{id}',
    L1: { enabled: false, ttl: 0 }, // 不占用内存
    L2: { enabled: true, ttl: 86400 }, // 24小时
    invalidateOn: ['column_modified', 'manual_update'],
  },

  // 全文搜索结果
  search_result: {
    key: 'search:{query_hash}',
    L1: { enabled: true, ttl: 30 },
    L2: { enabled: true, ttl: 300 }, // 5分钟
    invalidateOn: ['metadata_synced'],
  },

  // 表列表（分页）
  tables_paginated: {
    key: 'tables:list:db:{databaseId}:page:{page}:limit:{limit}:search:{search}',
    L1: { enabled: true, ttl: 60 },
    L2: { enabled: true, ttl: 300 },
    invalidateOn: ['table_added', 'table_removed', 'manual_sync'],
  },

  // 数据库列表
  databases_list: {
    key: 'databases:list:source:{sourceId}',
    L1: { enabled: true, ttl: 120 },
    L2: { enabled: true, ttl: 600 },
    invalidateOn: ['database_added', 'database_removed', 'manual_sync'],
  },
};

/**
 * 生成缓存键
 * @param configKey 配置键
 * @param params 参数对象
 */
export function generateCacheKey(configKey: string, params: Record<string, any>): string {
  const config = CACHE_CONFIGS[configKey];
  if (!config) {
    throw new Error(`Unknown cache config key: ${configKey}`);
  }

  let key = config.key;
  // 替换占位符
  Object.entries(params).forEach(([param, value]) => {
    key = key.replace(`{${param}}`, String(value));
  });

  return key;
}

/**
 * 缓存性能指标
 */
export interface CacheMetrics {
  hits: number; // 缓存命中次数
  misses: number; // 缓存未命中次数
  l1Hits: number; // L1 命中次数
  l2Hits: number; // L2 命中次数
  sets: number; // 缓存写入次数
  invalidations: number; // 缓存失效次数
}

/**
 * 缓存统计
 */
export class CacheStats {
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    l1Hits: 0,
    l2Hits: 0,
    sets: 0,
    invalidations: 0,
  };

  recordHit(layer: 'L1' | 'L2'): void {
    this.metrics.hits++;
    if (layer === 'L1') {
      this.metrics.l1Hits++;
    } else {
      this.metrics.l2Hits++;
    }
  }

  recordMiss(): void {
    this.metrics.misses++;
  }

  recordSet(): void {
    this.metrics.sets++;
  }

  recordInvalidation(): void {
    this.metrics.invalidations++;
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  getHitRate(): number {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? this.metrics.hits / total : 0;
  }

  reset(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      l1Hits: 0,
      l2Hits: 0,
      sets: 0,
      invalidations: 0,
    };
  }
}

// 全局缓存统计实例
export const cacheStats = new CacheStats();
