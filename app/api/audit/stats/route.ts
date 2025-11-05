/**
 * 审计统计 API
 * GET /api/audit/stats
 *
 * 功能：
 * - 获取审计统计数据（管理员功能）
 * - 提供多维度统计分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditLogger, AuditAnalyzer } from '@/lib/audit';
import prisma from '@/lib/prisma/client';

export interface AuditStatsResponse {
  success: boolean;
  data?: {
    overview: {
      totalQueries: number;
      successQueries: number;
      failedQueries: number;
      successRate: number;
      avgExecutionTime: number;
    };
    popularQueries?: Array<{
      naturalLanguageQuery: string;
      count: number;
      avgExecutionTime: number;
      successRate: number;
    }>;
    userActivity?: Array<{
      userId: string;
      userName?: string;
      totalQueries: number;
      successQueries: number;
      failedQueries: number;
      avgExecutionTime: number;
    }>;
    databaseUsage?: Array<{
      databaseName: string;
      queryCount: number;
      successRate: number;
      avgExecutionTime: number;
    }>;
    tableUsage?: Array<{
      tableName: string;
      databaseName: string;
      queryCount: number;
      avgExecutionTime: number;
      successRate: number;
    }>;
    timeRangeStats?: Array<{
      date: string;
      totalQueries: number;
      successQueries: number;
      failedQueries: number;
      avgExecutionTime: number;
    }>;
  };
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    // TODO: 添加管理员权限验证
    // const isAdmin = await checkAdminPermission(request);
    // if (!isAdmin) {
    //   return NextResponse.json({
    //     success: false,
    //     error: '需要管理员权限',
    //   } as AuditStatsResponse, { status: 403 });
    // }

    // 解析查询参数
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeDetails = searchParams.get('includeDetails') === 'true';

    console.log(`[Audit Stats] Fetching stats: includeDetails=${includeDetails}`);

    const auditLogger = new AuditLogger(prisma);
    const auditAnalyzer = new AuditAnalyzer(prisma);

    // 构建日期范围
    const dateFilters: any = {};
    if (startDate) {
      dateFilters.startDate = new Date(startDate);
    }
    if (endDate) {
      dateFilters.endDate = new Date(endDate);
    }

    // 1. 获取基本统计数据
    const overview = await auditLogger.getStats(dateFilters);
    console.log(`[Audit Stats] Overview: ${overview.totalQueries} queries`);

    const responseData: any = {
      overview: {
        totalQueries: overview.totalQueries,
        successQueries: overview.successQueries,
        failedQueries: overview.failedQueries,
        successRate: overview.successRate,
        avgExecutionTime: overview.avgExecutionTime,
      },
    };

    // 2. 如果需要详细数据
    if (includeDetails) {
      // 热门查询
      const popularQueries = await auditAnalyzer.analyzePopularQueries(
        dateFilters.startDate,
        dateFilters.endDate,
        10
      );

      // 用户活动
      const userActivity = await auditAnalyzer.analyzeUserActivity(
        dateFilters.startDate,
        dateFilters.endDate,
        10
      );

      // 数据库使用情况
      const databaseUsage = await auditAnalyzer.analyzeDatabaseUsage(
        dateFilters.startDate,
        dateFilters.endDate
      );

      // 表使用统计
      const tableUsage = await auditAnalyzer.analyzeTableUsage(
        dateFilters.startDate,
        dateFilters.endDate
      );

      // 时间范围统计（最近7天）
      let timeRangeStats: any[] = [];
      if (!startDate || !endDate) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        timeRangeStats = await auditAnalyzer.analyzeTimeRangeStats(start, end);
      } else {
        timeRangeStats = await auditAnalyzer.analyzeTimeRangeStats(
          new Date(startDate),
          new Date(endDate)
        );
      }

      responseData.popularQueries = popularQueries.map(q => ({
        naturalLanguageQuery: q.naturalLanguageQuery,
        count: q.count,
        avgExecutionTime: q.avgExecutionTime,
        successRate: q.successRate,
      }));

      responseData.userActivity = userActivity.map(u => ({
        userId: u.userId,
        userName: u.userName,
        totalQueries: u.totalQueries,
        successQueries: u.successQueries,
        failedQueries: u.failedQueries,
        avgExecutionTime: u.avgExecutionTime,
      }));

      responseData.databaseUsage = databaseUsage.map(d => ({
        databaseName: d.databaseName,
        queryCount: d.queryCount,
        successRate: d.successRate,
        avgExecutionTime: d.avgExecutionTime,
      }));

      responseData.tableUsage = tableUsage.map(t => ({
        tableName: t.tableName,
        databaseName: t.databaseName,
        queryCount: t.queryCount,
        avgExecutionTime: t.avgExecutionTime,
        successRate: t.successRate,
      }));

      responseData.timeRangeStats = timeRangeStats;

      console.log(`[Audit Stats] Detailed stats included`);
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    } as AuditStatsResponse);

  } catch (error: any) {
    console.error('[Audit Stats] Error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || '获取统计数据失败',
    } as AuditStatsResponse, { status: 500 });
  }
}
