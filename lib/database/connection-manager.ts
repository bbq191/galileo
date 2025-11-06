/**
 * 数据库连接管理器
 * 负责管理多个数据库连接池
 */

import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@prisma/client';
import { ConnectionPool } from './connection-pool';
import type {
  DatabaseConfig,
  PoolConfig,
  HealthCheckResult,
  ConnectionStats,
} from './connection-config';
import { DEFAULT_POOL_CONFIG } from './connection-config';
import { encryptPassword } from './encryption';
import prisma from '@/lib/prisma/client';
import { createLogger } from '@/lib/utils/logger';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { IConnectionPoolFactory } from '@/lib/di/factories/connection-pool.factory';

/**
 * 连接管理器
 */
@injectable()
class ConnectionManager {
  private pools: Map<string, ConnectionPool> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 60 秒
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private logger = createLogger('ConnectionManager');
  private signalHandlersRegistered = false;

  // DI 注入的依赖
  private prisma: PrismaClient;
  private poolFactory: IConnectionPoolFactory;

  constructor(
    @inject(DI_TOKENS.PrismaClient) prisma?: PrismaClient,
    @inject(DI_TOKENS.ConnectionPoolFactory) poolFactory?: IConnectionPoolFactory
  ) {
    // 如果通过 DI 注入，使用注入的实例
    if (prisma) {
      this.prisma = prisma;
    } else {
      // 向后兼容：使用全局 prisma
      this.prisma = prisma as any;
    }

    if (poolFactory) {
      this.poolFactory = poolFactory;
    } else {
      // 向后兼容：直接创建 ConnectionPool（需要创建默认工厂）
      this.poolFactory = {
        create: (config: DatabaseConfig, poolConfig: PoolConfig) =>
          new ConnectionPool(config, poolConfig),
      };
    }
  }

  /**
   * 启动所有生命周期服务
   * 包括健康检查和信号处理器
   */
  start(): void {
    this.startHealthCheck();
    this.registerSignalHandlers();
  }

