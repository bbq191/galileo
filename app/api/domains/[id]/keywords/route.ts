/**
 * 业务域关键词管理 API
 *
 * GET /api/domains/[id]/keywords - 获取关键词列表
 * PUT /api/domains/[id]/keywords - 批量更新关键词
 * POST /api/domains/[id]/keywords - 添加单个关键词
 *
 * @author xusy
 */


export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/di/setup';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { QueryDomainInferencer } from '@/lib/nlp/query-domain-inferencer';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/domains/[id]/keywords
 * 获取业务域关键词列表
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
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

    const inferencer = getService<QueryDomainInferencer>(DI_TOKENS.QueryDomainInferencer);
    const keywords = await inferencer.getDomainKeywordsFromDB(domainId);

    return NextResponse.json({
      success: true,
      data: keywords,
    });
  } catch (error) {
    console.error('获取关键词列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取关键词列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/domains/[id]/keywords
 * 批量更新关键词
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
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

    const { keywords } = body;

    if (!Array.isArray(keywords)) {
      return NextResponse.json(
        {
          success: false,
          error: '关键词列表格式错误',
        },
        { status: 400 }
      );
    }

    // 验证关键词格式
    for (const kw of keywords) {
      if (!kw.keyword || typeof kw.keyword !== 'string') {
        return NextResponse.json(
          {
            success: false,
            error: '关键词格式错误',
          },
          { status: 400 }
        );
      }
    }

    const inferencer = getService<QueryDomainInferencer>(DI_TOKENS.QueryDomainInferencer);
    await inferencer.setDomainKeywords(domainId, keywords);

    // 获取更新后的关键词列表
    const updatedKeywords = await inferencer.getDomainKeywordsFromDB(domainId);

    return NextResponse.json({
      success: true,
      data: updatedKeywords,
      message: `已更新 ${keywords.length} 个关键词`,
    });
  } catch (error) {
    console.error('更新关键词失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新关键词失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/domains/[id]/keywords
 * 添加单个关键词
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
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

    const { keyword, weight } = body;

    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: '关键词不能为空',
        },
        { status: 400 }
      );
    }

    const inferencer = getService<QueryDomainInferencer>(DI_TOKENS.QueryDomainInferencer);
    await inferencer.addKeyword(domainId, keyword, weight || 1.0);

    return NextResponse.json({
      success: true,
      message: `已添加关键词: ${keyword}`,
    });
  } catch (error) {
    console.error('添加关键词失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '添加关键词失败',
      },
      { status: 500 }
    );
  }
}
