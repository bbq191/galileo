/**
 * MetadataOrchestrator - 元数据编排器
 *
 * 职责：
 * - 协调元数据准备阶段的完整工作流
 * - 管理数据源连接和元数据同步
 * - 提供元数据检索和上下文构建
 * - 处理元数据变更检测和缓存失效
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../tokens';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { MetadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import type { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import type { MetadataRepository } from '@/lib/metadata/storage/metadata-repository';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import type { QueryIntent } from '@/lib/nlp/intent-recognizer';
import type { MetadataContext } from '@/lib/metadata/types';

/**
 * 元数据同步选项
 */
export interface MetadataSyncOptions {
  /** 数据源 ID */
  dataSourceId: number;

  /** 要同步的数据库列表（可选，为空则同步所有） */
  databases?: string[];

  /** 是否推断关系 */
  inferRelationships?: boolean;

  /** 关系推断最小置信度 */
  minConfidence?: number;

  /** 是否记录变更历史 */
  trackChanges?: boolean;

  /** 是否强制全量同步 */
  forceFullSync?: boolean;
}

/**
 * 元数据同步结果
 */
export interface MetadataSyncResult {
  /** 是否成功 */
  success: boolean;

  /** 同步的数据库数量 */
  databaseCount: number;

  /** 同步的表数量 */
  tableCount: number;

  /** 同步的列数量 */
  columnCount: number;

  /** 推断的关系数量 */
  relationshipCount?: number;

  /** 检测到的变更 */
  changes?: {
    added: { databases: number; tables: number; columns: number };
    updated: { databases: number; tables: number; columns: number };
    removed: { databases: number; tables: number; columns: number };
  };

  /** 执行时长（毫秒） */
  duration: number;

  /** 错误信息 */
  error?: string;
}

/**
 * 元数据变更检测结果
 */
export interface MetadataChangeResult {
  /** 是否有变更 */
  hasChanges: boolean;

  /** 变更的数据库 */
  changedDatabases: string[];

  /** 变更的表 */
  changedTables: Array<{
    database: string;
    table: string;
    changeType: 'added' | 'modified' | 'removed';
  }>;

  /** 上次同步时间 */
  lastSyncTime?: Date;
}

/**
 * MetadataOrchestrator
 *
 * 元数据编排器，协调元数据准备阶段的所有操作
 */
@injectable()
export class MetadataOrchestrator {
  constructor(
    @inject(DI_TOKENS.ConnectionManager)
    private readonly connectionManager: ConnectionManager,

    @inject(DI_TOKENS.MetadataSyncService)
    private readonly syncService: MetadataSyncService,

    @inject(DI_TOKENS.MetadataRetriever)
    private readonly retriever: MetadataRetriever,

    @inject(DI_TOKENS.MetadataRepository)
    private readonly repository: MetadataRepository,

    @inject(DI_TOKENS.CacheInvalidationService)
    private readonly cacheInvalidation: CacheInvalidationService
  ) {}

