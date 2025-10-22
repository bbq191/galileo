/**
 * 断点续传管理器
 *
 * 功能：
 * - 保存处理进度
 * - 恢复中断的处理
 * - 跳过已处理项
 */

import { PrismaClient } from '@prisma/client';
import type { TaskType } from './task-queue';

let prisma: PrismaClient;

function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * 处理进度记录
 */
export interface ProcessProgress {
  /** 进度 ID */
  id: string;

  /** 任务类型 */
  taskType: TaskType;

  /** 任务标识（如 databaseId, tableId 等） */
  taskIdentifier: string;

  /** 总项数 */
  totalItems: number;

  /** 已处理项数 */
  processedItems: number;

  /** 已完成的项 ID 列表 */
  completedItemIds: string[];

  /** 失败的项 ID 列表 */
  failedItemIds: string[];

  /** 状态 */
  status: 'in_progress' | 'completed' | 'failed';

  /** 开始时间 */
  startedAt: Date;

  /** 更新时间 */
  updatedAt: Date;

  /** 完成时间 */
  completedAt?: Date;

  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 断点续传管理器
 */
export class ResumeManager {
  /**
   * 开始新的处理任务
   */
  async startProgress(
    taskType: TaskType,
    taskIdentifier: string,
    totalItems: number,
    metadata?: Record<string, any>
  ): Promise<ProcessProgress> {
    const progress: ProcessProgress = {
      id: this.generateProgressId(),
      taskType,
      taskIdentifier,
      totalItems,
      processedItems: 0,
      completedItemIds: [],
      failedItemIds: [],
      status: 'in_progress',
      startedAt: new Date(),
      updatedAt: new Date(),
      metadata,
    };

    await this.saveProgress(progress);

    console.log(`开始处理任务: ${taskType} - ${taskIdentifier} (共 ${totalItems} 项)`);
    return progress;
  }

  /**
   * 恢复之前的处理进度
   */
  async resumeProgress(
    taskType: TaskType,
    taskIdentifier: string
  ): Promise<ProcessProgress | null> {
    const client = getPrismaClient();

    const progressRecords = await client.$queryRawUnsafe<any[]>(`
      SELECT * FROM process_progress
      WHERE task_type = ?
        AND task_identifier = ?
        AND status = 'in_progress'
      ORDER BY started_at DESC
      LIMIT 1
    `, taskType, taskIdentifier);

    if (progressRecords.length === 0) {
      return null;
    }

    const progress = this.deserializeProgress(progressRecords[0]);

    console.log(`恢复处理任务: ${taskType} - ${taskIdentifier}`);
    console.log(`已完成: ${progress.processedItems}/${progress.totalItems}`);
    console.log(`成功: ${progress.completedItemIds.length}, 失败: ${progress.failedItemIds.length}`);

    return progress;
  }

  /**
   * 获取或创建进度
   */
  async getOrCreateProgress(
    taskType: TaskType,
    taskIdentifier: string,
    totalItems: number,
    metadata?: Record<string, any>
  ): Promise<ProcessProgress> {
    // 尝试恢复
    const existingProgress = await this.resumeProgress(taskType, taskIdentifier);
    if (existingProgress) {
      return existingProgress;
    }

    // 创建新进度
    return await this.startProgress(taskType, taskIdentifier, totalItems, metadata);
  }

  /**
   * 标记项已完成
   */
  async markItemCompleted(
    progressId: string,
    itemId: string
  ): Promise<void> {
    const client = getPrismaClient();

    // 获取当前进度
    const progressRecords = await client.$queryRawUnsafe<any[]>(`
      SELECT * FROM process_progress WHERE id = ?
    `, progressId);

    if (progressRecords.length === 0) {
      throw new Error(`进度记录不存在: ${progressId}`);
    }

    const progress = this.deserializeProgress(progressRecords[0]);

    // 检查是否已经记录
    if (progress.completedItemIds.includes(itemId)) {
      return;
    }

    // 更新记录
    progress.completedItemIds.push(itemId);
    progress.processedItems++;
    progress.updatedAt = new Date();

    // 检查是否全部完成
    if (progress.processedItems >= progress.totalItems) {
      progress.status = 'completed';
      progress.completedAt = new Date();
      console.log(`任务完成: ${progress.taskType} - ${progress.taskIdentifier}`);
    }

    await this.updateProgress(progress);
  }

  /**
   * 标记项失败
   */
  async markItemFailed(
    progressId: string,
    itemId: string
  ): Promise<void> {
    const client = getPrismaClient();

    const progressRecords = await client.$queryRawUnsafe<any[]>(`
      SELECT * FROM process_progress WHERE id = ?
    `, progressId);

    if (progressRecords.length === 0) {
      throw new Error(`进度记录不存在: ${progressId}`);
    }

    const progress = this.deserializeProgress(progressRecords[0]);

    // 检查是否已经记录
    if (progress.failedItemIds.includes(itemId)) {
      return;
    }

    progress.failedItemIds.push(itemId);
    progress.processedItems++;
    progress.updatedAt = new Date();

    await this.updateProgress(progress);
  }

