/**
 * PUT /api/metadata/domains/apply
 *
 * 应用业务域分配（手动或自动推断后确认）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { PrismaClient } from '@/app/generated/prisma';
import type { DomainInferencer } from '@/lib/metadata/inference/domain-inferencer';

/**
 * 应用业务域分配
 *
 * 职责：
 * - 接收数据库 ID 和业务域 ID
 * - 更新数据库的业务域关联
 * - 返回操作结果
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { databaseId, domainId } = body;

    // 验证参数
    if (!databaseId) {
      return NextResponse.json(
        { error: '缺少 databaseId 参数' },
        { status: 400 }
      );
    }

    if (!domainId) {
      return NextResponse.json(
        { error: '缺少 domainId 参数' },
        { status: 400 }
      );
    }

    if (typeof databaseId !== 'number') {
      return NextResponse.json(
        { error: 'databaseId 必须是数字' },
        { status: 400 }
      );
    }

    if (typeof domainId !== 'number') {
      return NextResponse.json(
        { error: 'domainId 必须是数字' },
        { status: 400 }
      );
    }

    // 获取 Prisma 客户端
    const prisma = getService<PrismaClient>(DI_TOKENS.PrismaClient);

    // 验证数据库是否存在
    const database = await prisma.databaseMeta.findUnique({
      where: { id: databaseId },
      include: { domain: true },
    });

    if (!database) {
      return NextResponse.json(
        { error: `数据库不存在: ID=${databaseId}` },
        { status: 404 }
      );
    }

    // 验证业务域是否存在
    const domain = await prisma.businessDomain.findUnique({
      where: { id: domainId },
    });

    if (!domain) {
      return NextResponse.json(
        { error: `业务域不存在: ID=${domainId}` },
        { status: 404 }
      );
    }

    // 记录旧的业务域（用于日志）
    const oldDomain = database.domain;

    // 更新数据库的业务域
    await prisma.databaseMeta.update({
      where: { id: databaseId },
      data: { domainId },
    });

    // 失效推断缓存
    try {
      const domainInferencer = getService<DomainInferencer>(DI_TOKENS.DomainInferencer);
      await domainInferencer.invalidateCache(databaseId);
    } catch (error) {
      console.warn('[API] 失效推断缓存失败:', error);
      // 不影响主流程，继续执行
    }

    console.log(
      `[API] 业务域分配成功: 数据库="${database.databaseName}" (ID=${databaseId}), ` +
      `业务域: ${oldDomain?.name || '无'} → ${domain.name}`
    );

    return NextResponse.json({
      success: true,
      message: '业务域分配成功',
      data: {
        databaseId,
        databaseName: database.databaseName,
        oldDomain: oldDomain ? {
          id: oldDomain.id,
          name: oldDomain.name,
        } : null,
        newDomain: {
          id: domain.id,
          name: domain.name,
          description: domain.description,
        },
      },
    });
  } catch (error: any) {
    console.error('[API] 应用业务域失败:', error);
    return NextResponse.json(
      { error: error.message || '应用失败' },
      { status: 500 }
    );
  }
}
