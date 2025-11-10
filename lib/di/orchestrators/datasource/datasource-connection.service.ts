/**
 * DataSourceConnectionService - 数据源连接管理服务
 *
 * 职责：
 * - 测试数据源连接
 * - 管理连接池的健康状态
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';
import type { ConnectionManager } from '@/lib/database/connection-manager';
import type { DataSourceResult } from '../datasource.orchestrator';

/**
 * 数据源连接服务
 */
@injectable()
export class DataSourceConnectionService {
  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService,

    @inject(DI_TOKENS.ConnectionManager)
    private readonly connectionManager: ConnectionManager
  ) {}

  /**
   * 测试数据源连接
   *
   * @param id - 数据源 ID
   * @returns 连接健康状态
   */
  async testConnection(id: number): Promise<DataSourceResult['connectionHealth']> {
    try {
      console.log(`[DataSourceConnectionService] Testing connection for data source ${id}...`);

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
      console.error(`[DataSourceConnectionService] Test connection failed:`, error);

      return {
        healthy: false,
        error: errorMessage,
      };
    }
  }
}
