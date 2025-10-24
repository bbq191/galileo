/**
 * 元数据搜索 API
 * GET /api/metadata/search - 全文搜索元数据
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

/**
 * GET /api/metadata/search
 * 搜索元数据（数据库、表、列）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 搜索参数
    const query = searchParams.get('q') || searchParams.get('query');
    const type = searchParams.get('type'); // 'database' | 'table' | 'column' | 'all'
    const sourceId = searchParams.get('sourceId');
    const databaseId = searchParams.get('databaseId');

    // 分页参数
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    if (!query) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Search query is required',
        },
        { status: 400 }
      );
    }

    const results: any = {
      databases: [],
      tables: [],
      columns: [],
    };

    // 搜索数据库
    if (!type || type === 'database' || type === 'all') {
      const where: any = {
        OR: [
          { databaseName: { contains: query } },
          { semanticDescription: { contains: query } },
        ],
      };

      if (sourceId) {
        where.sourceId = parseInt(sourceId);
      }

      results.databases = await prisma.databaseMeta.findMany({
        where,
        take: type === 'database' ? limit : 10,
        skip: type === 'database' ? skip : 0,
        select: {
          id: true,
          databaseName: true,
          semanticDescription: true,
          sourceId: true,
          source: {
            select: {
              name: true,
              type: true,
            },
          },
          _count: {
            select: { tables: true },
          },
        },
        orderBy: { databaseName: 'asc' },
      });
    }

    // 搜索表
    if (!type || type === 'table' || type === 'all') {
      const where: any = {
        OR: [
          { tableName: { contains: query } },
          { tableComment: { contains: query } },
          { semanticDescription: { contains: query } },
        ],
      };

      if (databaseId) {
        where.databaseId = parseInt(databaseId);
      } else if (sourceId) {
        where.database = {
          sourceId: parseInt(sourceId),
        };
      }

      const tables = await prisma.tableMeta.findMany({
        where,
        take: type === 'table' ? limit : 10,
        skip: type === 'table' ? skip : 0,
        select: {
          id: true,
          tableName: true,
          tableComment: true,
          semanticDescription: true,
          rowCount: true,
          databaseId: true,
          database: {
            select: {
              databaseName: true,
              source: {
                select: {
                  name: true,
                },
              },
            },
          },
          _count: {
            select: { columns: true },
          },
        },
        orderBy: { tableName: 'asc' },
      });

      // 转换 BigInt 为字符串
      results.tables = tables.map((table) => ({
        ...table,
        rowCount: table.rowCount ? table.rowCount.toString() : '0',
      }));
    }

    // 搜索列
    if (!type || type === 'column' || type === 'all') {
      const where: any = {
        OR: [
          { columnName: { contains: query } },
          { columnComment: { contains: query } },
          { semanticDescription: { contains: query } },
        ],
      };

      if (databaseId) {
        where.table = {
          databaseId: parseInt(databaseId),
        };
      } else if (sourceId) {
        where.table = {
          database: {
            sourceId: parseInt(sourceId),
          },
        };
      }

      results.columns = await prisma.columnMeta.findMany({
        where,
        take: type === 'column' ? limit : 10,
        skip: type === 'column' ? skip : 0,
        select: {
          id: true,
          columnName: true,
          dataType: true,
          columnComment: true,
          semanticDescription: true,
          isPrimaryKey: true,
          isUnique: true,
          tableId: true,
          table: {
            select: {
              tableName: true,
              databaseId: true,
              database: {
                select: {
                  databaseName: true,
                  source: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { columnName: 'asc' },
      });
    }

    // 计算总数
    const total =
      results.databases.length +
      results.tables.length +
      results.columns.length;

    // 如果是搜索全部，合并结果并分页
    if (type === 'all' || !type) {
      const allResults = [
        ...results.databases.map((d: any) => ({ ...d, _type: 'database' })),
        ...results.tables.map((t: any) => ({ ...t, _type: 'table' })),
        ...results.columns.map((c: any) => ({ ...c, _type: 'column' })),
      ];

      return NextResponse.json({
        status: 'success',
        data: allResults.slice(skip, skip + limit),
        summary: {
          databases: results.databases.length,
          tables: results.tables.length,
          columns: results.columns.length,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // 返回分类结果
    return NextResponse.json({
      status: 'success',
      data: results,
      summary: {
        databases: results.databases.length,
        tables: results.tables.length,
        columns: results.columns.length,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('搜索元数据失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to search metadata',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
