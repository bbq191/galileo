/**
 * 认证配置
 *
 * 本模块同时被 proxy.ts 和 API Routes 引用。
 */

/** Cookie 名称 */
export const AUTH_COOKIES = {
  /** Access Token，所有路径可见 */
  access: 'galileo_at',
  /** Refresh Token，仅 /api/auth 路径可见，缩小暴露面 */
  refresh: 'galileo_rt',
} as const;

export const REFRESH_COOKIE_PATH = '/api/auth';

/**
 * 由 middleware 注入的可信身份请求头
 *
 * middleware 会先删除客户端传入的同名请求头，再根据 Token 重新设置，
 * 因此 API Routes 可以直接信任这些值。
 */
export const IDENTITY_HEADERS = {
  userId: 'x-user-id',
  userName: 'x-user-name',
  role: 'x-user-role',
  sessionId: 'x-session-id',
} as const;

const MIN_SECRET_LENGTH = 32;

/** .env.example 中的示例值，照抄部署时视为未配置 */
const EXAMPLE_SECRET = 'your-super-secret-jwt-key-min-32-chars-change-in-production';

/**
 * 解析时长字符串（如 30m、7d）为秒数
 */
export function parseDurationSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`无效的时长配置: "${value}"，格式应为数字加 s/m/h/d，例如 30m`);
  }
  const amount = Number(match[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * unit;
}

export interface AuthConfig {
  secret: Uint8Array;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  issuer: string;
  audience: string;
  cookieSecure: boolean;
}

/**
 * 读取认证配置
 *
 * JWT_SECRET 为必需项，缺失、过短或仍为示例值时直接抛错，不再提供默认密钥。
 * 每次调用时读取环境变量，便于测试中切换。
 */
export function getAuthConfig(): AuthConfig {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH || secret === EXAMPLE_SECRET) {
    throw new Error(
      `JWT_SECRET 未配置、长度不足 ${MIN_SECRET_LENGTH} 个字符或仍为 .env.example 中的示例值，` +
      '请运行 npm run security:generate-keys 生成后写入环境变量'
    );
  }

  return {
    secret: new TextEncoder().encode(secret),
    accessTtlSeconds: parseDurationSeconds(process.env.JWT_EXPIRES_IN || '30m'),
    refreshTtlSeconds: parseDurationSeconds(process.env.JWT_REFRESH_EXPIRES_IN || '7d'),
    issuer: 'galileo-nlp-sql',
    audience: 'galileo-users',
    // 内网 HTTP 部署时可设置 AUTH_COOKIE_SECURE=false
    cookieSecure: process.env.AUTH_COOKIE_SECURE
      ? process.env.AUTH_COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production',
  };
}
