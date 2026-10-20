/**
 * JWT 签发与校验（基于 jose，兼容 Edge Runtime 与 Node.js）
 *
 * - Access Token：携带身份与角色，middleware 无状态校验
 * - Refresh Token：携带 tokenVersion，刷新时与数据库比对以支持吊销
 */

import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';
import { JWTExpired } from 'jose/errors';
import { getAuthConfig } from './config';
import { isUserRole, type UserRole } from './permissions';

export interface AccessTokenPayload {
  userId: string;
  username: string;
  role: UserRole;
  /** 会话 ID，登录时生成，刷新时保持不变 */
  sessionId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenVersion: number;
}

export type VerifyResult<T> =
  | { ok: true; payload: T; expiresAt: number }
  | { ok: false; reason: 'expired' | 'invalid' };

const ALGORITHM = 'HS256';

async function sign(claims: Record<string, unknown>, subject: string, ttlSeconds: number) {
  const config = getAuthConfig();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(subject)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(config.secret);
}

async function verify(token: string, expectedType: 'access' | 'refresh') {
  const config = getAuthConfig();
  try {
    const { payload } = await jwtVerify(token, config.secret, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: [ALGORITHM],
    });
    if (payload.typ !== expectedType || !payload.sub || typeof payload.sid !== 'string') {
      return { ok: false as const, reason: 'invalid' as const };
    }
    return { ok: true as const, payload, expiresAt: (payload.exp ?? 0) * 1000 };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof JWTExpired ? ('expired' as const) : ('invalid' as const),
    };
  }
}

export function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return sign(
    { typ: 'access', name: payload.username, role: payload.role, sid: payload.sessionId },
    payload.userId,
    getAuthConfig().accessTtlSeconds
  );
}

export function signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
  return sign(
    { typ: 'refresh', sid: payload.sessionId, ver: payload.tokenVersion },
    payload.userId,
    getAuthConfig().refreshTtlSeconds
  );
}

export async function verifyAccessToken(token: string): Promise<VerifyResult<AccessTokenPayload>> {
  const result = await verify(token, 'access');
  if (!result.ok) return result;

  const { sub, name, role, sid } = result.payload;
  if (typeof name !== 'string' || !isUserRole(role)) {
    return { ok: false, reason: 'invalid' };
  }
  return {
    ok: true,
    expiresAt: result.expiresAt,
    payload: { userId: sub!, username: name, role, sessionId: sid as string },
  };
}

export async function verifyRefreshToken(token: string): Promise<VerifyResult<RefreshTokenPayload>> {
  const result = await verify(token, 'refresh');
  if (!result.ok) return result;

  const { sub, sid, ver } = result.payload;
  if (typeof ver !== 'number') {
    return { ok: false, reason: 'invalid' };
  }
  return {
    ok: true,
    expiresAt: result.expiresAt,
    payload: { userId: sub!, sessionId: sid as string, tokenVersion: ver },
  };
}
