/**
 * 业务服务层错误与接口层的公共处理
 *
 * 服务函数抛出 ServiceError（携带 HTTP 状态码与可直接展示的消息），
 * 路由用 serviceErrorResponse 统一转换；其他异常按服务器错误处理，不向客户端暴露细节。
 */

import { NextResponse } from 'next/server';
import { safeServerErrorResponse } from './response';

export class ServiceError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 422) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function serviceErrorResponse(error: unknown, context: string) {
  if (error instanceof ServiceError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return safeServerErrorResponse(error instanceof Error ? error : new Error('请求处理失败'), { context });
}

export function parsePagination(searchParams: URLSearchParams, defaultLimit = 20) {
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? String(defaultLimit), 10) || defaultLimit));
  return { page, limit };
}

export function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
