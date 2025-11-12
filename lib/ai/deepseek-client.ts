/**
 * Deepseek API 客户端
 *
 * 功能：
 * - 发送聊天请求到 Deepseek API（支持 Ollama）
 * - 批量处理请求
 * - 错误处理和重试机制
 * - 速率限制处理
 */

import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  DeepseekConfig,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingOptions,
} from './types';
import { APIError, RateLimitError } from './types';

/**
 * Deepseek API 客户端类
 * 支持官方 API 和本地 Ollama 部署
 */
export class DeepseekClient {
  private apiKey: string;
  private apiUrl: string;
  private model: string;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;
  private isOllama: boolean;

  constructor(config: DeepseekConfig) {
    this.apiKey = config.apiKey || 'ollama'; // Ollama 不需要真实的 API Key
    this.apiUrl = config.apiUrl || 'http://localhost:11434';
    this.model = config.model || 'deepseek-r1:1.5b';
    this.timeout = config.timeout || 60000; // Ollama 推理较慢，设为 60 秒
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000; // 1 秒

    // 检测是否为 Ollama
    this.isOllama = this.apiUrl.includes('localhost') || this.apiUrl.includes('127.0.0.1');
  }

  /**
   * 发送聊天请求
   */
  async chat(
    messages: ChatMessage[],
    options: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    } = {}
  ): Promise<string> {
    const request: ChatRequest = {
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
      top_p: options.top_p ?? 0.95,
    };

    let lastError: Error | null = null;

    // 重试机制
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(request);
        return response.choices[0]?.message?.content || '';
      } catch (error) {
        lastError = error as Error;

        // 处理速率限制
        if (error instanceof RateLimitError) {
          const delay = error.retryAfter || this.retryDelay * Math.pow(2, attempt);
          console.log(`速率限制，等待 ${delay}ms 后重试 (${attempt + 1}/${this.maxRetries})...`);
          await this.sleep(delay);
          continue;
        }

        // 其他错误，如果还有重试次数则继续
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.log(`请求失败，等待 ${delay}ms 后重试 (${attempt + 1}/${this.maxRetries})...`);
          await this.sleep(delay);
          continue;
        }

        // 已达到最大重试次数
        throw error;
      }
    }

    throw lastError || new APIError('所有重试均失败');
  }

  /**
   * 批量发送聊天请求
   */
  async batchChat(
    requests: Array<{
      messages: ChatMessage[];
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    }>,
    options: {
      batchSize?: number;
      delayBetweenBatches?: number;
    } = {}
  ): Promise<string[]> {
    const batchSize = options.batchSize || 50;
    const delayBetweenBatches = options.delayBetweenBatches || 1000;
    const results: string[] = [];

    // 分批处理
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(requests.length / batchSize);

      console.log(`处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个请求)...`);

      // 并行处理批次内的请求
      const batchResults = await Promise.all(
        batch.map((req) => this.chat(req.messages, req))
      );

      results.push(...batchResults);

      // 批次之间的延迟（避免速率限制）
      if (i + batchSize < requests.length) {
        console.log(`等待 ${delayBetweenBatches}ms 后处理下一批次...`);
        await this.sleep(delayBetweenBatches);
      }
    }

    return results;
  }

  /**
   * 发送 HTTP 请求
   */
  private async makeRequest(request: ChatRequest): Promise<ChatResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Ollama API 端点
      const endpoint = this.isOllama
        ? `${this.apiUrl}/api/chat`
        : `${this.apiUrl}/v1/chat/completions`;

      // 构建请求体
      const body = this.isOllama
        ? {
            model: this.model,
            messages: request.messages,
            stream: false,
            options: {
              temperature: request.temperature,
              num_predict: request.max_tokens,
              top_p: request.top_p,
            },
          }
        : {
            model: this.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: request.top_p,
          };

      // 构建请求头
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // 官方 API 需要 Authorization
      if (!this.isOllama) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();

        // 速率限制
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(
            '请求速率超限',
            retryAfter ? parseInt(retryAfter) * 1000 : undefined
          );
        }

        throw new APIError(
          `API 请求失败: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const data = await response.json();

      // 转换 Ollama 响应为标准格式
      if (this.isOllama) {
        return this.convertOllamaResponse(data);
      }

      return data as ChatResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof APIError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIError(`请求超时 (${this.timeout}ms)`);
      }

      throw new APIError(
        `网络请求失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 转换 Ollama 响应为标准 OpenAI 格式
   */
  private convertOllamaResponse(ollamaResponse: any): ChatResponse {
    return {
      id: ollamaResponse.created_at || Date.now().toString(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: ollamaResponse.model || this.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: ollamaResponse.message?.content || '',
          },
          finish_reason: ollamaResponse.done ? 'stop' : 'length',
        },
      ],
      usage: {
        prompt_tokens: ollamaResponse.prompt_eval_count || 0,
        completion_tokens: ollamaResponse.eval_count || 0,
        total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
      },
    };
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 生成文本向量（Embedding）
   *
   * @param input - 单个文本或文本数组
   * @param options - 生成选项
   * @returns Embedding 响应
   */
  async embeddings(
    input: string | string[],
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResponse> {
    const request: EmbeddingRequest = {
      model: options.model || this.model,
      input,
      encoding_format: 'float',
    };

    let lastError: Error | null = null;

    // 重试机制
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.makeEmbeddingRequest(request);
        return response;
      } catch (error) {
        lastError = error as Error;

        // 处理速率限制
        if (error instanceof RateLimitError) {
          const delay = error.retryAfter || this.retryDelay * Math.pow(2, attempt);
          console.log(`速率限制，等待 ${delay}ms 后重试 (${attempt + 1}/${this.maxRetries})...`);
          await this.sleep(delay);
          continue;
        }

        // 其他错误，如果还有重试次数则继续
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.log(`请求失败，等待 ${delay}ms 后重试 (${attempt + 1}/${this.maxRetries})...`);
          await this.sleep(delay);
          continue;
        }

        // 已达到最大重试次数
        throw error;
      }
    }

    throw lastError || new APIError('所有重试均失败');
  }

  /**
   * 批量生成向量
   *
   * @param texts - 文本数组
   * @param options - 生成选项
   * @returns 向量数组
   */
  async batchEmbeddings(
    texts: string[],
    options: EmbeddingOptions = {}
  ): Promise<number[][]> {
    const batchSize = options.batchSize || 50;
    const allEmbeddings: number[][] = [];

    // 分批处理
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(texts.length / batchSize);

      console.log(`生成向量批次 ${batchNumber}/${totalBatches} (${batch.length} 个文本)...`);

      const response = await this.embeddings(batch, options);

      // 按索引排序并提取向量
      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      allEmbeddings.push(...embeddings);

      // 批次之间的延迟（避免速率限制）
      if (i + batchSize < texts.length) {
        console.log(`等待 ${this.retryDelay}ms 后处理下一批次...`);
        await this.sleep(this.retryDelay);
      }
    }

    return allEmbeddings;
  }

  /**
   * 发送 Embedding 请求
   */
  private async makeEmbeddingRequest(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // 注意：Ollama 可能不支持 embeddings API
      // 如果是 Ollama，抛出错误提示用户
      if (this.isOllama) {
        throw new APIError(
          'Ollama 暂不支持 Embedding API。请使用官方 Deepseek API 或配置支持 Embedding 的模型服务。'
        );
      }

      // Deepseek 官方 API 端点
      const endpoint = `${this.apiUrl}/v1/embeddings`;

      // 构建请求头
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();

        // 速率限制
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(
            '请求速率超限',
            retryAfter ? parseInt(retryAfter) * 1000 : undefined
          );
        }

        throw new APIError(
          `Embedding API 请求失败: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const data = (await response.json()) as EmbeddingResponse;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof APIError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIError(`请求超时 (${this.timeout}ms)`);
      }

      throw new APIError(
        `网络请求失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取当前模型名称
   */
  getModelName(): string {
    return this.model;
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.chat([
        {
          role: 'user',
          content: 'Hello',
        },
      ]);
      return response.length > 0;
    } catch (error) {
      console.error('连接测试失败:', error);
      return false;
    }
  }
}

/**
 * 创建默认客户端实例
 */
export function createDeepseekClient(config?: Partial<DeepseekConfig>): DeepseekClient {
  const apiUrl = config?.apiUrl || process.env.DEEPSEEK_API_URL || 'http://localhost:11434';
  const isOllama = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');

  // Ollama 不需要 API Key
  const apiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY || (isOllama ? 'ollama' : '');

  if (!apiKey && !isOllama) {
    throw new Error('Deepseek API Key 未配置，请设置环境变量 DEEPSEEK_API_KEY');
  }

  return new DeepseekClient({
    apiKey,
    apiUrl,
    model: config?.model || process.env.DEEPSEEK_MODEL || 'deepseek-r1:1.5b',
    timeout: config?.timeout,
    maxRetries: config?.maxRetries,
    retryDelay: config?.retryDelay,
  });
}

/**
 * 默认导出单例
 */
let defaultClient: DeepseekClient | null = null;

export function getDeepseekClient(): DeepseekClient {
  if (!defaultClient) {
    defaultClient = createDeepseekClient();
  }
  return defaultClient;
}
