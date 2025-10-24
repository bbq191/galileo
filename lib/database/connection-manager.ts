/**
 * 数据库连接管理器
 * 负责管理多个数据库连接池
 */

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

/**
 * 连接管理器单例
 */
class ConnectionManager {
  private pools: Map<string, ConnectionPool> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 60 秒
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // 启动定期健康检查
    this.startHealthCheck();
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
      console.log('[ConnectionManager] Initialized successfully');
    } catch (error) {
      console.error('[ConnectionManager] Initialization failed:', error);
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

      // 创建连接池
      const pool = new ConnectionPool(configWithEncryption, poolConfig);
      await pool.initialize();

      // 存储连接池
      this.pools.set(config.id, pool);

      // 保存到数据库
      await this.saveToDatabase(configWithEncryption);

      console.log(`✓ 连接 ${config.name} 创建成功`);
    } catch (error) {
      console.error(`创建连接失败 (${config.id}):`, error);
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
    await prisma.dataSource.update({
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
      const dataSources = await prisma.dataSource.findMany({
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

          // 创建连接池（不保存到数据库，因为已存在）
          const pool = new ConnectionPool(config, DEFAULT_POOL_CONFIG);
          await pool.initialize();
          this.pools.set(config.id, pool);

          console.log(`✓ 加载连接: ${ds.name}`);
        } catch (error) {
          console.error(`加载连接失败 (${ds.name}):`, error);
          // 更新状态为错误
          await prisma.dataSource.update({
            where: { id: ds.id },
            data: { status: 'error' },
          });
        }
      }

      console.log(`✓ 共加载 ${this.pools.size} 个连接`);
    } catch (error) {
      console.error('从数据库加载连接失败:', error);
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
          await prisma.dataSource.update({
            where: { id: parseInt(id) },
            data: { status },
          });

          if (!health.healthy) {
            console.warn(`连接 ${id} 不健康:`, health.error);
          }
        } catch (error) {
          console.error(`健康检查失败 (${id}):`, error);
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
        console.error(`关闭连接失败 (${id}):`, error);
      }
    }

    this.pools.clear();
    console.log('✓ 所有连接已关闭');
  }

  /**
   * 保存连接配置到数据库
   */
  private async saveToDatabase(config: DatabaseConfig): Promise<void> {
    try {
      await prisma.dataSource.upsert({
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
      console.error('保存连接配置到数据库失败:', error);
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

// 导出单例实例
const connectionManager = new ConnectionManager();
export default connectionManager;

// 优雅关闭处理
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    console.log('\n正在优雅关闭连接管理器...');
    await connectionManager.closeAll();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n正在优雅关闭连接管理器...');
    await connectionManager.closeAll();
    process.exit(0);
  });
}
