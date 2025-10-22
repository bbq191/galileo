/**
 * 错误日志与监控系统
 *
 * 功能：
 * - 错误日志记录
 * - 错误分类与统计
 * - 错误告警
 * - 性能监控
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
 * 错误级别
 */
export enum ErrorLevel {
  INFO = 'info',        // 信息
  WARNING = 'warning',  // 警告
  ERROR = 'error',      // 错误
  CRITICAL = 'critical', // 严重错误
}

/**
 * 错误分类
 */
export enum ErrorCategory {
  NETWORK = 'network',           // 网络错误
  API = 'api',                   // API 错误
  DATABASE = 'database',         // 数据库错误
  VALIDATION = 'validation',     // 验证错误
  TIMEOUT = 'timeout',           // 超时错误
  RATE_LIMIT = 'rate_limit',     // 速率限制
  UNKNOWN = 'unknown',           // 未知错误
}

/**
 * 错误日志条目
 */
export interface ErrorLog {
  id: string;
  level: ErrorLevel;
  category: ErrorCategory;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  taskId?: string;
  taskType?: TaskType;
  createdAt: Date;
}

/**
 * 性能指标
 */
export interface PerformanceMetric {
  /** 操作名称 */
  operation: string;

  /** 耗时（毫秒） */
  duration: number;

  /** 成功/失败 */
  success: boolean;

  /** 时间戳 */
  timestamp: Date;

  /** 额外数据 */
  metadata?: Record<string, any>;
}

/**
 * 错误日志管理器
 */
export class ErrorLogger {
  /**
   * 记录错误
   */
  async log(
    level: ErrorLevel,
    category: ErrorCategory,
    message: string,
    options?: {
      error?: Error;
      context?: Record<string, any>;
      taskId?: string;
      taskType?: TaskType;
    }
  ): Promise<void> {
    const errorLog: ErrorLog = {
      id: this.generateId(),
      level,
      category,
      message,
      stack: options?.error?.stack,
      context: options?.context,
      taskId: options?.taskId,
      taskType: options?.taskType,
      createdAt: new Date(),
    };

    // 保存到数据库
    await this.saveErrorLog(errorLog);

    // 控制台输出
    this.consoleLog(errorLog);

    // 严重错误触发告警
    if (level === ErrorLevel.CRITICAL) {
      await this.triggerAlert(errorLog);
    }
  }

  /**
   * 记录信息
   */
  async info(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(ErrorLevel.INFO, ErrorCategory.UNKNOWN, message, { context });
  }

  /**
   * 记录警告
   */
  async warning(
    message: string,
    category: ErrorCategory,
    context?: Record<string, any>
  ): Promise<void> {
    await this.log(ErrorLevel.WARNING, category, message, { context });
  }

  /**
   * 记录错误
   */
  async error(
    message: string,
    category: ErrorCategory,
    error?: Error,
    context?: Record<string, any>
  ): Promise<void> {
    await this.log(ErrorLevel.ERROR, category, message, { error, context });
  }

  /**
   * 记录严重错误
   */
  async critical(
    message: string,
    category: ErrorCategory,
    error?: Error,
    context?: Record<string, any>
  ): Promise<void> {
    await this.log(ErrorLevel.CRITICAL, category, message, { error, context });
  }

  /**
   * 记录任务错误
   */
  async logTaskError(
    taskId: string,
    taskType: TaskType,
    error: Error,
    category: ErrorCategory = ErrorCategory.UNKNOWN
  ): Promise<void> {
    await this.log(ErrorLevel.ERROR, category, `任务执行失败: ${error.message}`, {
      error,
      taskId,
      taskType,
      context: { taskId, taskType },
    });
  }

  /**
   * 记录性能指标
   */
  async recordPerformance(metric: PerformanceMetric): Promise<void> {
    const client = getPrismaClient();

    try {
      await client.$executeRawUnsafe(`
        INSERT INTO performance_metrics (
          id, operation, duration, success, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        this.generateId(),
        metric.operation,
        metric.duration,
        metric.success,
        metric.metadata ? JSON.stringify(metric.metadata) : null,
        metric.timestamp
      );
    } catch (error) {
      console.error('记录性能指标失败:', error);
    }
  }

  /**
   * 获取错误统计
   */
  async getErrorStatistics(hours: number = 24): Promise<{
    total: number;
    byLevel: Record<ErrorLevel, number>;
    byCategory: Record<ErrorCategory, number>;
    recentErrors: ErrorLog[];
  }> {
    const client = getPrismaClient();

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);

    // 总数统计
    const totalResult = await client.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) as total FROM error_logs
      WHERE created_at >= ?
    `, cutoffDate);

    const total = Number(totalResult[0].total);

    // 按级别统计
    const levelStats = await client.$queryRawUnsafe<any[]>(`
      SELECT level, COUNT(*) as count
      FROM error_logs
      WHERE created_at >= ?
      GROUP BY level
    `, cutoffDate);

    const byLevel: Record<ErrorLevel, number> = {
      [ErrorLevel.INFO]: 0,
      [ErrorLevel.WARNING]: 0,
      [ErrorLevel.ERROR]: 0,
      [ErrorLevel.CRITICAL]: 0,
    };

    levelStats.forEach((stat) => {
      byLevel[stat.level as ErrorLevel] = Number(stat.count);
    });

    // 按分类统计
    const categoryStats = await client.$queryRawUnsafe<any[]>(`
      SELECT category, COUNT(*) as count
      FROM error_logs
      WHERE created_at >= ?
      GROUP BY category
    `, cutoffDate);

    const byCategory: Record<ErrorCategory, number> = {
      [ErrorCategory.NETWORK]: 0,
      [ErrorCategory.API]: 0,
      [ErrorCategory.DATABASE]: 0,
      [ErrorCategory.VALIDATION]: 0,
      [ErrorCategory.TIMEOUT]: 0,
      [ErrorCategory.RATE_LIMIT]: 0,
      [ErrorCategory.UNKNOWN]: 0,
    };

    categoryStats.forEach((stat) => {
      byCategory[stat.category as ErrorCategory] = Number(stat.count);
    });

    // 最近错误
    const recentErrorsRecords = await client.$queryRawUnsafe<any[]>(`
      SELECT * FROM error_logs
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT 20
    `, cutoffDate);

    const recentErrors = recentErrorsRecords.map((record) =>
      this.deserializeErrorLog(record)
    );

    return {
      total,
      byLevel,
      byCategory,
      recentErrors,
    };
  }

  /**
   * 获取性能统计
   */
  async getPerformanceStatistics(hours: number = 24): Promise<{
    operations: Array<{
      name: string;
      count: number;
      avgDuration: number;
      minDuration: number;
      maxDuration: number;
      successRate: number;
    }>;
  }> {
    const client = getPrismaClient();

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);

    const stats = await client.$queryRawUnsafe<any[]>(`
      SELECT
        operation as name,
        COUNT(*) as count,
        AVG(duration) as avgDuration,
        MIN(duration) as minDuration,
        MAX(duration) as maxDuration,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*) * 100 as successRate
      FROM performance_metrics
      WHERE created_at >= ?
      GROUP BY operation
      ORDER BY count DESC
    `, cutoffDate);

    return {
      operations: stats.map((stat) => ({
        name: stat.name,
        count: Number(stat.count),
        avgDuration: Number(stat.avgDuration),
        minDuration: Number(stat.minDuration),
        maxDuration: Number(stat.maxDuration),
        successRate: Number(stat.successRate),
      })),
    };
  }

