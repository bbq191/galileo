/**
 * API 测试端点
 * 验证 Prisma 数据库连接是否正常
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

export async function GET() {
  try {
    // 测试数据库连接
    await prisma.$queryRaw`SELECT 1`;

    // 获取数据字典条目数量
    const dictionaryCount = await prisma.dataDictionary.count();
    const dataSourceCount = await prisma.dataSource.count();

    return NextResponse.json({
      status: 'success',
      message: 'Database connection successful',
      data: {
        prismaVersion: '6.17.1',
        databaseConnected: true,
        statistics: {
          dataDictionary: dictionaryCount,
          dataSources: dataSourceCount,
        },
      },
    });
  } catch (error) {
    console.error('Database connection error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Database connection failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
