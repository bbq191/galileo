/**
 * 更新历史记录器
 *
 * 功能：
 * - 记录元数据增量更新的历史
 * - 提供更新历史的查询接口
 * - 便于审计和问题排查
 *
 * 职责：
 * - 记录更新摘要信息
 * - 格式化输出日志
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';

function getPrismaClient() {
  return prisma;
}

/**
 * 更新历史记录
 */
export interface UpdateHistoryRecord {
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
 * 更新历史记录器
 */
export class UpdateHistoryRecorder {
  /**
   * 记录更新历史
   */
  async recordHistory(record: UpdateHistoryRecord): Promise<void> {
    const client = getPrismaClient();

    try {
      // 输出到控制台（用于开发和调试）
      this.logToConsole(record);

      // 将更新历史记录到审计日志系统
      // 使用特殊的查询格式来标识这是元数据更新记录
      await client.queryAuditLog.create({
        data: {
          userId: 'system',
          userName: 'System',
          sessionId: `metadata-update-${record.databaseId}-${Date.now()}`,
          naturalLanguageQuery: `[METADATA_UPDATE] Database: ${record.databaseName}`,
          intent: JSON.stringify({
            type: 'METADATA_UPDATE',
            databaseId: record.databaseId,
            databaseName: record.databaseName,
            changes: {
              tablesAdded: record.tablesAdded,
              tablesDeleted: record.tablesDeleted,
              tablesUpdated: record.tablesUpdated,
              columnsAdded: record.columnsAdded,
              columnsDeleted: record.columnsDeleted,
              columnsUpdated: record.columnsUpdated,
              totalChanges: record.totalChanges,
            },
            errors: record.errors,
            startedAt: record.startedAt.toISOString(),
            completedAt: record.completedAt.toISOString(),
          }),
          generatedSql: '',
          executionSuccess: record.errors.length === 0,
          executionError: record.errors.length > 0
            ? `${record.errors.length} errors occurred during update`
            : null,
          rowCount: record.totalChanges,
          usedDatabases: JSON.stringify([record.databaseName]),
          usedTables: JSON.stringify([]),
          intentRecognitionTime: 0,
          sqlGenerationTime: 0,
          validationTime: 0,
          executionTime: record.duration,
          totalTime: record.duration,
          ipAddress: '',
          userAgent: 'System/MetadataSync',
          timestamp: record.completedAt,
        },
      });

      console.log(`[UpdateHistory] 已记录元数据更新历史: ${record.databaseName}`);
    } catch (error) {
      console.error('[UpdateHistory] 记录更新历史失败:', error);
    }
  }

  /**
   * 输出到控制台
   */
  private logToConsole(record: UpdateHistoryRecord): void {
    console.log(`增量更新历史已记录: ${record.databaseName}`);
    console.log(`  新增表: ${record.tablesAdded}`);
    console.log(`  删除表: ${record.tablesDeleted}`);
    console.log(`  更新表: ${record.tablesUpdated}`);
    console.log(`  新增字段: ${record.columnsAdded}`);
    console.log(`  删除字段: ${record.columnsDeleted}`);
    console.log(`  更新字段: ${record.columnsUpdated}`);

    if (record.errors.length > 0) {
      console.log(`  错误数: ${record.errors.length}`);
      record.errors.forEach(err => {
        console.log(`    - ${err.table}: ${err.error}`);
      });
    }
  }

  /**
   * 格式化更新摘要（用于返回给调用者）
   */
  formatSummary(record: UpdateHistoryRecord): string {
    const lines: string[] = [
      `数据库: ${record.databaseName}`,
      `开始时间: ${record.startedAt.toISOString()}`,
      `完成时间: ${record.completedAt.toISOString()}`,
      `耗时: ${record.duration}ms`,
      ``,
      `变更统计:`,
      `  表: +${record.tablesAdded} -${record.tablesDeleted} *${record.tablesUpdated}`,
      `  字段: +${record.columnsAdded} -${record.columnsDeleted} *${record.columnsUpdated}`,
      `  总计: ${record.totalChanges} 项变更`,
    ];

    if (record.errors.length > 0) {
      lines.push(``);
      lines.push(`错误列表:`);
      record.errors.forEach(err => {
        lines.push(`  - ${err.table}: ${err.error}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 获取数据库的更新历史
   */
  async getHistoryByDatabase(
    databaseId: number,
    limit: number = 10
  ): Promise<UpdateHistoryRecord[]> {
    try {
      const client = getPrismaClient();

      // 从审计日志中查询元数据更新记录
      const logs = await client.queryAuditLog.findMany({
        where: {
          naturalLanguageQuery: {
            startsWith: '[METADATA_UPDATE]',
          },
          intent: {
            contains: `"databaseId":${databaseId}`,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });

      // 转换为 UpdateHistoryRecord 格式
      return logs.map((log) => this.mapLogToRecord(log)).filter((r): r is UpdateHistoryRecord => r !== null);
    } catch (error) {
      console.error('[UpdateHistory] 查询数据库更新历史失败:', error);
      return [];
    }
  }

  /**
   * 获取最近的更新历史
   */
  async getRecentHistory(limit: number = 20): Promise<UpdateHistoryRecord[]> {
    try {
      const client = getPrismaClient();

      // 从审计日志中查询最近的元数据更新记录
      const logs = await client.queryAuditLog.findMany({
        where: {
          naturalLanguageQuery: {
            startsWith: '[METADATA_UPDATE]',
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });

      // 转换为 UpdateHistoryRecord 格式
      return logs.map((log) => this.mapLogToRecord(log)).filter((r): r is UpdateHistoryRecord => r !== null);
    } catch (error) {
      console.error('[UpdateHistory] 查询最近更新历史失败:', error);
      return [];
    }
  }

  /**
   * 将审计日志转换为 UpdateHistoryRecord
   */
  private mapLogToRecord(log: any): UpdateHistoryRecord | null {
    try {
      const intent = JSON.parse(log.intent as string);

      if (intent.type !== 'METADATA_UPDATE') {
        return null;
      }

      return {
        databaseId: intent.databaseId,
        databaseName: intent.databaseName,
        startedAt: new Date(intent.startedAt),
        completedAt: new Date(intent.completedAt || log.timestamp),
        duration: log.executionTime || 0,
        tablesAdded: intent.changes?.tablesAdded || 0,
        tablesDeleted: intent.changes?.tablesDeleted || 0,
        tablesUpdated: intent.changes?.tablesUpdated || 0,
        columnsAdded: intent.changes?.columnsAdded || 0,
        columnsDeleted: intent.changes?.columnsDeleted || 0,
        columnsUpdated: intent.changes?.columnsUpdated || 0,
        totalChanges: intent.changes?.totalChanges || 0,
        errors: intent.errors || [],
      };
    } catch (error) {
      console.error('[UpdateHistory] 转换日志记录失败:', error);
      return null;
    }
  }

  /**
   * 计算总变更数
   */
  calculateTotalChanges(record: Omit<UpdateHistoryRecord, 'totalChanges'>): number {
    return (
      record.tablesAdded +
      record.tablesDeleted +
      record.tablesUpdated +
      record.columnsAdded +
      record.columnsDeleted +
      record.columnsUpdated
    );
  }

  /**
   * 判断是否有错误
   */
  hasErrors(record: UpdateHistoryRecord): boolean {
    return record.errors.length > 0;
  }

  /**
   * 判断是否有变更
   */
  hasChanges(record: UpdateHistoryRecord): boolean {
    return record.totalChanges > 0;
  }
}
