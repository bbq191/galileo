/**
 * 业务域管理 API
 *
 * GET /api/domains - 获取所有业务域
 * POST /api/domains - 创建新业务域
 *
 * @author xusy
 */


export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';

/**
 * GET /api/domains
 * 获取所有业务域列表
 */
export async function GET() {
  try {
    const prisma = getPrismaClient();

    const domains = await prisma.businessDomain.findMany({
      include: {
        keywords: {
          orderBy: { weight: 'desc' },
        },
        databases: {
          select: {
            id: true,
            databaseName: true,
          },
        },
        _count: {
          select: {
            databases: true,
            keywords: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        total: domains.length,
        domains: domains,
      },
    });
  } catch (error) {
    console.error('获取业务域列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取业务域列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/domains
 * 创建新业务域
 */
export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();
    const body = await request.json();

    const { name, description, ownerTeam, keywords } = body;

    // 验证必填字段
    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: '业务域名称不能为空',
        },
        { status: 400 }
      );
    }

    // 检查名称是否已存在
    const existing = await prisma.businessDomain.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: '业务域名称已存在',
        },
        { status: 400 }
      );
    }

    // 创建业务域
    const domain = await prisma.businessDomain.create({
      data: {
        name,
        description,
        ownerTeam,
        keywords: keywords
          ? {
              create: keywords.map((kw: { keyword: string; weight?: number }) => ({
                keyword: kw.keyword,
                weight: kw.weight || 1.0,
              })),
            }
          : undefined,
      },
      include: {
        keywords: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: '业务域创建成功',
      data: domain,
    });
  } catch (error) {
    console.error('创建业务域失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建业务域失败',
      },
      { status: 500 }
    );
  }
}
