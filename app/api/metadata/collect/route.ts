/**
 * 元数据采集 API
 * POST /api/metadata/collect - 采集指定数据源的元数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectionManager } from '@/lib/database';
import { CollectorFactory } from '@/lib/metadata/collectors';
import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';

/**
 * 采集元数据
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataSourceId, databases } = body;

    if (!dataSourceId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing dataSourceId' },
        { status: 400 }
      );
    }

    // 获取数据源信息
    const dataSource = await (prisma as PrismaClient).dataSource.findUnique({
      where: { id: parseInt(dataSourceId) },
    });

    if (!dataSource) {
      return NextResponse.json(
        { status: 'error', message: 'Data source not found' },
        { status: 404 }
      );
    }

    // 获取连接池
    const connectionId = dataSourceId.toString();
    if (!(await connectionManager.hasConnection(connectionId))) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Connection not found. Please create connection first.',
        },
        { status: 404 }
      );
    }

    const pool = await connectionManager.getConnection(connectionId);

    // 创建采集器
    const collector = CollectorFactory.createCollector(
      pool,
      dataSource.type as any
    );

    // 采集数据库列表（如果未指定）
    const databasesToCollect = databases || [];

    if (databasesToCollect.length === 0) {
      const dbList = await collector.collectDatabases(connectionId);
      databasesToCollect.push(...dbList.map((db) => db.name));
    }

    // 采集结果
    const results = [];

    for (const dbName of databasesToCollect) {
      try {
        console.log(`\n开始采集数据库: ${dbName}`);
        const result = await (collector as any).collectAll(
          connectionId,
          dbName
        );
        results.push({
          database: dbName,
          ...result,
        });
      } catch (error) {
        console.error(`采集数据库 ${dbName} 失败:`, error);
        results.push({
          database: dbName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 更新数据源的最后同步时间
    await (prisma as PrismaClient).dataSource.update({
      where: { id: parseInt(dataSourceId) },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      status: 'success',
      message: `Successfully collected metadata from ${results.length} databases`,
      data: results,
    });
  } catch (error) {
    console.error('元数据采集失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to collect metadata',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
