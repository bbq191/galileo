/**
 * Redis 客户端配置
 * 用于 L2 缓存层
 */

import Redis from 'ioredis';

// Redis 连接配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
};

// 创建 Redis 客户端单例
let redisClient: Redis | null = null;

/**
 * 获取 Redis 客户端实例
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);

    redisClient.on('connect', () => {
      console.log('[Redis] 已连接到 Redis 服务器');
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] 连接错误:', err);
    });

    redisClient.on('ready', () => {
      console.log('[Redis] Redis 客户端就绪');
    });
  }

  return redisClient;
}

/**
 * 关闭 Redis 连接
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] 已断开连接');
  }
}

/**
 * 检查 Redis 连接状态
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] 健康检查失败:', error);
    return false;
  }
}

export default getRedisClient;
