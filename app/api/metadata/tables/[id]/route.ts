export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 更新表的语义描述
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const tableId = parseInt(id);

    if (isNaN(tableId)) {
      return NextResponse.json(
        { status: 'error', message: '无效的表ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { semanticDescription } = body;

    if (typeof semanticDescription !== 'string') {
      return NextResponse.json(
        { status: 'error', message: '语义描述必须是字符串' },
        { status: 400 }
      );
    }

    const prisma = getPrismaClient();

    // 检查表是否存在
    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { id: true, tableName: true },
    });

    if (!table) {
      return NextResponse.json(
        { status: 'error', message: '表不存在' },
        { status: 404 }
      );
    }

    // 更新语义描述
    const updatedTable = await prisma.tableMeta.update({
      where: { id: tableId },
      data: {
        semanticDescription: semanticDescription.trim() || null,
      },
      select: {
        id: true,
        tableName: true,
        semanticDescription: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      status: 'success',
      message: '表语义描述已更新',
      data: updatedTable,
    });
  } catch (error) {
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to update table semantic'),
      {
        context: 'table-semantic-update',
        metadata: { operation: 'update_table_semantic' },
      }
    );
  }
}
