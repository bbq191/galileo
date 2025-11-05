/**
 * 健康检查 API
 * GET /api/health
 *
 * 用于测试服务器是否正常运行
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET(request: NextRequest) {
  try {
    // 检查数据库连接
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    }, { status: 503 });
  }
}
