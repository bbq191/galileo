/**
 * 审计日志模块 - 审计日志记录器
 * Phase 2 - Week 9: 验证、优化与执行
 *
 * 功能：
 * - 记录所有查询操作
 * - 记录用户信息和时间戳
 * - 记录 SQL 生成过程
 * - 记录执行结果和错误
 * - 支持审计日志查询和分析
 */

import { PrismaClient } from '@/app/generated/prisma';
import prisma from '@/lib/prisma/client';
import type { AuditLog, AuditLogFilters, AuditStats, PaginatedAuditLogs } from './types';

export class AuditLogger {
  private prisma: PrismaClient;

  constructor(prismaInstance?: PrismaClient) {
    this.prisma = prismaInstance || prisma;
  }

  /**
   * 记录完整的查询审计日志
   */
  async log(logEntry: AuditLog): Promise<void> {
    try {
      await this.prisma.queryAuditLog.create({
        data: {
          userId: logEntry.userId,
          userName: logEntry.userName,
          sessionId: logEntry.sessionId,
          naturalLanguageQuery: logEntry.naturalLanguageQuery,
          intent: JSON.stringify(logEntry.intent),
          generatedSql: logEntry.generatedSQL,
          executionSuccess: logEntry.executionResult.success,
          executionError: logEntry.executionResult.error,
          rowCount: logEntry.executionResult.rowCount,
          usedDatabases: JSON.stringify(logEntry.metadata.usedDatabases),
          usedTables: JSON.stringify(logEntry.metadata.usedTables),
          intentRecognitionTime: logEntry.performance.intentRecognitionTime,
          sqlGenerationTime: logEntry.performance.sqlGenerationTime,
          validationTime: logEntry.performance.validationTime,
          executionTime: logEntry.performance.executionTime,
          totalTime: logEntry.performance.totalTime,
          ipAddress: logEntry.ipAddress,
          userAgent: logEntry.userAgent,
          timestamp: logEntry.timestamp,
        },
      });
    } catch (error) {
      // 审计日志失败不应该阻塞主流程
      console.error('[AuditLogger] Failed to write audit log:', error);
    }
  }

