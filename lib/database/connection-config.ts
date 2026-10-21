/**
 * 数据库连接配置接口定义
 */

/**
 * 支持的数据源类型
 *
 * 连接池、执行器、SQL 生成与校验目前都只实现了 MySQL 协议与方言，
 * PostgreSQL 等其他类型暂不支持（创建、更新、建立连接时均会拒绝）。
 */
export const SUPPORTED_DATABASE_TYPES = ['mysql', 'mariadb'] as const;

export type DatabaseType = (typeof SUPPORTED_DATABASE_TYPES)[number];

export const UNSUPPORTED_DATABASE_TYPE_MESSAGE = '暂不支持该数据库类型，目前仅支持 MySQL / MariaDB';

export function isSupportedDatabaseType(type: unknown): type is DatabaseType {
  return typeof type === 'string' && (SUPPORTED_DATABASE_TYPES as readonly string[]).includes(type);
}

export type ConnectionStatus = 'active' | 'inactive' | 'error' | 'testing';

/**
 * 数据库连接配置
 */
export interface DatabaseConfig {
  /** 连接唯一标识符 */
  id: string;

  /** 连接名称 */
  name: string;

  /** 数据库类型 */
  type: DatabaseType;

  /** 主机地址 */
  host: string;

  /** 端口号 */
  port: number;

  /** 用户名 */
  username: string;

  /** 密码（加密存储） */
  password: string;

  /** 需要连接的数据库列表 */
  databases: string[];

  /** 连接状态 */
  status?: ConnectionStatus;

  /** 最后同步时间 */
  lastSyncAt?: Date;
}

/**
 * 连接池配置
 */
export interface PoolConfig {
  /** 最小连接数 */
  min: number;

  /** 最大连接数 */
  max: number;

  /** 连接空闲超时时间（毫秒） */
  idleTimeoutMillis: number;

  /** 获取连接超时时间（毫秒） */
  connectionTimeoutMillis: number;

  /** 是否启用队列 */
  queueLimit?: number;
}

/**
 * 默认连接池配置
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000, // 30 秒
  connectionTimeoutMillis: 10000, // 10 秒
  queueLimit: 0, // 无限制
};

/**
 * 连接健康检查结果
 */
export interface HealthCheckResult {
  /** 是否健康 */
  healthy: boolean;

  /** 连接 ID */
  connectionId: string;

  /** 响应时间（毫秒） */
  responseTime: number;

  /** 错误信息 */
  error?: string;

  /** 检查时间 */
  checkedAt: Date;
}

/**
 * 连接统计信息
 */
export interface ConnectionStats {
  /** 活跃连接数 */
  active: number;

  /** 空闲连接数 */
  idle: number;

  /** 等待连接数 */
  waiting: number;

  /** 总连接数 */
  total: number;
}
