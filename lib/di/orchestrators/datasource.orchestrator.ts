/**
 * DataSourceOrchestrator - 数据源编排器
 *
 * 职责：
 * - 管理数据源的完整生命周期
 * - 协调数据源的创建、测试、更新、删除
 * - 处理连接池管理和健康检查
 * - 协调元数据同步流程
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../tokens';
import type { DatabaseService } from '../services/database.service';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { MetadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';
import type { DatabaseConfig } from '@/lib/database';
import { encryptPassword, decryptPassword } from '@/lib/database/encryption';

/**
 * 数据源创建选项
 */
export interface DataSourceCreateOptions {
  /** 数据源名称 */
  name: string;

  /** 数据源类型 */
  type: 'mysql' | 'mariadb' | 'postgresql';

  /** 主机地址 */
  host: string;

  /** 端口 */
  port: number;

  /** 用户名 */
  username: string;

  /** 密码 */
  password: string;

  /** 目标数据库列表 */
  databases?: string[];

  /** 描述 */
  description?: string;

  /** 是否自动同步元数据 */
  autoSync?: boolean;
}

/**
 * 数据源更新选项
 */
export interface DataSourceUpdateOptions {
  /** 数据源 ID */
  id: number;

  /** 数据源名称 */
  name?: string;

  /** 主机地址 */
  host?: string;

  /** 端口 */
  port?: number;

  /** 用户名 */
  username?: string;

  /** 密码（如果提供则更新） */
  password?: string;

  /** 目标数据库列表 */
  databases?: string[];

  /** 描述 */
  description?: string;

  /** 是否重建连接 */
  reconnect?: boolean;
}

/**
 * 数据源创建结果
 */
export interface DataSourceResult {
  /** 是否成功 */
  success: boolean;

  /** 数据源 ID */
  id?: number;

  /** 数据源名称 */
  name?: string;

  /** 数据源类型 */
  type?: string;

  /** 状态 */
  status?: 'active' | 'inactive' | 'error';

  /** 连接健康状态 */
  connectionHealth?: {
    healthy: boolean;
    responseTime?: number;
    checkedAt?: Date;
    error?: string;
  };

  /** 元数据同步结果 */
  syncResult?: {
    databaseCount: number;
    tableCount: number;
    columnCount: number;
    duration: number;
  };

  /** 错误信息 */
  error?: string;
}

/**
 * 数据源列表项
 */
export interface DataSourceListItem {
  /** 数据源 ID */
  id: number;

  /** 数据源名称 */
  name: string;

  /** 数据源类型 */
  type: string;

  /** 主机地址 */
  host: string;

  /** 端口 */
  port: number;

  /** 用户名 */
  username: string;

  /** 状态 */
  status: 'active' | 'inactive' | 'error';

  /** 目标数据库 */
  databases: string[];

  /** 最后同步时间 */
  lastSyncAt?: Date;

  /** 创建时间 */
  createdAt: Date;

  /** 更新时间 */
  updatedAt: Date;

  /** 是否已连接 */
  isConnected: boolean;

  /** 连接统计信息 */
  connectionStats?: {
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    waitingRequests: number;
  };
}

/**
 * DataSourceOrchestrator
 *
 * 数据源编排器，管理数据源的完整生命周期
 */
@injectable()
export class DataSourceOrchestrator {
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
      console.log(`[DataSourceOrchestrator] Creating data source: ${options.name}`);

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
        console.log(`[DataSourceOrchestrator] Creating connection pool for ${connectionId}...`);
        await this.connectionManager.createConnection(config);

