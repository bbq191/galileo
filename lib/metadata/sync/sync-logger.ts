/**
 * 同步日志记录器
 *
 * 功能：
 * - 记录同步任务的执行状态
 * - 记录同步错误和异常
 * - 提供同步历史查询
 */

import { PrismaClient } from '@prisma/client';

// 懒加载 Prisma 客户端
let prisma: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * 同步日志条目
 */
export interface SyncLogEntry {
  id?: number;
  sourceId: number;
  sourceName: string;
  databaseId?: number;
  databaseName?: string;
  syncType: 'full' | 'incremental';
  status: 'started' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  tablesAdded?: number;
  tablesUpdated?: number;
  tablesDeleted?: number;
  columnsAdded?: number;
  columnsUpdated?: number;
  columnsDeleted?: number;
  errorMessage?: string;
  errorStack?: string;
  metadata?: any;
}

/**
 * 同步统计信息
 */
export interface SyncStatistics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  successRate: number;
  averageDuration: number;
  lastSyncAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
}

/**
 * 同步日志记录器类
 */
export class SyncLogger {
  private logs: Map<string, SyncLogEntry> = new Map();

  /**
   * 记录同步开始
   */
  async logSyncStart(
    sourceId: number,
    sourceName: string,
    databaseId?: number,
    databaseName?: string,
    syncType: 'full' | 'incremental' = 'incremental'
  ): Promise<string> {
    const logId = `${sourceId}-${databaseId || 'all'}-${Date.now()}`;

    const entry: SyncLogEntry = {
      sourceId,
      sourceName,
      databaseId,
      databaseName,
      syncType,
      status: 'started',
      startedAt: new Date(),
    };

    this.logs.set(logId, entry);

    console.log(
      `[SyncLogger] 同步开始: ${sourceName}${databaseName ? `/${databaseName}` : ''} (${syncType})`
    );

    return logId;
  }

  /**
   * 记录同步完成
   */
  async logSyncComplete(
    logId: string,
    result: {
      tablesAdded?: number;
      tablesUpdated?: number;
      tablesDeleted?: number;
      columnsAdded?: number;
      columnsUpdated?: number;
      columnsDeleted?: number;
      metadata?: any;
    }
  ): Promise<void> {
    const entry = this.logs.get(logId);
    if (!entry) {
      console.warn(`[SyncLogger] 日志条目未找到: ${logId}`);
      return;
    }

    entry.status = 'completed';
    entry.completedAt = new Date();
    entry.duration = entry.completedAt.getTime() - entry.startedAt.getTime();
    entry.tablesAdded = result.tablesAdded || 0;
    entry.tablesUpdated = result.tablesUpdated || 0;
    entry.tablesDeleted = result.tablesDeleted || 0;
    entry.columnsAdded = result.columnsAdded || 0;
    entry.columnsUpdated = result.columnsUpdated || 0;
    entry.columnsDeleted = result.columnsDeleted || 0;
    entry.metadata = result.metadata;

    console.log(
      `[SyncLogger] 同步完成: ${entry.sourceName}${entry.databaseName ? `/${entry.databaseName}` : ''} ` +
      `(耗时: ${entry.duration}ms, ` +
      `表: +${entry.tablesAdded} ~${entry.tablesUpdated} -${entry.tablesDeleted}, ` +
      `列: +${entry.columnsAdded} ~${entry.columnsUpdated} -${entry.columnsDeleted})`
    );

    // 持久化到数据库（可选，如果需要长期存储）
    await this.persistLog(entry);
  }

