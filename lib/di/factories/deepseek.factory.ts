/**
 * Deepseek 客户端工厂
 * 负责创建和配置 DeepseekClient 实例
 *
 * @author xusy
 */

import { DeepseekClient } from '@/lib/ai/deepseek-client';
import type { DeepseekConfig } from '@/lib/ai/types';

/**
 * 创建 DeepseekClient 实例
 */
export function createDeepseekClient(config?: Partial<DeepseekConfig>): DeepseekClient {
  const apiUrl = config?.apiUrl || process.env.DEEPSEEK_API_URL || 'http://localhost:11434';
  const isOllama = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');

  // Ollama 不需要 API Key
  const apiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY || (isOllama ? 'ollama' : '');

  if (!apiKey && !isOllama) {
    console.warn('Deepseek API Key 未配置，某些功能可能无法使用');
  }

  // 从环境变量读取配置（优先使用传入的 config，其次使用环境变量，最后使用默认值）
  const timeout = config?.timeout ??
    (process.env.DEEPSEEK_TIMEOUT ? parseInt(process.env.DEEPSEEK_TIMEOUT, 10) : 300000);

  const maxRetries = config?.maxRetries ??
    (process.env.DEEPSEEK_MAX_RETRIES ? parseInt(process.env.DEEPSEEK_MAX_RETRIES, 10) : 3);

  const retryDelay = config?.retryDelay ??
    (process.env.DEEPSEEK_RETRY_DELAY ? parseInt(process.env.DEEPSEEK_RETRY_DELAY, 10) : 1000);

  console.log('[createDeepseekClient] 配置信息:', {
    apiUrl,
    model: config?.model || process.env.DEEPSEEK_MODEL || 'deepseek-r1:1.5b',
    timeout,
    maxRetries,
    retryDelay,
    isOllama,
    envTimeout: process.env.DEEPSEEK_TIMEOUT,
  });

  const finalConfig: DeepseekConfig = {
    apiKey,
    apiUrl,
    model: config?.model || process.env.DEEPSEEK_MODEL || 'deepseek-r1:1.5b',
    timeout,
    maxRetries,
    retryDelay,
  };

  return new DeepseekClient(finalConfig);
}
