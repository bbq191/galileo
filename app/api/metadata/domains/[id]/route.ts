/**
 * PUT /api/metadata/domains/:id
 *
 * 更新业务域信息
 */


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withDeprecationCheck } from '@/lib/api/version-middleware';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { PrismaClient } from '@prisma/client';

/**
 * 更新业务域
 *
 * 职责：
 * - 更新业务域的名称、描述、所属团队等信息
 * - 验证业务域是否存在
 * - 返回更新后的业务域信息
 */
async function handlePut(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const domainId = parseInt(params.id, 10);

    // 验证 ID
    if (isNaN(domainId)) {
      return NextResponse.json(
        { error: '无效的业务域 ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, description, ownerTeam } = body;

    // 验证至少有一个字段需要更新
    if (!name && !description && !ownerTeam) {
      return NextResponse.json(
        { error: '至少需要提供一个要更新的字段（name, description, ownerTeam）' },
        { status: 400 }
      );
    }

    // 获取 Prisma 客户端
    const prisma = getService<PrismaClient>(DI_TOKENS.PrismaClient);

    // 验证业务域是否存在
    const existingDomain = await prisma.businessDomain.findUnique({
      where: { id: domainId },
    });

    if (!existingDomain) {
      return NextResponse.json(
        { error: `业务域不存在: ID=${domainId}` },
        { status: 404 }
      );
    }

    // 如果要更新名称，检查是否与其他业务域冲突
    if (name && name !== existingDomain.name) {
      const duplicateDomain = await prisma.businessDomain.findUnique({
        where: { name },
      });

      if (duplicateDomain) {
        return NextResponse.json(
          { error: `业务域名称"${name}"已存在` },
          { status: 409 }
        );
      }
    }

    // 构建更新数据
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (ownerTeam !== undefined) updateData.ownerTeam = ownerTeam;

    // 更新业务域
    const updatedDomain = await prisma.businessDomain.update({
      where: { id: domainId },
      data: updateData,
    });

    console.log(`[API] 业务域更新成功: ID=${domainId}, 名称="${updatedDomain.name}"`);

    return NextResponse.json({
      success: true,
      message: '业务域更新成功',
      data: {
        id: updatedDomain.id,
        name: updatedDomain.name,
        description: updatedDomain.description,
        ownerTeam: updatedDomain.ownerTeam,
        createdAt: updatedDomain.createdAt,
        updatedAt: updatedDomain.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[API] 更新业务域失败:', error);
    return NextResponse.json(
      { error: error.message || '更新失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/metadata/domains/:id
 *
 * 删除业务域（可选功能）
 */
async function handleDelete(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const domainId = parseInt(params.id, 10);

    // 验证 ID
    if (isNaN(domainId)) {
      return NextResponse.json(
        { error: '无效的业务域 ID' },
        { status: 400 }
      );
    }

    // 获取 Prisma 客户端
    const prisma = getService<PrismaClient>(DI_TOKENS.PrismaClient);

    // 验证业务域是否存在
    const existingDomain = await prisma.businessDomain.findUnique({
      where: { id: domainId },
      include: {
        databases: {
          select: { id: true },
        },
      },
    });

    if (!existingDomain) {
      return NextResponse.json(
        { error: `业务域不存在: ID=${domainId}` },
        { status: 404 }
      );
    }

    // 检查是否有数据库关联到该业务域
    const databaseCount = (existingDomain as any).databases?.length || 0;
    if (databaseCount > 0) {
      return NextResponse.json(
        {
          error: `无法删除业务域"${existingDomain.name}"，因为有 ${databaseCount} 个数据库正在使用该业务域`,
          suggestion: '请先将这些数据库重新分配到其他业务域',
        },
        { status: 409 }
      );
    }

    // 删除业务域
    await prisma.businessDomain.delete({
      where: { id: domainId },
    });

    console.log(`[API] 业务域删除成功: ID=${domainId}, 名称="${existingDomain.name}"`);

    return NextResponse.json({
      success: true,
      message: '业务域删除成功',
      data: {
        id: existingDomain.id,
        name: existingDomain.name,
      },
    });
  } catch (error: any) {
    console.error('[API] 删除业务域失败:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}

// 已弃用：业务域 CRUD 请使用 /api/domains（见 lib/api/version-middleware.ts 的 DEPRECATED_ENDPOINTS）
export const PUT = withDeprecationCheck(handlePut);
export const DELETE = withDeprecationCheck(handleDelete);
