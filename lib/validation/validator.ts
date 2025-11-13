// lib/validation/validator.ts
import { z, ZodError } from 'zod';
import { NextResponse } from 'next/server';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string[]>;
}

/**
 * 验证请求体
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const validated = schema.parse(data);
    return {
      success: true,
      data: validated,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors: Record<string, string[]> = {};

      // ZodError 使用 issues 属性
      const issues = error.issues;

      if (Array.isArray(issues)) {
        issues.forEach((err: any) => {
          const path = err.path.join('.') || '_root';
          if (!errors[path]) {
            errors[path] = [];
          }
          errors[path].push(err.message);
        });
      }

      return {
        success: false,
        errors,
      };
    }

    // 处理其他类型的错误
    console.error('Validation error:', error);
    return {
      success: false,
      errors: {
        _general: [error instanceof Error ? error.message : '验证失败'],
      },
    };
  }
}

/**
 * 验证并返回错误响应（如果失败）
 */
export function validateOrRespond<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { data: T } | { response: NextResponse } {
  const result = validateRequest(schema, data);

  if (!result.success) {
    return {
      response: NextResponse.json(
        {
          error: '输入验证失败',
          details: result.errors,
        },
        { status: 400 }
      ),
    };
  }

  return { data: result.data as T };
}
