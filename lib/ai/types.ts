/**
 * AI 模块类型定义
 */

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 聊天请求
 */
export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * API 错误
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * 速率限制错误
 */
export class RateLimitError extends APIError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Deepseek 客户端配置
 */
export interface DeepseekConfig {
  apiKey: string;
  apiUrl?: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}
