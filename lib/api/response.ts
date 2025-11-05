/**
 * API 响应工具
 *
 * 提供统一的 API 响应格式
 */

import { NextResponse } from 'next/server';
import { sanitizeError, ErrorCategory, type SafeError } from '@/lib/security/error-sanitizer';

/**
 * 成功响应
 */
export function successResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

/**
 * 分页响应
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  status: number = 200
) {
  return NextResponse.json(
    {
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    { status }
  );
}

/**
 * 错误响应（已废弃，请使用 safeErrorResponse）
 * @deprecated 使用 safeErrorResponse 以确保错误信息安全
 */
export function errorResponse(
  message: string,
  status: number = 400,
  errors?: any
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        ...(errors && { details: errors }),
      },
    },
    { status }
  );
}

/**
 * 安全错误响应（推荐使用）
 */
export function safeErrorResponse(
  error: Error | string,
  options?: {
    category?: ErrorCategory;
    statusCode?: number;
    requestId?: string;
  }
) {
  const safeError = sanitizeError(error, options);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: safeError.code,
        message: safeError.message,
        category: safeError.category,
        timestamp: safeError.timestamp,
        ...(safeError.requestId && { requestId: safeError.requestId }),
      },
    },
    { status: safeError.statusCode }
  );
}

/**
 * 验证错误响应
 */
export function validationErrorResponse(errors: Record<string, string>) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message: 'Validation failed',
        details: errors,
      },
    },
    { status: 422 }
  );
}

/**
 * 未找到响应
 */
export function notFoundResponse(resource: string = 'Resource') {
  return errorResponse(`${resource} not found`, 404);
}

/**
 * 未授权响应
 */
export function unauthorizedResponse(message: string = 'Unauthorized') {
  return errorResponse(message, 401);
}

/**
 * 服务器错误响应（已废弃，请使用 safeErrorResponse）
 * @deprecated 使用 safeErrorResponse 以确保错误信息安全
 */
export function serverErrorResponse(error: Error) {
  console.error('Server error:', error);

  return NextResponse.json(
    {
      success: false,
      error: {
        message: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && {
          details: error.message,
          stack: error.stack,
        }),
      },
    },
    { status: 500 }
  );
}

/**
 * 安全服务器错误响应（推荐使用）
 */
export function safeServerErrorResponse(
  error: Error,
  options?: {
    context?: string;
    requestId?: string;
    metadata?: Record<string, any>;
  }
) {
  // 使用安全的错误日志记录
  const safeError = sanitizeError(error, {
    category: ErrorCategory.INTERNAL,
    statusCode: 500,
    requestId: options?.requestId,
  });

  // 仅在生产环境记录错误 ID，开发环境记录完整信息（已通过脱敏器处理）
  console.error('[SafeServerError]', {
    errorId: safeError.code,
    context: options?.context,
    category: safeError.category,
    timestamp: safeError.timestamp,
    ...(process.env.NODE_ENV === 'development' && {
      originalMessage: error.message,
      stack: error.stack?.split('\n').slice(0, 5), // 仅保留前5行堆栈
    }),
    ...options?.metadata,
  });

  return NextResponse.json(
    {
      success: false,
      error: {
        code: safeError.code,
        message: safeError.message,
        category: safeError.category,
        timestamp: safeError.timestamp,
        ...(safeError.requestId && { requestId: safeError.requestId }),
      },
    },
    { status: 500 }
  );
}
