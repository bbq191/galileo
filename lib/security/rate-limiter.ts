/**
 * 速率限制器
 *
 * 使用 Redis 实现分布式速率限制，防止 DoS 攻击和 API 滥用
 *
 * 不同级别的限制：
 * - query: 查询执行（最昂贵）- 10 req/min
 * - metadata: 元数据同步 - 5 req/hour
 * - general: 一般读取操作 - 30 req/min
 * - ai: AI 调用 - 20 req/min
 */

import { RateLimiterMemory } from 'rate-limiter-flexible';

/**
 * 创建速率限制器
 *
 * 注意：Next.js 中间件运行在 Edge Runtime，不支持 ioredis
 * 因此这里只使用内存版本
 *
 * 对于生产环境的分布式速率限制，建议：
 * 1. 使用 Vercel/Cloudflare 的 KV 存储 + @upstash/ratelimit
 * 2. 或者将速率限制移到 API 路由层（非中间件）
 */
function createRateLimiter(points: number, duration: number, keyPrefix: string) {
  // 使用内存版本（适合开发和单实例部署）
  return new RateLimiterMemory({
    points, // 允许的请求数
    duration, // 时间窗口（秒）
    keyPrefix,
  });
}

/**
 * 速率限制器实例
 */
export const rateLimiters = {
  // 严格限制：查询执行（最昂贵，调用 AI）
  query: createRateLimiter(10, 60, 'ratelimit:query'), // 10 req/min

  // 中等限制：元数据同步（耗资源但不常用）
  metadata: createRateLimiter(5, 3600, 'ratelimit:metadata'), // 5 req/hour

  // 宽松限制：一般读取操作
  general: createRateLimiter(30, 60, 'ratelimit:general'), // 30 req/min

  // AI 调用限制（直接调用 AI 的端点）
  ai: createRateLimiter(20, 60, 'ratelimit:ai'), // 20 req/min
};

/**
 * 从请求中获取唯一标识符
 *
 * 优先级：用户 ID > IP 地址
 */
export function getIdentifier(request: Request): string {
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
 * 检查速率限制
 *
 * @returns 是否允许请求通过，以及限制信息
 */
export async function checkRateLimit(
  limiter: RateLimiterMemory,
  identifier: string
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfter?: number;
}> {
  try {
    const result = await limiter.consume(identifier, 1);

    return {
      success: true,
      limit: limiter.points,
      remaining: result.remainingPoints,
      resetMs: result.msBeforeNext,
    };
  } catch (error: any) {
    // 超过限制
    if (error instanceof Error && 'msBeforeNext' in error) {
      const msBeforeNext = typeof error.msBeforeNext === 'number' ? error.msBeforeNext : 0;
      return {
        success: false,
        limit: limiter.points,
        remaining: 0,
        resetMs: msBeforeNext,
        retryAfter: Math.ceil(msBeforeNext / 1000),
      };
    }

    // 其他错误（如 Redis 连接失败），允许请求通过
    console.error('Rate limiter error:', error);
    return {
      success: true,
      limit: limiter.points,
      remaining: limiter.points,
      resetMs: 0,
    };
  }
}

/**
 * 速率限制器配置类型
 */
export interface RateLimitConfig {
  points: number;
  duration: number;
  name: string;
}

/**
 * 速率限制结果
 */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfter?: number;
}

/**
 * 注意：关于生产环境的速率限制
 *
 * 当前实现使用内存存储，适合：
 * - 开发环境
 * - 单实例部署
 * - 原型验证
 *
 * 生产环境建议：
 * 1. 使用 Vercel KV (@vercel/kv) + @upstash/ratelimit
 * 2. 使用 Cloudflare KV 或 Durable Objects
 * 3. 将速率限制逻辑移到 API Routes 层，使用 Redis
 *
 * 参考文档：
 * - https://vercel.com/docs/storage/vercel-kv/using-an-sdk#rate-limiting
 * - https://github.com/animir/node-rate-limiter-flexible
 */
