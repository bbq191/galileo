/**
 * 反馈相关接口的公共处理
 */

import { NextResponse } from 'next/server';
import { safeServerErrorResponse } from '@/lib/api/response';
import { FeedbackError } from './feedback-service';

export function feedbackErrorResponse(error: unknown, context: string) {
  if (error instanceof FeedbackError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return safeServerErrorResponse(error instanceof Error ? error : new Error('处理反馈失败'), { context });
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '20', 10) || 20));
  return { page, limit };
}

export function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