  /**
   * 检查项是否已处理
   */
  async isItemProcessed(
    progress: ProcessProgress,
    itemId: string
  ): Promise<boolean> {
    return (
      progress.completedItemIds.includes(itemId) ||
      progress.failedItemIds.includes(itemId)
    );
  }

  /**
   * 获取未处理的项
   */
  async getUnprocessedItems<T extends { id?: string; [key: string]: any }>(
    progress: ProcessProgress,
    allItems: T[]
  ): Promise<T[]> {
    const processedIds = new Set([
      ...progress.completedItemIds,
      ...progress.failedItemIds,
    ]);

    return allItems.filter((item) => {
      const itemId = item.id?.toString() || JSON.stringify(item);
      return !processedIds.has(itemId);
    });
  }

  /**
   * 标记进度完成
   */
  async completeProgress(progressId: string): Promise<void> {
    const client = getPrismaClient();

    await client.$executeRawUnsafe(`
      UPDATE process_progress
      SET status = 'completed',
          completed_at = ?,
          updated_at = ?
      WHERE id = ?
    `, new Date(), new Date(), progressId);

    console.log(`进度已完成: ${progressId}`);
  }

  /**
   * 标记进度失败
   */
  async failProgress(progressId: string): Promise<void> {
    const client = getPrismaClient();

    await client.$executeRawUnsafe(`
      UPDATE process_progress
      SET status = 'failed',
          completed_at = ?,
          updated_at = ?
      WHERE id = ?
    `, new Date(), new Date(), progressId);

    console.log(`进度已失败: ${progressId}`);
  }

  /**
   * 清理旧的进度记录
   */
  async cleanupOldProgress(daysToKeep: number = 7): Promise<number> {
    const client = getPrismaClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await client.$executeRawUnsafe(`
      DELETE FROM process_progress
      WHERE status IN ('completed', 'failed')
        AND completed_at < ?
    `, cutoffDate);

    console.log(`清理旧进度记录: ${result} 条`);
    return result as number;
  }

  /**
   * 获取所有进行中的任务
   */
  async getInProgressTasks(): Promise<ProcessProgress[]> {
    const client = getPrismaClient();

    const progressRecords = await client.$queryRawUnsafe<any[]>(`
      SELECT * FROM process_progress
      WHERE status = 'in_progress'
      ORDER BY started_at DESC
    `);

    return progressRecords.map((record) => this.deserializeProgress(record));
  }

  /**
   * 保存进度
   */
  private async saveProgress(progress: ProcessProgress): Promise<void> {
    const client = getPrismaClient();

    await client.$executeRawUnsafe(`
      INSERT INTO process_progress (
        id, task_type, task_identifier, total_items, processed_items,
        completed_item_ids, failed_item_ids, status,
        started_at, updated_at, completed_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      progress.id,
      progress.taskType,
      progress.taskIdentifier,
      progress.totalItems,
      progress.processedItems,
      JSON.stringify(progress.completedItemIds),
      JSON.stringify(progress.failedItemIds),
      progress.status,
      progress.startedAt,
      progress.updatedAt,
      progress.completedAt || null,
      progress.metadata ? JSON.stringify(progress.metadata) : null
    );
  }

  /**
   * 更新进度
   */
  private async updateProgress(progress: ProcessProgress): Promise<void> {
    const client = getPrismaClient();

    await client.$executeRawUnsafe(`
      UPDATE process_progress
      SET processed_items = ?,
          completed_item_ids = ?,
          failed_item_ids = ?,
          status = ?,
          updated_at = ?,
          completed_at = ?
      WHERE id = ?
    `,
      progress.processedItems,
      JSON.stringify(progress.completedItemIds),
      JSON.stringify(progress.failedItemIds),
      progress.status,
      progress.updatedAt,
      progress.completedAt || null,
      progress.id
    );
  }

  /**
   * 反序列化进度
   */
  private deserializeProgress(record: any): ProcessProgress {
    return {
      id: record.id,
      taskType: record.task_type as TaskType,
      taskIdentifier: record.task_identifier,
      totalItems: record.total_items,
      processedItems: record.processed_items,
      completedItemIds: JSON.parse(record.completed_item_ids),
      failedItemIds: JSON.parse(record.failed_item_ids),
      status: record.status,
      startedAt: new Date(record.started_at),
      updatedAt: new Date(record.updated_at),
      completedAt: record.completed_at ? new Date(record.completed_at) : undefined,
      metadata: record.metadata ? JSON.parse(record.metadata) : undefined,
    };
  }

  /**
   * 生成进度 ID
   */
  private generateProgressId(): string {
    return `progress_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * 导出默认实例
 */
export const resumeManager = new ResumeManager();
