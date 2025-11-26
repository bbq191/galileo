/**
 * 基于 Redis 的分布式速率限制器
 *
 * 用于 API Routes 层（Node.js Runtime），支持：
 * - 内部 Redis 服务（无需外部网络）
 * - 分布式部署（跨实例状态共享）
 * - 持久化速率限制状态
 *
 * 适用场景：
 * - 生产环境的多实例部署
 * - 内网环境（无外部依赖）
 *
 * 注意：此文件不能在 middleware.ts 中使用（Edge Runtime 不支持 ioredis）
 */

import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { getRedisClient } from '@/lib/cache/redis-client';

/**
 * Redis 速率限制配置
 */
export interface RedisRateLimitConfig {
  /** 时间窗口内允许的请求数 */
  points: number;
  /** 时间窗口（秒） */
  duration: number;
  /** 限制器名称 */
  name: string;
  /** Key 前缀 */
  keyPrefix: string;
}

/**
 * 速率限制结果
 */
export interface RedisRateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfter?: number;
}

/**
 * Redis 速率限制器实例缓存
 */
const limitersCache = new Map<string, RateLimiterRedis | RateLimiterMemory>();

/**
 * 检查 Redis 是否配置
 */
function isRedisConfigured(): boolean {
  return !!(process.env.REDIS_HOST || process.env.REDIS_URL);
}

/**
 * 创建 Redis 速率限制器
 *
 * 如果 Redis 配置可用，使用 Redis 版本；否则回退到内存版本
 */
function createRedisRateLimiter(
  config: RedisRateLimitConfig
): RateLimiterRedis | RateLimiterMemory {
  const cacheKey = config.keyPrefix;

  // 检查缓存
  if (limitersCache.has(cacheKey)) {
    return limitersCache.get(cacheKey)!;
  }

  let limiter: RateLimiterRedis | RateLimiterMemory;

  if (isRedisConfigured()) {
    try {
      const redisClient = getRedisClient();

      limiter = new RateLimiterRedis({
        storeClient: redisClient,
        points: config.points,
        duration: config.duration,
        keyPrefix: config.keyPrefix,
        // 如果 Redis 出错，不阻塞请求
        insuranceLimiter: new RateLimiterMemory({
          points: config.points,
          duration: config.duration,
          keyPrefix: `${config.keyPrefix}:fallback`,
        }),
      });

      console.log(`[Redis Rate Limiter] ${config.name} 使用 Redis 分布式速率限制`);
    } catch (error) {
      console.warn(`[Redis Rate Limiter] Redis 连接失败，${config.name} 回退到内存版本:`, error);

      limiter = new RateLimiterMemory({
        points: config.points,
        duration: config.duration,
        keyPrefix: config.keyPrefix,
      });
    }
  } else {
    console.warn(`[Redis Rate Limiter] Redis 未配置，${config.name} 使用内存版本`);

    limiter = new RateLimiterMemory({
      points: config.points,
      duration: config.duration,
      keyPrefix: config.keyPrefix,
    });
  }

  limitersCache.set(cacheKey, limiter);
  return limiter;
}

/**
 * 预定义的 Redis 速率限制器配置
 */
export const redisRateLimitConfigs = {
  /** 查询执行（最昂贵，调用 AI）- 10 req/min */
  query: {
    points: 10,
    duration: 60,
    name: 'query',
    keyPrefix: 'ratelimit:redis:query',
  },

  /** 元数据同步（耗资源但不常用）- 5 req/hour */
  metadata: {
    points: 5,
    duration: 3600,
    name: 'metadata',
    keyPrefix: 'ratelimit:redis:metadata',
  },

  /** 一般读取操作 - 30 req/min */
  general: {
    points: 30,
    duration: 60,
    name: 'general',
    keyPrefix: 'ratelimit:redis:general',
  },

  /** AI 调用 - 20 req/min */
  ai: {
    points: 20,
    duration: 60,
    name: 'ai',
    keyPrefix: 'ratelimit:redis:ai',
  },
} as const;

/**
 * Redis 速率限制器实例（延迟初始化以避免循环依赖）
 */
