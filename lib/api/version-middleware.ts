/**
 * API 版本管理中间件
 *
 * 为 API 响应添加版本信息，支持：
 * - 版本标识
 * - 弃用警告
 * - 日落通知
 * - 后继版本链接
 */

import { NextResponse } from 'next/server';

/**
 * API 版本状态
 */
export type VersionStatus = 'active' | 'deprecated' | 'sunset';

/**
 * API 版本信息
 */
export interface ApiVersionInfo {
  /** 版本状态 */
  status: VersionStatus;
  /** 日落日期（ISO 格式） */
  sunset?: string;
  /** 后继版本 */
  successor?: string;
  /** 发布日期 */
  releaseDate: string;
  /** 版本说明 */
  description: string;
}

/**
 * API 版本定义
 */
export const API_VERSIONS: Record<string, ApiVersionInfo> = {
  v1: {
    status: 'active',
    releaseDate: '2025-11-17',
    description: 'Initial stable release',
  },
};

/**
 * 当前 API 版本
 */
export const CURRENT_API_VERSION = 'v1';

/**
 * API 版本响应头
 */
export interface VersionHeaders {
  'API-Version': string;
  'API-Release-Date': string;
  Deprecation?: string;
  Sunset?: string;
  Link?: string;
}

/**
 * 获取版本响应头
 */
export function getVersionHeaders(version: string = CURRENT_API_VERSION): VersionHeaders {
  const versionInfo = API_VERSIONS[version];

  if (!versionInfo) {
    throw new Error(`Unknown API version: ${version}`);
  }

  const headers: VersionHeaders = {
    'API-Version': version,
    'API-Release-Date': versionInfo.releaseDate,
  };

  // 添加弃用警告
  if (versionInfo.status === 'deprecated' || versionInfo.status === 'sunset') {
    headers.Deprecation = 'true';
  }

  // 添加日落日期
  if (versionInfo.sunset) {
    headers.Sunset = versionInfo.sunset;
  }

  // 添加后继版本链接
  if (versionInfo.successor) {
    headers.Link = `<${versionInfo.successor}>; rel="successor-version"`;
  }

  return headers;
}

/**
 * 为响应添加版本头
 */
export function addVersionHeaders(
  response: NextResponse,
  version: string = CURRENT_API_VERSION
): NextResponse {
  const headers = getVersionHeaders(version);

  Object.entries(headers).forEach(([key, value]) => {
    if (value) {
      response.headers.set(key, value);
    }
  });

  return response;
}

/**
 * API 处理函数类型
 */
type ApiHandler = (request: Request, context?: any) => Promise<Response>;

/**
 * 带版本信息的 API 包装器
 *
 * @param version API 版本
 * @param handler 原始处理函数
 * @returns 包装后的处理函数
 *
 * @example
 * ```typescript
 * export const GET = withApiVersion('v1', async (request) => {
 *   return NextResponse.json({ data: 'example' });
 * });
 * ```
 */
export function withApiVersion(version: string, handler: ApiHandler): ApiHandler {
  return async (request: Request, context?: any) => {
    const response = await handler(request, context);

    // 如果是 NextResponse，添加版本头
    if (response instanceof NextResponse) {
      return addVersionHeaders(response, version);
    }

    // 如果是普通 Response，转换为 NextResponse
    const nextResponse = NextResponse.json(await response.json(), {
      status: response.status,
      headers: response.headers,
    });

    return addVersionHeaders(nextResponse, version);
  };
}

/**
 * 使用当前版本的 API 包装器
 */
export function withCurrentApiVersion(handler: ApiHandler): ApiHandler {
  return withApiVersion(CURRENT_API_VERSION, handler);
}

/**
 * 获取 API 版本信息
 */
export function getApiVersionInfo(): {
  current: string;
  versions: typeof API_VERSIONS;
} {
  return {
    current: CURRENT_API_VERSION,
    versions: API_VERSIONS,
  };
}

/**
 * 检查版本是否已弃用
 */
export function isVersionDeprecated(version: string): boolean {
  const versionInfo = API_VERSIONS[version];
  return versionInfo?.status === 'deprecated' || versionInfo?.status === 'sunset';
}

/**
 * 检查版本是否即将日落
 */
export function isVersionSunset(version: string): boolean {
  const versionInfo = API_VERSIONS[version];
  return versionInfo?.status === 'sunset';
}

/**
 * 获取版本迁移建议
 */
export function getVersionMigrationAdvice(version: string): string | null {
  const versionInfo = API_VERSIONS[version];

  if (!versionInfo) {
    return null;
  }

  if (versionInfo.status === 'deprecated') {
    return `API version ${version} is deprecated. ${
      versionInfo.successor
        ? `Please migrate to ${versionInfo.successor}.`
        : 'Please check for newer versions.'
    }`;
  }

  if (versionInfo.status === 'sunset') {
    return `API version ${version} will be removed on ${versionInfo.sunset}. ${
      versionInfo.successor
        ? `Please migrate to ${versionInfo.successor} immediately.`
        : 'Please check for newer versions immediately.'
    }`;
  }

  return null;
}

