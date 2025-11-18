/**
 * Prompt 缓存管理 API
 *
 * 提供 Prompt 缓存的统计、清理和管理功能
 */


/**
 * 显式声明 Node.js Runtime
 *
 * API Routes 运行在 Node.js Runtime 中，支持：
 * - Prisma ORM
 * - ioredis
 * - mysql2
 * - 其他 Node.js 专有 API
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getContainer } from '@/lib/di/container';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { PromptCacheManager } from '@/lib/ai/prompt-cache-manager';

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
    const container = getContainer();
    const promptCache = container.resolve<PromptCacheManager>(DI_TOKENS.PromptCacheManager);

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
    const container = getContainer();
    const promptCache = container.resolve<PromptCacheManager>(DI_TOKENS.PromptCacheManager);

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
    const container = getContainer();
    const promptCache = container.resolve<PromptCacheManager>(DI_TOKENS.PromptCacheManager);

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
