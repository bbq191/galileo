/**
 * 审计日志模块 - 审计日志分析器
 * Phase 2 - Week 9: 验证、优化与执行
 *
 * 功能：
 * - 分析查询模式
 * - 生成统计报表
 * - 识别异常查询
 * - 性能趋势分析
 */

import { PrismaClient } from '@/app/generated/prisma';
import prisma from '@/lib/prisma/client';
import type { AuditLog, PopularQuery, TableUsageStats, TimeRangeStats } from './types';

export interface QueryPattern {
  pattern: string;
  count: number;
  avgExecutionTime: number;
  successRate: number;
}

export interface UserActivity {
  userId: string;
  userName?: string;
  totalQueries: number;
  successQueries: number;
  failedQueries: number;
  avgExecutionTime: number;
  lastQueryTime: Date;
}

export interface DatabaseUsage {
  databaseName: string;
  queryCount: number;
  successRate: number;
  avgExecutionTime: number;
}

export interface PerformanceTrend {
  date: string;
  avgExecutionTime: number;
  queryCount: number;
  successRate: number;
}

export class AuditAnalyzer {
  private prisma: PrismaClient;

  constructor(prismaInstance?: PrismaClient) {
    this.prisma = prismaInstance || prisma;
  }

  /**
   * 分析查询模式
   * 识别常见的查询类型和模式
   */
  async analyzeQueryPatterns(
    startDate?: Date,
    endDate?: Date,
    limit: number = 10
  ): Promise<QueryPattern[]> {
    const where: any = {};

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const logs = await this.prisma.queryAuditLog.findMany({
      where,
      select: {
        naturalLanguageQuery: true,
        executionSuccess: true,
        executionTime: true,
      },
    });

    // 简单的模式识别：提取查询的主要关键词
    const patternMap = new Map<string, {
      count: number;
      totalTime: number;
      successCount: number
    }>();

    for (const log of logs) {
      const pattern = this.extractQueryPattern(log.naturalLanguageQuery);
      const current = patternMap.get(pattern) || {
        count: 0,
        totalTime: 0,
        successCount: 0
      };

      current.count++;
      current.totalTime += log.executionTime;
      if (log.executionSuccess) current.successCount++;

      patternMap.set(pattern, current);
    }

    // 转换为结果数组并排序
    const patterns: QueryPattern[] = Array.from(patternMap.entries())
      .map(([pattern, stats]) => ({
        pattern,
        count: stats.count,
        avgExecutionTime: stats.totalTime / stats.count,
        successRate: stats.successCount / stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return patterns;
  }

  /**
   * 提取查询模式
   */
  private extractQueryPattern(query: string): string {
    // 简化：提取关键词
    const keywords = ['查询', '统计', '分析', '对比', '汇总', '计算', '求和'];
    for (const keyword of keywords) {
      if (query.includes(keyword)) {
        return keyword;
      }
    }
    return '其他';
  }

  /**
   * 分析用户活动
   */
  async analyzeUserActivity(
    startDate?: Date,
    endDate?: Date,
    limit: number = 20
  ): Promise<UserActivity[]> {
    const where: any = {};

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    // 获取所有用户的查询日志
    const logs = await this.prisma.queryAuditLog.findMany({
      where,
      select: {
        userId: true,
        userName: true,
        executionSuccess: true,
        executionTime: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    // 按用户分组统计
    const userMap = new Map<string, {
      userName?: string;
      total: number;
      success: number;
      failed: number;
      totalTime: number;
      lastQuery: Date;
    }>();

    for (const log of logs) {
      const userId = log.userId || 'anonymous';
      const current = userMap.get(userId) || {
        userName: log.userName || undefined,
        total: 0,
        success: 0,
        failed: 0,
        totalTime: 0,
        lastQuery: log.timestamp,
      };

      current.total++;
      if (log.executionSuccess) {
        current.success++;
      } else {
        current.failed++;
      }
      current.totalTime += log.executionTime;

      if (log.timestamp > current.lastQuery) {
        current.lastQuery = log.timestamp;
      }

      userMap.set(userId, current);
    }

    // 转换为结果数组并排序
    const activities: UserActivity[] = Array.from(userMap.entries())
      .map(([userId, stats]) => ({
        userId,
        userName: stats.userName,
        totalQueries: stats.total,
        successQueries: stats.success,
        failedQueries: stats.failed,
        avgExecutionTime: stats.totalTime / stats.total,
        lastQueryTime: stats.lastQuery,
      }))
      .sort((a, b) => b.totalQueries - a.totalQueries)
      .slice(0, limit);

    return activities;
  }

  /**
   * 分析数据库使用情况
   */
  async analyzeDatabaseUsage(
    startDate?: Date,
    endDate?: Date
  ): Promise<DatabaseUsage[]> {
    const where: any = {};

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const logs = await this.prisma.queryAuditLog.findMany({
      where,
      select: {
        usedDatabases: true,
        executionSuccess: true,
        executionTime: true,
      },
    });

    // 按数据库分组统计
    const dbMap = new Map<string, {
      count: number;
      successCount: number;
      totalTime: number;
    }>();

    for (const log of logs) {
      const databases = Array.isArray(log.usedDatabases) ? log.usedDatabases : [log.usedDatabases as string];
      for (const db of databases) {
        const current = dbMap.get(db) || {
          count: 0,
          successCount: 0,
          totalTime: 0
        };

        current.count++;
        if (log.executionSuccess) current.successCount++;
        current.totalTime += log.executionTime;

        dbMap.set(db, current);
      }
    }

    // 转换为结果数组并排序
    const usage: DatabaseUsage[] = Array.from(dbMap.entries())
      .map(([databaseName, stats]) => ({
        databaseName,
        queryCount: stats.count,
        successRate: stats.successCount / stats.count,
        avgExecutionTime: stats.totalTime / stats.count,
      }))
      .sort((a, b) => b.queryCount - a.queryCount);

    return usage;
  }

  /**
   * 分析性能趋势（按天）
   */
  async analyzePerformanceTrend(
    startDate: Date,
    endDate: Date
  ): Promise<PerformanceTrend[]> {
    const logs = await this.prisma.queryAuditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        timestamp: true,
        executionTime: true,
        executionSuccess: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // 按日期分组
    const dateMap = new Map<string, {
      count: number;
      successCount: number;
      totalTime: number;
    }>();

    for (const log of logs) {
      const date = log.timestamp.toISOString().split('T')[0];
      const current = dateMap.get(date) || {
        count: 0,
        successCount: 0,
        totalTime: 0
      };

      current.count++;
      if (log.executionSuccess) current.successCount++;
      current.totalTime += log.executionTime;

      dateMap.set(date, current);
    }

    // 转换为结果数组
    const trend: PerformanceTrend[] = Array.from(dateMap.entries())
      .map(([date, stats]) => ({
        date,
        avgExecutionTime: stats.totalTime / stats.count,
        queryCount: stats.count,
        successRate: stats.successCount / stats.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return trend;
  }

  /**
   * 识别异常查询
   * 识别执行时间异常长或错误率高的查询
   */
  async identifyAnomalousQueries(
    executionTimeThreshold: number = 5000, // 5秒
    limit: number = 20
  ): Promise<AuditLog[]> {
    const logs = await this.prisma.queryAuditLog.findMany({
      where: {
        OR: [
          { executionTime: { gte: executionTimeThreshold } },
          { executionSuccess: false },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
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
   * 分析热门查询
   * 识别最常用的查询语句
   */
  async analyzePopularQueries(
    startDate?: Date,
    endDate?: Date,
    limit: number = 20
  ): Promise<PopularQuery[]> {
    const where: any = {};

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const logs = await this.prisma.queryAuditLog.findMany({
      where,
      select: {
        naturalLanguageQuery: true,
        executionSuccess: true,
        executionTime: true,
        timestamp: true,
      },
    });

    // 按查询语句分组统计
    const queryMap = new Map<string, {
      count: number;
      totalTime: number;
      successCount: number;
      lastUsed: Date;
    }>();

    for (const log of logs) {
      const query = log.naturalLanguageQuery.trim();
      const current = queryMap.get(query) || {
        count: 0,
        totalTime: 0,
        successCount: 0,
        lastUsed: log.timestamp,
      };

      current.count++;
      current.totalTime += log.executionTime;
      if (log.executionSuccess) current.successCount++;
      if (log.timestamp > current.lastUsed) {
        current.lastUsed = log.timestamp;
      }

      queryMap.set(query, current);
    }

    // 转换为结果数组并排序
    const popularQueries: PopularQuery[] = Array.from(queryMap.entries())
      .map(([naturalLanguageQuery, stats]) => ({
        naturalLanguageQuery,
        count: stats.count,
        avgExecutionTime: stats.totalTime / stats.count,
        successRate: stats.successCount / stats.count,
        lastUsed: stats.lastUsed,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return popularQueries;
  }

  /**
   * 分析表使用统计
   * 统计每个表的查询次数和性能
   */
  async analyzeTableUsage(
    startDate?: Date,
    endDate?: Date
  ): Promise<TableUsageStats[]> {
    const where: any = {};

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const logs = await this.prisma.queryAuditLog.findMany({
      where,
      select: {
        usedDatabases: true,
        usedTables: true,
        executionSuccess: true,
        executionTime: true,
      },
    });

    // 按表分组统计
    const tableMap = new Map<string, {
      databaseName: string;
      count: number;
      successCount: number;
      totalTime: number;
    }>();

    for (const log of logs) {
      const databases = JSON.parse(log.usedDatabases) as string[];
      const tables = JSON.parse(log.usedTables) as string[];

      // 尝试匹配数据库和表
      for (const table of tables) {
        // 简单实现：假设表名格式为 database.table 或单独的表名
        let dbName = '';
        let tableName = table;

        if (table.includes('.')) {
          const parts = table.split('.');
          dbName = parts[0];
          tableName = parts[1] || parts[0];
        } else if (databases.length > 0) {
          dbName = databases[0];
        }

        const key = `${dbName}.${tableName}`;
        const current = tableMap.get(key) || {
          databaseName: dbName,
          count: 0,
          successCount: 0,
          totalTime: 0,
        };

        current.count++;
        if (log.executionSuccess) current.successCount++;
        current.totalTime += log.executionTime;

        tableMap.set(key, current);
      }
    }

    // 转换为结果数组并排序
    const tableUsage: TableUsageStats[] = Array.from(tableMap.entries())
      .map(([fullTableName, stats]) => {
        const tableName = fullTableName.split('.')[1] || fullTableName;
        return {
          tableName,
          databaseName: stats.databaseName,
          queryCount: stats.count,
          avgExecutionTime: stats.totalTime / stats.count,
          successRate: stats.successCount / stats.count,
        };
      })
      .sort((a, b) => b.queryCount - a.queryCount);

    return tableUsage;
  }

  /**
   * 分析时间范围内的查询统计（按天）
   */
  async analyzeTimeRangeStats(
    startDate: Date,
    endDate: Date
  ): Promise<TimeRangeStats[]> {
    const logs = await this.prisma.queryAuditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        timestamp: true,
        executionTime: true,
        executionSuccess: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    // 按日期分组
    const dateMap = new Map<string, {
      total: number;
      success: number;
      failed: number;
      totalTime: number;
    }>();

    for (const log of logs) {
      const date = log.timestamp.toISOString().split('T')[0];
      const current = dateMap.get(date) || {
        total: 0,
        success: 0,
        failed: 0,
        totalTime: 0,
      };

      current.total++;
      if (log.executionSuccess) {
        current.success++;
      } else {
        current.failed++;
      }
      current.totalTime += log.executionTime;

      dateMap.set(date, current);
    }

    // 转换为结果数组
    const stats: TimeRangeStats[] = Array.from(dateMap.entries())
      .map(([date, data]) => ({
        date,
        totalQueries: data.total,
        successQueries: data.success,
        failedQueries: data.failed,
        avgExecutionTime: data.totalTime / data.total,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return stats;
  }

  /**
   * 关闭数据库连接
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