/**
 * 弃用端点信息
 */
export interface DeprecatedEndpoint {
  /** 端点路径 */
  path: string;
  /** 精确匹配规则；未设置时按 path 前缀匹配（前缀匹配会连同所有子路径一起弃用） */
  pattern?: RegExp;
  /** 弃用日期 */
  deprecatedDate: string;
  /** 日落日期 */
  sunsetDate: string;
  /** 替代端点 */
  replacement?: string;
  /** 弃用原因 */
  reason: string;
}

/**
 * 已弃用的端点列表
 * 在此处添加需要弃用的端点
 */
export const DEPRECATED_ENDPOINTS: DeprecatedEndpoint[] = [
  // 业务域 CRUD 统一到 /api/domains（支持关键词维护）；
  // /api/metadata/domains 下的 infer、batch-infer、apply、metrics 保留，不受影响
  {
    path: '/api/metadata/domains',
    pattern: /^\/api\/metadata\/domains\/?$/,
    deprecatedDate: '2026-10-20',
    sunsetDate: '2027-01-20',
    replacement: '/api/domains',
    reason: 'Business domain CRUD moved to /api/domains',
  },
  {
    path: '/api/metadata/domains/{id}',
    pattern: /^\/api\/metadata\/domains\/\d+\/?$/,
    deprecatedDate: '2026-10-20',
    sunsetDate: '2027-01-20',
    replacement: '/api/domains/{id}',
    reason: 'Business domain CRUD moved to /api/domains',
  },
];

/**
 * 弃用警告统计
 */
interface DeprecationStats {
  /** 弃用警告计数 */
  warnings: Map<string, number>;
  /** 上次重置时间 */
  lastReset: Date;
}

const deprecationStats: DeprecationStats = {
  warnings: new Map(),
  lastReset: new Date(),
};

/**
 * 检查端点是否已弃用
 */
export function isEndpointDeprecated(path: string): DeprecatedEndpoint | null {
  return (
    DEPRECATED_ENDPOINTS.find((endpoint) =>
      endpoint.pattern ? endpoint.pattern.test(path) : path.startsWith(endpoint.path)
    ) || null
  );
}

/**
 * 记录弃用警告
 */
export function logDeprecationWarning(
  endpoint: string,
  clientInfo?: {
    ip?: string;
    userAgent?: string;
  }
): void {
  // 更新统计
  const currentCount = deprecationStats.warnings.get(endpoint) || 0;
  deprecationStats.warnings.set(endpoint, currentCount + 1);

  // 记录警告日志
  console.warn(
    `[Deprecation Warning] ${new Date().toISOString()}`,
    `| Endpoint: ${endpoint}`,
    `| Count: ${currentCount + 1}`,
    clientInfo?.ip ? `| IP: ${clientInfo.ip}` : '',
    clientInfo?.userAgent ? `| UA: ${clientInfo.userAgent.substring(0, 50)}` : ''
  );
}

/**
 * 获取弃用警告统计
 */
export function getDeprecationStats(): {
  warnings: Record<string, number>;
  lastReset: string;
  totalWarnings: number;
} {
  const warningsObj: Record<string, number> = {};
  let total = 0;

  deprecationStats.warnings.forEach((count, endpoint) => {
    warningsObj[endpoint] = count;
    total += count;
  });

  return {
    warnings: warningsObj,
    lastReset: deprecationStats.lastReset.toISOString(),
    totalWarnings: total,
  };
}

/**
 * 重置弃用警告统计
 */
export function resetDeprecationStats(): void {
  deprecationStats.warnings.clear();
  deprecationStats.lastReset = new Date();
}

/**
 * 为响应添加端点弃用警告头
 */
export function addEndpointDeprecationHeaders(
  response: NextResponse,
  endpoint: DeprecatedEndpoint
): NextResponse {
  response.headers.set('Deprecation', 'true');
  response.headers.set('Deprecation-Date', endpoint.deprecatedDate);
  response.headers.set('Sunset', endpoint.sunsetDate);

  if (endpoint.replacement) {
    response.headers.set('Link', `<${endpoint.replacement}>; rel="successor-version"`);
  }

  // 添加警告头
  response.headers.set(
    'Warning',
    `299 - "This endpoint is deprecated and will be removed on ${endpoint.sunsetDate}. ${
      endpoint.replacement ? `Please migrate to ${endpoint.replacement}.` : ''
    }"`
  );

  return response;
}

/**
 * 带弃用检查的 API 包装器
 *
 * 自动检查端点是否已弃用，添加相应的警告头和日志
 */
export function withDeprecationCheck<Args extends [Request, ...unknown[]]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const [request] = args;
    const url = new URL(request.url);
    const deprecatedEndpoint = isEndpointDeprecated(url.pathname);

    const response = await handler(...args);

    if (deprecatedEndpoint) {
      // 记录弃用警告
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      logDeprecationWarning(url.pathname, { ip, userAgent });

      // 添加弃用头
      if (response instanceof NextResponse) {
        return addEndpointDeprecationHeaders(response, deprecatedEndpoint);
      }
    }

    return response;
  };
}
