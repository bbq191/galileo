/**
 * AuditOrchestrator - 审计编排器
 *
 * 职责：
 * - 统一管理审计日志记录
 * - 提供查询历史和统计分析
 * - 支持异常检测和告警
 * - 管理审计日志生命周期
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../tokens';
import type { DatabaseService } from '../services/database.service';
import type { AuditLog, AuditLogFilters, AuditStats, PaginatedAuditLogs } from '@/lib/audit/types';
import type { QueryIntent } from '@/lib/nlp/intent-recognizer';
import { PrismaClient } from '@/app/generated/prisma';

/**
 * 查询审计日志条目
 */
export interface QueryAuditEntry {
  /** 用户 ID */
  userId?: string;

  /** 用户名 */
  userName?: string;

  /** 会话 ID */
  sessionId: string;

  /** 自然语言查询 */
  naturalLanguageQuery: string;

  /** 查询意图 */
  intent: QueryIntent;

  /** 生成的 SQL */
  generatedSQL: string;

  /** 执行结果 */
  executionResult: {
    success: boolean;
    rowCount?: number;
    error?: string;
  };

  /** 元数据 */
  metadata: {
    usedDatabases: string[];
    usedTables: string[];
    usedColumns: string[];
  };

  /** 性能指标 */
  performance: {
    intentRecognitionTime: number;
    sqlGenerationTime: number;
    validationTime: number;
    executionTime: number;
    totalTime: number;
  };

  /** 时间戳 */
  timestamp: Date;

  /** IP 地址 */
  ipAddress?: string;

  /** User Agent */
  userAgent?: string;
}

/**
 * 错误审计日志条目
 */
export interface ErrorAuditEntry {
  /** 会话 ID */
  sessionId: string;

  /** 错误类型 */
  errorType: string;

  /** 错误消息 */
  errorMessage: string;

  /** 错误堆栈 */
  errorStack?: string;

  /** 上下文信息 */
  context: Record<string, any>;

  /** 时间戳 */
  timestamp: Date;
}

/**
 * 异常模式
 */
export interface AnomalyPattern {
  /** 模式类型 */
  type: 'high_failure_rate' | 'slow_query' | 'unusual_activity';

  /** 描述 */
  description: string;

  /** 严重程度 */
  severity: 'low' | 'medium' | 'high';

  /** 检测时间 */
  detectedAt: Date;

  /** 相关数据 */
  data: Record<string, any>;
}

/**
 * AuditOrchestrator
 *
 * 审计编排器，统一管理审计日志和分析
 */
