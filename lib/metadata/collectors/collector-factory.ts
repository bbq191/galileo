/**
 * 采集器工厂
 * 根据数据库类型创建相应的采集器
 */

import type { ConnectionPool } from '@/lib/database/connection-pool';
import { SUPPORTED_DATABASE_TYPES, type DatabaseType } from '@/lib/database/connection-config';
import { MySQLSchemaCollector } from './mysql-schema-collector';
import type { SchemaCollector } from './base-collector';

/**
 * 采集器工厂类
 */
export class CollectorFactory {
  /**
   * 创建采集器实例
   * @param pool 连接池
   * @param type 数据库类型
   */
  static createCollector(
    pool: ConnectionPool,
    type: DatabaseType
  ): SchemaCollector {
    switch (type) {
      case 'mysql':
      case 'mariadb':
        return new MySQLSchemaCollector(pool);

      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

  /**
   * 获取支持的数据库类型列表
   */
  static getSupportedTypes(): DatabaseType[] {
    return [...SUPPORTED_DATABASE_TYPES];
  }

  /**
   * 检查是否支持指定数据库类型
   */
  static isSupported(type: DatabaseType): boolean {
    return this.getSupportedTypes().includes(type);
  }
}
