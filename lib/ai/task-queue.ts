/**
 * 任务队列管理器
 *
 * 功能：
 * - 任务持久化（支持断点续传）
 * - 任务优先级管理
 * - 任务状态追踪
 * - 错误恢复
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';

function getPrismaClient() {
  return prisma;
}

/**
 * 任务状态
 */
export enum TaskStatus {
  PENDING = 'pending',     // 等待处理
  PROCESSING = 'processing', // 处理中
  COMPLETED = 'completed',  // 已完成
  FAILED = 'failed',        // 失败
  RETRYING = 'retrying',    // 重试中
  CANCELLED = 'cancelled',  // 已取消
}

/**
 * 任务优先级
 */
export enum TaskPriority {
  CRITICAL = 1,  // 关键任务
  HIGH = 2,      // 高优先级
  NORMAL = 3,    // 普通
  LOW = 4,       // 低优先级
}

/**
 * 任务类型
 */
export enum TaskType {
  SEMANTIC_ANNOTATION = 'semantic_annotation',      // 语义标注
  RELATIONSHIP_INFERENCE = 'relationship_inference', // 关系推断
  METADATA_SYNC = 'metadata_sync',                  // 元数据同步
}

/**
 * 任务定义
 */
export interface Task<T = any> {
  /** 任务 ID */
  id: string;

  /** 任务类型 */
  type: TaskType;

  /** 任务名称 */
  name: string;

  /** 任务数据 */
  data: T;

  /** 任务状态 */
  status: TaskStatus;

  /** 优先级 */
  priority: TaskPriority;

  /** 重试次数 */
  retryCount: number;

  /** 最大重试次数 */
  maxRetries: number;

  /** 错误信息 */
  error?: string;

  /** 创建时间 */
  createdAt: Date;

  /** 开始时间 */
  startedAt?: Date;

  /** 完成时间 */
  completedAt?: Date;

  /** 进度（0-100） */
  progress: number;

  /** 元数据（额外信息） */
  metadata?: Record<string, any>;
}

/**
 * 任务创建选项
 */
export interface CreateTaskOptions<T> {
  type: TaskType;
  name: string;
  data: T;
  priority?: TaskPriority;
  maxRetries?: number;
  metadata?: Record<string, any>;
}

/**
 * 任务队列管理器类
 */
export class TaskQueueManager {
  /**
   * 创建任务
   */
  async createTask<T>(options: CreateTaskOptions<T>): Promise<Task<T>> {
    const task: Task<T> = {
      id: this.generateTaskId(),
      type: options.type,
      name: options.name,
      data: options.data,
      status: TaskStatus.PENDING,
      priority: options.priority || TaskPriority.NORMAL,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      progress: 0,
      createdAt: new Date(),
      metadata: options.metadata,
    };

    // 持久化任务到数据库
    await this.saveTask(task);

    console.log(`任务已创建: ${task.id} - ${task.name}`);
    return task;
  }

  /**
   * 获取下一个待处理任务（按优先级）
   */
  async getNextTask(): Promise<Task | null> {
    const client = getPrismaClient();

    // 查询待处理任务，按优先级和创建时间排序
    const taskRecord = await client.$queryRawUnsafe<any[]>(`
      SELECT * FROM task_queue
      WHERE status IN ('pending', 'retrying')
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
    `);

    if (taskRecord.length === 0) {
      return null;
    }

    const task = this.deserializeTask(taskRecord[0]);

    // 标记为处理中
    await this.updateTaskStatus(task.id, TaskStatus.PROCESSING);
    task.status = TaskStatus.PROCESSING;
    task.startedAt = new Date();

    return task;
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    error?: string
  ): Promise<void> {
    const client = getPrismaClient();

    const updates: any = {
      status,
      updated_at: new Date(),
    };

    if (status === TaskStatus.PROCESSING) {
      updates.started_at = new Date();
    } else if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      updates.completed_at = new Date();
    }

    if (error) {
      updates.error = error;
    }

    await client.$executeRawUnsafe(`
      UPDATE task_queue
      SET ${Object.keys(updates).map((k) => `${k} = ?`).join(', ')}
      WHERE id = ?
    `, ...Object.values(updates), taskId);

