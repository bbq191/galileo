/**
 * Next.js 中间件 - API 速率限制
 *
 * 为所有 API 端点提供速率限制保护，防止：
 * - DoS 攻击
 * - API 滥用
 * - AI 额度消耗过快
 *
 * 不同端点使用不同的限制策略：
 * - /api/query/execute: 10 req/min（最昂贵）
 * - /api/metadata/sync: 5 req/hour
 * - /api/ai/*: 20 req/min
 * - 其他 API: 30 req/min
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { rateLimiters, getIdentifier, checkRateLimit } from '@/lib/security/rate-limiter';
import { logRateLimitViolation } from '@/lib/security/rate-limit-logger';

/**
 * 中间件主函数
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 仅对 API 路由应用速率限制
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 健康检查端点不受限制
  if (pathname === '/api/health') {
    return NextResponse.next();
  }

  // 确定使用哪个限制器
  let limiter;
  let limiterName = 'general';

  if (pathname.startsWith('/api/query/execute')) {
    limiter = rateLimiters.query;
    limiterName = 'query';
  } else if (pathname.startsWith('/api/metadata/sync')) {
    limiter = rateLimiters.metadata;
    limiterName = 'metadata';
  } else if (pathname.startsWith('/api/datasources/') && pathname.endsWith('/sync')) {
    limiter = rateLimiters.metadata;
    limiterName = 'metadata';
  } else if (pathname.startsWith('/api/ai/') || pathname.includes('/semantic')) {
    limiter = rateLimiters.ai;
    limiterName = 'ai';
  } else {
    limiter = rateLimiters.general;
    limiterName = 'general';
  }

  // 获取请求标识符（用户 ID 或 IP）
  const identifier = getIdentifier(request);

  // 检查速率限制
  const { success, limit, remaining, resetMs, retryAfter } = await checkRateLimit(
    limiter,
    identifier
  );

  // 准备响应
  let response: NextResponse;

  if (success) {
    // 允许请求通过
    response = NextResponse.next();
  } else {
    // 超过限制，返回 429
    response = NextResponse.json(
      {
        error: '请求过于频繁，请稍后再试',
        message: `您已超过 ${limiterName} 端点的速率限制。请在 ${retryAfter} 秒后重试。`,
        retryAfter,
      },
      { status: 429 }
    );

    // 添加 Retry-After 头（HTTP 标准）
    if (retryAfter) {
      response.headers.set('Retry-After', retryAfter.toString());
    }

    // 记录速率限制违规（用于监控和安全分析）
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0] || realIp || '127.0.0.1';

    await logRateLimitViolation({
      endpoint: pathname,
      identifier,
      ip,
      userAgent: request.headers.get('user-agent') || 'unknown',
      limiterType: limiterName,
    });
  }

  // 添加速率限制响应头（符合 RFC 标准）
  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  response.headers.set('X-RateLimit-Reset', new Date(Date.now() + resetMs).toISOString());

  return response;
}

/**
 * 中间件配置
 *
 * 匹配所有 API 路由
 */
export const config = {
  matcher: '/api/:path*',
};
