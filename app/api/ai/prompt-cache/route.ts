export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { PromptCacheManager } from '@/lib/ai/prompt-cache-manager';

// 延迟导入以避免循环依赖
function getService(): PromptCacheManager {
  const { getContainer } = require('@/lib/di/container');
  const { DI_TOKENS } = require('@/lib/di/tokens');
  // 确保 DI 容器已初始化
  require('@/lib/di/setup');

  const container = getContainer();
  return container.resolve(DI_TOKENS.PromptCacheManager) as PromptCacheManager;
}

/**
 * GET /api/ai/prompt-cache
 *
 * 获取 Prompt 缓存统计
 *
 * @example
 * GET /api/ai/prompt-cache
 */
export async function GET(request: NextRequest) {
  try {
    const promptCache = getService();

    const stats = await promptCache.getStats();
    const runtimeStats = promptCache.getRuntimeStats();

    return NextResponse.json({
      success: true,
      stats,
      runtimeStats,
      size: promptCache.size(),
    });
  } catch (error) {
    console.error('[API] Prompt cache statistics error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get Prompt cache statistics',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai/prompt-cache/cleanup
 *
 * 清理低质量 Prompt 缓存
 *
 * Body 参数：
 * - minAccessCount: 最小访问次数（默认 2）
 * - maxAge: 最大年龄（天，默认 30）
 * - minSimilarity: 最小平均相似度（默认 0.85）
 *
 * @example
 * POST /api/ai/prompt-cache/cleanup
 * Body: { "minAccessCount": 2, "maxAge": 30 }
 */
export async function POST(request: NextRequest) {
  try {
    const promptCache = getService();

    const body = await request.json();
    const { minAccessCount, maxAge, minSimilarity } = body;

    const removedCount = await promptCache.cleanup({
      minAccessCount,
      maxAge,
      minSimilarity,
    });

    return NextResponse.json({
      success: true,
      removedCount,
      message: `Successfully cleaned up ${removedCount} low-quality cache entries`,
    });
  } catch (error) {
    console.error('[API] Prompt cache cleanup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cleanup Prompt cache',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai/prompt-cache
 *
 * 清空所有 Prompt 缓存
 *
 * @example
 * DELETE /api/ai/prompt-cache
 */
export async function DELETE(request: NextRequest) {
  try {
    const promptCache = getService();

    await promptCache.clear();

    return NextResponse.json({
      success: true,
      message: 'Prompt cache cleared successfully',
    });
  } catch (error) {
    console.error('[API] Prompt cache clear error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clear Prompt cache',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
