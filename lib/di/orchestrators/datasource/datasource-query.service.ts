/**
 * DataSourceQueryService - 数据源查询操作服务
 *
 * 职责：
 * - 获取数据源列表
 * - 获取数据源详情
 * - 提供数据源状态查询
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { DataSourceListItem } from '../datasource.orchestrator';

/**
 * 数据源查询服务
 */
@injectable()
export class DataSourceQueryService {
  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService,

    @inject(DI_TOKENS.ConnectionManager)
    private readonly connectionManager: ConnectionManager
  ) {}

  /**
   * 获取数据源列表
   *
   * @param status - 可选的状态过滤
   * @returns 数据源列表
   */
  async listDataSources(status?: 'active' | 'inactive' | 'error'): Promise<DataSourceListItem[]> {
    try {
      console.log(`[DataSourceQueryService] Listing data sources (status: ${status || 'all'})...`);

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

      console.log(`[DataSourceQueryService] Found ${items.length} data sources`);
      return items;

    } catch (error) {
      console.error(`[DataSourceQueryService] List data sources failed:`, error);
      return [];
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
      console.error(`[DataSourceQueryService] Get data source failed:`, error);
      return null;
    }
  }
}
