/**
 * Deepseek 客户端工厂
 * 负责创建和配置 DeepseekClient 实例
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

  const finalConfig: DeepseekConfig = {
    apiKey,
    apiUrl,
    model: config?.model || process.env.DEEPSEEK_MODEL || 'deepseek-r1:1.5b',
    timeout: config?.timeout || 60000,
    maxRetries: config?.maxRetries || 3,
    retryDelay: config?.retryDelay || 1000,
  };

  return new DeepseekClient(finalConfig);
}
