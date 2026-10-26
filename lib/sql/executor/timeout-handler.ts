/**
 * 超时处理器
 * 负责查询执行的超时控制
 */

import { ExecutorError, ExecutorErrorType } from './types';

/**
 * 创建超时 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param errorMessage 自定义错误消息
 */
export function createTimeoutPromise(
  timeoutMs: number,
  errorMessage?: string
): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new ExecutorError(
          ExecutorErrorType.TIMEOUT_ERROR,
          errorMessage || `查询超时（超过 ${timeoutMs}ms）`
        )
      );
    }, timeoutMs);
  });
}

/**
 * 带超时的执行包装器
 * @param promise 需要执行的 Promise
 * @param timeoutMs 超时时间（毫秒）
 * @param errorMessage 自定义超时错误消息
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new ExecutorError(
          ExecutorErrorType.TIMEOUT_ERROR,
          errorMessage || `查询超时（超过 ${timeoutMs}ms）`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    // 查询先完成时清除定时器，否则每次查询都会留下一个待触发的定时器
    clearTimeout(timeoutId);
  }
}

/**
 * 可取消的超时控制器
 */
export class TimeoutController {
  private timeoutId: NodeJS.Timeout | null = null;
  private isTimedOut = false;
  private isCancelled = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout?: () => void
  ) {}

  /**
   * 启动超时计时
   */
  start(): void {
    if (this.timeoutId) {
      return; // 已经启动
    }

    this.timeoutId = setTimeout(() => {
      this.isTimedOut = true;
      if (this.onTimeout) {
        this.onTimeout();
      }
    }, this.timeoutMs);
  }

  /**
   * 取消超时计时
   */
  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.isCancelled = true;
  }

  /**
   * 检查是否已超时
   */
  hasTimedOut(): boolean {
    return this.isTimedOut;
  }

  /**
   * 检查是否已取消
   */
  hasCancelled(): boolean {
    return this.isCancelled;
  }

  /**
   * 获取剩余时间（毫秒）
   */
  getRemainingTime(): number {
    if (this.isTimedOut || this.isCancelled) {
      return 0;
    }
    // 简化实现：返回原始超时时间
    return this.timeoutMs;
  }
}

/**
 * 批量查询超时管理器
 * 用于管理多个查询的整体超时
 */
export class BatchTimeoutManager {
  private startTime: number;
  private totalTimeoutMs: number;

  constructor(totalTimeoutMs: number) {
    this.totalTimeoutMs = totalTimeoutMs;
    this.startTime = Date.now();
  }

  /**
   * 获取剩余时间
   */
  getRemainingTime(): number {
    const elapsed = Date.now() - this.startTime;
    const remaining = this.totalTimeoutMs - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * 检查是否已超时
   */
  isTimedOut(): boolean {
    return this.getRemainingTime() <= 0;
  }

  /**
   * 为单个查询创建超时 Promise
   */
  createQueryTimeout(queryName?: string): Promise<never> {
    const remaining = this.getRemainingTime();
    if (remaining <= 0) {
      return Promise.reject(
        new ExecutorError(
          ExecutorErrorType.TIMEOUT_ERROR,
          `批量查询超时（总时间超过 ${this.totalTimeoutMs}ms）`
        )
      );
    }

    return createTimeoutPromise(
      remaining,
      queryName
        ? `查询 "${queryName}" 超时（剩余时间 ${remaining}ms）`
        : undefined
    );
  }

  /**
   * 重置计时器
   */
  reset(): void {
    this.startTime = Date.now();
  }
}

/**
 * 自适应超时策略
 * 根据查询复杂度动态调整超时时间
 */
export class AdaptiveTimeoutStrategy {
  // 基础超时时间
  private readonly baseTimeoutMs: number;
  // 复杂度系数
  private readonly complexityMultiplier: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  constructor(baseTimeoutMs: number = 30000) {
    this.baseTimeoutMs = baseTimeoutMs;
  }

  /**
   * 根据复杂度计算超时时间
   */
  calculateTimeout(complexity: 'low' | 'medium' | 'high'): number {
    const multiplier = this.complexityMultiplier[complexity] || 1;
    return this.baseTimeoutMs * multiplier;
  }

  /**
   * 根据表数量和行数估算超时时间
   */
  estimateTimeout(tableCount: number, estimatedRows: number): number {
    let timeout = this.baseTimeoutMs;

    // 根据表数量调整
    if (tableCount > 3) {
      timeout *= 1.5;
    } else if (tableCount > 5) {
      timeout *= 2;
    }

    // 根据预估行数调整
    if (estimatedRows > 100000) {
      timeout *= 2;
    } else if (estimatedRows > 1000000) {
      timeout *= 3;
    }

    // 最大不超过 5 分钟
    return Math.min(timeout, 300000);
  }

  /**
   * 根据历史执行时间预测超时
   */
  predictTimeout(avgExecutionTime: number, stdDeviation: number): number {
    // 设置为平均时间 + 3倍标准差（99.7%的查询应该在此时间内完成）
    const predictedTime = avgExecutionTime + 3 * stdDeviation;

    // 至少给予基础超时时间
    return Math.max(predictedTime, this.baseTimeoutMs);
  }
}
