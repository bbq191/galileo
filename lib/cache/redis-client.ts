/**
 * Redis 客户端配置
 * 用于 L2 缓存层
 */

import Redis from 'ioredis';

// Redis 连接配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  retryStrategy: (times: number) => {
    const retryDelayMs = parseInt(process.env.REDIS_RETRY_DELAY_MS || '50', 10);
    const maxRetryDelayMs = parseInt(process.env.REDIS_MAX_RETRY_DELAY_MS || '2000', 10);
    const delay = Math.min(times * retryDelayMs, maxRetryDelayMs);
    return delay;
  },
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST || '3', 10),
  // 添加命令超时配置，防止请求挂起
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10),
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '3000', 10),
  // 启用离线队列，防止 Redis 未启动时阻塞
  enableOfflineQueue: false,
  // 自动重连配置
  lazyConnect: false,
  enableReadyCheck: true,
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
    // 检查连接是否就绪
    if (client.status !== 'ready') {
      console.warn('[Redis] 连接未就绪，当前状态:', client.status);
      return false;
    }
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] 健康检查失败:', error);
    return false;
  }
}

export default getRedisClient;
