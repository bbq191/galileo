/**
 * DataSourceSyncService - 数据源元数据同步管理服务
 *
 * 职责：
 * - 管理数据源的元数据同步
 * - 处理同步完成后的状态更新和缓存失效
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { MetadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import { InvalidationEvent } from '@/lib/cache/cache-invalidation';
import type { DataSourceResult } from '../datasource.orchestrator';

/**
 * 数据源同步服务
 */
@injectable()
export class DataSourceSyncService {
  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService,

    @inject(DI_TOKENS.ConnectionManager)
    private readonly connectionManager: ConnectionManager,

    @inject(DI_TOKENS.MetadataSyncService)
    private readonly syncService: MetadataSyncService,

    @inject(DI_TOKENS.CacheInvalidationService)
    private readonly cacheInvalidation: CacheInvalidationService
  ) {}

  /**
   * 同步数据源元数据
   *
   * @param id - 数据源 ID
   * @param databases - 可选的数据库列表
   * @returns 同步结果
   */
  async syncMetadata(id: number, databases?: string[]): Promise<DataSourceResult> {
    try {
      console.log(`[DataSourceSyncService] Syncing metadata for data source ${id}...`);

      // 确保连接存在
      const connectionId = id.toString();
      if (!await this.connectionManager.hasConnection(connectionId)) {
        await this.connectionManager.loadConnectionsFromDatabase();
      }

      // 执行同步
      const result = await this.syncService.syncDataSource({
        dataSourceId: id,
        databases,
        inferRelationships: true,
        minConfidence: 0.70,
        trackChanges: true,
      });

      // 更新最后同步时间
      await this.dbService.prisma.dataSource.update({
        where: { id },
        data: { lastSyncAt: new Date() },
      });

      // 失效缓存
      await this.cacheInvalidation.invalidate(
        InvalidationEvent.METADATA_SYNCED,
        { reason: `Data source ${id} metadata synced` }
      );

      console.log(`[DataSourceSyncService] Metadata sync completed: ${result.tableCount} tables`);

      return {
        success: true,
        id,
        syncResult: {
          databaseCount: result.databaseCount,
          tableCount: result.tableCount,
          columnCount: result.columnCount,
          duration: result.duration,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DataSourceSyncService] Sync metadata failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