let _redisRateLimitersCache: Record<string, RateLimiterRedis | RateLimiterMemory> | null = null;

export const redisRateLimiters = {
  get query() {
    if (!_redisRateLimitersCache) {
      _redisRateLimitersCache = {
        query: createRedisRateLimiter(redisRateLimitConfigs.query),
        metadata: createRedisRateLimiter(redisRateLimitConfigs.metadata),
        general: createRedisRateLimiter(redisRateLimitConfigs.general),
        ai: createRedisRateLimiter(redisRateLimitConfigs.ai),
      };
    }
    return _redisRateLimitersCache.query;
  },
  get metadata() {
    if (!_redisRateLimitersCache) {
      _redisRateLimitersCache = {
        query: createRedisRateLimiter(redisRateLimitConfigs.query),
        metadata: createRedisRateLimiter(redisRateLimitConfigs.metadata),
        general: createRedisRateLimiter(redisRateLimitConfigs.general),
        ai: createRedisRateLimiter(redisRateLimitConfigs.ai),
      };
    }
    return _redisRateLimitersCache.metadata;
  },
  get general() {
    if (!_redisRateLimitersCache) {
      _redisRateLimitersCache = {
        query: createRedisRateLimiter(redisRateLimitConfigs.query),
        metadata: createRedisRateLimiter(redisRateLimitConfigs.metadata),
        general: createRedisRateLimiter(redisRateLimitConfigs.general),
        ai: createRedisRateLimiter(redisRateLimitConfigs.ai),
      };
    }
    return _redisRateLimitersCache.general;
  },
  get ai() {
    if (!_redisRateLimitersCache) {
      _redisRateLimitersCache = {
        query: createRedisRateLimiter(redisRateLimitConfigs.query),
        metadata: createRedisRateLimiter(redisRateLimitConfigs.metadata),
        general: createRedisRateLimiter(redisRateLimitConfigs.general),
        ai: createRedisRateLimiter(redisRateLimitConfigs.ai),
      };
    }
    return _redisRateLimitersCache.ai;
  },
};

/**
 * 检查 Redis 速率限制
 *
 * @param limiter 速率限制器实例
 * @param identifier 请求标识符（用户 ID 或 IP）
 * @returns 速率限制结果
 */
export async function checkRedisRateLimit(
  limiter: RateLimiterRedis | RateLimiterMemory,
  identifier: string
): Promise<RedisRateLimitResult> {
  try {
    const result = await limiter.consume(identifier, 1);

    return {
      success: true,
      limit: limiter.points,
      remaining: result.remainingPoints,
      resetMs: result.msBeforeNext,
    };
  } catch (error: unknown) {
    // 超过限制
    if (error && typeof error === 'object' && 'msBeforeNext' in error) {
      const rateLimitError = error as { msBeforeNext: number };
      return {
        success: false,
        limit: limiter.points,
        remaining: 0,
        resetMs: rateLimitError.msBeforeNext,
        retryAfter: Math.ceil(rateLimitError.msBeforeNext / 1000),
      };
    }

    // 其他错误（如 Redis 连接失败），允许请求通过
    console.error('[Redis Rate Limiter] 检查失败:', error);
    return {
      success: true,
      limit: limiter.points,
      remaining: limiter.points,
      resetMs: 0,
    };
  }
}

/**
 * 从请求中获取标识符
 */
export function getIdentifierFromRequest(request: Request): string {
  // 1. 优先使用用户 ID
  const userId = request.headers.get('x-user-id');
  if (userId) {
    return `user:${userId}`;
  }

  // 2. 回退到 IP 地址
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || '127.0.0.1';

  return `ip:${ip}`;
}

/**
 * 获取 Redis 速率限制器信息
 */
export function getRedisRateLimiterInfo(): {
  type: 'redis' | 'memory';
  configured: boolean;
  configs: typeof redisRateLimitConfigs;
} {
  return {
    type: isRedisConfigured() ? 'redis' : 'memory',
    configured: isRedisConfigured(),
    configs: redisRateLimitConfigs,
  };
}
