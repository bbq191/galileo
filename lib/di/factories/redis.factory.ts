/**
 * Redis 客户端工厂
 * 提供单例 Redis 客户端实例
 */

import Redis from 'ioredis';

/**
 * Redis 连接配置
 */
export interface RedisFactoryConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

/**
 * 全局类型扩展
 */
declare global {
  var redisGlobal: Redis | undefined;
}

/**
 * 创建 Redis 客户端单例
 */
export function createRedisClient(config?: RedisFactoryConfig): Redis {
  const redisConfig = {
    host: config?.host || process.env.REDIS_HOST || 'localhost',
    port: config?.port || parseInt(process.env.REDIS_PORT || '6379'),
    password: config?.password || process.env.REDIS_PASSWORD || undefined,
    db: config?.db || parseInt(process.env.REDIS_DB || '0'),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    // 延迟连接，避免构建时尝试连接
    lazyConnect: true,
    // 开发环境启用离线队列，允许在 Redis 未启动时继续运行
    enableOfflineQueue: true,
  };

  if (globalThis.redisGlobal) {
    return globalThis.redisGlobal;
  }

  const redisClient = new Redis(redisConfig);

  // 在构建时静默错误，避免污染构建日志
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

  redisClient.on('connect', () => {
    if (!isBuildTime) {
      console.log('[Redis] 已连接到 Redis 服务器');
    }
  });

  redisClient.on('error', (err) => {
    // 构建时静默连接错误（预期的行为）
    if (!isBuildTime) {
      console.error('[Redis] 连接错误:', err);
    }
  });

  redisClient.on('ready', () => {
    if (!isBuildTime) {
      console.log('[Redis] Redis 客户端就绪');
    }
  });

  // 注册清理钩子，使用 once 避免重复注册
  const cleanup = async () => {
    if (redisClient.status !== 'end') {
      await redisClient.quit();
      console.log('[Redis] 已断开连接');
    }
  };

  if (typeof process !== 'undefined') {
    // 增加 maxListeners 避免内存泄漏警告
    process.setMaxListeners(Math.max(process.getMaxListeners(), 20));

    // 使用 once 避免重复注册
    process.once('beforeExit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }

  // 所有环境都复用同一个客户端（生产环境若重复创建，每个客户端各自建立连接并注册监听器）
  globalThis.redisGlobal = redisClient;

  return redisClient;
}

/**
 * 检查 Redis 连接健康状态
 */
export async function checkRedisHealth(client: Redis): Promise<boolean> {
  try {
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] 健康检查失败:', error);
    return false;
  }
}
