/**
 * 元数据同步调度器
 *
 * 功能：
 * - 定时同步元数据
 * - 支持动态调度配置
 * - 集成变更检测和增量更新
 * - 健康检查和错误处理
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import mysql from 'mysql2/promise';
import { changeDetector, DetectionMode } from './change-detector';
import { incrementalUpdater } from './incremental-updater';
import { syncLogger } from './sync-logger';

function getPrismaClient(): PrismaClient {
  return prisma;
}

/**
 * 调度配置
 */
export interface SyncScheduleConfig {
  sourceId: number;
  schedule: string;  // cron 表达式
  enabled: boolean;
  detectionMode?: DetectionMode;
  enableAIAnnotation?: boolean;
  batchSize?: number;
}

/**
 * 同步任务
 */
interface SyncTask {
  config: SyncScheduleConfig;
  job: ReturnType<typeof cron.schedule>;
  isRunning: boolean;
  lastRunAt?: Date;
  lastStatus?: 'success' | 'failure';
  lastError?: string;
}

/**
 * 调度器选项
 */
export interface SchedulerOptions {
  defaultSchedule?: string;  // 默认 cron 表达式
  defaultDetectionMode?: DetectionMode;
  defaultEnableAI?: boolean;
  defaultBatchSize?: number;
  autoStart?: boolean;  // 是否自动启动
  maxConcurrent?: number;  // 最大并发同步数
}

/**
 * 同步调度器类
 */
export class SyncScheduler {
  private tasks: Map<number, SyncTask> = new Map();
  private options: Required<SchedulerOptions>;
  private runningCount: number = 0;
  private isInitialized: boolean = false;

  constructor(options: SchedulerOptions = {}) {
    this.options = {
      defaultSchedule: options.defaultSchedule || '0 * * * *',  // 每小时
      defaultDetectionMode: options.defaultDetectionMode || DetectionMode.AUTO,
      defaultEnableAI: options.defaultEnableAI ?? false,
      defaultBatchSize: options.defaultBatchSize || 50,
      autoStart: options.autoStart ?? true,
      maxConcurrent: options.maxConcurrent || 5,
    };
  }

  /**
   * 初始化调度器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[SyncScheduler] 调度器已经初始化');
      return;
    }

    console.log('[SyncScheduler] 正在初始化调度器...');

    try {
      const prisma = getPrismaClient();

      // 获取所有活跃的数据源
      const sources = await prisma.dataSource.findMany({
        where: { status: 'active' },
      });

      console.log(`[SyncScheduler] 找到 ${sources.length} 个活跃数据源`);

      // 为每个数据源创建调度任务
      for (const source of sources) {
        const config: SyncScheduleConfig = {
          sourceId: source.id,
          schedule: this.options.defaultSchedule,
          enabled: true,
          detectionMode: this.options.defaultDetectionMode,
          enableAIAnnotation: this.options.defaultEnableAI,
          batchSize: this.options.defaultBatchSize,
        };

        await this.scheduleTask(config);
      }

      this.isInitialized = true;
      console.log('[SyncScheduler] 调度器初始化完成');

      if (this.options.autoStart) {
        this.startAll();
      }
    } catch (error) {
      console.error('[SyncScheduler] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 调度单个任务
   */
  async scheduleTask(config: SyncScheduleConfig): Promise<void> {
    // 如果任务已存在，先取消
    if (this.tasks.has(config.sourceId)) {
      await this.unscheduleTask(config.sourceId);
    }

    // 验证 cron 表达式
    if (!cron.validate(config.schedule)) {
      throw new Error(`无效的 cron 表达式: ${config.schedule}`);
    }

    // 创建 cron 任务
    const job = cron.schedule(
      config.schedule,
      async () => {
        await this.executeSyncTask(config.sourceId);
      },
      {
        timezone: 'Asia/Shanghai',
      }
    );

    // 默认不自动启动，需要手动调用 start()
    job.stop();

    const task: SyncTask = {
      config,
      job,
      isRunning: false,
    };

    this.tasks.set(config.sourceId, task);

    console.log(
      `[SyncScheduler] 调度任务已创建: 数据源 ${config.sourceId} (${config.schedule})`
    );
  }

  /**
   * 取消调度任务
   */
  async unscheduleTask(sourceId: number): Promise<void> {
    const task = this.tasks.get(sourceId);
    if (!task) {
      return;
    }

    task.job.stop();
    this.tasks.delete(sourceId);

    console.log(`[SyncScheduler] 调度任务已取消: 数据源 ${sourceId}`);
  }

  /**
   * 启动所有任务
   */
  startAll(): void {
    console.log('[SyncScheduler] 启动所有调度任务...');

    for (const [sourceId, task] of this.tasks.entries()) {
      if (task.config.enabled) {
        task.job.start();
        console.log(`[SyncScheduler] 任务已启动: 数据源 ${sourceId}`);
      }
    }
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    console.log('[SyncScheduler] 停止所有调度任务...');

    for (const [sourceId, task] of this.tasks.entries()) {
      task.job.stop();
      console.log(`[SyncScheduler] 任务已停止: 数据源 ${sourceId}`);
    }
  }

