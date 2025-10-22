/**
 * 关系验证 API
 * POST /api/relationships/verify - 验证或拒绝推断关系
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';

/**
 * POST /api/relationships/verify
 * 验证或拒绝推断关系
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证必填字段
    if (!body.relationshipId || typeof body.verified === 'undefined') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Missing required fields: relationshipId, verified',
        },
        { status: 400 }
      );
    }

    const relationshipId = parseInt(body.relationshipId);
    const verified = body.verified === true;
    const verifiedBy = body.verifiedBy || 'system';
    const action = body.action; // 'verify' | 'reject' | 'convert'

    // 检查关系是否存在
    const relationship = await prisma.inferredRelationship.findUnique({
      where: { id: relationshipId },
    });

    if (!relationship) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Inferred relationship not found',
        },
        { status: 404 }
      );
    }

    // 根据操作类型处理
    if (action === 'convert' && verified) {
      // 将推断关系转换为显式关系
      const explicitRelationship = await prisma.explicitRelationship.create({
        data: {
          sourceTableId: relationship.sourceTableId,
          sourceColumnId: relationship.sourceColumnId,
          targetTableId: relationship.targetTableId,
          targetColumnId: relationship.targetColumnId,
          relationshipType: relationship.relationshipType,
          constraintName: `fk_inferred_${relationshipId}`,
        },
      });

      // 删除推断关系
      await prisma.inferredRelationship.delete({
        where: { id: relationshipId },
      });

      return NextResponse.json({
        status: 'success',
        message: 'Inferred relationship converted to explicit relationship',
        data: {
          explicitRelationship,
        },
      });
    } else if (action === 'reject' || verified === false) {
      // 拒绝推断关系，直接删除
      await prisma.inferredRelationship.delete({
        where: { id: relationshipId },
      });

      return NextResponse.json({
        status: 'success',
        message: 'Inferred relationship rejected and removed',
      });
    } else {
      // 仅标记为已验证
      const updated = await prisma.inferredRelationship.update({
        where: { id: relationshipId },
        data: {
          isVerified: verified,
          verifiedBy,
          verifiedAt: verified ? new Date() : null,
        },
      });

      return NextResponse.json({
        status: 'success',
        message: verified
          ? 'Relationship verified successfully'
          : 'Relationship verification removed',
        data: updated,
      });
    }
  } catch (error) {
    console.error('验证关系失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to verify relationship',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
