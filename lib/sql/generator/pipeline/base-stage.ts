/**
 * 管道阶段基类
 *
 * 提供通用功能：
 * - 执行时间跟踪
 * - 错误处理
 * - 日志记录
 * - 条件执行
 */

import { PipelineStage, PipelineContext, StageExecutionInfo } from './types';

/**
 * 管道阶段抽象基类
 */
export abstract class BasePipelineStage implements PipelineStage {
  /** 阶段名称 */
  abstract readonly name: string;

  /** 阶段描述 */
  abstract readonly description: string;

  /** 阶段优先级 */
  abstract readonly priority: number;

  /**
   * 处理请求
   */
  async process(context: PipelineContext): Promise<PipelineContext> {
    // 如果已经应该停止，直接返回
    if (context.shouldStop) {
      context.skippedStages.push(this.name);
      return context;
    }

    // 检查是否应该执行此阶段
    if (!this.shouldExecute(context)) {
      context.skippedStages.push(this.name);
      this.log(context, `跳过阶段：${this.name}`, 'info');
      return context;
    }

    const startTime = Date.now();
    const executionInfo: StageExecutionInfo = {
      stageName: this.name,
      startTime,
      endTime: 0,
      duration: 0,
      success: false
    };

    try {
      this.log(context, `开始执行阶段：${this.name}`, 'info');

      // 执行具体逻辑
      const updatedContext = await this.execute(context);

      // 记录成功
      executionInfo.success = true;
      executionInfo.endTime = Date.now();
      executionInfo.duration = executionInfo.endTime - startTime;

      updatedContext.executedStages.push(executionInfo);

      this.log(
        context,
        `阶段完成：${this.name}，耗时 ${executionInfo.duration}ms`,
        'info'
      );

      return updatedContext;
    } catch (error) {
      // 记录失败
      executionInfo.success = false;
      executionInfo.endTime = Date.now();
      executionInfo.duration = executionInfo.endTime - startTime;
      executionInfo.error = error instanceof Error ? error.message : String(error);

      context.executedStages.push(executionInfo);

      this.log(
        context,
        `阶段失败：${this.name}，错误：${executionInfo.error}`,
        'error'
      );

      // 决定是否应该传播错误
      if (this.shouldThrowError(context, error)) {
        throw error;
      }

      // 继续执行下一阶段
      return context;
    }
  }

  /**
   * 执行阶段具体逻辑（子类实现）
   */
  protected abstract execute(context: PipelineContext): Promise<PipelineContext>;

  /**
   * 是否应该执行此阶段（子类可覆盖）
   */
  shouldExecute(context: PipelineContext): boolean {
    // 默认总是执行
    return true;
  }

  /**
   * 是否应该抛出错误（子类可覆盖）
   */
  protected shouldThrowError(context: PipelineContext, error: unknown): boolean {
    // 默认不抛出错误，继续执行管道
    // 缓存类阶段失败不应该中断流程
    return false;
  }

  /**
   * 日志记录
   */
  protected log(
    context: PipelineContext,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info'
  ): void {
    if (context.options.verbose) {
      const timestamp = new Date().toISOString();
      const prefix = `[Pipeline:${this.name}] [${timestamp}]`;

      switch (level) {
        case 'info':
          console.log(`${prefix} ${message}`);
          break;
        case 'warn':
          console.warn(`${prefix} ${message}`);
          break;
        case 'error':
          console.error(`${prefix} ${message}`);
          break;
      }
    }
  }

  /**
   * 创建结果并停止管道
   */
  protected createResultAndStop(
    context: PipelineContext,
    result: PipelineContext['result'],
    cacheType?: 'template' | 'prompt' | 'sql'
  ): PipelineContext {
    const updatedContext = { ...context };
    updatedContext.result = result;
    updatedContext.shouldStop = true;

    if (cacheType) {
      updatedContext.additionalData.cacheType = cacheType;
      updatedContext.additionalData.cached = true;
    }

    return updatedContext;
  }
}
