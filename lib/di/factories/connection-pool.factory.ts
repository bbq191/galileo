/**
 * ConnectionPool 工厂
 * 用于动态创建 ConnectionPool 实例
 */

import { injectable } from 'tsyringe';
import { ConnectionPool } from '@/lib/database/connection-pool';
import type { DatabaseConfig, PoolConfig } from '@/lib/database/connection-config';

/**
 * ConnectionPool 工厂接口
 */
export interface IConnectionPoolFactory {
  /**
   * 创建新的 ConnectionPool 实例
   * @param config 数据库配置
   * @param poolConfig 连接池配置
   * @returns ConnectionPool 实例
   */
  create(config: DatabaseConfig, poolConfig: PoolConfig): ConnectionPool;
}

/**
 * ConnectionPool 工厂实现
 * 使用 Transient 模式，每次调用 create 都返回新实例
 */
@injectable()
export class ConnectionPoolFactory implements IConnectionPoolFactory {
  /**
   * 创建 ConnectionPool 实例
   */
  create(config: DatabaseConfig, poolConfig: PoolConfig): ConnectionPool {
    return new ConnectionPool(config, poolConfig);
  }
}
