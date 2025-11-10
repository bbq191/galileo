/**
 * 查询优化分析器
 * 负责分析 SQL 查询并生成优化建议和警告
 */

import { Parser } from 'node-sql-parser';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import {
  ValidationWarning,
  OptimizationSuggestion,
} from './types';
import { SQLPatternDetector } from './sql-pattern-detector';
import { IndexAnalyzer } from './index-analyzer';
import { QueryCostEstimator } from './query-cost-estimator';

export class QueryOptimizationAnalyzer {
  private patternDetector: SQLPatternDetector;
  private indexAnalyzer: IndexAnalyzer;
  private costEstimator: QueryCostEstimator;

  constructor(indexAnalyzer: IndexAnalyzer) {
    this.patternDetector = new SQLPatternDetector();
    this.indexAnalyzer = indexAnalyzer;
    this.costEstimator = new QueryCostEstimator();
  }

  /**
   * 分析查询并生成建议
   */
  async analyzeQuery(
    ast: any,
    context: MetadataContext
  ): Promise<{
    warnings: ValidationWarning[];
    suggestions: OptimizationSuggestion[];
  }> {
    const warnings: ValidationWarning[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    // 1. 检查 SELECT *
    if (this.patternDetector.containsSelectStar(ast)) {
      suggestions.push({
        type: 'select_star',
        message: '建议明确指定需要的列，避免 SELECT *',
        impact: 'medium',
        suggestion: '只查询需要的字段可以减少网络传输和内存占用'
      });
    }

    // 2. 检查缺少 LIMIT
    if (!this.patternDetector.hasLimit(ast) && this.costEstimator.estimateResultSize(context) > 1000) {
      warnings.push({
        type: 'missing_limit',
        message: '查询可能返回大量数据，建议添加 LIMIT',
        severity: 'medium'
      });
    }

    // 3. 检查跨库 JOIN
    const crossDbJoins = this.costEstimator.detectCrossDbJoins(ast, context);
    if (crossDbJoins > 0) {
      warnings.push({
        type: 'cross_database_join',
        message: `查询包含 ${crossDbJoins} 个跨库 JOIN，可能影响性能`,
        severity: 'high'
      });

      suggestions.push({
        type: 'cross_db_optimization',
        message: '跨库 JOIN 性能较差，建议优化',
        impact: 'high',
        suggestion: '考虑在各数据库内先进行过滤，减少跨库传输的数据量'
      });
    }

    // 4. 检查是否使用索引
    const nonIndexedFilters = await this.indexAnalyzer.checkIndexUsage(ast, context);
    for (const filter of nonIndexedFilters) {
      suggestions.push({
        type: 'missing_index',
        message: `WHERE 条件 '${filter}' 可能未使用索引`,
        impact: 'high',
        suggestion: '建议在该字段上创建索引以提高查询性能'
      });
    }

    // 5. 检查函数使用
    if (this.patternDetector.hasFunctionOnColumn(ast)) {
      suggestions.push({
        type: 'function_on_column',
        message: 'WHERE 子句中对列使用了函数',
        impact: 'high',
        suggestion: '在列上使用函数会导致无法使用索引，建议改写查询条件'
      });
    }

    // 6. 检查子查询
    if (this.patternDetector.hasSubquery(ast)) {
      const subqueryCount = this.patternDetector.countSubqueries(ast);
      if (subqueryCount > 2) {
        warnings.push({
          type: 'excessive_subqueries',
          message: `查询包含 ${subqueryCount} 个子查询，可能影响性能`,
          severity: 'medium'
        });
        suggestions.push({
          type: 'subquery_optimization',
          message: '考虑使用 JOIN 替代子查询，或使用 CTE 提高可读性',
          impact: 'medium',
          suggestion: '将相关子查询改写为 JOIN，将非相关子查询改写为 CTE'
        });
      }
    }

    // 7. 检查 UNION
    if (this.patternDetector.hasUnion(ast)) {
      const unionCount = this.patternDetector.countUnions(ast);
      if (unionCount > 3) {
        warnings.push({
          type: 'excessive_unions',
          message: `查询包含 ${unionCount} 个 UNION，可能影响性能`,
          severity: 'medium'
        });
      }

      if (!this.patternDetector.usesUnionAll(ast)) {
        suggestions.push({
          type: 'union_all',
          message: '如果不需要去重，建议使用 UNION ALL 替代 UNION',
          impact: 'medium',
          suggestion: 'UNION 会执行去重操作，UNION ALL 性能更好'
        });
      }
    }

    // 8. 检查 DISTINCT
    if (this.patternDetector.hasDistinct(ast)) {
      suggestions.push({
        type: 'distinct_usage',
        message: '使用了 DISTINCT，可能影响性能',
        impact: 'medium',
        suggestion: '考虑是否可以通过 GROUP BY 或优化查询逻辑避免使用 DISTINCT'
      });
    }

    // 9. 检查 OR 条件
    if (this.patternDetector.hasOrCondition(ast)) {
      suggestions.push({
        type: 'or_condition',
        message: 'WHERE 子句包含 OR 条件，可能无法有效使用索引',
        impact: 'medium',
        suggestion: '考虑将 OR 改写为 UNION，或使用 IN 替代多个 OR'
      });
    }

    // 10. 检查 NOT IN
    if (this.patternDetector.hasNotIn(ast)) {
      warnings.push({
        type: 'not_in_usage',
        message: '使用了 NOT IN，可能导致全表扫描',
        severity: 'medium'
      });
      suggestions.push({
        type: 'not_in_optimization',
        message: '建议使用 NOT EXISTS 或 LEFT JOIN 替代 NOT IN',
        impact: 'high',
        suggestion: 'NOT IN 在某些情况下无法使用索引，NOT EXISTS 通常性能更好'
      });
    }

    // 11. 检查排序字段索引
    const orderByResults = await this.indexAnalyzer.checkOrderByIndexes(ast, context);
    for (const result of orderByResults) {
      if (!result.hasIndex) {
        suggestions.push({
          type: 'orderby_index',
          message: `ORDER BY 列 '${result.column}' 可能未使用索引`,
          impact: 'medium',
          suggestion: '在排序字段上创建索引可以提高排序性能'
        });
      }
    }

    // 12. 检查 GROUP BY 字段索引
    const groupByResults = await this.indexAnalyzer.checkGroupByIndexes(ast, context);
    for (const result of groupByResults) {
      if (!result.hasIndex) {
        suggestions.push({
          type: 'groupby_index',
          message: `GROUP BY 列 '${result.column}' 可能未使用索引`,
          impact: 'medium',
          suggestion: '在分组字段上创建索引可以提高分组性能'
        });
      }
    }

    return { warnings, suggestions };
  }
}
