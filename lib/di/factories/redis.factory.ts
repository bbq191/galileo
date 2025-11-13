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
  // eslint-disable-next-line no-var
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
  };

  if (globalThis.redisGlobal) {
    return globalThis.redisGlobal;
  }

  const redisClient = new Redis(redisConfig);

  redisClient.on('connect', () => {
    console.log('[Redis] 已连接到 Redis 服务器');
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] 连接错误:', err);
  });

  redisClient.on('ready', () => {
    console.log('[Redis] Redis 客户端就绪');
  });

  // 注册清理钩子
  const cleanup = async () => {
    await redisClient.quit();
    console.log('[Redis] 已断开连接');
  };

  if (typeof process !== 'undefined') {
    process.on('beforeExit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  // 保存到 global（开发环境）
  if (process.env.NODE_ENV !== 'production') {
    globalThis.redisGlobal = redisClient;
  }

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
