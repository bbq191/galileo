/**
 * 业务域自动发现 API
 *
 * POST /api/domains/discover - 触发自动发现业务域
 *
 * @author xusy
 */


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { DomainDiscoverer } from '@/lib/metadata/discovery/domain-discoverer';

/**
 * POST /api/domains/discover
 * 触发自动发现业务域
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataSourceId, autoCreate, minClusterSize, autoCreateThreshold } = body;

    if (!dataSourceId) {
      return NextResponse.json(
        {
          success: false,
          error: '数据源 ID 不能为空',
        },
        { status: 400 }
      );
    }

    const discoverer = getService<DomainDiscoverer>(DI_TOKENS.DomainDiscoverer);

    const discoveredDomains = await discoverer.discoverAndCreateDomains(dataSourceId, {
      minClusterSize: minClusterSize || 2,
      autoCreateThreshold: autoCreateThreshold || 0.8,
      autoCreate: autoCreate !== false, // 默认为 true
    });

    // 统计结果
    const autoCreated = discoveredDomains.filter((d) => d.autoCreateRecommended).length;
    const needsReview = discoveredDomains.filter((d) => !d.autoCreateRecommended).length;

    return NextResponse.json({
      success: true,
      data: {
        discovered: discoveredDomains,
        summary: {
          total: discoveredDomains.length,
          autoCreated,
          needsReview,
        },
      },
      message: `发现 ${discoveredDomains.length} 个业务域，${autoCreated} 个已自动创建，${needsReview} 个需要人工审核`,
    });
  } catch (error) {
    console.error('自动发现业务域失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '自动发现业务域失败',
      },
      { status: 500 }
    );
  }
}
