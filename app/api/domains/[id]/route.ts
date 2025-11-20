/**
 * 单个业务域管理 API
 *
 * GET /api/domains/[id] - 获取业务域详情
 * PUT /api/domains/[id] - 更新业务域
 * DELETE /api/domains/[id] - 删除业务域
 *
 * @author xusy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/domains/[id]
 * 获取业务域详情
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const prisma = getPrismaClient();
    const domainId = parseInt(params.id);

    if (isNaN(domainId)) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的业务域 ID',
        },
        { status: 400 }
      );
    }

    const domain = await prisma.businessDomain.findUnique({
      where: { id: domainId },
      include: {
        keywords: {
          orderBy: { weight: 'desc' },
        },
        databases: {
          select: {
            id: true,
            databaseName: true,
            semanticDescription: true,
          },
        },
        _count: {
          select: {
            databases: true,
            keywords: true,
          },
        },
      },
    });

    if (!domain) {
      return NextResponse.json(
        {
          success: false,
          error: '业务域不存在',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: domain,
    });
  } catch (error) {
    console.error('获取业务域详情失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取业务域详情失败',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/domains/[id]
 * 更新业务域
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const prisma = getPrismaClient();
    const domainId = parseInt(params.id);
    const body = await request.json();

    if (isNaN(domainId)) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的业务域 ID',
        },
        { status: 400 }
      );
    }

    const { name, description, ownerTeam } = body;

    // 检查业务域是否存在
    const existing = await prisma.businessDomain.findUnique({
      where: { id: domainId },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: '业务域不存在',
        },
        { status: 404 }
      );
    }

    // 如果更新名称，检查是否与其他业务域重复
    if (name && name !== existing.name) {
      const duplicate = await prisma.businessDomain.findUnique({
        where: { name },
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error: '业务域名称已存在',
          },
          { status: 400 }
        );
      }
    }

    // 更新业务域
    const updated = await prisma.businessDomain.update({
      where: { id: domainId },
      data: {
        name: name || existing.name,
        description: description !== undefined ? description : existing.description,
        ownerTeam: ownerTeam !== undefined ? ownerTeam : existing.ownerTeam,
      },
      include: {
        keywords: true,
        databases: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('更新业务域失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新业务域失败',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/domains/[id]
 * 删除业务域
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const prisma = getPrismaClient();
    const domainId = parseInt(params.id);

    if (isNaN(domainId)) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的业务域 ID',
        },
        { status: 400 }
      );
    }

    // 检查业务域是否存在
    const existing = await prisma.businessDomain.findUnique({
      where: { id: domainId },
      include: {
        _count: {
          select: {
            databases: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: '业务域不存在',
        },
        { status: 404 }
      );
    }

    // 检查是否有关联的数据库
    if (existing._count.databases > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `该业务域下还有 ${existing._count.databases} 个数据库，无法删除`,
        },
        { status: 400 }
      );
    }

    // 删除业务域（关键词会被级联删除）
    await prisma.businessDomain.delete({
      where: { id: domainId },
    });

    return NextResponse.json({
      success: true,
      message: '业务域已删除',
    });
  } catch (error) {
    console.error('删除业务域失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除业务域失败',
      },
      { status: 500 }
    );
  }
}
