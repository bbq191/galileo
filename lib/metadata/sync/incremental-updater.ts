/**
 * 增量更新器（聚合类）
 *
 * 功能：
 * - 处理变更检测器发现的变更
 * - 仅更新变更的部分（而非全量同步）
 * - 处理新增表、删除表、表结构变更
 * - 记录变更历史
 * - 触发 AI 重新标注（仅对变更部分）
 *
 * 优势：
 * - 避免全量同步的性能开销
 * - 精准更新变更的数据
 * - 自动触发相关的后续处理
 *
 * 架构：
 * - 本类已拆分为 4 个职责单一的子模块（位于 incremental/ 子目录）：
 *   1. TableUpdateHandler - 表更新处理（新增、删除、变更表）
 *   2. ColumnDiffAnalyzer - 字段差异分析和对比
 *   3. UpdateHistoryRecorder - 更新历史记录管理
 *   4. BatchUpdateProcessor - 批量更新处理器
 * - 本类作为聚合类，协调各子模块完成增量更新流程
 */

import type { Connection } from 'mysql2/promise';
import type { ChangeDetectionResult } from './change-detector';
import { TableUpdateHandler } from './incremental/table-update-handler';
import { UpdateHistoryRecorder } from './incremental/update-history-recorder';
import { BatchUpdateProcessor } from './incremental/batch-update-processor';
import type { BatchUpdateItem } from './incremental/batch-update-processor';

/**
 * 更新选项
 */
export interface IncrementalUpdateOptions {
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
}

/**
 * 更新结果
 */
export interface IncrementalUpdateResult {
  /** 数据库 ID */
  databaseId: number;

  /** 数据库名称 */
  databaseName: string;

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
}

/**
 * 增量更新器（聚合类）
 *
 * 协调各子模块完成增量更新流程
 */
export class IncrementalUpdater {
  private tableHandler: TableUpdateHandler;
  private historyRecorder: UpdateHistoryRecorder;
  private batchProcessor: BatchUpdateProcessor;

  constructor() {
    this.tableHandler = new TableUpdateHandler();
    this.historyRecorder = new UpdateHistoryRecorder();
    this.batchProcessor = new BatchUpdateProcessor();
  }

  /**
   * 执行增量更新
   */
  async update(
    connection: Connection,
    databaseId: number,
    databaseName: string,
    changeResult: ChangeDetectionResult,
    options: IncrementalUpdateOptions = {}
  ): Promise<IncrementalUpdateResult> {
    const startedAt = new Date();
    const {
      updateNewTables = true,
      deleteRemovedTables = true,
      updateChangedTables = true,
      triggerAIAnnotation = false,
      recordHistory = true,
      verbose = false,
      batchSize = 10,
    } = options;

    if (verbose) {
      console.log(`\n开始增量更新: ${databaseName}`);
      console.log(`新增表: ${changeResult.tableDiff.newTables.length}`);
      console.log(`删除表: ${changeResult.tableDiff.deletedTables.length}`);
      console.log(`变更表: ${changeResult.changedTables.length}`);
    }

    const result: IncrementalUpdateResult = {
      databaseId,
      databaseName,
      startedAt,
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
    };

    try {
      // 1. 处理新增的表（委托给 TableUpdateHandler）
      if (updateNewTables && changeResult.tableDiff.newTables.length > 0) {
        if (verbose) console.log('\n处理新增表...');
        const addResult = await this.tableHandler.handleNewTables(
          connection,
          databaseId,
          databaseName,
          changeResult.tableDiff.newTables,
          { triggerAIAnnotation, verbose, batchSize }
        );
        result.tablesAdded = addResult.tablesAdded;
        result.columnsAdded = addResult.columnsAdded;
        result.errors.push(...addResult.errors);
      }

      // 2. 处理删除的表（委托给 TableUpdateHandler）
      if (deleteRemovedTables && changeResult.tableDiff.deletedTables.length > 0) {
        if (verbose) console.log('\n处理删除表...');
        const deleteResult = await this.tableHandler.handleDeletedTables(
          changeResult.tableDiff.deletedTables,
          { verbose }
        );
        result.tablesDeleted = deleteResult.tablesDeleted;
        result.errors.push(...deleteResult.errors);
      }

      // 3. 处理结构变更的表（委托给 TableUpdateHandler）
      if (updateChangedTables && changeResult.changedTables.length > 0) {
        if (verbose) console.log('\n处理结构变更表...');
        const updateResult = await this.tableHandler.handleChangedTables(
          connection,
          databaseId,
          databaseName,
          changeResult.changedTables,
          { triggerAIAnnotation, verbose, batchSize }
        );
        result.tablesUpdated = updateResult.tablesUpdated;
        result.columnsAdded += updateResult.columnsAdded;
        result.columnsDeleted = updateResult.columnsDeleted;
        result.columnsUpdated = updateResult.columnsUpdated;
        result.errors.push(...updateResult.errors);
      }

      const completedAt = new Date();
      result.completedAt = completedAt;
      result.duration = completedAt.getTime() - startedAt.getTime();
      result.totalChanges =
        result.tablesAdded +
        result.tablesDeleted +
        result.tablesUpdated +
        result.columnsAdded +
        result.columnsDeleted +
        result.columnsUpdated;

      if (verbose) {
        console.log(`\n增量更新完成`);
        console.log(`总变更数: ${result.totalChanges}`);
        console.log(`耗时: ${result.duration}ms`);
        if (result.errors.length > 0) {
          console.log(`错误数: ${result.errors.length}`);
        }
      }

      // 4. 记录更新历史（委托给 UpdateHistoryRecorder）
      if (recordHistory) {
        await this.historyRecorder.recordHistory(result);
      }

      // 5. 更新数据库的最后同步时间（委托给 TableUpdateHandler）
      await this.tableHandler.updateLastSyncTime(databaseId);

      return result;
    } catch (error) {
      console.error('增量更新失败:', error);
      throw error;
    }
  }


  /**
   * 批量更新多个数据库
   */
  async batchUpdate(
    updates: Array<{
      connection: Connection;
      databaseId: number;
      databaseName: string;
      changeResult: ChangeDetectionResult;
    }>,
    options: IncrementalUpdateOptions = {}
  ): Promise<IncrementalUpdateResult[]> {
    const results: IncrementalUpdateResult[] = [];

    for (const update of updates) {
      try {
        const result = await this.update(
          update.connection,
          update.databaseId,
          update.databaseName,
          update.changeResult,
          options
        );
        results.push(result);
      } catch (error) {
        console.error(
          `批量更新数据库 ${update.databaseName} 失败:`,
          error
        );
      }
    }

    return results;
  }
}

/**
 * 导出默认实例
 */
export const incrementalUpdater = new IncrementalUpdater();
