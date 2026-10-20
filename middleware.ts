/**
 * Next.js 中间件 - 认证、访问控制与 API 速率限制
 *
 * 处理顺序：
 * 1. 跨站写请求拦截（Origin 校验）
 * 2. 剥离客户端伪造的身份请求头
 * 3. 按 lib/auth/route-policy.ts 校验登录态与权限，注入可信身份请求头
 * 4. API 速率限制（已登录按用户计数，未登录按 IP 计数）
 *
 * 不同端点使用不同的限制策略：
 * - /api/query/execute: 10 req/min（最昂贵）
 * - /api/datasources/{id}/sync: 5 req/hour
 * - /api/ai/*: 20 req/min
 * - /api/auth/login: 10 req/min（按 IP）
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
  getClientIp,
  checkDistributedRateLimit,
} from '@/lib/security/distributed-rate-limiter';
import {
  CURRENT_API_VERSION,
  API_VERSIONS,
} from '@/lib/api/version-middleware';
import { AUTH_COOKIES, IDENTITY_HEADERS } from '@/lib/auth/config';
import { verifyAccessToken, type AccessTokenPayload } from '@/lib/auth/tokens';
import { getPermissionsByRole, UserRole } from '@/lib/auth/permissions';
import { resolveRouteAccess } from '@/lib/auth/route-policy';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 常量时间字符串比较（Edge Runtime 无 crypto.timingSafeEqual）
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 解析请求身份：管理员 API Key（脚本调用）或 Access Token Cookie（浏览器）
 */
async function resolveIdentity(request: NextRequest): Promise<AccessTokenPayload | null> {
  const apiKey = request.headers.get('x-api-key');
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (apiKey && adminApiKey && constantTimeEqual(apiKey, adminApiKey)) {
    return { userId: 'api-key', username: 'api-key', role: UserRole.ADMIN, sessionId: 'api-key' };
  }

  const token = request.cookies.get(AUTH_COOKIES.access)?.value;
  if (!token) return null;

  const result = await verifyAccessToken(token);
  return result.ok ? result.payload : null;
}

/**
 * 写请求的 Origin 与当前站点不一致时视为跨站请求
 * （SameSite=Lax 已阻止跨站写请求携带 Cookie，此处为纵深防御）
 */
function isCrossOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

function setVersionHeaders(response: NextResponse): NextResponse {
  const versionInfo = API_VERSIONS[CURRENT_API_VERSION];
  response.headers.set('API-Version', CURRENT_API_VERSION);
  response.headers.set('API-Release-Date', versionInfo.releaseDate);
  return response;
}

function apiError(status: number, error: string, code: string): NextResponse {
  return setVersionHeaders(NextResponse.json({ success: false, error, code }, { status }));
}

function selectLimiter(pathname: string) {
  // 手动执行保存的查询与执行查询共用限额（直接访问业务库）
  if (pathname.startsWith('/api/query/execute') || /^\/api\/saved-queries\/\d+\/run$/.test(pathname)) {
    return { limiter: distributedRateLimiters.query, name: 'query' };
  }
  if (pathname.startsWith('/api/datasources/') && pathname.endsWith('/sync')) {
    return { limiter: distributedRateLimiters.metadata, name: 'metadata' };
  }
  if (pathname === '/api/auth/login') {
    return { limiter: distributedRateLimiters.auth, name: 'auth' };
  }
  if (pathname.startsWith('/api/ai/') || pathname.includes('/semantic')) {
    return { limiter: distributedRateLimiters.ai, name: 'ai' };
  }
  return { limiter: distributedRateLimiters.general, name: 'general' };
}

/**
 * 中间件主函数
 *
 * Next.js middleware 默认运行在 Edge Runtime 中
 * 确保所有依赖都兼容 Edge Runtime（无 Node.js 专有 API）
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (isApi && !READ_METHODS.has(request.method) && isCrossOrigin(request)) {
    return apiError(403, '拒绝跨站请求', 'cross_origin');
  }

  // 剥离客户端传入的身份请求头，防止伪造用户绕过限流或污染审计日志
  const requestHeaders = new Headers(request.headers);
  for (const header of Object.values(IDENTITY_HEADERS)) {
    requestHeaders.delete(header);
  }

  const access = resolveRouteAccess(pathname, request.method);
  let identity: AccessTokenPayload | null = null;

  if (access.kind === 'authenticated') {
    try {
      identity = await resolveIdentity(request);
    } catch (error) {
      // 通常是 JWT_SECRET 未配置
      console.error('[Auth] 身份校验失败:', error instanceof Error ? error.message : error);
      return isApi
        ? apiError(500, '认证服务未正确配置', 'auth_misconfigured')
        : new NextResponse('认证服务未正确配置', { status: 500 });
    }

    if (!identity) {
      if (isApi) {
        return apiError(401, '未登录或登录已过期', 'unauthorized');
      }
      // 页面请求先尝试用 Refresh Token 续期，失败时由刷新接口跳转登录页
      const refreshUrl = new URL('/api/auth/refresh', request.url);
      refreshUrl.searchParams.set('next', pathname + search);
      return NextResponse.redirect(refreshUrl);
    }

    if (access.permission && !getPermissionsByRole(identity.role).includes(access.permission)) {
      return isApi
        ? apiError(403, '权限不足', 'forbidden')
        : NextResponse.redirect(new URL('/', request.url));
    }

    requestHeaders.set(IDENTITY_HEADERS.userId, identity.userId);
    requestHeaders.set(IDENTITY_HEADERS.userName, encodeURIComponent(identity.username));
    requestHeaders.set(IDENTITY_HEADERS.role, identity.role);
    requestHeaders.set(IDENTITY_HEADERS.sessionId, identity.sessionId);
  }

  const forward = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (!isApi) {
    return forward();
  }

  // 健康检查端点不受速率限制，但仍需添加版本头
  if (pathname === '/api/health') {
    return setVersionHeaders(forward());
  }

  const { limiter, name: limiterName } = selectLimiter(pathname);
  const identifier = identity ? `user:${identity.userId}` : `ip:${getClientIp(request)}`;

  // 检查速率限制
  const { success, limit, remaining, resetMs, retryAfter } = await checkDistributedRateLimit(
    limiter,
    identifier
  );

  // 准备响应
  let response: NextResponse;

  if (success) {
    // 允许请求通过
    response = forward();
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
    // Edge Runtime 兼容的简单日志记录
    console.warn(
      `[Rate Limit Violation] ${new Date().toISOString()}`,
      `| Type: ${limiterName}`,
      `| Endpoint: ${pathname}`,
      `| Identifier: ${identifier}`,
      `| IP: ${getClientIp(request)}`
    );
  }

  // 添加速率限制响应头（符合 RFC 标准）
  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  response.headers.set('X-RateLimit-Reset', new Date(Date.now() + resetMs).toISOString());

  return setVersionHeaders(response);
}

/**
 * 中间件配置
 *
 * 匹配除静态资源外的所有路径（页面需要登录校验，API 需要登录校验与速率限制）
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
