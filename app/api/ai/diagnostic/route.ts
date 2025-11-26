/**
 * AI 服务诊断 API
 * 用于检查 DI 容器和服务状态
 */

export const runtime = 'nodejs';
export { dynamic } from '@/lib/api/route-config';

import { NextResponse } from 'next/server';
import { getContainer, isRegistered } from '@/lib/di/container';
import { DI_TOKENS } from '@/lib/di/tokens';

export async function GET() {
  try {
    const diagnostics: Record<string, any> = {
      timestamp: new Date().toISOString(),
      services: {},
      errors: [],
    };

    // 检查 DI 容器
    try {
      const container = getContainer();
      diagnostics.containerStatus = 'initialized';
    } catch (error) {
      diagnostics.containerStatus = 'failed';
      diagnostics.errors.push({
        service: 'container',
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(diagnostics, { status: 500 });
    }

    // 检查 AICostTracker 注册状态
    try {
      diagnostics.services.AICostTracker = {
        registered: isRegistered(DI_TOKENS.AICostTracker),
      };
    } catch (error) {
      diagnostics.services.AICostTracker = {
        registered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // 检查 AICostTracker 解析
    try {
      const container = getContainer();
      const costTracker = container.resolve<any>(DI_TOKENS.AICostTracker);
      diagnostics.services.AICostTracker.resolved = true;
      diagnostics.services.AICostTracker.type = costTracker?.constructor?.name || 'unknown';
    } catch (error) {
      diagnostics.services.AICostTracker.resolved = false;
      diagnostics.services.AICostTracker.resolveError = error instanceof Error ? error.message : String(error);
      diagnostics.errors.push({
        service: 'AICostTracker',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    // 检查 PromptCacheManager 注册状态
    try {
      diagnostics.services.PromptCacheManager = {
        registered: isRegistered(DI_TOKENS.PromptCacheManager),
      };
    } catch (error) {
      diagnostics.services.PromptCacheManager = {
        registered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // 检查 PromptCacheManager 解析
    try {
      const container = getContainer();
      const promptCache = container.resolve<any>(DI_TOKENS.PromptCacheManager);
      diagnostics.services.PromptCacheManager.resolved = true;
      diagnostics.services.PromptCacheManager.type = promptCache?.constructor?.name || 'unknown';
    } catch (error) {
      diagnostics.services.PromptCacheManager.resolved = false;
      diagnostics.services.PromptCacheManager.resolveError = error instanceof Error ? error.message : String(error);
      diagnostics.errors.push({
        service: 'PromptCacheManager',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    // 检查 Redis 客户端
    try {
      diagnostics.services.RedisClient = {
        registered: isRegistered(DI_TOKENS.RedisClient),
      };

      const container = getContainer();
      const redis = container.resolve<any>(DI_TOKENS.RedisClient);
      diagnostics.services.RedisClient.resolved = true;
      diagnostics.services.RedisClient.status = redis?.status || 'unknown';
    } catch (error) {
      diagnostics.services.RedisClient.resolved = false;
      diagnostics.services.RedisClient.resolveError = error instanceof Error ? error.message : String(error);
    }

    const hasErrors = diagnostics.errors.length > 0;

    return NextResponse.json(diagnostics, {
      status: hasErrors ? 500 : 200,
    });
  } catch (error) {
    console.error('[Diagnostic API] Fatal error:', error);
    return NextResponse.json(
      {
        error: 'Diagnostic API failed',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