  /**
   * 注册进程信号处理器（优雅关闭）
   */
  registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) {
      return;
    }

    if (typeof process !== 'undefined') {
      process.on('SIGINT', async () => {
        console.log('\n正在优雅关闭连接管理器...');
        await this.closeAll();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n正在优雅关闭连接管理器...');
        await this.closeAll();
        process.exit(0);
      });

      this.signalHandlersRegistered = true;
      this.logger.info('信号处理器已注册');
    }
  }

  /**
   * 确保 ConnectionManager 已初始化（懒加载）
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // 如果正在初始化，等待初始化完成
    if (this.initPromise) {
      return this.initPromise;
    }

    // 开始初始化
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  /**
   * 初始化连接管理器，从数据库加载活跃连接
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('[ConnectionManager] Initializing...');

    try {
      await this.loadConnectionsFromDatabase();
      this.isInitialized = true;
      this.logger.info('Initialized successfully');
    } catch (error) {
      this.logger.error(
        'Initialization failed',
        error instanceof Error ? error : new Error(String(error))
      );
      // 即使失败也标记为已初始化，避免重复尝试
      this.isInitialized = true;
    }
  }

  /**
   * 创建数据库连接
   */
  async createConnection(
    config: DatabaseConfig,
    poolConfig: PoolConfig = DEFAULT_POOL_CONFIG
  ): Promise<void> {
    // 检查连接是否已存在
    if (this.pools.has(config.id)) {
      throw new Error(`Connection ${config.id} already exists`);
    }

    try {
      // 加密密码（如果还未加密）
      const encryptedPassword = this.isPasswordEncrypted(config.password)
        ? config.password
        : encryptPassword(config.password);

      const configWithEncryption: DatabaseConfig = {
        ...config,
        password: encryptedPassword,
      };

      // 创建连接池（使用工厂）
      const pool = this.poolFactory.create(configWithEncryption, poolConfig);
      await pool.initialize();

      // 存储连接池
      this.pools.set(config.id, pool);

      // 保存到数据库
      await this.saveToDatabase(configWithEncryption);

      this.logger.info(`连接 ${config.name} 创建成功`);
    } catch (error) {
      // 使用安全的 logger（已脱敏）
      this.logger.error(
        `创建连接失败 (${config.id})`,
        error instanceof Error ? error : new Error(String(error)),
        { metadata: { configId: config.id, configName: config.name } }
      );
      throw error;
    }
  }

  /**
   * 测试连接
   */
  async testConnection(id: string): Promise<HealthCheckResult> {
    await this.ensureInitialized();

    const pool = this.pools.get(id);
    if (!pool) {
      throw new Error(`Connection ${id} not found`);
    }

    return await pool.healthCheck();
  }

  /**
   * 获取连接池
   */
  async getConnection(id: string): Promise<ConnectionPool> {
    await this.ensureInitialized();

    const pool = this.pools.get(id);
    if (!pool) {
      throw new Error(`Connection ${id} not found`);
    }

    // 检查连接池是否健康
    const health = await pool.healthCheck();
    if (!health.healthy) {
      throw new Error(
        `Connection ${id} is unhealthy: ${health.error || 'Unknown error'}`
      );
    }

    return pool;
  }

  /**
   * 关闭连接
   */
  async closeConnection(id: string): Promise<void> {
    const pool = this.pools.get(id);
    if (!pool) {
      throw new Error(`Connection ${id} not found`);
    }

    await pool.close();
    this.pools.delete(id);

    // 更新数据库状态
    await this.prisma.dataSource.update({
      where: { id: parseInt(id) },
      data: { status: 'inactive' },
    });

    console.log(`✓ 连接 ${id} 已关闭`);
  }

  /**
   * 获取所有连接
   */
  getAllConnections(): Map<string, ConnectionPool> {
    return this.pools;
  }

  /**
   * 获取连接统计信息
   */
  async getConnectionStats(id: string): Promise<ConnectionStats> {
    await this.ensureInitialized();

    const pool = this.pools.get(id);
    if (!pool) {
      throw new Error(`Connection ${id} not found`);
    }

    return pool.getStats();
  }

  /**
   * 获取所有连接的健康状态
   */
  async getAllHealthStatus(): Promise<Map<string, HealthCheckResult>> {
    await this.ensureInitialized();

    const results = new Map<string, HealthCheckResult>();

    const entries = Array.from(this.pools.entries());
    for (const [id, pool] of entries) {
      const health = await pool.healthCheck();
      results.set(id, health);
    }

    return results;
  }

  /**
   * 从数据库加载所有活跃连接
   */
  async loadConnectionsFromDatabase(): Promise<void> {
    try {
      const dataSources = await this.prisma.dataSource.findMany({
        where: { status: 'active' },
      });

      console.log(`正在加载 ${dataSources.length} 个活跃数据源连接...`);

      for (const ds of dataSources) {
        try {
          const config: DatabaseConfig = {
            id: ds.id.toString(),
            name: ds.name,
            type: ds.type as any,
            host: ds.host,
            port: ds.port,
            username: ds.username,
            password: ds.passwordEncrypted,
            databases: [], // 将在后续从 databases_meta 加载
          };

          // 创建连接池（不保存到数据库，因为已存在，使用工厂）
          const pool = this.poolFactory.create(config, DEFAULT_POOL_CONFIG);
          await pool.initialize();
          this.pools.set(config.id, pool);

          this.logger.info(`加载连接: ${ds.name}`);
        } catch (error) {
          this.logger.error(
            `加载连接失败 (${ds.name})`,
            error instanceof Error ? error : new Error(String(error)),
            { metadata: { dataSourceId: ds.id, dataSourceName: ds.name } }
          );
          // 更新状态为错误
          await this.prisma.dataSource.update({
            where: { id: ds.id },
            data: { status: 'error' },
          });
        }
      }

      this.logger.info(`共加载 ${this.pools.size} 个连接`);
    } catch (error) {
      this.logger.error(
        '从数据库加载连接失败',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * 定期健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      console.log('开始定期健康检查...');

      const entries = Array.from(this.pools.entries());
      for (const [id, pool] of entries) {
        try {
          const health = await pool.healthCheck();

          // 更新数据库状态
          const status = health.healthy ? 'active' : 'error';
          await this.prisma.dataSource.update({
            where: { id: parseInt(id) },
            data: { status },
          });

          if (!health.healthy) {
            this.logger.warn(`连接 ${id} 不健康: ${health.error}`);
          }
        } catch (error) {
          this.logger.error(
            `健康检查失败 (${id})`,
            error instanceof Error ? error : new Error(String(error)),
            { metadata: { connectionId: id } }
          );
        }
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    console.log('正在关闭所有连接...');

    this.stopHealthCheck();

    const entries = Array.from(this.pools.entries());
    for (const [id, pool] of entries) {
      try {
        await pool.close();
      } catch (error) {
        this.logger.error(
          `关闭连接失败 (${id})`,
          error instanceof Error ? error : new Error(String(error)),
          { metadata: { connectionId: id } }
        );
      }
    }

    this.pools.clear();
    this.logger.info('所有连接已关闭');
  }

  /**
   * 保存连接配置到数据库
   */
  private async saveToDatabase(config: DatabaseConfig): Promise<void> {
    try {
      await this.prisma.dataSource.upsert({
        where: { name: config.name },
        update: {
          type: config.type,
          host: config.host,
          port: config.port,
          username: config.username,
          passwordEncrypted: config.password,
          status: 'active',
        },
        create: {
          name: config.name,
          type: config.type,
          host: config.host,
          port: config.port,
          username: config.username,
          passwordEncrypted: config.password,
          status: 'active',
        },
      });
    } catch (error) {
      this.logger.error(
        '保存连接配置到数据库失败',
        error instanceof Error ? error : new Error(String(error)),
        { metadata: { configId: config.id } }
      );
      throw error;
    }
  }

  /**
   * 检查密码是否已加密
   */
  private isPasswordEncrypted(password: string): boolean {
    // 加密后的密码通常包含特定字符模式（Base64）
    // AES 加密后的字符串通常较长且包含 = 等字符
    return password.length > 50 && /[A-Za-z0-9+/=]/.test(password);
  }

  /**
   * 获取连接数量
   */
  getConnectionCount(): number {
    return this.pools.size;
  }

  /**
   * 检查连接是否存在
   */
  async hasConnection(id: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.pools.has(id);
  }
}

// 导出类（用于 DI）
export { ConnectionManager };

// 导出单例实例（向后兼容）
// 注意：通过 DI 使用时，应该注入 ConnectionManager 类而不是使用此单例
const connectionManager = new ConnectionManager();
// 启动生命周期服务（仅全局单例）
connectionManager.start();

export default connectionManager;
