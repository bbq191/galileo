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

/**
 * Embedding 请求
 */
export interface EmbeddingRequest {
  /** 模型名称 */
  model: string;
  /** 输入文本（单个或数组） */
  input: string | string[];
  /** 编码格式（可选） */
  encoding_format?: 'float' | 'base64';
}

/**
 * Embedding 响应
 */
export interface EmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Embedding 生成选项
 */
export interface EmbeddingOptions {
  /** 模型名称（可选，默认使用配置中的 embeddingModel） */
  model?: string;
  /** 批处理大小 */
  batchSize?: number;
}
