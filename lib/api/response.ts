/**
 * API 响应工具
 *
 * 提供统一的 API 响应格式
 */

import { NextResponse } from 'next/server';

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
 * 错误响应
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
 * 服务器错误响应
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