  /**
   * 启动单个任务
   */
  startTask(sourceId: number): void {
    const task = this.tasks.get(sourceId);
    if (!task) {
      throw new Error(`任务不存在: 数据源 ${sourceId}`);
    }

    task.config.enabled = true;
    task.job.start();

    console.log(`[SyncScheduler] 任务已启动: 数据源 ${sourceId}`);
  }

  /**
   * 停止单个任务
   */
  stopTask(sourceId: number): void {
    const task = this.tasks.get(sourceId);
    if (!task) {
      throw new Error(`任务不存在: 数据源 ${sourceId}`);
    }

    task.config.enabled = false;
    task.job.stop();

    console.log(`[SyncScheduler] 任务已停止: 数据源 ${sourceId}`);
  }

  /**
   * 手动触发同步
   */
  async triggerSync(sourceId: number): Promise<void> {
    console.log(`[SyncScheduler] 手动触发同步: 数据源 ${sourceId}`);
    await this.executeSyncTask(sourceId);
  }

  /**
   * 执行同步任务
   */
  private async executeSyncTask(sourceId: number): Promise<void> {
    const task = this.tasks.get(sourceId);
    if (!task) {
      console.warn(`[SyncScheduler] 任务不存在: 数据源 ${sourceId}`);
      return;
    }

    // 检查是否正在运行
    if (task.isRunning) {
      console.warn(`[SyncScheduler] 任务正在运行中，跳过: 数据源 ${sourceId}`);
      return;
    }

    // 检查并发限制
    if (this.runningCount >= this.options.maxConcurrent) {
      console.warn(
        `[SyncScheduler] 达到最大并发限制 (${this.options.maxConcurrent})，跳过: 数据源 ${sourceId}`
      );
      return;
    }

    task.isRunning = true;
    task.lastRunAt = new Date();
    this.runningCount++;

    let logId: string | undefined;

    try {
      const prisma = getPrismaClient();

      // 获取数据源信息
      const source = await prisma.dataSource.findUnique({
        where: { id: sourceId },
        include: {
          databases: {
            where: { lastSyncedAt: { not: null } },  // 只同步已初始化的数据库
          },
        },
      });

      if (!source) {
        throw new Error(`数据源不存在: ${sourceId}`);
      }

      if (source.status !== 'active') {
        console.log(`[SyncScheduler] 数据源未激活，跳过: ${source.name}`);
        return;
      }

      console.log(`[SyncScheduler] 开始同步数据源: ${source.name}`);
      logId = await syncLogger.logSyncStart(source.id, source.name, undefined, undefined, 'incremental');

      // 创建数据库连接
      const connection = await mysql.createConnection({
        host: source.host,
        port: source.port,
        user: source.username,
        password: this.decryptPassword(source.passwordEncrypted),
      });

      try {
        let totalTablesAdded = 0;
        let totalTablesUpdated = 0;
        let totalTablesDeleted = 0;
        let totalColumnsAdded = 0;
        let totalColumnsUpdated = 0;
        let totalColumnsDeleted = 0;

        // 对每个数据库执行增量同步
        for (const database of source.databases) {
          console.log(`[SyncScheduler] 同步数据库: ${database.databaseName}`);

          try {
            // 1. 变更检测
            const changeResult = await changeDetector.detectChanges(
              connection,
              database.id,
              database.databaseName,
              {
                mode: task.config.detectionMode || DetectionMode.AUTO,
                verbose: false,
              }
            );

            // 2. 如果有变更，执行增量更新
            if (changeResult.hasChanges) {
              const updateResult = await incrementalUpdater.update(
                connection,
                database.id,
                database.databaseName,
                changeResult,
                {
                  batchSize: task.config.batchSize,
                  triggerAIAnnotation: task.config.enableAIAnnotation,
                  verbose: false,
                }
              );

              totalTablesAdded += updateResult.tablesAdded;
              totalTablesUpdated += updateResult.tablesUpdated;
              totalTablesDeleted += updateResult.tablesDeleted;
              totalColumnsAdded += updateResult.columnsAdded;
              totalColumnsUpdated += updateResult.columnsUpdated;
              totalColumnsDeleted += updateResult.columnsDeleted;

              console.log(
                `[SyncScheduler] 数据库 ${database.databaseName} 同步完成: ` +
                `表 +${updateResult.tablesAdded} ~${updateResult.tablesUpdated} -${updateResult.tablesDeleted}, ` +
                `列 +${updateResult.columnsAdded} ~${updateResult.columnsUpdated} -${updateResult.columnsDeleted}`
              );
            } else {
              console.log(`[SyncScheduler] 数据库 ${database.databaseName} 无变更`);
            }

            // 更新最后同步时间
            await prisma.databaseMeta.update({
              where: { id: database.id },
              data: { lastSyncedAt: new Date() },
            });
          } catch (dbError) {
            console.error(
              `[SyncScheduler] 数据库 ${database.databaseName} 同步失败:`,
              dbError
            );
            // 继续处理下一个数据库
          }
        }

        // 更新数据源最后同步时间
        await prisma.dataSource.update({
          where: { id: source.id },
          data: { lastSyncAt: new Date() },
        });

        // 记录成功
        if (logId) {
          await syncLogger.logSyncComplete(logId, {
            tablesAdded: totalTablesAdded,
            tablesUpdated: totalTablesUpdated,
            tablesDeleted: totalTablesDeleted,
            columnsAdded: totalColumnsAdded,
            columnsUpdated: totalColumnsUpdated,
            columnsDeleted: totalColumnsDeleted,
          });
        }

        task.lastStatus = 'success';
        console.log(`[SyncScheduler] 数据源 ${source.name} 同步成功`);
      } finally {
        await connection.end();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SyncScheduler] 同步失败: 数据源 ${sourceId}`, error);

      if (logId) {
        await syncLogger.logSyncFailure(
          logId,
          error instanceof Error ? error : new Error(errorMessage)
        );
      }

      task.lastStatus = 'failure';
      task.lastError = errorMessage;
    } finally {
      task.isRunning = false;
      this.runningCount--;
    }
  }

  /**
   * 解密密码
   */
  private decryptPassword(encryptedPassword: string): string {
    // 使用加密工具解密密码
    // 如果密码未加密（旧数据），会自动返回原值
    const { decryptPassword } = require('@/lib/security/encryption');
    return decryptPassword(encryptedPassword);
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(sourceId: number): {
    exists: boolean;
    enabled: boolean;
    isRunning: boolean;
    schedule?: string;
    lastRunAt?: Date;
    lastStatus?: 'success' | 'failure';
    lastError?: string;
  } {
    const task = this.tasks.get(sourceId);

    if (!task) {
      return { exists: false, enabled: false, isRunning: false };
    }

    return {
      exists: true,
      enabled: task.config.enabled,
      isRunning: task.isRunning,
      schedule: task.config.schedule,
      lastRunAt: task.lastRunAt,
      lastStatus: task.lastStatus,
      lastError: task.lastError,
    };
  }

  /**
   * 获取所有任务状态
   */
  getAllTaskStatus(): Array<{
    sourceId: number;
    enabled: boolean;
    isRunning: boolean;
    schedule: string;
    lastRunAt?: Date;
    lastStatus?: 'success' | 'failure';
    lastError?: string;
  }> {
    return Array.from(this.tasks.entries()).map(([sourceId, task]) => ({
      sourceId,
      enabled: task.config.enabled,
      isRunning: task.isRunning,
      schedule: task.config.schedule,
      lastRunAt: task.lastRunAt,
      lastStatus: task.lastStatus,
      lastError: task.lastError,
    }));
  }

  /**
   * 更新任务配置
   */
  async updateTaskConfig(
    sourceId: number,
    updates: Partial<SyncScheduleConfig>
  ): Promise<void> {
    const task = this.tasks.get(sourceId);
    if (!task) {
      throw new Error(`任务不存在: 数据源 ${sourceId}`);
    }

    const newConfig = {
      ...task.config,
      ...updates,
      sourceId,  // 确保 sourceId 不被修改
    };

    // 如果 schedule 发生变化，需要重新调度
    if (updates.schedule && updates.schedule !== task.config.schedule) {
      await this.scheduleTask(newConfig);
    } else {
      task.config = newConfig;
    }

    console.log(`[SyncScheduler] 任务配置已更新: 数据源 ${sourceId}`);
  }

  /**
   * 获取调度器健康状态
   */
  getHealthStatus(): {
    isInitialized: boolean;
    totalTasks: number;
    enabledTasks: number;
    runningTasks: number;
    maxConcurrent: number;
  } {
    const enabledTasks = Array.from(this.tasks.values()).filter(
      (task) => task.config.enabled
    ).length;

    return {
      isInitialized: this.isInitialized,
      totalTasks: this.tasks.size,
      enabledTasks,
      runningTasks: this.runningCount,
      maxConcurrent: this.options.maxConcurrent,
    };
  }

  /**
   * 关闭调度器
   */
  async shutdown(): Promise<void> {
    console.log('[SyncScheduler] 正在关闭调度器...');

    this.stopAll();

    // 等待所有运行中的任务完成
    while (this.runningCount > 0) {
      console.log(`[SyncScheduler] 等待 ${this.runningCount} 个任务完成...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.tasks.clear();
    this.isInitialized = false;

    console.log('[SyncScheduler] 调度器已关闭');
  }
}

// 导出单例
export const syncScheduler = new SyncScheduler();