    console.log(`任务状态更新: ${taskId} -> ${status}`);
  }

  /**
   * 更新任务进度
   */
  async updateTaskProgress(taskId: string, progress: number): Promise<void> {
    const client = getPrismaClient();

    await client.$executeRawUnsafe(`
      UPDATE task_queue
      SET progress = ?, updated_at = ?
      WHERE id = ?
    `, Math.max(0, Math.min(100, progress)), new Date(), taskId);
  }

  /**
   * 标记任务完成
   */
  async completeTask(taskId: string): Promise<void> {
    await this.updateTaskStatus(taskId, TaskStatus.COMPLETED);
    await this.updateTaskProgress(taskId, 100);
  }

  /**
   * 标记任务失败
   */
  async failTask(taskId: string, error: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    // 检查是否需要重试
    if (task.retryCount < task.maxRetries) {
      console.log(`任务失败，将重试: ${taskId} (${task.retryCount + 1}/${task.maxRetries})`);
      await this.retryTask(taskId, error);
    } else {
      console.error(`任务彻底失败: ${taskId} - ${error}`);
      await this.updateTaskStatus(taskId, TaskStatus.FAILED, error);
    }
  }

  /**
   * 重试任务
   */
  async retryTask(taskId: string, error: string): Promise<void> {
    const client = getPrismaClient();

    await client.$executeRawUnsafe(`
      UPDATE task_queue
      SET status = ?,
          retry_count = retry_count + 1,
          error = ?,
          updated_at = ?
      WHERE id = ?
    `, TaskStatus.RETRYING, error, new Date(), taskId);

    // 延迟后重新设置为 pending
    setTimeout(async () => {
      await this.updateTaskStatus(taskId, TaskStatus.PENDING);
    }, 5000); // 5秒后重试
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<void> {
    await this.updateTaskStatus(taskId, TaskStatus.CANCELLED);
  }

  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<Task | null> {
    const client = getPrismaClient();

    const taskRecords = await client.$queryRawUnsafe<any[]>(`
      SELECT * FROM task_queue WHERE id = ?
    `, taskId);

    if (taskRecords.length === 0) {
      return null;
    }

    return this.deserializeTask(taskRecords[0]);
  }

  /**
   * 获取任务列表
   */
  async getTasks(filters?: {
    status?: TaskStatus;
    type?: TaskType;
    priority?: TaskPriority;
    limit?: number;
  }): Promise<Task[]> {
    const client = getPrismaClient();

    let whereClause = '';
    const params: any[] = [];

    if (filters) {
      const conditions: string[] = [];
      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }
      if (filters.type) {
        conditions.push('type = ?');
        params.push(filters.type);
      }
      if (filters.priority) {
        conditions.push('priority = ?');
        params.push(filters.priority);
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
    }

    const limit = filters?.limit || 100;
    const query = `
      SELECT * FROM task_queue
      ${whereClause}
      ORDER BY priority ASC, created_at DESC
      LIMIT ?
    `;

    const taskRecords = await client.$queryRawUnsafe<any[]>(
      query,
      ...params,
      limit
    );

    return taskRecords.map((record) => this.deserializeTask(record));
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
    cancelled: number;
  }> {
    const client = getPrismaClient();

    const stats = await client.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'retrying' THEN 1 ELSE 0 END) as retrying,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM task_queue
    `);

    const stat = stats[0];
    return {
      total: Number(stat.total),
      pending: Number(stat.pending),
      processing: Number(stat.processing),
      completed: Number(stat.completed),
      failed: Number(stat.failed),
      retrying: Number(stat.retrying),
      cancelled: Number(stat.cancelled),
    };
  }

  /**
   * 清理已完成的任务（保留最近N天）
   */
  async cleanupCompletedTasks(daysToKeep: number = 7): Promise<number> {
    const client = getPrismaClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await client.$executeRawUnsafe(`
      DELETE FROM task_queue
      WHERE status IN ('completed', 'cancelled')
        AND completed_at < ?
    `, cutoffDate);

    console.log(`清理完成任务: ${result} 条记录`);
    return result as number;
  }

  /**
   * 恢复中断的任务
   */
  async recoverInterruptedTasks(): Promise<number> {
    const client = getPrismaClient();

    // 将处理中的任务重置为待处理
    const result = await client.$executeRawUnsafe(`
      UPDATE task_queue
      SET status = 'pending',
          updated_at = ?
      WHERE status = 'processing'
    `, new Date());

    if (result) {
      console.log(`恢复中断任务: ${result} 个`);
    }

    return result as number;
  }

  /**
   * 生成任务 ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * 保存任务到数据库
   */
  private async saveTask(task: Task): Promise<void> {
    const client = getPrismaClient();

    try {
      await client.$executeRawUnsafe(`
        INSERT INTO task_queue (
          id, type, name, data, status, priority,
          retry_count, max_retries, progress, error,
          created_at, started_at, completed_at, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        task.id,
        task.type,
        task.name,
        JSON.stringify(task.data),
        task.status,
        task.priority,
        task.retryCount,
        task.maxRetries,
        task.progress,
        task.error || null,
        task.createdAt,
        task.startedAt || null,
        task.completedAt || null,
        task.metadata ? JSON.stringify(task.metadata) : null
      );
    } catch (error) {
      console.error('保存任务失败:', error);
      throw error;
    }
  }

  /**
   * 反序列化任务
   */
  private deserializeTask(record: any): Task {
    return {
      id: record.id,
      type: record.type as TaskType,
      name: record.name,
      data: JSON.parse(record.data),
      status: record.status as TaskStatus,
      priority: record.priority as TaskPriority,
      retryCount: record.retry_count,
      maxRetries: record.max_retries,
      progress: record.progress,
      error: record.error,
      createdAt: new Date(record.created_at),
      startedAt: record.started_at ? new Date(record.started_at) : undefined,
      completedAt: record.completed_at ? new Date(record.completed_at) : undefined,
      metadata: record.metadata ? JSON.parse(record.metadata) : undefined,
    };
  }
}

/**
 * 导出默认实例
 */
export const taskQueueManager = new TaskQueueManager();
