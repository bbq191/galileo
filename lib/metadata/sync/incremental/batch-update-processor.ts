/**
 * 批量更新处理器
 *
 * 功能：
 * - 批量处理多个数据库的增量更新
 * - 协调更新流程，处理并发和错误
 * - 聚合批量更新的结果
 *
 * 职责：
 * - 管理批量更新的执行顺序
 * - 收集和汇总更新结果
 * - 处理批量更新中的异常情况
 */

import type { Connection } from 'mysql2/promise';
import type { ChangeDetectionResult } from '../change-detector';

/**
 * 批量更新项
 */
export interface BatchUpdateItem {
  connection: Connection;
  databaseId: number;
  databaseName: string;
  changeResult: ChangeDetectionResult;
}

/**
 * 批量更新选项
 */
export interface BatchUpdateOptions {
  /** 是否更新新增表 */
  updateNewTables?: boolean;

  /** 是否删除已删除的表 */
  deleteRemovedTables?: boolean;

  /** 是否更新变更的表结构 */
  updateChangedTables?: boolean;

  /** 是否触发 AI 标注 */
  triggerAIAnnotation?: boolean;

  /** 是否记录变更历史 */
  recordHistory?: boolean;

  /** 是否详细输出 */
  verbose?: boolean;

  /** 批量处理大小 */
  batchSize?: number;

  /** 是否并行处理（默认串行） */
  parallel?: boolean;

  /** 最大并行数（仅在 parallel=true 时有效） */
  maxConcurrency?: number;
}

/**
 * 单个数据库的更新结果
 */
export interface DatabaseUpdateResult {
  /** 数据库 ID */
  databaseId: number;

  /** 数据库名称 */
  databaseName: string;

  /** 是否成功 */
  success: boolean;

  /** 开始时间 */
  startedAt: Date;

  /** 完成时间 */
  completedAt: Date;

  /** 耗时（毫秒） */
  duration: number;

  /** 新增表数量 */
  tablesAdded: number;

  /** 删除表数量 */
  tablesDeleted: number;

  /** 更新表数量 */
  tablesUpdated: number;

  /** 新增字段数量 */
  columnsAdded: number;

  /** 删除字段数量 */
  columnsDeleted: number;

  /** 更新字段数量 */
  columnsUpdated: number;

  /** 总变更数 */
  totalChanges: number;

  /** 错误列表 */
  errors: Array<{ table: string; error: string }>;

  /** 失败原因（如果失败） */
  failureReason?: string;
}

/**
 * 批量更新结果
 */
export interface BatchUpdateResult {
  /** 总数据库数 */
  totalDatabases: number;

  /** 成功数量 */
  successCount: number;

  /** 失败数量 */
  failureCount: number;

  /** 开始时间 */
  startedAt: Date;

  /** 完成时间 */
  completedAt: Date;

  /** 总耗时（毫秒） */
  totalDuration: number;

  /** 各数据库的更新结果 */
  results: DatabaseUpdateResult[];

  /** 汇总统计 */
  summary: {
    totalTablesAdded: number;
    totalTablesDeleted: number;
    totalTablesUpdated: number;
    totalColumnsAdded: number;
    totalColumnsDeleted: number;
    totalColumnsUpdated: number;
    totalChanges: number;
  };
}

/**
 * 批量更新处理器
 */
export class BatchUpdateProcessor {
  /**
   * 处理批量更新（串行）
   */
  async processSequential(
    items: BatchUpdateItem[],
    updateFn: (item: BatchUpdateItem, options: any) => Promise<DatabaseUpdateResult>,
    options: BatchUpdateOptions = {}
  ): Promise<BatchUpdateResult> {
    const startedAt = new Date();
    const results: DatabaseUpdateResult[] = [];

    if (options.verbose) {
      console.log(`\n开始批量更新 (串行模式): ${items.length} 个数据库`);
    }

    for (const item of items) {
      try {
        const result = await updateFn(item, options);
        results.push(result);

        if (options.verbose) {
          console.log(
            `✓ ${item.databaseName}: ${result.totalChanges} 项变更 (${result.duration}ms)`
          );
        }
      } catch (error: any) {
        console.error(`批量更新数据库 ${item.databaseName} 失败:`, error);

        // 记录失败结果
        results.push({
          databaseId: item.databaseId,
          databaseName: item.databaseName,
          success: false,
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 0,
          tablesAdded: 0,
          tablesDeleted: 0,
          tablesUpdated: 0,
          columnsAdded: 0,
          columnsDeleted: 0,
          columnsUpdated: 0,
          totalChanges: 0,
          errors: [],
          failureReason: error.message,
        });
      }
    }

    const completedAt = new Date();
    return this.buildBatchResult(startedAt, completedAt, results);
  }

