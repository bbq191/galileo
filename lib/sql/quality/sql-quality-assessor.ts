/**
 * SQL 质量评估器
 * 评估生成的 SQL 质量，提供改进建议
 */

import { Parser } from 'node-sql-parser';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

export interface QualityAssessment {
  overallScore: number; // 0-100 的总分
  dimensions: {
    correctness: QualityDimension;
    performance: QualityDimension;
    readability: QualityDimension;
    security: QualityDimension;
    bestPractices: QualityDimension;
  };
  suggestions: QualitySuggestion[];
  warnings: string[];
}

export interface QualityDimension {
  score: number; // 0-100
  weight: number; // 权重
  issues: QualityIssue[];
}

export interface QualityIssue {
  severity: 'critical' | 'major' | 'minor';
  message: string;
  impact: number; // 对分数的影响（负数）
}

export interface QualitySuggestion {
  type: 'optimization' | 'refactoring' | 'best_practice';
  priority: 'high' | 'medium' | 'low';
  message: string;
  originalSQL?: string;
  suggestedSQL?: string;
}

/**
 * SQL 质量评估器
 */
export class SQLQualityAssessor {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * 评估 SQL 质量
   */
  assess(sql: string, context?: MetadataContext): QualityAssessment {
    const assessment: QualityAssessment = {
      overallScore: 0,
      dimensions: {
        correctness: this.assessCorrectness(sql, context),
        performance: this.assessPerformance(sql, context),
        readability: this.assessReadability(sql),
        security: this.assessSecurity(sql),
        bestPractices: this.assessBestPractices(sql)
      },
      suggestions: [],
      warnings: []
    };

    // 计算加权总分
    assessment.overallScore = this.calculateOverallScore(assessment.dimensions);

    // 收集所有建议
    assessment.suggestions = this.collectSuggestions(assessment.dimensions);

    // 收集警告
    assessment.warnings = this.collectWarnings(assessment.dimensions);

    return assessment;
  }

  /**
   * 评估正确性维度
   */
  private assessCorrectness(sql: string, context?: MetadataContext): QualityDimension {
    const dimension: QualityDimension = {
      score: 100,
      weight: 0.4, // 正确性占 40% 权重
      issues: []
    };

    try {
      // 1. 语法检查
      try {
        this.parser.astify(sql, { database: 'MySQL' });
      } catch (error) {
        // 如果包含数据库前缀，parser 可能失败，但不一定是错误
        if (!sql.match(/`[^`]+`\s*\.\s*`[^`]+`/)) {
          dimension.issues.push({
            severity: 'critical',
            message: 'SQL 语法错误',
            impact: -50
          });
        }
      }

      // 2. SELECT * 检查
      if (/SELECT\s+\*/i.test(sql)) {
        dimension.issues.push({
          severity: 'minor',
          message: '使用了 SELECT *，建议明确指定字段',
          impact: -5
        });
      }

      // 3. 表名/字段名验证
      if (context) {
        const tableValidation = this.validateTablesAndColumns(sql, context);
        if (!tableValidation.isValid) {
          dimension.issues.push({
            severity: 'critical',
            message: `引用了不存在的表或字段: ${tableValidation.errors.join(', ')}`,
            impact: -40
          });
        }
      }

    } catch (error) {
      dimension.issues.push({
        severity: 'critical',
        message: `正确性检查失败: ${(error as Error).message}`,
        impact: -30
      });
    }

    // 计算得分
    dimension.score = Math.max(0, dimension.score + dimension.issues.reduce((sum, issue) => sum + issue.impact, 0));

    return dimension;
  }

  /**
   * 评估性能维度
   */
  private assessPerformance(sql: string, context?: MetadataContext): QualityDimension {
    const dimension: QualityDimension = {
      score: 100,
      weight: 0.25, // 性能占 25% 权重
      issues: []
    };

    // 1. 缺少 LIMIT 检查
    if (!/LIMIT\s+\d+/i.test(sql) && /SELECT/i.test(sql)) {
      dimension.issues.push({
        severity: 'major',
        message: '缺少 LIMIT 子句，可能返回大量数据',
        impact: -15
      });
    }

    // 2. 跨库 JOIN 检查
    const crossDbJoins = this.detectCrossDbJoins(sql);
    if (crossDbJoins > 0) {
      dimension.issues.push({
        severity: 'major',
        message: `包含 ${crossDbJoins} 个跨库 JOIN，可能影响性能`,
        impact: -10 * crossDbJoins
      });
    }

    // 3. 子查询嵌套深度
    const subqueryDepth = this.calculateSubqueryDepth(sql);
    if (subqueryDepth > 2) {
      dimension.issues.push({
        severity: 'major',
        message: `子查询嵌套过深（${subqueryDepth}层），考虑使用 CTE`,
        impact: -10
      });
    }

    // 4. 函数在 WHERE 子句中的使用
    if (/WHERE\s+[A-Z_]+\([^)]+\)\s*=/i.test(sql)) {
      dimension.issues.push({
        severity: 'minor',
        message: 'WHERE 子句中使用函数，可能无法使用索引',
        impact: -5
      });
    }