@injectable()
export class AuditOrchestrator {
  private prisma: PrismaClient;

  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService
  ) {
    // 从 DatabaseService 获取 PrismaClient
    this.prisma = (this.dbService as any).prisma;
  }

  /**
   * 记录查询审计日志
   *
   * @param entry - 查询审计条目
   */
  async logQuery(entry: QueryAuditEntry): Promise<void> {
    try {
      console.log(`[AuditOrchestrator] Logging query: "${entry.naturalLanguageQuery.substring(0, 50)}..."`);

      await this.prisma.queryAuditLog.create({
        data: {
          userId: entry.userId,
          userName: entry.userName,
          sessionId: entry.sessionId,
          naturalLanguageQuery: entry.naturalLanguageQuery,
          intent: JSON.stringify(entry.intent),
          generatedSql: entry.generatedSQL,
          executionSuccess: entry.executionResult.success,
          executionError: entry.executionResult.error,
          rowCount: entry.executionResult.rowCount,
          usedDatabases: JSON.stringify(entry.metadata.usedDatabases),
          usedTables: JSON.stringify(entry.metadata.usedTables),
          intentRecognitionTime: entry.performance.intentRecognitionTime,
          sqlGenerationTime: entry.performance.sqlGenerationTime,
          validationTime: entry.performance.validationTime,
          executionTime: entry.performance.executionTime,
          totalTime: entry.performance.totalTime,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          timestamp: entry.timestamp,
        },
      });

      console.log(`[AuditOrchestrator] Query logged successfully`);

    } catch (error) {
      // 审计日志失败不应阻塞主流程
      console.error(`[AuditOrchestrator] Failed to log query:`, error);
    }
  }

  /**
   * 记录错误日志
   *
   * @param entry - 错误审计条目
   */
  async logError(entry: ErrorAuditEntry): Promise<void> {
    try {
      console.log(`[AuditOrchestrator] Logging error: ${entry.errorType}`);

      // 注意：需要在 Prisma schema 中添加 ErrorLog 模型
      // 这里使用通用方式记录到查询日志中
      await this.prisma.queryAuditLog.create({
        data: {
          sessionId: entry.sessionId,
          naturalLanguageQuery: `[ERROR] ${entry.errorType}`,
          intent: JSON.stringify({ type: 'error', message: entry.errorMessage }),
          generatedSql: '',
          executionSuccess: false,
          executionError: entry.errorMessage,
          rowCount: 0,
          usedDatabases: JSON.stringify([]),
          usedTables: JSON.stringify([]),
          intentRecognitionTime: 0,
          sqlGenerationTime: 0,
          validationTime: 0,
          executionTime: 0,
          totalTime: 0,
          timestamp: entry.timestamp,
        },
      });

      console.log(`[AuditOrchestrator] Error logged successfully`);

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to log error:`, error);
    }
  }

  /**
   * 获取查询历史（带分页）
   *
   * @param filters - 过滤条件
   * @returns 分页的审计日志
   */
  async getQueryHistory(filters: AuditLogFilters): Promise<PaginatedAuditLogs> {
    try {
      const where: any = {};

      if (filters.userId) {
        where.userId = filters.userId;
      }

      if (filters.success !== undefined) {
        where.executionSuccess = filters.success;
      }

      if (filters.startDate || filters.endDate) {
        where.timestamp = {};
        if (filters.startDate) {
          where.timestamp.gte = filters.startDate;
        }
        if (filters.endDate) {
          where.timestamp.lte = filters.endDate;
        }
      }

      const page = filters.page || 1;
      const limit = filters.limit || 50;

      const [logs, totalCount] = await Promise.all([
        this.prisma.queryAuditLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.queryAuditLog.count({ where }),
      ]);

      return {
        data: logs.map((log) => this.mapToAuditLog(log)),
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      };

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to get query history:`, error);
      throw error;
    }
  }

  /**
   * 获取统计信息
   *
   * @param options - 时间范围选项
   * @returns 审计统计
   */
  async getStatistics(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<AuditStats> {
    try {
      const where: any = {};

      if (options.startDate || options.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          where.timestamp.gte = options.startDate;
        }
        if (options.endDate) {
          where.timestamp.lte = options.endDate;
        }
      }

      const [totalQueries, successQueries, avgExecutionTime] = await Promise.all([
        this.prisma.queryAuditLog.count({ where }),
        this.prisma.queryAuditLog.count({
          where: { ...where, executionSuccess: true },
        }),
        this.prisma.queryAuditLog.aggregate({
          where,
          _avg: { executionTime: true },
        }),
      ]);

      return {
        totalQueries,
        successQueries,
        failedQueries: totalQueries - successQueries,
        successRate: totalQueries > 0 ? successQueries / totalQueries : 0,
        avgExecutionTime: avgExecutionTime._avg.executionTime || 0,
      };

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to get statistics:`, error);
      throw error;
    }
  }

  /**
   * 获取日均审计记录数
   *
   * @returns 日均记录数
   */
  async getAvgRecordsPerDay(): Promise<number> {
    try {
      const [totalCount, oldestRecord] = await Promise.all([
        this.prisma.queryAuditLog.count(),
        this.prisma.queryAuditLog.findFirst({
          orderBy: { timestamp: 'asc' },
          select: { timestamp: true },
        }),
      ]);

      if (!oldestRecord || totalCount === 0) {
        return 0;
      }

      const daysSinceFirst = Math.max(
        1,
        Math.ceil((Date.now() - oldestRecord.timestamp.getTime()) / (1000 * 60 * 60 * 24))
      );

      return Math.round(totalCount / daysSinceFirst);
    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to get avg records per day:`, error);
      return 0;
    }
  }

  /**
   * 检测异常模式
   *
   * 分析审计日志，检测异常行为：
   * - 高失败率
   * - 慢查询激增
   * - 异常活动模式
   *
   * @param timeWindowMinutes - 时间窗口（分钟）
   * @returns 检测到的异常模式
   */
  async detectAnomalies(timeWindowMinutes: number = 60): Promise<AnomalyPattern[]> {
    try {
      const anomalies: AnomalyPattern[] = [];
      const startDate = new Date(Date.now() - timeWindowMinutes * 60 * 1000);

      // 1. 检测高失败率
      const stats = await this.getStatistics({ startDate });
      if (stats.totalQueries > 10 && stats.successRate < 0.7) {
        anomalies.push({
          type: 'high_failure_rate',
          description: `查询失败率过高: ${((1 - stats.successRate) * 100).toFixed(1)}%`,
          severity: stats.successRate < 0.5 ? 'high' : 'medium',
          detectedAt: new Date(),
          data: {
            successRate: stats.successRate,
            totalQueries: stats.totalQueries,
            failedQueries: stats.failedQueries,
          },
        });
      }

      // 2. 检测慢查询
      const slowQueryThreshold = 5000; // 5秒
      const slowQueries = await this.prisma.queryAuditLog.count({
        where: {
          timestamp: { gte: startDate },
          executionTime: { gte: slowQueryThreshold },
        },
      });

      if (slowQueries > stats.totalQueries * 0.2) {
        anomalies.push({
          type: 'slow_query',
          description: `慢查询数量异常: ${slowQueries} 个查询超过 ${slowQueryThreshold}ms`,
          severity: slowQueries > stats.totalQueries * 0.5 ? 'high' : 'medium',
          detectedAt: new Date(),
          data: {
            slowQueryCount: slowQueries,
            threshold: slowQueryThreshold,
            percentage: (slowQueries / stats.totalQueries) * 100,
          },
        });
      }

      // 3. 检测异常活动（短时间内大量查询）
      if (stats.totalQueries > 1000) {
        anomalies.push({
          type: 'unusual_activity',
          description: `检测到异常高频活动: ${timeWindowMinutes}分钟内 ${stats.totalQueries} 次查询`,
          severity: stats.totalQueries > 5000 ? 'high' : 'low',
          detectedAt: new Date(),
          data: {
            queryCount: stats.totalQueries,
            timeWindowMinutes,
            avgQueriesPerMinute: stats.totalQueries / timeWindowMinutes,
          },
        });
      }

      console.log(`[AuditOrchestrator] Detected ${anomalies.length} anomalies`);

      return anomalies;

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to detect anomalies:`, error);
      return [];
    }
  }

  /**
   * 获取慢查询列表
   *
   * @param thresholdMs - 慢查询阈值（毫秒）
   * @param options - 分页选项
   * @returns 慢查询日志
   */
  async getSlowQueries(
    thresholdMs: number = 1000,
    options: {
      limit?: number;
      page?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AuditLog[]> {
    try {
      const where: any = {
        executionTime: { gte: thresholdMs },
      };

      if (options.startDate || options.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          where.timestamp.gte = options.startDate;
        }
        if (options.endDate) {
          where.timestamp.lte = options.endDate;
        }
      }

      const logs = await this.prisma.queryAuditLog.findMany({
        where,
        orderBy: { executionTime: 'desc' },
        skip: ((options.page || 1) - 1) * (options.limit || 50),
        take: options.limit || 50,
      });

      return logs.map((log) => this.mapToAuditLog(log));

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to get slow queries:`, error);
      throw error;
    }
  }

  /**
   * 获取失败查询列表
   *
   * @param options - 分页选项
   * @returns 失败查询日志
   */
  async getFailedQueries(options: {
    limit?: number;
    page?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<AuditLog[]> {
    try {
      const where: any = {
        executionSuccess: false,
      };

      if (options.startDate || options.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          where.timestamp.gte = options.startDate;
        }
        if (options.endDate) {
          where.timestamp.lte = options.endDate;
        }
      }

      const logs = await this.prisma.queryAuditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: ((options.page || 1) - 1) * (options.limit || 50),
        take: options.limit || 50,
      });

      return logs.map((log) => this.mapToAuditLog(log));

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to get failed queries:`, error);
      throw error;
    }
  }

  /**
   * 清理过期审计日志
   *
   * @param daysToKeep - 保留天数
   * @returns 清理的日志数量
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.prisma.queryAuditLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      console.log(`[AuditOrchestrator] Cleaned up ${result.count} old audit logs`);
      return result.count;

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to cleanup old logs:`, error);
      throw error;
    }
  }

  /**
   * 获取热门查询
   *
   * @param options - 选项
   * @returns 热门查询列表
   */
  async getHotQueries(options: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<Array<{ query: string; count: number; avgDuration: number }>> {
    try {
      const where: any = {
        executionSuccess: true, // 只统计成功的查询
      };

      if (options.startDate || options.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          where.timestamp.gte = options.startDate;
        }
        if (options.endDate) {
          where.timestamp.lte = options.endDate;
        }
      }

      // 获取所有符合条件的查询
      const logs = await this.prisma.queryAuditLog.findMany({
        where,
        select: {
          naturalLanguageQuery: true,
          executionTime: true,
        },
      });

      // 按查询内容分组统计
      const queryMap = new Map<string, { count: number; totalDuration: number }>();

      logs.forEach((log) => {
        const query = log.naturalLanguageQuery;
        const existing = queryMap.get(query);

        if (existing) {
          existing.count++;
          existing.totalDuration += log.executionTime;
        } else {
          queryMap.set(query, {
            count: 1,
            totalDuration: log.executionTime,
          });
        }
      });

      // 转换为结果数组并排序
      const results = Array.from(queryMap.entries())
        .map(([query, stats]) => ({
          query,
          count: stats.count,
          avgDuration: Math.round(stats.totalDuration / stats.count),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, options.limit || 10);

      console.log(`[AuditOrchestrator] Found ${results.length} hot queries`);
      return results;

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to get hot queries:`, error);
      return [];
    }
  }

  /**
   * 获取热门表
   *
   * @param options - 选项
   * @returns 热门表列表
   */
  async getHotTables(options: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<Array<{ database: string; table: string; accessCount: number }>> {
    try {
      const where: any = {};

      if (options.startDate || options.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          where.timestamp.gte = options.startDate;
        }
        if (options.endDate) {
          where.timestamp.lte = options.endDate;
        }
      }

      // 获取所有符合条件的查询
      const logs = await this.prisma.queryAuditLog.findMany({
        where,
        select: {
          usedTables: true,
          usedDatabases: true,
        },
      });

      // 统计表访问次数
      const tableMap = new Map<string, { database: string; table: string; count: number }>();

      logs.forEach((log) => {
        try {
          const tables = JSON.parse(log.usedTables) as string[];
          const databases = JSON.parse(log.usedDatabases) as string[];

          tables.forEach((table) => {
            // 从完整表名中提取数据库和表名
            // 格式可能是 "database.table" 或 "table"
            let database = databases[0] || 'unknown';
            let tableName = table;

            if (table.includes('.')) {
              const parts = table.split('.');
              database = parts[0];
              tableName = parts[1];
            }

            const key = `${database}.${tableName}`;
            const existing = tableMap.get(key);

            if (existing) {
              existing.count++;
            } else {
              tableMap.set(key, {
                database,
                table: tableName,
                count: 1,
              });
            }
          });
        } catch (e) {
          // 忽略 JSON 解析错误
        }
      });

      // 转换为结果数组并排序
      const results = Array.from(tableMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, options.limit || 10)
        .map((item) => ({
          database: item.database,
          table: item.table,
          accessCount: item.count,
        }));

      console.log(`[AuditOrchestrator] Found ${results.length} hot tables`);
      return results;

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to get hot tables:`, error);
      return [];
    }
  }

  /**
   * 获取用户查询模式分析
   *
   * @param userId - 用户 ID
   * @param days - 分析天数
   * @returns 用户查询模式
   */
  async getUserQueryPatterns(userId: string, days: number = 30) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const logs = await this.prisma.queryAuditLog.findMany({
        where: {
          userId,
          timestamp: { gte: startDate },
        },
        orderBy: { timestamp: 'desc' },
      });

      // 分析常用表
      const tableUsage = new Map<string, number>();
      logs.forEach((log) => {
        try {
          const tables = JSON.parse(log.usedTables) as string[];
          tables.forEach((table) => {
            tableUsage.set(table, (tableUsage.get(table) || 0) + 1);
          });
        } catch (e) {
          // 忽略解析错误
        }
      });

      // 分析查询时间分布
      const hourDistribution = new Array(24).fill(0);
      logs.forEach((log) => {
        const hour = log.timestamp.getHours();
        hourDistribution[hour]++;
      });

      return {
        totalQueries: logs.length,
        mostUsedTables: Array.from(tableUsage.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([table, count]) => ({ table, count })),
        hourDistribution,
        peakHours: hourDistribution
          .map((count, hour) => ({ hour, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
      };

    } catch (error) {
      console.error(`[AuditOrchestrator] Failed to get user query patterns:`, error);
      throw error;
    }
  }

  /**
   * 映射数据库记录到 AuditLog
   */
  private mapToAuditLog(log: any): AuditLog {
    return {
      id: Number(log.id),
      userId: log.userId || undefined,
      userName: log.userName || undefined,
      sessionId: log.sessionId,
      naturalLanguageQuery: log.naturalLanguageQuery,
      intent: JSON.parse(log.intent),
      generatedSQL: log.generatedSql,
      executionResult: {
        success: log.executionSuccess,
        rowCount: log.rowCount || undefined,
        error: log.executionError || undefined,
      },
      metadata: {
        usedDatabases: JSON.parse(log.usedDatabases),
        usedTables: JSON.parse(log.usedTables),
        usedColumns: [],
      },
      performance: {
        intentRecognitionTime: log.intentRecognitionTime,
        sqlGenerationTime: log.sqlGenerationTime,
        validationTime: log.validationTime,
        executionTime: log.executionTime,
        totalTime: log.totalTime,
      },
      timestamp: log.timestamp,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
    };
  }
}
