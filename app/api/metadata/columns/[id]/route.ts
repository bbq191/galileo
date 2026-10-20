export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';
import type { SemanticSource } from '@/lib/ai/semantic-annotator';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 更新字段的语义描述
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const columnId = parseInt(id);

    if (isNaN(columnId)) {
      return NextResponse.json(
        { status: 'error', message: '无效的字段ID' },
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

    // 检查字段是否存在
    const column = await prisma.columnMeta.findUnique({
      where: { id: columnId },
      select: { id: true, columnName: true },
    });

    if (!column) {
      return NextResponse.json(
        { status: 'error', message: '字段不存在' },
        { status: 404 }
      );
    }

    // 更新语义描述，标记为人工修改
    const updatedColumn = await prisma.columnMeta.update({
      where: { id: columnId },
      data: {
        semanticDescription: semanticDescription.trim() || null,
        semanticSource: 'manual' as SemanticSource, // 人工修改标记
      },
      select: {
        id: true,
        columnName: true,
        semanticDescription: true,
        semanticSource: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      status: 'success',
      message: '字段语义描述已更新',
      data: updatedColumn,
    });
  } catch (error) {
    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to update column semantic'),
      {
        context: 'column-semantic-update',
        metadata: { operation: 'update_column_semantic' },
      }
    );
  }
}
