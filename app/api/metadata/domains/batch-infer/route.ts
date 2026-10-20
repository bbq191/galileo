/**
 * POST /api/metadata/domains/batch-infer
 *
 * 批量推断多个数据库的业务域
 */


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { DomainInferencer } from '@/lib/metadata/inference/domain-inferencer';
import type { DomainInference } from '@/lib/metadata/inference/domain-inference.types';

/**
 * 批量推断数据库的业务域
 *
 * 职责：
 * - 接收数据库 ID 列表
 * - 调用 DomainInferencer 批量推断
 * - 可选：自动应用高置信度的结果
 * - 返回批量推断结果
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { databaseIds, enableAI = false, autoApply = false } = body;

    // 验证参数
    if (!databaseIds) {
      return NextResponse.json(
        { error: '缺少 databaseIds 参数' },
        { status: 400 }
      );
    }

    if (!Array.isArray(databaseIds)) {
      return NextResponse.json(
        { error: 'databaseIds 必须是数组' },
        { status: 400 }
      );
    }

    if (databaseIds.length === 0) {
      return NextResponse.json(
        { error: 'databaseIds 数组不能为空' },
        { status: 400 }
      );
    }

    if (databaseIds.length > 100) {
      return NextResponse.json(
        { error: '单次最多处理 100 个数据库' },
        { status: 400 }
      );
    }

    // 验证所有元素都是数字
    if (!databaseIds.every(id => typeof id === 'number')) {
      return NextResponse.json(
        { error: 'databaseIds 中的所有元素必须是数字' },
        { status: 400 }
      );
    }

    // 获取推断器服务
    const inferencer = getService<DomainInferencer>(DI_TOKENS.DomainInferencer);

    // 执行批量推断
    const batchResult = await inferencer.batchInferDomains(databaseIds, {
      enableAI,
      minConfidence: 0.7,
      includeAlternatives: false, // 批量操作不返回候选域，减少数据量
    });

    // 如果设置了自动应用，则应用高置信度的结果
    if (autoApply) {
      const applied: number[] = [];
      const skipped: number[] = [];

      for (const [dbId, inference] of batchResult.results.entries()) {
        if (!(inference instanceof Error)) {
          if (!inference.requiresReview) {
            try {
              await inferencer.applyInference(dbId, inference);
              applied.push(dbId);
            } catch (applyError) {
              console.error(`[API] 应用推断结果失败 (dbId=${dbId}):`, applyError);
              skipped.push(dbId);
            }
          } else {
            skipped.push(dbId);
          }
        }
      }

      console.log(`[API] 自动应用结果: 成功=${applied.length}, 跳过=${skipped.length}`);
    }

    // 构建响应
    const results = Array.from(batchResult.results.entries()).map(([dbId, result]) => {
      if (result instanceof Error) {
        return {
          databaseId: dbId,
          success: false,
          error: result.message,
        };
      }

      const inference = result as DomainInference;
      return {
        databaseId: dbId,
        success: true,
        suggestedDomain: {
          id: inference.suggestedDomain.id,
          name: inference.suggestedDomain.name,
        },
        confidence: inference.confidence,
        requiresReview: inference.requiresReview,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        total: batchResult.total,
        inferred: batchResult.inferred,
        needsReview: batchResult.needsReview,
        failed: batchResult.failed,
        autoApplied: autoApply,
        results,
      },
    });
  } catch (error: any) {
    console.error('[API] 批量推断失败:', error);
    return NextResponse.json(
      { error: error.message || '批量推断失败' },
      { status: 500 }
    );
  }
}