  /**
   * 清理旧日志
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<{
    errorLogs: number;
    performanceMetrics: number;
  }> {
    const client = getPrismaClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const errorLogsDeleted = await client.$executeRawUnsafe(`
      DELETE FROM error_logs WHERE created_at < ?
    `, cutoffDate);

    const metricsDeleted = await client.$executeRawUnsafe(`
      DELETE FROM performance_metrics WHERE created_at < ?
    `, cutoffDate);

    console.log(`清理日志完成: 错误日志 ${errorLogsDeleted} 条，性能指标 ${metricsDeleted} 条`);

    return {
      errorLogs: errorLogsDeleted as number,
      performanceMetrics: metricsDeleted as number,
    };
  }

  /**
   * 保存错误日志
   */
  private async saveErrorLog(log: ErrorLog): Promise<void> {
    const client = getPrismaClient();

    try {
      await client.$executeRawUnsafe(`
        INSERT INTO error_logs (
          id, level, category, message, stack, context,
          task_id, task_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        log.id,
        log.level,
        log.category,
        log.message,
        log.stack || null,
        log.context ? JSON.stringify(log.context) : null,
        log.taskId || null,
        log.taskType || null,
        log.createdAt
      );
    } catch (error) {
      console.error('保存错误日志失败:', error);
    }
  }

  /**
   * 控制台输出
   */
  private consoleLog(log: ErrorLog): void {
    const timestamp = log.createdAt.toISOString();
    const prefix = `[${timestamp}] [${log.level.toUpperCase()}] [${log.category}]`;

    switch (log.level) {
      case ErrorLevel.INFO:
        console.log(`${prefix} ${log.message}`);
        break;
      case ErrorLevel.WARNING:
        console.warn(`${prefix} ${log.message}`);
        break;
      case ErrorLevel.ERROR:
        console.error(`${prefix} ${log.message}`);
        if (log.stack) {
          console.error(log.stack);
        }
        break;
      case ErrorLevel.CRITICAL:
        console.error(`🚨 ${prefix} ${log.message}`);
        if (log.stack) {
          console.error(log.stack);
        }
        break;
    }

    if (log.context) {
      console.log('Context:', log.context);
    }
  }

  /**
   * 触发告警（严重错误）
   */
  private async triggerAlert(log: ErrorLog): Promise<void> {
    // TODO: 实现告警逻辑
    // - 发送邮件
    // - 发送钉钉/企业微信通知
    // - 写入告警系统
    console.error('🚨🚨🚨 严重错误告警 🚨🚨🚨');
    console.error(`消息: ${log.message}`);
    console.error(`分类: ${log.category}`);
    console.error(`时间: ${log.createdAt.toISOString()}`);
  }

  /**
   * 生成 ID
   */
  private generateId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * 反序列化错误日志
   */
  private deserializeErrorLog(record: any): ErrorLog {
    return {
      id: record.id,
      level: record.level as ErrorLevel,
      category: record.category as ErrorCategory,
      message: record.message,
      stack: record.stack,
      context: record.context ? JSON.parse(record.context) : undefined,
      taskId: record.task_id,
      taskType: record.task_type as TaskType,
      createdAt: new Date(record.created_at),
    };
  }
}

/**
 * 性能监控装饰器
 */
export function measurePerformance(operation: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let success = true;
      let error: Error | undefined;

      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (err) {
        success = false;
        error = err as Error;
        throw err;
      } finally {
        const duration = Date.now() - startTime;

        await errorLogger.recordPerformance({
          operation,
          duration,
          success,
          timestamp: new Date(),
          metadata: {
            method: propertyKey,
            error: error?.message,
          },
        });
      }
    };

    return descriptor;
  };
}

/**
 * 导出默认实例
 */
export const errorLogger = new ErrorLogger();
