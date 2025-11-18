/**
 * API Routes 速率限制中间件
 *
 * 为 API Routes 提供分布式速率限制保护
 * 使用内部 Redis 服务（支持内网环境）
 *
 * 使用示例：
 * ```typescript
 * import { withRateLimit, withQueryRateLimit } from '@/lib/security/api-rate-limit-middleware';
 *
 * // 方式1：使用预定义限制器
 * export const POST = withQueryRateLimit(async (request) => {
 *   // 你的处理逻辑
 *   return NextResponse.json({ data: 'result' });
 * });
 *
 * // 方式2：自定义限制类型
 * export const GET = withRateLimit('general', async (request) => {
 *   return NextResponse.json({ data: 'result' });
 * });
 * ```
 */

import { NextResponse } from 'next/server';
import {
  redisRateLimiters,
  checkRedisRateLimit,
  getIdentifierFromRequest,
} from './redis-rate-limiter';
import { logRateLimitViolation } from './rate-limit-logger';

/**
 * 速率限制类型
 */
export type RateLimitType = 'query' | 'metadata' | 'general' | 'ai';

/**
 * API 处理函数类型
 */
type ApiHandler = (
  request: Request,
  context?: { params: Record<string, string> }
) => Promise<Response>;

/**
 * 创建带速率限制的 API 处理函数包装器
 *
 * @param type 速率限制类型
 * @param handler 原始 API 处理函数
 * @returns 包装后的处理函数
 */
export function withRateLimit(type: RateLimitType, handler: ApiHandler): ApiHandler {
  return async (request: Request, context?: { params: Record<string, string> }) => {
    const limiter = redisRateLimiters[type];
    const identifier = getIdentifierFromRequest(request);

    // 检查速率限制
    const { success, limit, remaining, resetMs, retryAfter } = await checkRedisRateLimit(
      limiter,
      identifier
    );

    if (!success) {
      // 记录违规（异步，不阻塞响应）
      const forwarded = request.headers.get('x-forwarded-for');
      const realIp = request.headers.get('x-real-ip');
      const ip = forwarded?.split(',')[0] || realIp || '127.0.0.1';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      logRateLimitViolation({
        endpoint: new URL(request.url).pathname,
        identifier,
        ip,
        userAgent,
        limiterType: type,
      }).catch((err) => console.error('[API Rate Limit] 日志记录失败:', err));

      // 返回 429 Too Many Requests
      const response = NextResponse.json(
        {
          error: '请求过于频繁，请稍后再试',
          message: `您已超过 ${type} 端点的速率限制。请在 ${retryAfter} 秒后重试。`,
          retryAfter,
        },
        { status: 429 }
      );

      // 设置速率限制响应头
      if (retryAfter !== undefined) {
        response.headers.set('Retry-After', retryAfter.toString());
      }
      response.headers.set('X-RateLimit-Limit', limit.toString());
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', new Date(Date.now() + resetMs).toISOString());

      return response;
    }

    // 执行原始处理函数
    const response = await handler(request, context);

    // 如果响应是 NextResponse，添加速率限制响应头
    if (response instanceof NextResponse) {
      response.headers.set('X-RateLimit-Limit', limit.toString());
      response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
      response.headers.set('X-RateLimit-Reset', new Date(Date.now() + resetMs).toISOString());
    }

    return response;
  };
}

/**
 * 预定义的速率限制中间件
 */

/**
 * 查询执行速率限制（10 req/min）
 * 用于：/api/query/execute
 */
export function withQueryRateLimit(handler: ApiHandler): ApiHandler {
  return withRateLimit('query', handler);
}

/**
 * 元数据同步速率限制（5 req/hour）
 * 用于：/api/metadata/sync, /api/datasources/{id}/sync
 */
export function withMetadataRateLimit(handler: ApiHandler): ApiHandler {
  return withRateLimit('metadata', handler);
}

/**
 * AI 调用速率限制（20 req/min）
 * 用于：/api/ai/*, /api/metadata/relationships/infer
 */
export function withAiRateLimit(handler: ApiHandler): ApiHandler {
  return withRateLimit('ai', handler);
}

/**
 * 一般 API 速率限制（30 req/min）
 * 用于：其他 API 端点
 */
export function withGeneralRateLimit(handler: ApiHandler): ApiHandler {
  return withRateLimit('general', handler);
}
