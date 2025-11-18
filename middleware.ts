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
 *
 * 支持分布式部署：
 * - 配置 Upstash Redis 后自动启用分布式速率限制
 * - 未配置时回退到内存版本（适合开发环境）
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  distributedRateLimiters,
  getRequestIdentifier,
  checkDistributedRateLimit,
} from '@/lib/security/distributed-rate-limiter';
import {
  CURRENT_API_VERSION,
  API_VERSIONS,
} from '@/lib/api/version-middleware';

/**
 * 中间件主函数
 *
 * Next.js middleware 默认运行在 Edge Runtime 中
 * 确保所有依赖都兼容 Edge Runtime（无 Node.js 专有 API）
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 仅对 API 路由应用速率限制
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 健康检查端点不受速率限制，但仍需添加版本头
  if (pathname === '/api/health') {
    const healthResponse = NextResponse.next();
    const versionInfo = API_VERSIONS[CURRENT_API_VERSION];
    healthResponse.headers.set('API-Version', CURRENT_API_VERSION);
    healthResponse.headers.set('API-Release-Date', versionInfo.releaseDate);
    return healthResponse;
  }

  // 确定使用哪个限制器
  let limiter;
  let limiterName = 'general';

  if (pathname.startsWith('/api/query/execute')) {
    limiter = distributedRateLimiters.query;
    limiterName = 'query';
  } else if (pathname.startsWith('/api/metadata/sync')) {
    limiter = distributedRateLimiters.metadata;
    limiterName = 'metadata';
  } else if (pathname.startsWith('/api/datasources/') && pathname.endsWith('/sync')) {
    limiter = distributedRateLimiters.metadata;
    limiterName = 'metadata';
  } else if (pathname.startsWith('/api/ai/') || pathname.includes('/semantic')) {
    limiter = distributedRateLimiters.ai;
    limiterName = 'ai';
  } else {
    limiter = distributedRateLimiters.general;
    limiterName = 'general';
  }

  // 获取请求标识符（用户 ID 或 IP）
  const identifier = getRequestIdentifier(request);

  // 检查速率限制
  const { success, limit, remaining, resetMs, retryAfter } = await checkDistributedRateLimit(
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

    // Edge Runtime 兼容的简单日志记录
    console.warn(
      `[Rate Limit Violation] ${new Date().toISOString()}`,
      `| Type: ${limiterName}`,
      `| Endpoint: ${pathname}`,
      `| Identifier: ${identifier}`,
      `| IP: ${ip}`
    );
  }

  // 添加速率限制响应头（符合 RFC 标准）
  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  response.headers.set('X-RateLimit-Reset', new Date(Date.now() + resetMs).toISOString());

  // 添加 API 版本信息（使用版本中间件模块的常量）
  const versionInfo = API_VERSIONS[CURRENT_API_VERSION];
  response.headers.set('API-Version', CURRENT_API_VERSION);
  response.headers.set('API-Release-Date', versionInfo.releaseDate);

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
