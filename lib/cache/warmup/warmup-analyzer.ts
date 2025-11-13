/**
 * WarmupAnalyzer - 缓存预热热点分析器
 *
 * 职责：
 * - 基于审计日志分析热点表和热点查询
 * - 计算预热优先级（基于访问频率、平均耗时、最后访问时间）
 * - 为预热策略提供数据支持
 */

import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { AuditLogger } from '@/lib/audit/audit-logger';
import type { PrismaClient } from '@/app/generated/prisma';

/**
 * 热表分析结果
 */
export interface HotTableAnalysis {
  tableId: number;
  tableName: string;
  databaseName: string;
  accessCount: number;
  avgQueryTime: number;
  lastAccessTime: Date;
  score: number; // 热度得分（0-100）
  priority: 'P0' | 'P1' | 'P2' | 'P3'; // 预热优先级
}

/**
 * 热查询分析结果
 */
export interface HotQueryAnalysis {
  naturalLanguageQuery: string;
  count: number;
  avgExecutionTime: number;
  successRate: number;
  lastUsed: Date;
  score: number; // 热度得分（0-100）
  priority: 'P0' | 'P1' | 'P2' | 'P3';
}

/**
 * 预热建议
 */
export interface WarmupRecommendation {
  hotTables: HotTableAnalysis[];
  hotQueries: HotQueryAnalysis[];
  summary: {
    totalTables: number;
    totalQueries: number;
    recommendedTableCount: number;
    recommendedQueryCount: number;
    estimatedWarmupTime: number; // 毫秒
  };
}

/**
 * WarmupAnalyzer
 *
 * 热点分析器，基于审计日志数据驱动预热策略
 */
@injectable()
export class WarmupAnalyzer {
  constructor(
    @inject(DI_TOKENS.AuditLogger)
    private readonly auditLogger: AuditLogger,

    @inject(DI_TOKENS.PrismaClient)
    private readonly prisma: PrismaClient
  ) {}

  /**
   * 分析热表
   *
   * 基于访问频率、查询耗时、最后访问时间计算热度得分
   *
   * @param topN - 返回前 N 个热表
   * @param options - 分析选项
   * @returns 热表分析结果
   */
  async analyzeHotTables(
    topN: number = 50,
    options: {
      startDate?: Date;
      endDate?: Date;
      minAccessCount?: number;
    } = {}
  ): Promise<HotTableAnalysis[]> {
    // 获取表访问统计
    const tableStats = await this.auditLogger.getTableAccessStats({
      startDate: options.startDate,
      endDate: options.endDate,
    });

    // 过滤低频访问的表
    const minAccessCount = options.minAccessCount || 2;
    const filtered = tableStats.filter((stat) => stat.accessCount >= minAccessCount);

    // 计算热度得分
    const results: HotTableAnalysis[] = [];
    const now = Date.now();

    for (const stat of filtered) {
      // 查找表 ID
      const table = await this.prisma.tableMeta.findFirst({
        where: {
          tableName: stat.tableName,
          database: {
            databaseName: stat.databaseName,
          },
        },
        select: {
          id: true,
        },
      });

      if (!table) continue;

      // 热度得分计算：
      // - 访问频率占 60%
      // - 查询性能占 20%（耗时越短得分越高）
      // - 访问时效占 20%（越近得分越高）
      const accessScore = Math.min(stat.accessCount * 2, 60); // 最高 60 分
      const performanceScore = Math.max(20 - stat.avgExecutionTime / 100, 0); // 最高 20 分
      const recencyScore =
        Math.max(
          20 - (now - stat.lastAccessTime.getTime()) / (1000 * 60 * 60 * 24),
          0
        ); // 最高 20 分

      const score = accessScore + performanceScore + recencyScore;

      // 根据得分划分优先级
      let priority: 'P0' | 'P1' | 'P2' | 'P3';
      if (score >= 80) {
        priority = 'P0';
      } else if (score >= 60) {
        priority = 'P1';
      } else if (score >= 40) {
        priority = 'P2';
      } else {
        priority = 'P3';
      }

      results.push({
        tableId: table.id,
        tableName: stat.tableName,
        databaseName: stat.databaseName,
        accessCount: stat.accessCount,
        avgQueryTime: stat.avgExecutionTime,
        lastAccessTime: stat.lastAccessTime,
        score: Math.round(score * 10) / 10,
        priority,
      });
    }

    // 按得分排序并取 topN
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
  }

