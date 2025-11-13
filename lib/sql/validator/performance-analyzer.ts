/**
 * SQL 性能分析器（聚合类）
 *
 * 此文件已重构为聚合模式，将原来的大文件（841行）拆分为 4 个职责单一的子类：
 * - SQLPatternDetector: SQL 模式检测
 * - IndexAnalyzer: 索引分析
 * - QueryCostEstimator: 成本估算
 * - QueryOptimizationAnalyzer: 查询优化建议生成
 *
 * 此聚合类负责组合所有分析器，提供统一的访问接口，保持向后兼容
 */

import { Parser } from 'node-sql-parser';
import { PrismaClient } from '@/app/generated/prisma';
import prisma from '@/lib/prisma/client';
import { PerformanceAnalysis } from './types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { SQLPatternDetector } from './sql-pattern-detector';
import { IndexAnalyzer } from './index-analyzer';
import { QueryCostEstimator } from './query-cost-estimator';
import { QueryOptimizationAnalyzer } from './query-optimization-analyzer';

export class PerformanceAnalyzer {
  private parser: Parser;
  private prisma: PrismaClient;
  private patternDetector: SQLPatternDetector;
  private indexAnalyzer: IndexAnalyzer;
  private costEstimator: QueryCostEstimator;
  private optimizationAnalyzer: QueryOptimizationAnalyzer;

  constructor(prismaInstance?: PrismaClient) {
    this.parser = new Parser();
    this.prisma = prismaInstance || prisma;
    this.patternDetector = new SQLPatternDetector();
    this.indexAnalyzer = new IndexAnalyzer(this.prisma);
    this.costEstimator = new QueryCostEstimator();
    this.optimizationAnalyzer = new QueryOptimizationAnalyzer(this.indexAnalyzer);
  }

  /**
   * 分析 SQL 性能（委托给子分析器）
   */
  async analyze(
    sql: string,
    context: MetadataContext
  ): Promise<PerformanceAnalysis> {
    try {
      const ast = this.parser.astify(sql, { database: 'MySQL' });
      const statements = Array.isArray(ast) ? ast : [ast];

      // 使用优化分析器获取警告和建议
      const { warnings, suggestions } = await this.optimizationAnalyzer.analyzeQuery(
        statements[0],
        context
      );

      // 使用成本估算器计算查询成本
      const crossDbJoins = this.costEstimator.detectCrossDbJoins(statements[0], context);
      const estimatedCost = await this.costEstimator.estimateCost(
        statements[0],
        context,
        crossDbJoins
      );

      return {
        warnings,
        suggestions,
        estimatedCost
      };
    } catch (error) {
      console.error('Performance analysis failed:', error);
      return {
        warnings: [{
          type: 'analysis_failed',
          message: '性能分析失败，但不影响 SQL 执行',
          severity: 'low'
        }],
        suggestions: [],
        estimatedCost: {
          complexity: 'medium'
        }
      };
    }
  }

  /**
   * 清理缓存（委托给索引分析器）
   */
  public clearCache(): void {
    this.indexAnalyzer.clearCache();
  }
}
