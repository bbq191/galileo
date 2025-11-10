/**
 * DataSourceOrchestrator - 数据源编排器（聚合类）
 *
 * 架构说明：
 * 本类已拆分为 4 个职责单一的子服务，所有方法都委托给相应的子服务执行。
 *
 * 子服务：
 * - DataSourceLifecycleService: 数据源生命周期管理（创建、更新、删除）
 * - DataSourceConnectionService: 数据源连接管理（测试连接）
 * - DataSourceSyncService: 数据源元数据同步管理
 * - DataSourceQueryService: 数据源查询操作（列表、详情）
 *
 * 职责：
 * - 作为统一入口点，保持向后兼容
 * - 协调和委托调用给相应的子服务
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../tokens';
import type { DataSourceLifecycleService } from './datasource/datasource-lifecycle.service';
import type { DataSourceConnectionService } from './datasource/datasource-connection.service';
import type { DataSourceSyncService } from './datasource/datasource-sync.service';
import type { DataSourceQueryService } from './datasource/datasource-query.service';

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
 * 数据源编排器聚合类 - 将方法委托给专门的子服务
 */
@injectable()
export class DataSourceOrchestrator {
  constructor(
    @inject(DI_TOKENS.DataSourceLifecycleService)
    private readonly lifecycleService: DataSourceLifecycleService,

    @inject(DI_TOKENS.DataSourceConnectionService)
    private readonly connectionService: DataSourceConnectionService,

    @inject(DI_TOKENS.DataSourceSyncService)
    private readonly syncService: DataSourceSyncService,

    @inject(DI_TOKENS.DataSourceQueryService)
    private readonly queryService: DataSourceQueryService
  ) {}

  /**
   * 创建数据源
   * 委托给 DataSourceLifecycleService
   *
   * @param options - 创建选项
   * @returns 创建结果
   */
  async createDataSource(options: DataSourceCreateOptions): Promise<DataSourceResult> {
    return this.lifecycleService.createDataSource(options);
  }

  /**
   * 更新数据源
   * 委托给 DataSourceLifecycleService
   *
   * @param options - 更新选项
   * @returns 更新结果
   */
  async updateDataSource(options: DataSourceUpdateOptions): Promise<DataSourceResult> {
    return this.lifecycleService.updateDataSource(options);
  }

  /**
   * 删除数据源
   * 委托给 DataSourceLifecycleService
   *
   * @param id - 数据源 ID
   * @returns 是否成功
   */
  async deleteDataSource(id: number): Promise<DataSourceResult> {
    return this.lifecycleService.deleteDataSource(id);
  }

  /**
   * 获取数据源列表
   * 委托给 DataSourceQueryService
   *
   * @param status - 可选的状态过滤
   * @returns 数据源列表
   */
  async listDataSources(status?: 'active' | 'inactive' | 'error'): Promise<DataSourceListItem[]> {
    return this.queryService.listDataSources(status);
  }

  /**
   * 测试数据源连接
   * 委托给 DataSourceConnectionService
   *
   * @param id - 数据源 ID
   * @returns 连接健康状态
   */
  async testConnection(id: number): Promise<DataSourceResult['connectionHealth']> {
    return this.connectionService.testConnection(id);
  }

  /**
   * 同步数据源元数据
   * 委托给 DataSourceSyncService
   *
   * @param id - 数据源 ID
   * @param databases - 可选的数据库列表
   * @returns 同步结果
   */
  async syncMetadata(id: number, databases?: string[]): Promise<DataSourceResult> {
    return this.syncService.syncMetadata(id, databases);
  }

  /**
   * 获取数据源详情
   * 委托给 DataSourceQueryService
   *
   * @param id - 数据源 ID
   * @returns 数据源详情
   */
  async getDataSource(id: number): Promise<DataSourceListItem | null> {
    return this.queryService.getDataSource(id);
  }
}
