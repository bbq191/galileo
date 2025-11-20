/**
 * DataSourceSyncService - 数据源元数据同步管理服务
 *
 * 职责：
 * - 管理数据源的元数据同步
 * - 处理同步完成后的状态更新和缓存失效
 * - 🆕 触发自动业务域发现
 *
 * @author xusy
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { MetadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import type { DomainDiscoverer } from '@/lib/metadata/discovery/domain-discoverer';
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

    @inject(DI_TOKENS.DomainDiscoverer)
    private readonly domainDiscoverer: DomainDiscoverer,

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

      // 🆕 Step: 自动业务域发现（异步执行，不阻塞主流程）
      this.triggerDomainDiscovery(id).catch((error) => {
        console.error('[DataSourceSyncService] Domain discovery failed:', error);
        // 不影响主流程，只记录错误
      });

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

  /**
   * 🆕 触发自动业务域发现
   *
   * 在元数据同步完成后自动调用，尝试从数据库结构推断业务域
   *
   * @param dataSourceId - 数据源 ID
   * @author xusy
   */
  private async triggerDomainDiscovery(dataSourceId: number): Promise<void> {
    try {
      console.log(`[DataSourceSyncService] 🔍 开始自动业务域发现 (数据源 ${dataSourceId})...`);

      const discovered = await this.domainDiscoverer.discoverAndCreateDomains(dataSourceId, {
        minClusterSize: 2,
        autoCreateThreshold: 0.8,
        autoCreate: true,  // 自动创建高置信度的业务域
      });

      if (discovered.length > 0) {
        const autoCreatedCount = discovered.filter((d) => d.autoCreateRecommended).length;
        const needsReviewCount = discovered.filter((d) => !d.autoCreateRecommended).length;

        console.log(
          `[DataSourceSyncService] ✅ 业务域发现完成: 共发现 ${discovered.length} 个业务域，` +
          `${autoCreatedCount} 个已自动创建，${needsReviewCount} 个需人工审核`
        );

        // 记录发现的业务域详情
        for (const domain of discovered) {
          console.log(
            `[DataSourceSyncService]   - ${domain.suggestedName} ` +
            `(置信度: ${(domain.confidence * 100).toFixed(0)}%, ` +
            `数据库数: ${domain.databaseIds.length}, ` +
            `${domain.autoCreateRecommended ? '已自动创建' : '需审核'})`
          );
        }
      } else {
        console.log(
          `[DataSourceSyncService] ℹ️ 未发现可聚类的业务域（数据库数量可能不足）`
        );
      }
    } catch (error) {
      console.error('[DataSourceSyncService] 业务域发现失败:', error);
      throw error;
    }
  }
}