        // 5. 测试连接
        console.log(`[DataSourceOrchestrator] Testing connection ${connectionId}...`);
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
          console.log(`[DataSourceOrchestrator] Auto-syncing metadata for ${connectionId}...`);
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
            console.warn(`[DataSourceOrchestrator] Auto-sync failed (non-fatal):`, syncError);
            // 同步失败不影响数据源创建
          }
        }

        const duration = Date.now() - startTime;
        console.log(`[DataSourceOrchestrator] Data source created successfully in ${duration}ms`);

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

      console.error(`[DataSourceOrchestrator] Create data source failed:`, error);

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
      console.log(`[DataSourceOrchestrator] Updating data source ${options.id}...`);

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
          console.log(`[DataSourceOrchestrator] Closing old connection ${connectionId}...`);
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

        console.log(`[DataSourceOrchestrator] Creating new connection ${connectionId}...`);
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

      console.log(`[DataSourceOrchestrator] Data source ${options.id} updated successfully`);

      return {
        success: true,
        id: updated.id,
        name: updated.name,
        type: updated.type,
        status: updated.status as any,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DataSourceOrchestrator] Update data source failed:`, error);

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
      console.log(`[DataSourceOrchestrator] Deleting data source ${id}...`);

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
        console.log(`[DataSourceOrchestrator] Closing connection ${connectionId}...`);
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

      console.log(`[DataSourceOrchestrator] Data source ${id} deleted successfully`);

      return {
        success: true,
        id,
        name: existing.name,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DataSourceOrchestrator] Delete data source failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取数据源列表
   *
   * @param status - 可选的状态过滤
   * @returns 数据源列表
   */
  async listDataSources(status?: 'active' | 'inactive' | 'error'): Promise<DataSourceListItem[]> {
    try {
      console.log(`[DataSourceOrchestrator] Listing data sources (status: ${status || 'all'})...`);

      const dataSources = await this.dbService.prisma.dataSource.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      // 获取连接统计信息
      const items = await Promise.all(
        dataSources.map(async (ds) => {
          const connectionId = ds.id.toString();
          const hasConnection = await this.connectionManager.hasConnection(connectionId);

          let connectionStats;
          if (hasConnection) {
            connectionStats = await this.connectionManager.getConnectionStats(connectionId);
          }

          return {
            id: ds.id,
            name: ds.name,
            type: ds.type,
            host: ds.host,
            port: ds.port,
            username: ds.username,
            status: ds.status as any,
            databases: ds.targetDatabases
              ? Array.isArray(ds.targetDatabases)
                ? ds.targetDatabases
                : [ds.targetDatabases as string]
              : [],
            lastSyncAt: ds.lastSyncAt || undefined,
            createdAt: ds.createdAt,
            updatedAt: ds.updatedAt,
            isConnected: hasConnection,
            connectionStats,
          };
        })
      );

      console.log(`[DataSourceOrchestrator] Found ${items.length} data sources`);
      return items;

    } catch (error) {
      console.error(`[DataSourceOrchestrator] List data sources failed:`, error);
      return [];
    }
  }

  /**
   * 测试数据源连接
   *
   * @param id - 数据源 ID
   * @returns 连接健康状态
   */
  async testConnection(id: number): Promise<DataSourceResult['connectionHealth']> {
    try {
      console.log(`[DataSourceOrchestrator] Testing connection for data source ${id}...`);

      const connectionId = id.toString();

      // 检查连接是否存在
      if (await this.connectionManager.hasConnection(connectionId)) {
        const healthCheck = await this.connectionManager.testConnection(connectionId);
        return healthCheck;
      }

      // 连接不存在，从数据库加载并创建临时连接测试
      const dataSource = await this.dbService.prisma.dataSource.findUnique({
        where: { id },
      });

      if (!dataSource) {
        return {
          healthy: false,
          error: 'Data source not found',
        };
      }

      // 加载到连接管理器
      await this.connectionManager.loadConnectionsFromDatabase();

      // 再次测试
      if (await this.connectionManager.hasConnection(connectionId)) {
        const healthCheck = await this.connectionManager.testConnection(connectionId);
        return healthCheck;
      }

      return {
        healthy: false,
        error: 'Failed to create connection',
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DataSourceOrchestrator] Test connection failed:`, error);

      return {
        healthy: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 同步数据源元数据
   *
   * @param id - 数据源 ID
   * @param databases - 可选的数据库列表
   * @returns 同步结果
   */
  async syncMetadata(id: number, databases?: string[]): Promise<DataSourceResult> {
    try {
      console.log(`[DataSourceOrchestrator] Syncing metadata for data source ${id}...`);

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
      await this.cacheInvalidation.invalidateMetadata({
        dataSourceId: id,
        databases,
      });

      console.log(`[DataSourceOrchestrator] Metadata sync completed: ${result.tableCount} tables`);

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
      console.error(`[DataSourceOrchestrator] Sync metadata failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 获取数据源详情
   *
   * @param id - 数据源 ID
   * @returns 数据源详情
   */
  async getDataSource(id: number): Promise<DataSourceListItem | null> {
    try {
      const dataSource = await this.dbService.prisma.dataSource.findUnique({
        where: { id },
      });

      if (!dataSource) {
        return null;
      }

      const connectionId = id.toString();
      const hasConnection = await this.connectionManager.hasConnection(connectionId);

      let connectionStats;
      if (hasConnection) {
        connectionStats = await this.connectionManager.getConnectionStats(connectionId);
      }

      return {
        id: dataSource.id,
        name: dataSource.name,
        type: dataSource.type,
        host: dataSource.host,
        port: dataSource.port,
        username: dataSource.username,
        status: dataSource.status as any,
        databases: dataSource.targetDatabases
          ? Array.isArray(dataSource.targetDatabases)
            ? dataSource.targetDatabases
            : [dataSource.targetDatabases as string]
          : [],
        lastSyncAt: dataSource.lastSyncAt || undefined,
        createdAt: dataSource.createdAt,
        updatedAt: dataSource.updatedAt,
        isConnected: hasConnection,
        connectionStats,
      };

    } catch (error) {
      console.error(`[DataSourceOrchestrator] Get data source failed:`, error);
      return null;
    }
  }

  /**
   * 回滚数据源创建
   *
   * @private
   */
  private async rollbackDataSourceCreation(id: number, connectionId: string): Promise<void> {
    try {
      console.log(`[DataSourceOrchestrator] Rolling back data source creation ${id}...`);

      // 删除连接池
      if (await this.connectionManager.hasConnection(connectionId)) {
        await this.connectionManager.removeConnection(connectionId);
      }

      // 删除数据库记录
      await this.dbService.prisma.dataSource.delete({
        where: { id },
      });

      console.log(`[DataSourceOrchestrator] Rollback completed`);
    } catch (error) {
      console.error(`[DataSourceOrchestrator] Rollback failed:`, error);
    }
  }
}
