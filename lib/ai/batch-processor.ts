/**
 * 批量处理器
 *
 * 功能：
 * - AI 批量调用管理
 * - 错误处理和重试
 * - 进度跟踪
 * - 速率限制
 * - 任务持久化与恢复
 * - 断点续传
 * - 错误日志与监控
 */

import { injectable, inject } from 'tsyringe';
import { DeepseekClient } from './deepseek-client';
import { batchConfig } from './config';
import type { ChatMessage } from './types';
import { taskQueueManager, TaskType, TaskPriority } from './task-queue';
import { errorLogger, ErrorLevel, ErrorCategory } from './error-logger';
import { resumeManager } from './resume-manager';
import type { ProcessProgress } from './resume-manager';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * 批量处理请求
 */
export interface BatchRequest<T> {
  /** 唯一标识 */
  id: string;

  /** 输入数据 */
  data: T;

  /** AI 消息 */
  messages: ChatMessage[];

  /** 温度参数 */
  temperature?: number;

  /** 最大 token 数 */
  maxTokens?: number;
}

/**
 * 批量处理结果
 */
export interface BatchResult<T> {
  /** 请求 ID */
  id: string;

  /** 输入数据 */
  data: T;

  /** AI 响应 */
  response: string;

  /** 是否成功 */
  success: boolean;

  /** 错误信息 */
  error?: string;

  /** 重试次数 */
  retryCount: number;
}

/**
 * 批量处理选项
 */
export interface BatchProcessOptions {
  /** 每批次处理数量 */
  batchSize?: number;

  /** 批次间延迟（毫秒） */
  delayBetweenBatches?: number;

  /** 最大并发数 */
  maxConcurrency?: number;

  /** 最大重试次数 */
  maxRetries?: number;

  /** 进度回调 */
  onProgress?: (progress: BatchProgress) => void;

  /** 错误回调 */
  onError?: (error: Error, request: BatchRequest<any>) => void;

  /** 任务标识符（用于断点续传） */
  taskIdentifier?: string;

  /** 任务类型 */
  taskType?: TaskType;

  /** 任务优先级 */
  taskPriority?: TaskPriority;

  /** 是否启用断点续传 */
  enableResume?: boolean;

  /** 是否持久化任务 */
  persistTask?: boolean;
}

/**
 * 批量处理进度
 */
export interface BatchProgress {
  /** 总数 */
  total: number;

  /** 已完成 */
  completed: number;

  /** 成功数 */
  succeeded: number;

  /** 失败数 */
  failed: number;

  /** 进度百分比 */
  percentage: number;

  /** 当前批次 */
  currentBatch: number;

  /** 总批次数 */
  totalBatches: number;
}

/**
 * 批量处理器类
 */
@injectable()
export class BatchProcessor {
  constructor(
    @inject(DI_TOKENS.DeepseekClient) private client: DeepseekClient
  ) {}

