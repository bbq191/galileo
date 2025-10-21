/**
 * 数据库连接管理模块导出
 */

export { default as connectionManager } from './connection-manager';
export { ConnectionPool } from './connection-pool';
export {
  encryptPassword,
  decryptPassword,
  validateEncryptedPassword,
  generateEncryptionKey,
} from './encryption';

export type {
  DatabaseConfig,
  DatabaseType,
  ConnectionStatus,
  PoolConfig,
  HealthCheckResult,
  ConnectionStats,
} from './connection-config';

export { DEFAULT_POOL_CONFIG } from './connection-config';
