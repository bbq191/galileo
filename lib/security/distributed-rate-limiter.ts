/**
 * 分布式速率限制器
 *
 * 支持多种部署模式：
 * - Upstash Redis（外部服务，Edge Runtime 兼容）
 * - 内存版本（开发环境和内网环境）
 *
 * 配置环境变量：
 * - UPSTASH_REDIS_REST_URL: Upstash Redis REST URL（可选，外网环境）
 * - UPSTASH_REDIS_REST_TOKEN: Upstash Redis REST Token（可选，外网环境）
 *
 * 内网环境说明：
 * - 如果不配置 Upstash，自动使用内存版本
 * - API Routes 层会使用内部 Redis（redis-rate-limiter.ts）提供分布式支持
 * - Middleware 层使用内存版本作为快速第一道防线
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  /** 时间窗口内允许的请求数 */
  requests: number;
  /** 时间窗口（秒） */
  window: number;
  /** 限制器名称（用于日志和分析） */
  name: string;
}

/**
 * 速率限制结果
 */
export interface DistributedRateLimitResult {
  /** 是否允许请求通过 */
  success: boolean;
  /** 总限制数 */
  limit: number;
  /** 剩余请求数 */
  remaining: number;
  /** 重置时间（毫秒后） */
  resetMs: number;
  /** 建议重试时间（秒） */
  retryAfter?: number;
}

/**
 * 分布式速率限制器类型
 */
type DistributedRateLimiter = {
  limit: (identifier: string) => Promise<DistributedRateLimitResult>;
  config: RateLimitConfig;
};

/**
 * 检查 Upstash Redis 配置是否可用
 */
function isUpstashConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * 创建 Upstash Redis 客户端
 */
function createRedisClient(): Redis | null {
  if (!isUpstashConfigured()) {
    return null;
  }

  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

/**
 * 内存速率限制器（回退方案）
 *
 * 使用简单的 Map 实现，适合：
 * - 开发环境
 * - 内网环境（配合 API Routes 层的 Redis 速率限制）
 * - 单实例部署
 *
 * 注意：在多实例部署时，此限制器为每个实例独立计数
 * API Routes 层使用 redis-rate-limiter.ts 提供真正的分布式速率限制
 */
class MemoryRateLimiter {
  private store = new Map<string, { count: number; resetTime: number }>();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // 启动定期清理（每分钟）
    this.startCleanup();
  }

  private startCleanup(): void {
    // 避免在 Edge Runtime 中使用 setInterval（可能不支持）
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }
  }

  async limit(identifier: string): Promise<DistributedRateLimitResult> {
    const now = Date.now();
    const windowMs = this.config.window * 1000;
    const key = `${this.config.name}:${identifier}`;

    let record = this.store.get(key);

    // 如果记录不存在或已过期，创建新记录
    if (!record || now >= record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    // 增加计数
    record.count++;
    this.store.set(key, record);

    const remaining = Math.max(0, this.config.requests - record.count);
    const resetMs = Math.max(0, record.resetTime - now);
    const success = record.count <= this.config.requests;

    return {
      success,
      limit: this.config.requests,
      remaining,
      resetMs,
      retryAfter: success ? undefined : Math.ceil(resetMs / 1000),
    };
  }

  getConfig(): RateLimitConfig {
    return this.config;
  }

  // 清理过期记录（防止内存泄漏）
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now >= record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * 创建分布式速率限制器
 *
 * 如果 Upstash 配置可用，使用分布式版本；否则回退到内存版本
 */
function createDistributedRateLimiter(
  config: RateLimitConfig
): DistributedRateLimiter {
  const redis = createRedisClient();

  if (redis) {
    // 使用 Upstash 分布式速率限制
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.requests, `${config.window} s`),
      prefix: `ratelimit:${config.name}`,
      analytics: true,
    });

    return {
      config,
      limit: async (identifier: string): Promise<DistributedRateLimitResult> => {
        const result = await ratelimit.limit(identifier);

        return {
          success: result.success,
          limit: result.limit,
          remaining: result.remaining,
          resetMs: Math.max(0, result.reset - Date.now()),
          retryAfter: result.success
            ? undefined
            : Math.ceil((result.reset - Date.now()) / 1000),
        };
      },
    };
  } else {
    // 回退到内存版本（适合开发环境和内网环境）
    // 内网环境下，API Routes 层会使用 redis-rate-limiter.ts 提供分布式支持
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[Rate Limiter] ${config.name} 使用内存版本（开发环境）`
      );
    } else {
      console.warn(
        `[Rate Limiter] ${config.name} 使用内存版本。` +
        `生产环境建议：配置 Upstash 或确保 API Routes 层已集成 Redis 速率限制`
      );
    }

    const memoryLimiter = new MemoryRateLimiter(config);

    return {
      config,
      limit: (identifier: string) => memoryLimiter.limit(identifier),
    };
  }
}

/**
 * 分布式速率限制器实例
 *
 * 不同端点使用不同的限制策略
 */
export const distributedRateLimiters = {
  /** 查询执行（最昂贵，调用 AI）- 10 req/min */
  query: createDistributedRateLimiter({
    requests: 10,
    window: 60,
    name: 'query',
  }),

  /** 元数据同步（耗资源但不常用）- 5 req/hour */
  metadata: createDistributedRateLimiter({
    requests: 5,
    window: 3600,
    name: 'metadata',
  }),

  /** 一般读取操作 - 30 req/min */
  general: createDistributedRateLimiter({
    requests: 30,
    window: 60,
    name: 'general',
  }),

  /** AI 调用 - 20 req/min */
  ai: createDistributedRateLimiter({
    requests: 20,
    window: 60,
    name: 'ai',
  }),
};

/**
 * 从请求中获取唯一标识符
 *
 * 优先级：用户 ID > IP 地址
 */
export function getRequestIdentifier(request: Request): string {
  // 1. 优先使用用户 ID（如果有认证系统）
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
 * 检查分布式速率限制
 *
 * @param limiter 速率限制器实例
 * @param identifier 请求标识符
 * @returns 速率限制结果
 */
export async function checkDistributedRateLimit(
  limiter: DistributedRateLimiter,
  identifier: string
): Promise<DistributedRateLimitResult> {
  try {
    return await limiter.limit(identifier);
  } catch (error) {
    // 如果速率限制器失败，允许请求通过（fail-open 策略）
    console.error('[Distributed Rate Limiter] 检查失败:', error);
    return {
      success: true,
      limit: limiter.config.requests,
      remaining: limiter.config.requests,
      resetMs: 0,
    };
  }
}

/**
 * 获取速率限制器配置信息
 */
export function getRateLimiterInfo(): {
  type: 'distributed' | 'memory';
  configured: boolean;
  limiters: Record<string, RateLimitConfig>;
} {
  const isDistributed = isUpstashConfigured();

  return {
    type: isDistributed ? 'distributed' : 'memory',
    configured: isDistributed,
    limiters: {
      query: distributedRateLimiters.query.config,
      metadata: distributedRateLimiters.metadata.config,
      general: distributedRateLimiters.general.config,
      ai: distributedRateLimiters.ai.config,
    },
  };
}
