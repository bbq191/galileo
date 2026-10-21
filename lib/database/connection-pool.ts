/**
 * 数据库连接池封装
 * 支持 MySQL/MariaDB 连接池管理
 */

import mysql from 'mysql2/promise';
import type {
  DatabaseConfig,
  PoolConfig,
  ConnectionStats,
  HealthCheckResult,
} from './connection-config';
import { isSupportedDatabaseType, UNSUPPORTED_DATABASE_TYPE_MESSAGE } from './connection-config';
import { decryptPassword } from './encryption';

/**
 * 连接池包装类
 */
export class ConnectionPool {
  private pool: mysql.Pool | null = null;
  private config: DatabaseConfig;
  private poolConfig: PoolConfig;
  private lastHealthCheck: HealthCheckResult | null = null;

  constructor(config: DatabaseConfig, poolConfig: PoolConfig) {
    this.config = config;
    this.poolConfig = poolConfig;
  }

  /**
   * 初始化连接池
   */
  async initialize(): Promise<void> {
    if (this.pool) {
      console.warn(`连接池 ${this.config.id} 已存在`);
      return;
    }

    // 驱动只有 mysql2：数据库中已有的其他类型数据源（如早期创建的 PostgreSQL）不建立连接
    if (!isSupportedDatabaseType(this.config.type)) {
      throw new Error(`${UNSUPPORTED_DATABASE_TYPE_MESSAGE}（${this.config.type}）`);
    }

    try {
      // 解密密码
      const password = decryptPassword(this.config.password);

      // 创建连接池
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.username,
        password: password,
        // 不指定默认数据库，允许跨库查询
        database: undefined,
        connectionLimit: this.poolConfig.max,
        queueLimit: this.poolConfig.queueLimit,
        waitForConnections: true,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000, // 10 秒
        charset: 'utf8mb4',
        timezone: '+00:00', // UTC
        decimalNumbers: true,
        dateStrings: false,
      });

      console.log(`✓ 连接池 ${this.config.name} (${this.config.id}) 初始化成功`);
    } catch (error) {
      console.error(`连接池 ${this.config.id} 初始化失败:`, error);
      throw new Error(`Failed to initialize connection pool: ${error}`);
    }
  }

  /**
   * 获取连接
   */
  async getConnection(): Promise<mysql.PoolConnection> {
    if (!this.pool) {
      throw new Error(`Connection pool ${this.config.id} not initialized`);
    }

    try {
      const connection = await this.pool.getConnection();
      return connection;
    } catch (error) {
      console.error(`获取连接失败 (${this.config.id}):`, error);
      throw error;
    }
  }

  /**
   * 执行查询
   */
  async query<T = any>(
    sql: string,
    values?: any[]
  ): Promise<[T, mysql.FieldPacket[]]> {
    if (!this.pool) {
      throw new Error(`Connection pool ${this.config.id} not initialized`);
    }

    try {
      const result = await this.pool.query(sql, values);
      return result as [T, mysql.FieldPacket[]];
    } catch (error) {
      console.error(`查询执行失败 (${this.config.id}):`, error);
      throw error;
    }
  }

  /**
   * 执行单条查询（返回第一行）
   */
  async queryOne<T = any>(sql: string, values?: any[]): Promise<T | null> {
    const [rows] = await this.query<T[]>(sql, values);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const result: HealthCheckResult = {
      healthy: false,
      connectionId: this.config.id,
      responseTime: 0,
      checkedAt: new Date(),
    };

    try {
      if (!this.pool) {
        throw new Error('Connection pool not initialized');
      }

      // 执行简单查询测试连接
      await this.pool.query('SELECT 1 as health_check');

      result.healthy = true;
      result.responseTime = Date.now() - startTime;

      this.lastHealthCheck = result;
      return result;
    } catch (error) {
      result.healthy = false;
      result.responseTime = Date.now() - startTime;
      result.error = error instanceof Error ? error.message : 'Unknown error';

      this.lastHealthCheck = result;
      console.error(`健康检查失败 (${this.config.id}):`, error);
      return result;
    }
  }

  /**
   * 获取连接池统计信息
   */
  getStats(): ConnectionStats {
    if (!this.pool) {
      return { active: 0, idle: 0, waiting: 0, total: 0 };
    }

    // mysql2 连接池状态（类型推断）
    const pool = this.pool as any;

    return {
      active: pool._allConnections?.length || 0,
      idle: pool._freeConnections?.length || 0,
      waiting: pool._connectionQueue?.length || 0,
      total:
        (pool._allConnections?.length || 0) +
        (pool._freeConnections?.length || 0),
    };
  }

  /**
   * 获取最后一次健康检查结果
   */
  getLastHealthCheck(): HealthCheckResult | null {
    return this.lastHealthCheck;
  }

  /**
   * 测试特定数据库的访问权限
   */
  async testDatabaseAccess(database: string): Promise<boolean> {
    try {
      // 测试能否访问 INFORMATION_SCHEMA
      const [rows] = await this.query<any[]>(
        `SELECT COUNT(*) as table_count
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ?`,
        [database]
      );

      return rows.length > 0;
    } catch (error) {
      console.error(`数据库访问测试失败 (${database}):`, error);
      return false;
    }
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    if (!this.pool) {
      return;
    }

    try {
      await this.pool.end();
      this.pool = null;
      console.log(`✓ 连接池 ${this.config.name} (${this.config.id}) 已关闭`);
    } catch (error) {
      console.error(`关闭连接池失败 (${this.config.id}):`, error);
      throw error;
    }
  }

  /**
   * 获取连接配置
   */
  getConfig(): DatabaseConfig {
    return { ...this.config };
  }

  /**
   * 检查连接池是否已初始化
   */
  isInitialized(): boolean {
    return this.pool !== null;
  }
}
