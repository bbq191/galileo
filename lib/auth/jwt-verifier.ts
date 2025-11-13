/**
 * JWT 验证模块
 *
 * 功能：
 * - JWT Token 生成和验证
 * - 用户身份认证
 * - Token 刷新机制
 *
 * 依赖：jsonwebtoken 库
 */

import jwt from 'jsonwebtoken';
import { UserRole, Permission } from './permissions';

/**
 * JWT Payload 接口
 */
export interface JWTPayload {
  /** 用户 ID */
  userId: string;
  /** 用户角色 */
  role: UserRole;
  /** 用户名（可选） */
  username?: string;
  /** 邮箱（可选） */
  email?: string;
  /** 签发时间 */
  iat: number;
  /** 过期时间 */
  exp: number;
}

/**
 * 验证结果
 */
export interface VerifyResult {
  success: boolean;
  payload?: JWTPayload;
  error?: string;
}

/**
 * JWT 配置
 */
const JWT_CONFIG = {
  /** JWT 密钥（从环境变量读取） */
  secret: process.env.JWT_SECRET || 'galileo-default-secret-key-change-in-production',

  /** Token 有效期（默认 7 天） */
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',

  /** Refresh Token 有效期（默认 30 天） */
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

  /** 签发者 */
  issuer: 'galileo-nlp-sql',

  /** 受众 */
  audience: 'galileo-users',
};

/**
 * 生成 JWT Token
 *
 * @param payload - 用户信息
 * @returns JWT Token 字符串
 */
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  try {
    return jwt.sign(payload, JWT_CONFIG.secret, {
      expiresIn: JWT_CONFIG.expiresIn,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    } as jwt.SignOptions);
  } catch (error) {
    console.error('[JWT] 生成 Token 失败:', error);
    throw new Error('Token 生成失败');
  }
}

/**
 * 生成 Refresh Token
 *
 * @param userId - 用户 ID
 * @returns Refresh Token 字符串
 */
export function generateRefreshToken(userId: string): string {
  try {
    return jwt.sign({ userId, type: 'refresh' }, JWT_CONFIG.secret, {
      expiresIn: JWT_CONFIG.refreshExpiresIn,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    } as jwt.SignOptions);
  } catch (error) {
    console.error('[JWT] 生成 Refresh Token 失败:', error);
    throw new Error('Refresh Token 生成失败');
  }
}

/**
 * 验证 JWT Token
 *
 * @param token - JWT Token 字符串
 * @returns 验证结果
 */
export function verifyToken(token: string): VerifyResult {
  try {
    // 验证 Token
    const decoded = jwt.verify(token, JWT_CONFIG.secret, {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    }) as JWTPayload;

    // 检查必需字段
    if (!decoded.userId || !decoded.role) {
      return {
        success: false,
        error: 'Token payload 缺少必需字段',
      };
    }

    // 检查角色有效性
    if (!Object.values(UserRole).includes(decoded.role)) {
      return {
        success: false,
        error: '无效的用户角色',
      };
    }

    return {
      success: true,
      payload: decoded,
    };
  } catch (error) {
    // 处理各种 JWT 错误
    if (error instanceof jwt.TokenExpiredError) {
      return {
        success: false,
        error: 'Token 已过期',
      };
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return {
        success: false,
        error: 'Token 无效',
      };
    }

    if (error instanceof jwt.NotBeforeError) {
      return {
        success: false,
        error: 'Token 尚未生效',
      };
    }

    return {
      success: false,
      error: 'Token 验证失败',
    };
  }
}

/**
 * 刷新 Token
 *
 * @param refreshToken - Refresh Token
 * @returns 新的 Access Token 和 Refresh Token
 */
export async function refreshTokens(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    // 验证 Refresh Token
    const decoded = jwt.verify(refreshToken, JWT_CONFIG.secret, {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    }) as any;

    // 检查是否是 Refresh Token
    if (decoded.type !== 'refresh') {
      return null;
    }

    // 从数据库获取用户信息（这里简化处理）
    // 在实际应用中，应该从数据库查询用户最新信息
    const userPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: decoded.userId,
      role: UserRole.USER, // 应该从数据库获取
    };

    // 生成新的 Token
    const newAccessToken = generateToken(userPayload);
    const newRefreshToken = generateRefreshToken(decoded.userId);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    console.error('[JWT] 刷新 Token 失败:', error);
    return null;
  }
}

/**
 * 解码 Token（不验证签名）
 *
 * @param token - JWT Token
 * @returns 解码后的 payload
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * 检查 Token 是否即将过期
 *
 * @param token - JWT Token
 * @param thresholdSeconds - 阈值（秒），默认 5 分钟
 * @returns 是否即将过期
 */
export function isTokenExpiringSoon(token: string, thresholdSeconds: number = 300): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = decoded.exp - now;

  return timeUntilExpiry < thresholdSeconds;
}

/**
 * 根据角色映射权限
 */
export function getPermissionsByRole(role: UserRole): Permission[] {
  const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    [UserRole.ADMIN]: [
      Permission.QUERY_EXECUTE,
      Permission.AUDIT_VIEW,
      Permission.STATS_VIEW,
      Permission.DATASOURCE_MANAGE,
      Permission.METADATA_MANAGE,
      Permission.SYSTEM_CONFIG,
    ],
    [UserRole.USER]: [
      Permission.QUERY_EXECUTE,
      Permission.AUDIT_VIEW,
    ],
    [UserRole.GUEST]: [
      Permission.QUERY_EXECUTE,
    ],
  };

  return ROLE_PERMISSIONS[role] || [];
}
