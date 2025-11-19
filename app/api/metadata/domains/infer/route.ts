/**
 * POST /api/metadata/domains/infer
 *
 * 推断单个数据库的业务域
 */

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { DomainInferencer } from '@/lib/metadata/inference/domain-inferencer';

/**
 * 推断单个数据库的业务域
 *
 * 职责：
 * - 接收数据库 ID
 * - 调用 DomainInferencer 进行推断
 * - 返回推断结果
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { databaseId, enableAI = true } = body;

    // 验证参数
    if (!databaseId) {
      return NextResponse.json(
        { error: '缺少 databaseId 参数' },
        { status: 400 }
      );
    }

    if (typeof databaseId !== 'number') {
      return NextResponse.json(
        { error: 'databaseId 必须是数字' },
        { status: 400 }
      );
    }

    // 获取推断器服务
    const inferencer = getService<DomainInferencer>(DI_TOKENS.DomainInferencer);

    // 执行推断
    const result = await inferencer.inferDomain(databaseId, {
      enableAI,
      includeAlternatives: true,
      maxAlternatives: 3,
      minConfidence: 0.7,
    });

    // 返回结果
    return NextResponse.json({
      success: true,
      data: {
        databaseId,
        suggestedDomain: {
          id: result.suggestedDomain.id,
          name: result.suggestedDomain.name,
          description: result.suggestedDomain.description,
        },
        confidence: result.confidence,
        reasoning: result.reasoning,
        requiresReview: result.requiresReview,
        strategies: result.strategies.map(s => ({
          strategyName: s.strategyName,
          score: s.score,
          weight: s.weight,
          features: s.features,
        })),
        alternativeDomains: result.alternativeDomains?.map(alt => ({
          id: alt.domain.id,
          name: alt.domain.name,
          description: alt.domain.description,
          confidence: alt.confidence,
        })),
      },
    });
  } catch (error: any) {
    console.error('[API] 推断业务域失败:', error);

    // 区分不同的错误类型
    if (error.message?.includes('数据库不存在')) {
      return NextResponse.json(
        { error: '数据库不存在' },
        { status: 404 }
      );
    }

    if (error.message?.includes('没有可用的业务域')) {
      return NextResponse.json(
        { error: '系统中没有可用的业务域，请先创建业务域' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || '推断失败' },
      { status: 500 }
    );
  }
}