  /**
   * 分析热查询
   *
   * @param topN - 返回前 N 个热查询
   * @param options - 分析选项
   * @returns 热查询分析结果
   */
  async analyzeHotQueries(
    topN: number = 20,
    options: {
      startDate?: Date;
      endDate?: Date;
      minCount?: number;
    } = {}
  ): Promise<HotQueryAnalysis[]> {
    // 获取热门查询
    const hotQueries = await this.auditLogger.getHotQueries(topN * 2, {
      startDate: options.startDate,
      endDate: options.endDate,
      minCount: options.minCount || 2,
    });

    // 计算热度得分
    const results: HotQueryAnalysis[] = [];
    const now = Date.now();

    for (const query of hotQueries) {
      // 热度得分计算：
      // - 查询频率占 50%
      // - 成功率占 30%
      // - 查询性能占 10%（耗时越短得分越高）
      // - 访问时效占 10%
      const frequencyScore = Math.min(query.count * 2.5, 50); // 最高 50 分
      const successScore = query.successRate * 30; // 最高 30 分
      const performanceScore = Math.max(10 - query.avgExecutionTime / 200, 0); // 最高 10 分
      const recencyScore =
        Math.max(10 - (now - query.lastUsed.getTime()) / (1000 * 60 * 60 * 24), 0); // 最高 10 分

      const score = frequencyScore + successScore + performanceScore + recencyScore;

      // 根据得分划分优先级
      let priority: 'P0' | 'P1' | 'P2' | 'P3';
      if (score >= 80) {
        priority = 'P0';
      } else if (score >= 60) {
        priority = 'P1';
      } else if (score >= 40) {
        priority = 'P2';
      } else {
        priority = 'P3';
      }

      results.push({
        naturalLanguageQuery: query.naturalLanguageQuery,
        count: query.count,
        avgExecutionTime: query.avgExecutionTime,
        successRate: query.successRate,
        lastUsed: query.lastUsed,
        score: Math.round(score * 10) / 10,
        priority,
      });
    }

    // 按得分排序并取 topN
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
  }

  /**
   * 生成预热建议
   *
   * 综合分析热表和热查询，生成预热建议
   *
   * @param options - 分析选项
   * @returns 预热建议
   */
  async generateWarmupRecommendation(options: {
    maxTables?: number;
    maxQueries?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<WarmupRecommendation> {
    const maxTables = options.maxTables || 50;
    const maxQueries = options.maxQueries || 20;

    // 并行分析热表和热查询
    const [hotTables, hotQueries] = await Promise.all([
      this.analyzeHotTables(maxTables, {
        startDate: options.startDate,
        endDate: options.endDate,
      }),
      this.analyzeHotQueries(maxQueries, {
        startDate: options.startDate,
        endDate: options.endDate,
      }),
    ]);

    // 筛选推荐预热的表和查询（P0 和 P1）
    const recommendedTables = hotTables.filter(
      (t) => t.priority === 'P0' || t.priority === 'P1'
    );
    const recommendedQueries = hotQueries.filter(
      (q) => q.priority === 'P0' || q.priority === 'P1'
    );

    // 预估预热时间（毫秒）
    // 每张表预热约 50ms，每个查询预热约 100ms
    const estimatedWarmupTime =
      recommendedTables.length * 50 + recommendedQueries.length * 100;

    return {
      hotTables,
      hotQueries,
      summary: {
        totalTables: hotTables.length,
        totalQueries: hotQueries.length,
        recommendedTableCount: recommendedTables.length,
        recommendedQueryCount: recommendedQueries.length,
        estimatedWarmupTime,
      },
    };
  }

  /**
   * 获取最近 N 天的热点分析
   *
   * @param days - 分析最近 N 天的数据
   * @param options - 分析选项
   * @returns 预热建议
   */
  async getRecentHotspots(
    days: number = 7,
    options: {
      maxTables?: number;
      maxQueries?: number;
    } = {}
  ): Promise<WarmupRecommendation> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.generateWarmupRecommendation({
      ...options,
      startDate,
      endDate,
    });
  }
}