  /**
   * 处理批量更新（并行）
   */
  async processParallel(
    items: BatchUpdateItem[],
    updateFn: (item: BatchUpdateItem, options: any) => Promise<DatabaseUpdateResult>,
    options: BatchUpdateOptions = {}
  ): Promise<BatchUpdateResult> {
    const startedAt = new Date();
    const maxConcurrency = options.maxConcurrency || 3;

    if (options.verbose) {
      console.log(
        `\n开始批量更新 (并行模式): ${items.length} 个数据库, 最大并发: ${maxConcurrency}`
      );
    }

    // 使用并发控制
    const results = await this.processConcurrent(
      items,
      updateFn,
      options,
      maxConcurrency
    );

    const completedAt = new Date();
    return this.buildBatchResult(startedAt, completedAt, results);
  }

  /**
   * 并发控制处理
   */
  private async processConcurrent(
    items: BatchUpdateItem[],
    updateFn: (item: BatchUpdateItem, options: any) => Promise<DatabaseUpdateResult>,
    options: BatchUpdateOptions,
    maxConcurrency: number
  ): Promise<DatabaseUpdateResult[]> {
    const results: DatabaseUpdateResult[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
      const promise = this.processOne(item, updateFn, options).then(result => {
        results.push(result);

        if (options.verbose) {
          const status = result.success ? '✓' : '✗';
          console.log(
            `${status} ${item.databaseName}: ${result.totalChanges} 项变更 (${result.duration}ms)`
          );
        }
      });

      executing.push(promise);

      // 控制并发数
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        // 移除已完成的 Promise
        executing.splice(
          executing.findIndex(p => p === promise),
          1
        );
      }
    }

    // 等待所有剩余任务完成
    await Promise.all(executing);

    return results;
  }

  /**
   * 处理单个更新项
   */
  private async processOne(
    item: BatchUpdateItem,
    updateFn: (item: BatchUpdateItem, options: any) => Promise<DatabaseUpdateResult>,
    options: BatchUpdateOptions
  ): Promise<DatabaseUpdateResult> {
    try {
      return await updateFn(item, options);
    } catch (error: any) {
      console.error(`批量更新数据库 ${item.databaseName} 失败:`, error);

      return {
        databaseId: item.databaseId,
        databaseName: item.databaseName,
        success: false,
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
        tablesAdded: 0,
        tablesDeleted: 0,
        tablesUpdated: 0,
        columnsAdded: 0,
        columnsDeleted: 0,
        columnsUpdated: 0,
        totalChanges: 0,
        errors: [],
        failureReason: error.message,
      };
    }
  }

  /**
   * 构建批量更新结果
   */
  private buildBatchResult(
    startedAt: Date,
    completedAt: Date,
    results: DatabaseUpdateResult[]
  ): BatchUpdateResult {
    const successCount = results.filter(r => r.success !== false).length;
    const failureCount = results.length - successCount;

    // 计算汇总统计
    const summary = {
      totalTablesAdded: 0,
      totalTablesDeleted: 0,
      totalTablesUpdated: 0,
      totalColumnsAdded: 0,
      totalColumnsDeleted: 0,
      totalColumnsUpdated: 0,
      totalChanges: 0,
    };

    for (const result of results) {
      summary.totalTablesAdded += result.tablesAdded;
      summary.totalTablesDeleted += result.tablesDeleted;
      summary.totalTablesUpdated += result.tablesUpdated;
      summary.totalColumnsAdded += result.columnsAdded;
      summary.totalColumnsDeleted += result.columnsDeleted;
      summary.totalColumnsUpdated += result.columnsUpdated;
      summary.totalChanges += result.totalChanges;
    }

    return {
      totalDatabases: results.length,
      successCount,
      failureCount,
      startedAt,
      completedAt,
      totalDuration: completedAt.getTime() - startedAt.getTime(),
      results,
      summary,
    };
  }

  /**
   * 格式化批量更新结果摘要
   */
  formatSummary(result: BatchUpdateResult): string {
    const lines: string[] = [
      `批量更新完成`,
      `  总数据库: ${result.totalDatabases}`,
      `  成功: ${result.successCount}`,
      `  失败: ${result.failureCount}`,
      `  总耗时: ${result.totalDuration}ms`,
      ``,
      `变更统计:`,
      `  表: +${result.summary.totalTablesAdded} -${result.summary.totalTablesDeleted} *${result.summary.totalTablesUpdated}`,
      `  字段: +${result.summary.totalColumnsAdded} -${result.summary.totalColumnsDeleted} *${result.summary.totalColumnsUpdated}`,
      `  总计: ${result.summary.totalChanges} 项变更`,
    ];

    return lines.join('\n');
  }
}