  /**
   * 同步数据源元数据
   *
   * 执行完整的元数据同步流程：
   * 1. 验证连接
   * 2. 采集元数据
   * 3. 语义标注
   * 4. 推断关系
   * 5. 失效缓存
   *
   * @param options - 同步选项
   * @returns 同步结果
   */
  async syncDataSource(options: MetadataSyncOptions): Promise<MetadataSyncResult> {
    const startTime = Date.now();

    try {
      console.log(`[MetadataOrchestrator] Starting metadata sync for data source ${options.dataSourceId}`);

      // 1. 验证连接是否存在
      const connectionId = options.dataSourceId.toString();
      const hasConnection = await this.connectionManager.hasConnection(connectionId);

      if (!hasConnection) {
        console.log(`[MetadataOrchestrator] Connection not found, loading from database...`);
        await this.connectionManager.loadConnectionsFromDatabase();
      }

      // 2. 执行元数据同步
      const syncResult = await this.syncService.syncDataSource({
        dataSourceId: options.dataSourceId,
        databases: options.databases,
        inferRelationships: options.inferRelationships ?? true,
        minConfidence: options.minConfidence ?? 0.70,
        trackChanges: options.trackChanges ?? true,
      });

      // 3. 失效相关缓存
      console.log(`[MetadataOrchestrator] Invalidating metadata caches...`);
      await this.cacheInvalidation.invalidateMetadata({
        dataSourceId: options.dataSourceId,
        databases: options.databases,
      });

      const duration = Date.now() - startTime;

      console.log(`[MetadataOrchestrator] Sync completed in ${duration}ms`);

      return {
        success: true,
        databaseCount: syncResult.databaseCount,
        tableCount: syncResult.tableCount,
        columnCount: syncResult.columnCount,
        relationshipCount: syncResult.relationshipCount,
        changes: syncResult.changes,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[MetadataOrchestrator] Sync failed:`, error);

      return {
        success: false,
        databaseCount: 0,
        tableCount: 0,
        columnCount: 0,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * 刷新指定数据源的元数据
   *
   * @param dataSourceId - 数据源 ID
   * @returns 同步结果
   */
  async refreshMetadata(dataSourceId: number): Promise<MetadataSyncResult> {
    return this.syncDataSource({
      dataSourceId,
      forceFullSync: true,
      inferRelationships: true,
      trackChanges: true,
    });
  }

  /**
   * 检测元数据变更
   *
   * @param dataSourceId - 数据源 ID
   * @returns 变更检测结果
   */
  async detectChanges(dataSourceId: number): Promise<MetadataChangeResult> {
    try {
      console.log(`[MetadataOrchestrator] Detecting metadata changes for data source ${dataSourceId}`);

      // 获取上次同步时间和当前元数据快照
      const lastSync = await this.repository.getLastSyncTime(dataSourceId);
      const changes = await this.repository.detectChanges(dataSourceId);

      return {
        hasChanges: changes.length > 0,
        changedDatabases: Array.from(new Set(changes.map(c => c.database))),
        changedTables: changes.map(c => ({
          database: c.database,
          table: c.table,
          changeType: c.changeType as 'added' | 'modified' | 'removed',
        })),
        lastSyncTime: lastSync,
      };

    } catch (error) {
      console.error(`[MetadataOrchestrator] Change detection failed:`, error);
      return {
        hasChanges: false,
        changedDatabases: [],
        changedTables: [],
      };
    }
  }

  /**
   * 获取查询所需的元数据上下文
   *
   * 根据查询意图检索相关的数据库、表和列信息
   *
   * @param intent - 查询意图
   * @returns 元数据上下文
   */
  async getMetadataContext(intent: QueryIntent): Promise<MetadataContext> {
    try {
      console.log(`[MetadataOrchestrator] Retrieving metadata context for intent: ${intent.type}`);

      const context = await this.retriever.retrieveContext(intent);

      console.log(
        `[MetadataOrchestrator] Context retrieved: ${context.tables.length} tables, ` +
        `${context.relationships.length} relationships`
      );

      return context;

    } catch (error) {
      console.error(`[MetadataOrchestrator] Failed to retrieve context:`, error);
      throw error;
    }
  }

  /**
   * 预热元数据缓存（懒加载优化：增强版）
   *
   * 为常用的数据库和表预加载元数据到缓存
   *
   * @param dataSourceId - 数据源 ID
   * @param databases - 要预热的数据库列表
   * @param commonTableNames - 常用表名列表（用于预热搜索缓存）
   */
  async warmupCache(
    dataSourceId: number,
    databases?: string[],
    commonTableNames?: string[]
  ): Promise<void> {
    try {
      console.log(`[MetadataOrchestrator] Warming up metadata cache for data source ${dataSourceId}`);

      // 1. 预热基础元数据
      const metadata = await this.repository.getMetadata(dataSourceId, databases);
      console.log(`[MetadataOrchestrator] Base cache warmed up with ${metadata.length} items`);

      // 2. 预热常用表的搜索缓存
      if (commonTableNames && commonTableNames.length > 0) {
        console.log(`[MetadataOrchestrator] Warming up search cache for ${commonTableNames.length} common tables`);

        for (const tableName of commonTableNames) {
          try {
            // 触发搜索以填充缓存
            await this.retriever.searchColumns(tableName, undefined, { limit: 5 });
          } catch (error) {
            // 忽略单个表的预热失败
            console.warn(`[MetadataOrchestrator] Failed to warmup table: ${tableName}`);
          }
        }
      }

      // 3. 预热最常用的表（基于查询频率）
      try {
        const topTables = await this.repository.getTopQueriedTables(dataSourceId, 20);
        if (topTables && topTables.length > 0) {
          console.log(`[MetadataOrchestrator] Warming up ${topTables.length} frequently queried tables`);

          for (const table of topTables) {
            try {
              await this.retriever.getTableDetails(table.id);
            } catch (error) {
              console.warn(`[MetadataOrchestrator] Failed to warmup table: ${table.tableName}`);
            }
          }
        }
      } catch (error) {
        // getTopQueriedTables 可能未实现，忽略错误
        console.warn(`[MetadataOrchestrator] Top queried tables not available`);
      }

      console.log(`[MetadataOrchestrator] Cache warmup completed successfully`);

    } catch (error) {
      console.error(`[MetadataOrchestrator] Cache warmup failed:`, error);
      // 不抛出错误，预热失败不应影响正常流程
    }
  }

  /**
   * 设置定时缓存预热任务（懒加载优化：新增）
   *
   * 定期预热元数据缓存以保持热数据的高命中率
   *
   * @param dataSourceId - 数据源 ID
   * @param intervalMinutes - 预热间隔（分钟），默认60分钟
   * @returns 清理函数（用于停止定时任务）
   */
  setupCacheWarmupSchedule(
    dataSourceId: number,
    intervalMinutes: number = 60
  ): () => void {
    console.log(
      `[MetadataOrchestrator] Setting up cache warmup schedule for data source ${dataSourceId} ` +
      `(interval: ${intervalMinutes} minutes)`
    );

    const intervalMs = intervalMinutes * 60 * 1000;

    // 立即执行一次预热
    this.warmupCache(dataSourceId).catch(error => {
      console.error(`[MetadataOrchestrator] Initial cache warmup failed:`, error);
    });

    // 设置定时任务
    const timer = setInterval(() => {
      this.warmupCache(dataSourceId).catch(error => {
        console.error(`[MetadataOrchestrator] Scheduled cache warmup failed:`, error);
      });
    }, intervalMs);

    // 返回清理函数
    return () => {
      console.log(`[MetadataOrchestrator] Stopping cache warmup schedule for data source ${dataSourceId}`);
      clearInterval(timer);
    };
  }

  /**
   * 验证数据源连接
   *
   * @param dataSourceId - 数据源 ID
   * @returns 是否连接成功
   */
  async validateConnection(dataSourceId: number): Promise<boolean> {
    try {
      const connectionId = dataSourceId.toString();
      const connection = await this.connectionManager.getConnection(connectionId);
      return await this.connectionManager.testConnection(connectionId);
    } catch (error) {
      console.error(`[MetadataOrchestrator] Connection validation failed:`, error);
      return false;
    }
  }

  /**
   * 获取元数据统计信息
   *
   * @param dataSourceId - 数据源 ID
   * @returns 统计信息
   */
  async getStatistics(dataSourceId: number) {
    try {
      const stats = await this.repository.getStatistics(dataSourceId);
      return stats;
    } catch (error) {
      console.error(`[MetadataOrchestrator] Failed to get statistics:`, error);
      throw error;
    }
  }

  /**
   * 搜索元数据（数据库、表、列）
   *
   * @param query - 搜索关键词
   * @param options - 搜索选项
   * @returns 搜索结果
   */
  async searchMetadata(
    query: string,
    options: {
      type?: 'database' | 'table' | 'column' | 'all';
      sourceId?: number;
      databaseId?: number;
      page?: number;
      limit?: number;
    } = {}
  ) {
    try {
      const { type = 'all', sourceId, databaseId, page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      console.log(`[MetadataOrchestrator] Searching metadata: "${query}", type: ${type}`);

      const results: any = {
        databases: [],
        tables: [],
        columns: [],
      };

      // 搜索数据库
      if (!type || type === 'database' || type === 'all') {
        results.databases = await this.repository.searchDatabases(query, {
          sourceId,
          limit: type === 'database' ? limit : 10,
          skip: type === 'database' ? skip : 0,
        });
      }

      // 搜索表
      if (!type || type === 'table' || type === 'all') {
        results.tables = await this.repository.searchTables(query, {
          sourceId,
          databaseId,
          limit: type === 'table' ? limit : 10,
          skip: type === 'table' ? skip : 0,
        });
      }

      // 搜索列
      if (!type || type === 'column' || type === 'all') {
        results.columns = await this.repository.searchColumns(query, {
          sourceId,
          databaseId,
          limit: type === 'column' ? limit : 10,
          skip: type === 'column' ? skip : 0,
        });
      }

      return results;
    } catch (error) {
      console.error(`[MetadataOrchestrator] Search failed:`, error);
      throw error;
    }
  }

  /**
   * 获取数据库列表
   *
   * @param sourceId - 数据源 ID
   * @param databaseId - 数据库 ID（可选，获取单个数据库）
   * @returns 数据库列表
   */
  async getDatabases(sourceId?: number, databaseId?: number) {
    try {
      if (databaseId) {
        const database = await this.repository.getDatabaseById(databaseId);
        return database ? [database] : [];
      }

      if (sourceId) {
        return await this.repository.getDatabasesBySource(sourceId);
      }

      throw new Error('sourceId or databaseId is required');
    } catch (error) {
      console.error(`[MetadataOrchestrator] Failed to get databases:`, error);
      throw error;
    }
  }

  /**
   * 获取表列表
   *
   * @param databaseId - 数据库 ID
   * @param options - 查询选项
   * @returns 表列表（分页）
   */
  async getTables(databaseId: number, options?: {
    page?: number;
    limit?: number;
    search?: string;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
  }) {
    try {
      return await this.repository.getTablesPaginated(databaseId, options || {});
    } catch (error) {
      console.error(`[MetadataOrchestrator] Failed to get tables:`, error);
      throw error;
    }
  }

  /**
   * 获取列列表
   *
   * @param tableId - 表 ID
   * @returns 列列表
   */
  async getColumns(tableId: number) {
    try {
      return await this.repository.getColumnsByTable(tableId);
    } catch (error) {
      console.error(`[MetadataOrchestrator] Failed to get columns:`, error);
      throw error;
    }
  }
}
