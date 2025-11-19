/**
 * 清除缓存 API
 *
 * POST /api/cache/clear
 * - pattern=query: 清除查询缓存
 * - pattern=all: 清除所有缓存
 */

import { NextRequest, NextResponse } from 'next/server';
import { getContainer } from '@/lib/di/container';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { CacheOrchestrator } from '@/lib/di/orchestrators/cache.orchestrator';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pattern = searchParams.get('pattern') || 'query';

    const container = getContainer();
    const cacheOrchestrator = container.resolve<CacheOrchestrator>(DI_TOKENS.CacheOrchestrator);

    let result;

    if (pattern === 'all') {
      // 清空所有缓存
      result = await cacheOrchestrator.clearAllCache();
    } else {
      // 默认只清除查询缓存
      result = await cacheOrchestrator.invalidateCache({ pattern: 'query' });
    }

    return NextResponse.json({
      success: result.success,
      message: pattern === 'all' ? '所有缓存已清除' : '查询缓存已清除',
      clearedKeys: result.clearedKeys,
      duration: result.duration,
    });

  } catch (error) {
    console.error('[API] Clear cache failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: '请使用 POST 请求清除缓存',
    usage: {
      'POST /api/cache/clear': '清除查询缓存',
      'POST /api/cache/clear?pattern=all': '清除所有缓存',
    },
  });
}