  /**
   * 批量处理请求
   */
  async process<T>(
    requests: BatchRequest<T>[],
    options: BatchProcessOptions = {}
  ): Promise<BatchResult<T>[]> {
    const startTime = Date.now();
    const {
      batchSize = batchConfig.batchSize,
      delayBetweenBatches = batchConfig.delayBetweenBatches,
      maxConcurrency = batchConfig.maxConcurrency,
      maxRetries = 3,
      onProgress,
      onError,
      taskIdentifier,
      taskType = TaskType.SEMANTIC_ANNOTATION,
      taskPriority = TaskPriority.NORMAL,
      enableResume = false,
      persistTask = false,
    } = options;

    let taskId: string | undefined;
    let progress: ProcessProgress | undefined;

    try {
      // 创建任务（如果启用持久化）
      if (persistTask) {
        const task = await taskQueueManager.createTask({
          type: taskType,
          name: `批量处理 (${requests.length} 个请求)`,
          data: { requestCount: requests.length },
          priority: taskPriority,
          maxRetries,
          metadata: {
            batchSize,
            maxConcurrency,
            taskIdentifier,
          },
        });
        taskId = task.id;
        await errorLogger.info(`任务已创建: ${taskId}`, { taskType, requestCount: requests.length });
      }

      // 启用断点续传
      if (enableResume && taskIdentifier) {
        progress = await resumeManager.getOrCreateProgress(
          taskType,
          taskIdentifier,
          requests.length,
          { batchSize, maxConcurrency }
        );

        // 过滤已处理的请求
        const unprocessedRequests = await resumeManager.getUnprocessedItems(
          progress,
          requests
        );

        if (unprocessedRequests.length < requests.length) {
          console.log(
            `恢复处理: 已完成 ${progress.processedItems}/${requests.length}，` +
            `剩余 ${unprocessedRequests.length} 个请求`
          );
          await errorLogger.info('恢复批量处理', {
            total: requests.length,
            processed: progress.processedItems,
            remaining: unprocessedRequests.length,
          });
        }

        // 使用未处理的请求继续
        requests = unprocessedRequests;
      }

      const totalBatches = Math.ceil(requests.length / batchSize);
      const results: BatchResult<T>[] = [];

      let completed = progress?.processedItems || 0;
      let succeeded = progress?.completedItemIds.length || 0;
      let failed = progress?.failedItemIds.length || 0;

      console.log(`开始批量处理: 共 ${requests.length} 个请求，分 ${totalBatches} 批`);

      // 分批处理
      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        console.log(`处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个请求)...`);

        // 并发处理批次内的请求（限制并发数）
        const batchResults = await this.processBatchWithConcurrency(
          batch,
          maxConcurrency,
          maxRetries,
          onError,
          progress,
          taskId
        );

        results.push(...batchResults);

        // 更新统计
        completed += batch.length;
        succeeded += batchResults.filter((r) => r.success).length;
        failed += batchResults.filter((r) => !r.success).length;

        // 更新任务进度
        if (taskId) {
          const progressPercent = Math.round(
            (completed / (requests.length + (progress?.processedItems || 0))) * 100
          );
          await taskQueueManager.updateTaskProgress(taskId, progressPercent);
        }

        // 触发进度回调
        if (onProgress) {
          onProgress({
            total: requests.length + (progress?.processedItems || 0),
            completed,
            succeeded,
            failed,
            percentage: (completed / (requests.length + (progress?.processedItems || 0))) * 100,
            currentBatch: batchNumber,
            totalBatches,
          });
        }

        // 批次之间的延迟（避免速率限制）
        if (i + batchSize < requests.length) {
          console.log(`等待 ${delayBetweenBatches}ms 后处理下一批次...`);
          await this.sleep(delayBetweenBatches);
        }
      }

      console.log(`批量处理完成: 成功 ${succeeded}，失败 ${failed}`);

      // 完成进度记录
      if (progress) {
        await resumeManager.completeProgress(progress.id);
      }

      // 完成任务
      if (taskId) {
        await taskQueueManager.completeTask(taskId);
      }

      // 记录性能指标
      const duration = Date.now() - startTime;
      await errorLogger.recordPerformance({
        operation: 'batch_process',
        duration,
        success: true,
        timestamp: new Date(),
        metadata: {
          requestCount: requests.length,
          succeeded,
          failed,
          taskId,
        },
      });

      return results;
    } catch (error) {
      const err = error as Error;

      // 记录严重错误
      await errorLogger.critical(
        `批量处理失败: ${err.message}`,
        ErrorCategory.UNKNOWN,
        err,
        { requestCount: requests.length, taskId }
      );

      // 失败进度记录
      if (progress) {
        await resumeManager.failProgress(progress.id);
      }

      // 失败任务
      if (taskId) {
        await taskQueueManager.failTask(taskId, err.message);
      }

      // 记录性能指标
      const duration = Date.now() - startTime;
      await errorLogger.recordPerformance({
        operation: 'batch_process',
        duration,
        success: false,
        timestamp: new Date(),
        metadata: {
          requestCount: requests.length,
          error: err.message,
          taskId,
        },
      });

      throw error;
    }
  }

  /**
   * 带并发控制的批次处理
   */
  private async processBatchWithConcurrency<T>(
    batch: BatchRequest<T>[],
    maxConcurrency: number,
    maxRetries: number,
    onError?: (error: Error, request: BatchRequest<T>) => void,
    progress?: ProcessProgress,
    taskId?: string
  ): Promise<BatchResult<T>[]> {
    const results: BatchResult<T>[] = [];
    const queue = [...batch];

    // 并发处理
    const workers = Array(Math.min(maxConcurrency, batch.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const request = queue.shift();
          if (!request) break;

          const result = await this.processWithRetry(
            request,
            maxRetries,
            onError,
            taskId
          );
          results.push(result);

          // 更新断点续传进度
          if (progress) {
            if (result.success) {
              await resumeManager.markItemCompleted(progress.id, request.id);
            } else {
              await resumeManager.markItemFailed(progress.id, request.id);
            }
          }
        }
      });

    await Promise.all(workers);

    return results;
  }

  /**
   * 带重试的单个请求处理
   */
  private async processWithRetry<T>(
    request: BatchRequest<T>,
    maxRetries: number,
    onError?: (error: Error, request: BatchRequest<T>) => void,
    taskId?: string
  ): Promise<BatchResult<T>> {
    let lastError: Error | null = null;
    let errorCategory = ErrorCategory.UNKNOWN;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.chat(request.messages, {
          temperature: request.temperature,
          max_tokens: request.maxTokens,
        });

        // 如果之前有过重试，记录恢复日志
        if (attempt > 0) {
          await errorLogger.info(
            `请求 ${request.id} 重试成功 (第 ${attempt} 次重试)`,
            { requestId: request.id, retryCount: attempt, taskId }
          );
        }

        return {
          id: request.id,
          data: request.data,
          response,
          success: true,
          retryCount: attempt,
        };
      } catch (error) {
        lastError = error as Error;

        // 识别错误类型
        errorCategory = this.categorizeError(lastError);

        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt); // 指数退避
          console.log(
            `请求 ${request.id} 失败，${delay}ms 后重试 (${attempt + 1}/${maxRetries})...`
          );

          // 记录警告
          await errorLogger.warning(
            `请求失败，准备重试: ${lastError.message}`,
            errorCategory,
            {
              requestId: request.id,
              attempt: attempt + 1,
              maxRetries,
              delay,
              taskId,
            }
          );

          await this.sleep(delay);
        } else {
          console.error(`请求 ${request.id} 失败，已达最大重试次数:`, error);

          // 记录错误
          await errorLogger.error(
            `请求失败，已达最大重试次数: ${lastError.message}`,
            errorCategory,
            lastError,
            {
              requestId: request.id,
              maxRetries,
              taskId,
            }
          );

          if (onError) {
            onError(lastError, request);
          }
        }
      }
    }

    return {
      id: request.id,
      data: request.data,
      response: '',
      success: false,
      error: lastError?.message || '未知错误',
      retryCount: maxRetries,
    };
  }

  /**
   * 识别错误类型
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('timeout') || message.includes('etimedout')) {
      return ErrorCategory.TIMEOUT;
    }
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
      return ErrorCategory.RATE_LIMIT;
    }
    if (message.includes('api') || message.includes('400') || message.includes('500')) {
      return ErrorCategory.API;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 估算批量处理耗时
   */
  estimateDuration(
    requestCount: number,
    options: BatchProcessOptions = {}
  ): {
    minDuration: number;
    maxDuration: number;
    estimatedDuration: number;
  } {
    const {
      batchSize = batchConfig.batchSize,
      delayBetweenBatches = batchConfig.delayBetweenBatches,
      maxConcurrency = batchConfig.maxConcurrency,
    } = options;

    const totalBatches = Math.ceil(requestCount / batchSize);
    const avgRequestTime = 2000; // 平均每个请求 2 秒

    // 每批次耗时 = (批次大小 / 并发数) * 平均请求时间
    const batchDuration = (batchSize / maxConcurrency) * avgRequestTime;

    // 总耗时 = 批次耗时 * 批次数 + 批次间延迟 * (批次数 - 1)
    const totalDelay = (totalBatches - 1) * delayBetweenBatches;
    const estimatedDuration = batchDuration * totalBatches + totalDelay;

    return {
      minDuration: estimatedDuration * 0.7, // 最快情况
      maxDuration: estimatedDuration * 1.5, // 最慢情况（包含重试）
      estimatedDuration,
    };
  }

  /**
   * 将数组分组
   */
  static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * 导出默认实例（向后兼容）
 * 实际实例在 DI 容器初始化后创建
 */
let _batchProcessor: BatchProcessor | null = null;

export function getBatchProcessor(): BatchProcessor {
  if (!_batchProcessor) {
    // 如果 DI 容器还未初始化，创建临时实例
    const { getService } = require('@/lib/di/setup');
    try {
      _batchProcessor = getService<BatchProcessor>(DI_TOKENS.BatchProcessor);
    } catch {
      // 回退方案：创建不使用 DI 的实例
      const { getDeepseekClient } = require('./deepseek-client');
      _batchProcessor = new BatchProcessor(getDeepseekClient());
    }
  }
  return _batchProcessor;
}

export const batchProcessor = new Proxy({} as BatchProcessor, {
  get(_target, prop) {
    return getBatchProcessor()[prop as keyof BatchProcessor];
  }
});