  /**
   * 记录同步失败
   */
  async logSyncFailure(
    logId: string,
    error: Error | string
  ): Promise<void> {
    const entry = this.logs.get(logId);
    if (!entry) {
      console.warn(`[SyncLogger] 日志条目未找到: ${logId}`);
      return;
    }

    entry.status = 'failed';
    entry.completedAt = new Date();
    entry.duration = entry.completedAt.getTime() - entry.startedAt.getTime();

    if (typeof error === 'string') {
      entry.errorMessage = error;
    } else {
      entry.errorMessage = error.message;
      entry.errorStack = error.stack;
    }

    console.error(
      `[SyncLogger] 同步失败: ${entry.sourceName}${entry.databaseName ? `/${entry.databaseName}` : ''} ` +
      `(耗时: ${entry.duration}ms) - ${entry.errorMessage}`
    );

    // 持久化到数据库
    await this.persistLog(entry);
  }

  /**
   * 获取同步日志
   */
  getSyncLog(logId: string): SyncLogEntry | undefined {
    return this.logs.get(logId);
  }

  /**
   * 获取最近的同步日志
   */
  getRecentLogs(limit: number = 10): SyncLogEntry[] {
    return Array.from(this.logs.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * 获取数据源的同步统计
   */
  async getSourceStatistics(sourceId: number): Promise<SyncStatistics> {
    const logs = Array.from(this.logs.values()).filter(
      (log) => log.sourceId === sourceId
    );

    const totalSyncs = logs.length;
    const successfulSyncs = logs.filter((log) => log.status === 'completed').length;
    const failedSyncs = logs.filter((log) => log.status === 'failed').length;
    const successRate = totalSyncs > 0 ? successfulSyncs / totalSyncs : 0;

    const completedLogs = logs.filter((log) => log.duration !== undefined);
    const averageDuration = completedLogs.length > 0
      ? completedLogs.reduce((sum, log) => sum + (log.duration || 0), 0) / completedLogs.length
      : 0;

    const sortedLogs = logs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const lastSyncAt = sortedLogs.length > 0 ? sortedLogs[0].startedAt : undefined;

    const successLogs = logs.filter((log) => log.status === 'completed')
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const lastSuccessAt = successLogs.length > 0 ? successLogs[0].startedAt : undefined;

    const failureLogs = logs.filter((log) => log.status === 'failed')
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const lastFailureAt = failureLogs.length > 0 ? failureLogs[0].startedAt : undefined;

    return {
      totalSyncs,
      successfulSyncs,
      failedSyncs,
      successRate,
      averageDuration,
      lastSyncAt,
      lastSuccessAt,
      lastFailureAt,
    };
  }

  /**
   * 清理旧日志（保留最近 N 条）
   */
  cleanupOldLogs(keepCount: number = 100): void {
    const logs = Array.from(this.logs.entries())
      .sort((a, b) => b[1].startedAt.getTime() - a[1].startedAt.getTime());

    if (logs.length > keepCount) {
      const toRemove = logs.slice(keepCount);
      toRemove.forEach(([logId]) => this.logs.delete(logId));

      console.log(`[SyncLogger] 清理了 ${toRemove.length} 条旧日志`);
    }
  }

  /**
   * 持久化日志到数据库（可选）
   *
   * 注意：这里假设有一个 sync_logs 表，实际项目中可以选择是否实现
   */
  private async persistLog(entry: SyncLogEntry): Promise<void> {
    try {
      // 这里可以选择将日志持久化到数据库
      // 由于文档中没有定义 sync_logs 表，这里仅作为示例

      // const prisma = getPrismaClient();
      // await prisma.$executeRaw`
      //   INSERT INTO sync_logs (
      //     source_id, source_name, database_id, database_name,
      //     sync_type, status, started_at, completed_at, duration,
      //     tables_added, tables_updated, tables_deleted,
      //     columns_added, columns_updated, columns_deleted,
      //     error_message, error_stack, metadata
      //   ) VALUES (...)
      // `;

      // 目前仅保存在内存中，定期清理
      this.cleanupOldLogs(100);
    } catch (error) {
      console.error('[SyncLogger] 持久化日志失败:', error);
    }
  }
}

// 导出单例
export const syncLogger = new SyncLogger();
