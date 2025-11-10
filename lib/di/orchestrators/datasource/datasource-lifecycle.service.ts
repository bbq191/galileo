/**
 * DataSourceLifecycleService - 数据源生命周期管理服务
 *
 * 职责：
 * - 管理数据源的创建、更新、删除操作
 * - 处理数据源创建时的回滚逻辑
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { MetadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import type { DatabaseConfig } from '@/lib/database';
import { encryptPassword, decryptPassword } from '@/lib/database/encryption';
import type {
  DataSourceCreateOptions,
  DataSourceUpdateOptions,
  DataSourceResult,
} from '../datasource.orchestrator';

/**
 * 数据源生命周期服务
 */
@injectable()
export class DataSourceLifecycleService {
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
   * 创建数据源
   *
   * 完整流程：
   * 1. 验证输入
   * 2. 检查名称唯一性
   * 3. 创建数据库记录
   * 4. 创建连接池
   * 5. 测试连接
   * 6. （可选）自动同步元数据
   *
   * @param options - 创建选项
   * @returns 创建结果
   */
  async createDataSource(options: DataSourceCreateOptions): Promise<DataSourceResult> {
    const startTime = Date.now();

    try {
      console.log(`[DataSourceLifecycleService] Creating data source: ${options.name}`);

      // 1. 检查名称是否已存在
      const existing = await this.dbService.prisma.dataSource.findUnique({
        where: { name: options.name },
      });

      if (existing) {
        return {
          success: false,
          error: `Data source with name '${options.name}' already exists`,
        };
      }

      // 2. 创建数据库记录（先创建获取 ID）
      const dataSource = await this.dbService.prisma.dataSource.create({
        data: {
          name: options.name,
          type: options.type,
          host: options.host,
          port: options.port,
          username: options.username,
          passwordEncrypted: encryptPassword(options.password),
          targetDatabases: options.databases && options.databases.length > 0
            ? (options.databases as any)
            : null,
          status: 'inactive',
        },
      });

      const connectionId = dataSource.id.toString();

      // 3. 创建连接配置
      const config: DatabaseConfig = {
        id: connectionId,
        name: options.name,
        type: options.type,
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        databases: options.databases || [],
      };

      try {
        // 4. 创建连接池
        console.log(`[DataSourceLifecycleService] Creating connection pool for ${connectionId}...`);
        await this.connectionManager.createConnection(config);

        // 5. 测试连接
        console.log(`[DataSourceLifecycleService] Testing connection ${connectionId}...`);
        const healthCheck = await this.connectionManager.testConnection(connectionId);

        if (!healthCheck.healthy) {
          // 连接测试失败，回滚
          await this.rollbackDataSourceCreation(dataSource.id, connectionId);
          return {
            success: false,
            error: `Connection test failed: ${healthCheck.error || 'Unknown error'}`,
            connectionHealth: healthCheck,
          };
        }

        // 6. 更新状态为 active
        await this.dbService.prisma.dataSource.update({
          where: { id: dataSource.id },
          data: { status: 'active' },
        });

        // 7. （可选）自动同步元数据
        let syncResult;
        if (options.autoSync) {
          console.log(`[DataSourceLifecycleService] Auto-syncing metadata for ${connectionId}...`);
          try {
            const result = await this.syncService.syncDataSource({
              dataSourceId: dataSource.id,
              databases: options.databases,
              inferRelationships: true,
              minConfidence: 0.70,
              trackChanges: true,
            });

            syncResult = {
              databaseCount: result.databaseCount,
              tableCount: result.tableCount,
              columnCount: result.columnCount,
              duration: result.duration,
            };

            // 更新最后同步时间
            await this.dbService.prisma.dataSource.update({
              where: { id: dataSource.id },
              data: { lastSyncAt: new Date() },
            });
          } catch (syncError) {
            console.warn(`[DataSourceLifecycleService] Auto-sync failed (non-fatal):`, syncError);
            // 同步失败不影响数据源创建
          }
        }

        const duration = Date.now() - startTime;
        console.log(`[DataSourceLifecycleService] Data source created successfully in ${duration}ms`);

        return {
          success: true,
          id: dataSource.id,
          name: dataSource.name,
          type: dataSource.type,
          status: 'active',
          connectionHealth: healthCheck,
          syncResult,
        };

      } catch (error) {
        // 创建连接失败，回滚数据库记录
        await this.rollbackDataSourceCreation(dataSource.id, connectionId);
        throw error;
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`[DataSourceLifecycleService] Create data source failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 更新数据源
   *
   * @param options - 更新选项
   * @returns 更新结果
   */
  async updateDataSource(options: DataSourceUpdateOptions): Promise<DataSourceResult> {
    try {
      console.log(`[DataSourceLifecycleService] Updating data source ${options.id}...`);

      // 1. 检查数据源是否存在
      const existing = await this.dbService.prisma.dataSource.findUnique({
        where: { id: options.id },
      });

      if (!existing) {
        return {
          success: false,
          error: `Data source with ID ${options.id} not found`,
        };
      }

      // 2. 准备更新数据
      const updateData: any = {};
      if (options.name !== undefined) updateData.name = options.name;
      if (options.host !== undefined) updateData.host = options.host;
      if (options.port !== undefined) updateData.port = options.port;
      if (options.username !== undefined) updateData.username = options.username;
      if (options.password !== undefined) {
        updateData.passwordEncrypted = encryptPassword(options.password);
      }
      if (options.databases !== undefined) {
        updateData.targetDatabases = options.databases.length > 0
          ? (options.databases as any)
          : null;
      }

      // 3. 更新数据库记录
      const updated = await this.dbService.prisma.dataSource.update({
        where: { id: options.id },
        data: updateData,
      });

      // 4. 如果需要重建连接
      if (options.reconnect) {
        const connectionId = options.id.toString();

        // 关闭旧连接
        if (await this.connectionManager.hasConnection(connectionId)) {
          console.log(`[DataSourceLifecycleService] Closing old connection ${connectionId}...`);
          await this.connectionManager.removeConnection(connectionId);
        }

        // 创建新连接
        const password = options.password || decryptPassword(existing.passwordEncrypted);
        const config: DatabaseConfig = {
          id: connectionId,
          name: updated.name,
          type: updated.type as any,
          host: updated.host,
          port: updated.port,
          username: updated.username,
          password: password,
          databases: options.databases || [],
        };

        console.log(`[DataSourceLifecycleService] Creating new connection ${connectionId}...`);
        await this.connectionManager.createConnection(config);

        // 测试新连接
        const healthCheck = await this.connectionManager.testConnection(connectionId);

        if (!healthCheck.healthy) {
          return {
            success: false,
            error: `Reconnection failed: ${healthCheck.error || 'Unknown error'}`,
            connectionHealth: healthCheck,
          };
        }
      }

      // 5. 失效相关缓存
      await this.cacheInvalidation.invalidateMetadata({
        dataSourceId: options.id,
      });

      console.log(`[DataSourceLifecycleService] Data source ${options.id} updated successfully`);

      return {
        success: true,
        id: updated.id,
        name: updated.name,
        type: updated.type,
        status: updated.status as any,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DataSourceLifecycleService] Update data source failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 删除数据源
   *
   * @param id - 数据源 ID
   * @returns 是否成功
   */
  async deleteDataSource(id: number): Promise<DataSourceResult> {
    try {
      console.log(`[DataSourceLifecycleService] Deleting data source ${id}...`);

      // 1. 检查数据源是否存在
      const existing = await this.dbService.prisma.dataSource.findUnique({
        where: { id },
      });

      if (!existing) {
        return {
          success: false,
          error: `Data source with ID ${id} not found`,
        };
      }

      const connectionId = id.toString();

      // 2. 关闭连接池
      if (await this.connectionManager.hasConnection(connectionId)) {
        console.log(`[DataSourceLifecycleService] Closing connection ${connectionId}...`);
        await this.connectionManager.removeConnection(connectionId);
      }

      // 3. 删除数据库记录（级联删除元数据）
      await this.dbService.prisma.dataSource.delete({
        where: { id },
      });

      // 4. 失效所有相关缓存
      await this.cacheInvalidation.invalidateMetadata({
        dataSourceId: id,
      });

      console.log(`[DataSourceLifecycleService] Data source ${id} deleted successfully`);

      return {
        success: true,
        id,
        name: existing.name,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DataSourceLifecycleService] Delete data source failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 回滚数据源创建
   *
   * @private
   */
  private async rollbackDataSourceCreation(id: number, connectionId: string): Promise<void> {
    try {
      console.log(`[DataSourceLifecycleService] Rolling back data source creation ${id}...`);

      // 删除连接池
      if (await this.connectionManager.hasConnection(connectionId)) {
        await this.connectionManager.removeConnection(connectionId);
      }

      // 删除数据库记录
      await this.dbService.prisma.dataSource.delete({
        where: { id },
      });

      console.log(`[DataSourceLifecycleService] Rollback completed`);
    } catch (error) {
      console.error(`[DataSourceLifecycleService] Rollback failed:`, error);
    }
  }
}
