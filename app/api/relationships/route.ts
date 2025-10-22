/**
 * 关系查询 API
 * GET /api/relationships - 获取关系列表
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

/**
 * GET /api/relationships
 * 获取关系列表（显式关系和推断关系）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 分页参数
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // 过滤参数
    const type = searchParams.get('type'); // 'explicit' | 'inferred' | 'all'
    const tableId = searchParams.get('tableId');
    const verified = searchParams.get('verified'); // 'true' | 'false' (仅对推断关系有效)
    const minConfidence = searchParams.get('minConfidence'); // 最小置信度 (0-1)

    let explicitRelationships = [];
    let inferredRelationships = [];

    // 查询显式关系
    if (!type || type === 'explicit' || type === 'all') {
      const where: any = {};

      if (tableId) {
        const tid = parseInt(tableId);
        where.OR = [
          { sourceTableId: tid },
          { targetTableId: tid },
        ];
      }

      explicitRelationships = await prisma.explicitRelationship.findMany({
        where,
        skip: type === 'explicit' ? skip : 0,
        take: type === 'explicit' ? limit : undefined,
        include: {
          sourceTable: {
            select: {
              id: true,
              tableName: true,
              database: {
                select: {
                  id: true,
                  databaseName: true,
                },
              },
            },
          },
          targetTable: {
            select: {
              id: true,
              tableName: true,
              database: {
                select: {
                  id: true,
                  databaseName: true,
                },
              },
            },
          },
          sourceColumn: {
            select: {
              id: true,
              columnName: true,
              dataType: true,
            },
          },
          targetColumn: {
            select: {
              id: true,
              columnName: true,
              dataType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // 查询推断关系
    if (!type || type === 'inferred' || type === 'all') {
      const where: any = {};

      if (tableId) {
        const tid = parseInt(tableId);
        where.OR = [
          { sourceTableId: tid },
          { targetTableId: tid },
        ];
      }

      if (verified === 'true') {
        where.isVerified = true;
      } else if (verified === 'false') {
        where.isVerified = false;
      }

      if (minConfidence) {
        where.confidenceScore = { gte: parseFloat(minConfidence) };
      }

      inferredRelationships = await prisma.inferredRelationship.findMany({
        where,
        skip: type === 'inferred' ? skip : 0,
        take: type === 'inferred' ? limit : undefined,
        include: {
          sourceTable: {
            select: {
              id: true,
              tableName: true,
              database: {
                select: {
                  id: true,
                  databaseName: true,
                },
              },
            },
          },
          targetTable: {
            select: {
              id: true,
              tableName: true,
              database: {
                select: {
                  id: true,
                  databaseName: true,
                },
              },
            },
          },
          sourceColumn: {
            select: {
              id: true,
              columnName: true,
              dataType: true,
            },
          },
          targetColumn: {
            select: {
              id: true,
              columnName: true,
              dataType: true,
            },
          },
        },
        orderBy: { confidenceScore: 'desc' },
      });
    }

    // 合并结果
    const relationships = [
      ...explicitRelationships.map((r) => ({
        ...r,
        type: 'explicit' as const,
        confidenceScore: 1.0, // 显式关系置信度为 1
      })),
      ...inferredRelationships.map((r) => ({
        ...r,
        type: 'inferred' as const,
        confidenceScore: parseFloat(r.confidenceScore.toString()),
      })),
    ];

    // 如果是查询全部，需要分页
    let paginatedRelationships = relationships;
    if (type === 'all' || !type) {
      paginatedRelationships = relationships.slice(skip, skip + limit);
    }

    const total = relationships.length;

    return NextResponse.json({
      status: 'success',
      data: paginatedRelationships,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('获取关系列表失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch relationships',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
