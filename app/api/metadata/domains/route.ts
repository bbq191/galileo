/**
 * GET/POST /api/metadata/domains
 *
 * 获取所有业务域及其统计信息 / 创建新业务域
 */

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { PrismaClient } from '@/app/generated/prisma';

/**
 * 获取所有业务域
 *
 * 职责：
 * - 查询所有业务域
 * - 统计每个业务域关联的数据库数量
 * - 返回业务域列表及统计信息
 */
export async function GET(request: NextRequest) {
  try {
    // 从查询参数获取选项
    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get('includeStats') === 'true';

    // 获取 Prisma 客户端
    const prisma = getService<PrismaClient>(DI_TOKENS.PrismaClient);

    // 查询所有业务域
    const domains = await prisma.businessDomain.findMany({
      orderBy: { id: 'asc' },
      include: includeStats ? {
        databases: {
          select: { id: true },
        },
      } : undefined,
    });

    // 构建响应
    const domainsData = domains.map(domain => ({
      id: domain.id,
      name: domain.name,
      description: domain.description,
      ownerTeam: domain.ownerTeam,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
      ...(includeStats && {
        databaseCount: (domain as any).databases?.length || 0,
      }),
    }));

    return NextResponse.json({
      success: true,
      data: {
        total: domains.length,
        domains: domainsData,
      },
    });
  } catch (error: any) {
    console.error('[API] 获取业务域列表失败:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}

/**
 * 创建新业务域
 *
 * 职责：
 * - 验证输入参数
 * - 检查业务域名称是否重复
 * - 创建新业务域
 * - 返回创建结果
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, ownerTeam } = body;

    // 验证必填参数
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: '业务域名称不能为空' },
        { status: 400 }
      );
    }

    // 获取 Prisma 客户端
    const prisma = getService<PrismaClient>(DI_TOKENS.PrismaClient);

    // 检查名称是否已存在
    const existingDomain = await prisma.businessDomain.findUnique({
      where: { name: name.trim() },
    });

    if (existingDomain) {
      return NextResponse.json(
        { error: `业务域名称"${name}"已存在` },
        { status: 409 }
      );
    }

    // 创建新业务域
    const newDomain = await prisma.businessDomain.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        ownerTeam: ownerTeam?.trim() || null,
      },
    });

    console.log(`[API] 业务域创建成功: ID=${newDomain.id}, 名称="${newDomain.name}"`);

    return NextResponse.json({
      success: true,
      message: '业务域创建成功',
      data: {
        id: newDomain.id,
        name: newDomain.name,
        description: newDomain.description,
        ownerTeam: newDomain.ownerTeam,
        createdAt: newDomain.createdAt,
        updatedAt: newDomain.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[API] 创建业务域失败:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}
