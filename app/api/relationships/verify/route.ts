export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRelationshipOrchestrator, getDatabaseService } from '@/lib/di/setup';
import { safeServerErrorResponse } from '@/lib/api/response';

/**
 * POST /api/relationships/verify
 * 验证或拒绝推断关系
 *
 * 请求体:
 * - relationshipId: 推断关系 ID (必需)
 * - verified: 是否验证通过 (必需)
 * - verifiedBy: 验证人 (可选,默认 'system')
 * - action: 操作类型 ('verify' | 'reject' | 'convert', 可选)
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

    const dbService = getDatabaseService() as any;
    const prisma = dbService.prisma;

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

    console.log(`[POST /api/relationships/verify] Verifying relationship ${relationshipId}, action: ${action || 'verify'}`);

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

      console.log(`[POST /api/relationships/verify] Converted inferred relationship ${relationshipId} to explicit`);

      return NextResponse.json({
        status: 'success',
        message: 'Inferred relationship converted to explicit relationship',
        data: {
          explicitRelationship,
        },
      });

    } else if (action === 'reject' || verified === false) {
      // 使用 RelationshipOrchestrator 删除无效关系
      const orchestrator = getRelationshipOrchestrator();
      const success = await orchestrator.verifyRelationship({
        relationshipId,
        isValid: false,
      });

      if (!success) {
        return NextResponse.json(
          {
            status: 'error',
            message: 'Failed to reject relationship',
          },
          { status: 500 }
        );
      }

      console.log(`[POST /api/relationships/verify] Rejected relationship ${relationshipId}`);

      return NextResponse.json({
        status: 'success',
        message: 'Inferred relationship rejected and removed',
      });

    } else {
      // 使用 RelationshipOrchestrator 标记为已验证
      const orchestrator = getRelationshipOrchestrator();
      const success = await orchestrator.verifyRelationship({
        relationshipId,
        isValid: verified,
        method: 'manual',
      });

      if (!success) {
        return NextResponse.json(
          {
            status: 'error',
            message: 'Failed to verify relationship',
          },
          { status: 500 }
        );
      }

      // 获取更新后的关系
      const updated = await prisma.inferredRelationship.findUnique({
        where: { id: relationshipId },
      });

      console.log(`[POST /api/relationships/verify] Verified relationship ${relationshipId}`);

      return NextResponse.json({
        status: 'success',
        message: verified
          ? 'Relationship verified successfully'
          : 'Relationship verification removed',
        data: updated,
      });
    }

  } catch (error) {
    console.error('[POST /api/relationships/verify] Error:', error);

    return safeServerErrorResponse(
      error instanceof Error ? error : new Error('Failed to verify relationship'),
      {
        context: 'relationships-verify-post',
        metadata: { operation: 'verify_relationship' },
      }
    );
  }
}
