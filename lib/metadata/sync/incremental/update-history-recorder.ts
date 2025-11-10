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
      // TODO: 如果有专门的更新历史表，可以在这里创建记录
      // 目前使用控制台日志记录
      this.logToConsole(record);

      // 示例：如果有 UpdateHistory 表
      // await client.updateHistory.create({
      //   data: {
      //     databaseId: record.databaseId,
      //     databaseName: record.databaseName,
      //     startedAt: record.startedAt,
      //     completedAt: record.completedAt,
      //     duration: record.duration,
      //     tablesAdded: record.tablesAdded,
      //     tablesDeleted: record.tablesDeleted,
      //     tablesUpdated: record.tablesUpdated,
      //     columnsAdded: record.columnsAdded,
      //     columnsDeleted: record.columnsDeleted,
      //     columnsUpdated: record.columnsUpdated,
      //     totalChanges: record.totalChanges,
      //     errors: JSON.stringify(record.errors),
      //   },
      // });
    } catch (error) {
      console.error('记录更新历史失败:', error);
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
   * 获取数据库的更新历史（示例方法）
   */
  async getHistoryByDatabase(
    databaseId: number,
    limit: number = 10
  ): Promise<UpdateHistoryRecord[]> {
    // TODO: 从数据库查询历史记录
    // const client = getPrismaClient();
    // const records = await client.updateHistory.findMany({
    //   where: { databaseId },
    //   orderBy: { completedAt: 'desc' },
    //   take: limit,
    // });
    // return records.map(this.mapToRecord);

    return [];
  }

  /**
   * 获取最近的更新历史（示例方法）
   */
  async getRecentHistory(limit: number = 20): Promise<UpdateHistoryRecord[]> {
    // TODO: 从数据库查询最近的历史记录
    // const client = getPrismaClient();
    // const records = await client.updateHistory.findMany({
    //   orderBy: { completedAt: 'desc' },
    //   take: limit,
    // });
    // return records.map(this.mapToRecord);

    return [];
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