    // 5. 大表全表扫描（需要元数据）
    if (context) {
      const largeTableScan = this.detectLargeTableScan(sql, context);
      if (largeTableScan) {
        dimension.issues.push({
          severity: 'major',
          message: '可能对大表进行全表扫描',
          impact: -20
        });
      }
    }

    dimension.score = Math.max(0, dimension.score + dimension.issues.reduce((sum, issue) => sum + issue.impact, 0));

    return dimension;
  }

  /**
   * 评估可读性维度
   */
  private assessReadability(sql: string): QualityDimension {
    const dimension: QualityDimension = {
      score: 100,
      weight: 0.15, // 可读性占 15% 权重
      issues: []
    };

    // 1. SQL 长度
    if (sql.length > 1000) {
      dimension.issues.push({
        severity: 'minor',
        message: 'SQL 过长，考虑拆分或使用 CTE',
        impact: -5
      });
    }

    // 2. 别名使用
    if (!/AS\s+\w+/i.test(sql) && /JOIN/i.test(sql)) {
      dimension.issues.push({
        severity: 'minor',
        message: '建议为表和复杂表达式使用别名',
        impact: -5
      });
    }

    // 3. 关键字大小写一致性
    const keywords = sql.match(/\b(SELECT|FROM|WHERE|JOIN|GROUP|ORDER|LIMIT|AS|ON)\b/gi);
    if (keywords) {
      const uppercaseCount = keywords.filter(k => k === k.toUpperCase()).length;
      const lowercaseCount = keywords.filter(k => k === k.toLowerCase()).length;
      if (uppercaseCount > 0 && lowercaseCount > 0) {
        dimension.issues.push({
          severity: 'minor',
          message: 'SQL 关键字大小写不一致',
          impact: -3
        });
      }
    }

    dimension.score = Math.max(0, dimension.score + dimension.issues.reduce((sum, issue) => sum + issue.impact, 0));

    return dimension;
  }

  /**
   * 评估安全性维度
   */
  private assessSecurity(sql: string): QualityDimension {
    const dimension: QualityDimension = {
      score: 100,
      weight: 0.15, // 安全性占 15% 权重
      issues: []
    };

    // 1. SQL 注入特征检查
    const injectionPatterns = [
      /;.*DROP/i,
      /UNION.*SELECT/i,
      /OR\s+1\s*=\s*1/i,
      /--/,
      /\/\*/
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(sql)) {
        dimension.issues.push({
          severity: 'critical',
          message: '检测到潜在的 SQL 注入特征',
          impact: -50
        });
        break;
      }
    }

    // 2. 危险操作检查
    const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER'];
    for (const keyword of dangerousKeywords) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(sql)) {
        dimension.issues.push({
          severity: 'critical',
          message: `包含危险操作: ${keyword}`,
          impact: -50
        });
      }
    }

    // 3. 系统表访问检查
    if (/information_schema|mysql\.|sys\./i.test(sql)) {
      dimension.issues.push({
        severity: 'major',
        message: '访问系统表可能存在安全风险',
        impact: -20
      });
    }

    dimension.score = Math.max(0, dimension.score + dimension.issues.reduce((sum, issue) => sum + issue.impact, 0));

    return dimension;
  }

  /**
   * 评估最佳实践维度
   */
  private assessBestPractices(sql: string): QualityDimension {
    const dimension: QualityDimension = {
      score: 100,
      weight: 0.05, // 最佳实践占 5% 权重
      issues: []
    };

    // 1. 使用反引号包裹标识符
    if (!/`[^`]+`/.test(sql)) {
      dimension.issues.push({
        severity: 'minor',
        message: '建议使用反引号包裹表名和字段名',
        impact: -5
      });
    }

    // 2. JOIN 类型明确性
    if (/JOIN/i.test(sql) && !/(?:INNER|LEFT|RIGHT|FULL)\s+JOIN/i.test(sql)) {
      dimension.issues.push({
        severity: 'minor',
        message: '建议明确指定 JOIN 类型（INNER/LEFT/RIGHT）',
        impact: -3
      });
    }

    // 3. GROUP BY 后使用 HAVING 而非 WHERE
    if (/GROUP\s+BY.*WHERE/is.test(sql)) {
      // 检查 WHERE 是否在 GROUP BY 之后
      const groupByIndex = sql.toUpperCase().lastIndexOf('GROUP BY');
      const whereIndex = sql.toUpperCase().lastIndexOf('WHERE');
      if (whereIndex > groupByIndex) {
        dimension.issues.push({
          severity: 'minor',
          message: 'GROUP BY 后应使用 HAVING 而非 WHERE',
          impact: -5
        });
      }
    }

    dimension.score = Math.max(0, dimension.score + dimension.issues.reduce((sum, issue) => sum + issue.impact, 0));

    return dimension;
  }

  /**
   * 计算加权总分
   */
  private calculateOverallScore(dimensions: QualityAssessment['dimensions']): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, dimension] of Object.entries(dimensions)) {
      totalScore += dimension.score * dimension.weight;
      totalWeight += dimension.weight;
    }

    return Math.round(totalScore / totalWeight);
  }

  /**
   * 收集所有建议
   */
  private collectSuggestions(dimensions: QualityAssessment['dimensions']): QualitySuggestion[] {
    const suggestions: QualitySuggestion[] = [];

    for (const dimension of Object.values(dimensions)) {
      for (const issue of dimension.issues) {
        const priority = issue.severity === 'critical' ? 'high' :
                        issue.severity === 'major' ? 'medium' : 'low';

        suggestions.push({
          type: this.categorizeIssue(issue.message),
          priority,
          message: issue.message
        });
      }
    }

    return suggestions;
  }

  /**
   * 收集警告
   */
  private collectWarnings(dimensions: QualityAssessment['dimensions']): string[] {
    const warnings: string[] = [];

    for (const dimension of Object.values(dimensions)) {
      for (const issue of dimension.issues) {
        if (issue.severity === 'critical' || issue.severity === 'major') {
          warnings.push(issue.message);
        }
      }
    }

    return warnings;
  }

  /**
   * 分类问题类型
   */
  private categorizeIssue(message: string): 'optimization' | 'refactoring' | 'best_practice' {
    if (message.includes('性能') || message.includes('索引') || message.includes('LIMIT')) {
      return 'optimization';
    } else if (message.includes('拆分') || message.includes('CTE') || message.includes('子查询')) {
      return 'refactoring';
    } else {
      return 'best_practice';
    }
  }

  /**
   * 验证表和字段
   */
  private validateTablesAndColumns(sql: string, context: MetadataContext): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // 提取所有表名
      const tablePattern = /(?:FROM|JOIN)\s+(?:`([^`]+)`\.)?`([^`]+)`/gi;
      let match;

      while ((match = tablePattern.exec(sql)) !== null) {
        const dbName = match[1];
        const tableName = match[2];

        const tableExists = context.tables.some(t => {
          if (dbName) {
            return t.databaseName === dbName && t.tableName === tableName;
          }
          return t.tableName === tableName;
        });

        if (!tableExists) {
          errors.push(`${dbName ? dbName + '.' : ''}${tableName}`);
        }
      }

    } catch (error) {
      console.warn('表和字段验证失败:', error);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 检测跨库 JOIN 数量
   */
  private detectCrossDbJoins(sql: string): number {
    const dbTablePattern = /`([^`]+)`\.`([^`]+)`/g;
    const matches = [...sql.matchAll(dbTablePattern)];
    const databases = new Set(matches.map(m => m[1]));
    return Math.max(0, databases.size - 1);
  }

  /**
   * 计算子查询嵌套深度
   */
  private calculateSubqueryDepth(sql: string): number {
    let depth = 0;
    let maxDepth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];

      // 跟踪字符串，避免在字符串中计算括号
      if (char === '"' || char === "'") {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar && sql[i - 1] !== '\\') {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      if (char === '(') {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else if (char === ')') {
        depth--;
      }
    }

    return maxDepth;
  }

  /**
   * 检测大表全表扫描
   */
  private detectLargeTableScan(sql: string, context: MetadataContext): boolean {
    // 简化检测：如果查询的表行数大于 10 万，且没有 WHERE 子句，视为全表扫描
    const hasWhere = /WHERE/i.test(sql);
    if (hasWhere) {
      return false;
    }

    // 提取查询的表
    const tablePattern = /FROM\s+(?:`([^`]+)`\.)?`([^`]+)`/i;
    const match = tablePattern.exec(sql);
    if (!match) {
      return false;
    }

    const tableName = match[2];
    const table = context.tables.find(t => t.tableName === tableName);

    return (table?.rowCount || 0) > 100000;
  }
}