  /**
   * 查询审计日志（带分页信息）
   */
  async queryWithPagination(filters: AuditLogFilters): Promise<PaginatedAuditLogs> {
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
      data: logs.map((log) => ({
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
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  /**
   * 查询审计日志
   */
  async query(filters: AuditLogFilters): Promise<AuditLog[]> {
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

    const logs = await this.prisma.queryAuditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: ((filters.page || 1) - 1) * (filters.limit || 50),
      take: filters.limit || 50,
    });

    return logs.map((log) => ({
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
    }));
  }

  /**
   * 统计分析
   */
  async getStats(filters: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditStats> {
    const where: any = {};

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
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
  }

  /**
   * 获取用户查询历史
   */
  async getUserHistory(
    userId: string,
    options: {
      limit?: number;
      page?: number;
    } = {}
  ): Promise<AuditLog[]> {
    return this.query({
      userId,
      limit: options.limit || 20,
      page: options.page || 1,
    });
  }

  /**
   * 获取失败的查询日志
   */
  async getFailedQueries(options: {
    limit?: number;
    page?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<AuditLog[]> {
    return this.query({
      success: false,
      limit: options.limit || 50,
      page: options.page || 1,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  /**
   * 获取慢查询日志（执行时间超过阈值）
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

    return logs.map((log) => ({
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
    }));
  }

  /**
   * 清理过期审计日志
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.queryAuditLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`[AuditLogger] Cleaned up ${result.count} old audit logs`);
    return result.count;
  }

  /**
   * 获取热门查询（用于缓存预热）
   */
  async getHotQueries(
    topN: number = 20,
    options: {
      startDate?: Date;
      endDate?: Date;
      minCount?: number;
    } = {}
  ): Promise<import('./types').PopularQuery[]> {
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

    // 按自然语言查询分组，统计频率
    const grouped = await this.prisma.queryAuditLog.groupBy({
      by: ['naturalLanguageQuery'],
      where,
      _count: {
        naturalLanguageQuery: true,
      },
      _avg: {
        executionTime: true,
      },
      _max: {
        timestamp: true,
      },
      orderBy: {
        _count: {
          naturalLanguageQuery: 'desc',
        },
      },
      take: topN,
    });

    // 过滤掉低频查询
    const minCount = options.minCount || 2;
    const filtered = grouped.filter((item) => item._count.naturalLanguageQuery >= minCount);

    // 计算成功率
    const results: import('./types').PopularQuery[] = [];
    for (const item of filtered) {
      const totalCount = await this.prisma.queryAuditLog.count({
        where: {
          naturalLanguageQuery: item.naturalLanguageQuery,
        },
      });

      const successCount = item._count.naturalLanguageQuery;

      results.push({
        naturalLanguageQuery: item.naturalLanguageQuery,
        count: totalCount,
        avgExecutionTime: item._avg.executionTime || 0,
        successRate: totalCount > 0 ? successCount / totalCount : 0,
        lastUsed: item._max.timestamp || new Date(),
      });
    }

    return results;
  }

  /**
   * 获取热表统计（用于缓存预热）
   */
  async getHotTables(
    topN: number = 50,
    options: {
      startDate?: Date;
      endDate?: Date;
      minCount?: number;
    } = {}
  ): Promise<import('./types').TableUsageStats[]> {
    const where: any = {
      executionSuccess: true,
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

    // 获取所有成功的查询日志
    const logs = await this.prisma.queryAuditLog.findMany({
      where,
      select: {
        usedTables: true,
        executionTime: true,
      },
    });

    // 统计每张表的访问次数
    const tableStats = new Map<string, { count: number; totalTime: number; successCount: number }>();

    for (const log of logs) {
      try {
        const tables = JSON.parse(log.usedTables) as string[];
        for (const tableName of tables) {
          if (!tableName) continue;

          const stats = tableStats.get(tableName) || { count: 0, totalTime: 0, successCount: 0 };
          stats.count++;
          stats.totalTime += log.executionTime;
          stats.successCount++;
          tableStats.set(tableName, stats);
        }
      } catch (error) {
        // 忽略解析错误
      }
    }

    // 转换为结果数组并排序
    const results: import('./types').TableUsageStats[] = [];
    for (const [tableName, stats] of Array.from(tableStats.entries())) {
      if (stats.count < (options.minCount || 2)) continue;

      // 解析表名（格式：database.table 或 table）
      const parts = tableName.split('.');
      const databaseName = parts.length > 1 ? parts[0] : '';
      const tableNameOnly = parts.length > 1 ? parts[1] : parts[0];

      results.push({
        tableName: tableNameOnly,
        databaseName: databaseName,
        queryCount: stats.count,
        avgExecutionTime: stats.totalTime / stats.count,
        successRate: 1.0, // 已经只统计成功的查询
      });
    }

    // 按访问次数排序并取 topN
    results.sort((a, b) => b.queryCount - a.queryCount);
    return results.slice(0, topN);
  }

  /**
   * 获取表访问统计（带数据库名）
   */
  async getTableAccessStats(
    options: {
      startDate?: Date;
      endDate?: Date;
      databaseName?: string;
    } = {}
  ): Promise<
    Array<{
      tableName: string;
      databaseName: string;
      accessCount: number;
      avgExecutionTime: number;
      lastAccessTime: Date;
    }>
  > {
    const where: any = {
      executionSuccess: true,
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
      select: {
        usedTables: true,
        usedDatabases: true,
        executionTime: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    // 统计表访问信息
    const tableAccessMap = new Map<
      string,
      {
        accessCount: number;
        totalTime: number;
        lastAccessTime: Date;
        databaseName: string;
      }
    >();

    for (const log of logs) {
      try {
        const tables = JSON.parse(log.usedTables) as string[];
        const databases = JSON.parse(log.usedDatabases) as string[];
        const dbName = databases[0] || '';

        // 如果指定了数据库名，过滤
        if (options.databaseName && dbName !== options.databaseName) {
          continue;
        }

        for (const tableName of tables) {
          if (!tableName) continue;

          const key = `${dbName}.${tableName}`;
          const stats = tableAccessMap.get(key) || {
            accessCount: 0,
            totalTime: 0,
            lastAccessTime: log.timestamp,
            databaseName: dbName,
          };

          stats.accessCount++;
          stats.totalTime += log.executionTime;
          if (log.timestamp > stats.lastAccessTime) {
            stats.lastAccessTime = log.timestamp;
          }

          tableAccessMap.set(key, stats);
        }
      } catch (error) {
        // 忽略解析错误
      }
    }

    // 转换为结果数组
    const results: Array<{
      tableName: string;
      databaseName: string;
      accessCount: number;
      avgExecutionTime: number;
      lastAccessTime: Date;
    }> = [];

    for (const [key, stats] of Array.from(tableAccessMap.entries())) {
      const parts = key.split('.');
      const tableName = parts[1] || parts[0];

      results.push({
        tableName,
        databaseName: stats.databaseName,
        accessCount: stats.accessCount,
        avgExecutionTime: stats.totalTime / stats.accessCount,
        lastAccessTime: stats.lastAccessTime,
      });
    }

    // 按访问次数排序
    results.sort((a, b) => b.accessCount - a.accessCount);
    return results;
  }

  /**
   * 关闭数据库连接
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
