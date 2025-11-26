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
    const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST || '3', 10);

    // 超过最大重试次数后返回 null，停止重试
    if (times > maxRetries) {
      return null;
    }

    const delay = Math.min(times * retryDelayMs, maxRetryDelayMs);
    return delay;
  },
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST || '3', 10),
  // 添加命令超时配置，防止请求挂起
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
  // 开发环境启用离线队列，允许在 Redis 未启动时继续运行
  // 生产环境禁用离线队列，快速失败
  enableOfflineQueue: true,
  // 自动重连配置
  lazyConnect: true,
  enableReadyCheck: true,
};

// 创建 Redis 客户端单例
let redisClient: Redis | null = null;

/**
 * 获取 Redis 客户端实例
 * @author xusy
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);

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

    // 非构建环境下自动连接
    if (!isBuildTime && redisConfig.lazyConnect) {
      redisClient.connect().catch((err) => {
        console.warn('[Redis] 初始连接失败，将在首次使用时重试:', err.message);
      });
    }
  }

  return redisClient;
}

/**
 * 关闭 Redis 连接
 * @author xusy
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
 * @author xusy
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisClient();

    // 检查连接状态，尝试连接如果未连接
    if (client.status === 'wait' || client.status === 'close' || client.status === 'end') {
      await client.connect();
    }

    // 通过 ping 检查连接是否可用
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] 健康检查失败:', error);
    return false;
  }
}

export default getRedisClient;
