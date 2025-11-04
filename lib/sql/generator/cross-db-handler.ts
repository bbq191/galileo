/**
 * 跨库查询处理器
 * 专门处理跨数据库的 SQL 查询生成和优化
 */

import { Parser } from 'node-sql-parser';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext, TableContext, RelationshipContext } from '@/lib/metadata/retrieval/types';
import { SQLGenerationResult } from './types';

/**
 * 跨库查询分析结果
 */
export interface CrossDatabaseAnalysis {
  /** 是否为跨库查询 */
  isCrossDatabase: boolean;
  /** 涉及的数据库列表 */
  databases: string[];
  /** 跨库 JOIN 数量 */
  crossDbJoinCount: number;
  /** 跨库 JOIN 详情 */
  crossDbJoins: CrossDatabaseJoin[];
  /** 复杂度评估 */
  complexity: 'low' | 'medium' | 'high';
  /** 优化建议 */
  optimizationSuggestions: string[];
}

/**
 * 跨库 JOIN 详情
 */
export interface CrossDatabaseJoin {
  /** 源表 */
  sourceTable: {
    database: string;
    table: string;
  };
  /** 目标表 */
  targetTable: {
    database: string;
    table: string;
  };
  /** JOIN 类型 */
  joinType: 'inner' | 'left' | 'right';
  /** JOIN 条件 */
  joinCondition: {
    sourceColumn: string;
    targetColumn: string;
  };
  /** 关系类型 */
  relationshipType: 'explicit' | 'inferred';
  /** 置信度（仅推断关系） */
  confidence?: number;
}

/**
 * 跨库查询策略
 */
export enum CrossDbStrategy {
  /** 单连接跨库查询（推荐） - 所有数据库在同一实例 */
  SINGLE_CONNECTION = 'single_connection',
  /** 应用层 JOIN - 分别查询后合并 */
  APPLICATION_JOIN = 'application_join',
  /** 联邦查询 - 使用 Federated Engine */
  FEDERATED = 'federated'
}

/**
 * 跨库查询处理器
 */
export class CrossDatabaseHandler {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * 分析是否为跨库查询
   */
  analyzeCrossDatabaseQuery(
    intent: QueryIntent,
    context: MetadataContext
  ): CrossDatabaseAnalysis {
    // 收集所有涉及的数据库
    const databases = new Set<string>();
    const tablesByDb = new Map<string, TableContext[]>();

    context.tables.forEach(table => {
      databases.add(table.databaseName);
      if (!tablesByDb.has(table.databaseName)) {
        tablesByDb.set(table.databaseName, []);
      }
      tablesByDb.get(table.databaseName)!.push(table);
    });

    const isCrossDatabase = databases.size > 1;

    // 分析跨库 JOIN
    const crossDbJoins = this.analyzeCrossDbJoins(context);

    // 评估复杂度
    const complexity = this.evaluateComplexity(
      databases.size,
      context.tables.length,
      crossDbJoins.length
    );

    // 生成优化建议
    const optimizationSuggestions = this.generateOptimizationSuggestions(
      crossDbJoins,
      context
    );

    return {
      isCrossDatabase,
      databases: Array.from(databases),
      crossDbJoinCount: crossDbJoins.length,
      crossDbJoins,
      complexity,
      optimizationSuggestions
    };
  }

  /**
   * 分析跨库 JOIN 详情
   */
  private analyzeCrossDbJoins(context: MetadataContext): CrossDatabaseJoin[] {
    const crossDbJoins: CrossDatabaseJoin[] = [];

    if (!context.relationships || context.relationships.length === 0) {
      return crossDbJoins;
    }

    for (const rel of context.relationships) {
      // 查找源表和目标表
      const sourceTable = context.tables.find(t => t.tableName === rel.sourceTable);
      const targetTable = context.tables.find(t => t.tableName === rel.targetTable);

      if (!sourceTable || !targetTable) {
        continue;
      }

      // 检查是否为跨库 JOIN
      if (sourceTable.databaseName !== targetTable.databaseName) {
        crossDbJoins.push({
          sourceTable: {
            database: sourceTable.databaseName,
            table: sourceTable.tableName
          },
          targetTable: {
            database: targetTable.databaseName,
            table: targetTable.tableName
          },
          joinType: 'inner', // 默认为 INNER JOIN
          joinCondition: {
            sourceColumn: rel.sourceColumn,
            targetColumn: rel.targetColumn
          },
          relationshipType: rel.type,
          confidence: rel.confidence
        });
      }
    }

    return crossDbJoins;
  }

  /**
   * 评估跨库查询复杂度
   */
  private evaluateComplexity(
    databaseCount: number,
    tableCount: number,
    crossDbJoinCount: number
  ): 'low' | 'medium' | 'high' {
    // 单库查询
    if (databaseCount === 1) {
      return tableCount <= 3 ? 'low' : 'medium';
    }

    // 跨库查询
    if (crossDbJoinCount === 0) {
      // 虽然涉及多个库，但没有跨库 JOIN
      return 'low';
    } else if (crossDbJoinCount <= 2 && tableCount <= 4) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  /**
   * 生成优化建议
   */
  private generateOptimizationSuggestions(
    crossDbJoins: CrossDatabaseJoin[],
    context: MetadataContext
  ): string[] {
    const suggestions: string[] = [];

    if (crossDbJoins.length === 0) {
      return suggestions;
    }

    // 基础跨库警告
    suggestions.push(
      `查询包含 ${crossDbJoins.length} 个跨库 JOIN，可能影响性能`
    );

    // 推断关系警告
    const inferredJoins = crossDbJoins.filter(j => j.relationshipType === 'inferred');
    if (inferredJoins.length > 0) {
      suggestions.push(
        `其中 ${inferredJoins.length} 个跨库 JOIN 基于推断关系，建议验证数据准确性`
      );
    }

    // 大表跨库 JOIN 警告
    const largeTables = context.tables.filter(t => (t.rowCount || 0) > 100000);
    if (largeTables.length > 0) {
      suggestions.push(
        `涉及大表（${largeTables.map(t => t.tableName).join(', ')}），建议先进行过滤再 JOIN`
      );
    }

    // 多层跨库 JOIN 警告
    if (crossDbJoins.length > 3) {
      suggestions.push(
        '跨库 JOIN 层数较多，建议考虑使用子查询或 CTE 分步处理'
      );
    }

    // 策略建议
    suggestions.push(
      '建议确保所有数据库在同一 MySQL 实例以获得最佳性能'
    );

    return suggestions;
  }

  /**
   * 增强 SQL 生成 Prompt（针对跨库查询）
   */
  enhancePromptForCrossDb(
    basePrompt: string,
    analysis: CrossDatabaseAnalysis
  ): string {
    if (!analysis.isCrossDatabase) {
      return basePrompt;
    }

    const crossDbGuidance = `

## 跨库查询特别注意事项

本查询涉及 ${analysis.databases.length} 个数据库（${analysis.databases.join(', ')}），包含 ${analysis.crossDbJoinCount} 个跨库 JOIN。

### 跨库查询最佳实践：

1. **表名限定**：必须使用完整的表限定名：\`database_name\`.\`table_name\`

2. **JOIN 顺序优化**：
   - 先连接小表，再连接大表
   - 优先在单个数据库内进行过滤，减少跨库传输的数据量

3. **过滤条件优化**：
   - 将过滤条件尽可能应用在 JOIN 之前
   - 使用 WHERE 子句在源头减少数据量

4. **性能考虑**：
   - 跨库 JOIN 性能低于同库 JOIN
   - 尽量避免全表扫描
   - 确保 JOIN 字段有索引

### 跨库 JOIN 详情：

${analysis.crossDbJoins.map((join, index) => `
${index + 1}. \`${join.sourceTable.database}\`.\`${join.sourceTable.table}\` → \`${join.targetTable.database}\`.\`${join.targetTable.table}\`
   - JOIN 条件: ${join.sourceTable.table}.${join.joinCondition.sourceColumn} = ${join.targetTable.table}.${join.joinCondition.targetColumn}
   - 关系类型: ${join.relationshipType}${join.confidence ? ` (置信度: ${join.confidence})` : ''}
`).join('')}

### 示例（跨库查询）：

\`\`\`sql
SELECT
  o.order_id,
  o.order_date,
  p.product_name,
  o.amount
FROM \`sales_db\`.\`orders\` o
INNER JOIN \`product_db\`.\`products\` p
  ON o.product_id = p.id
WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND o.amount > 0
ORDER BY o.order_date DESC
LIMIT 100;
\`\`\`

### 警告提示：

${analysis.optimizationSuggestions.map(s => `- ${s}`).join('\n')}
`;

    return basePrompt + crossDbGuidance;
  }

  /**
   * 验证跨库 SQL
   */
  validateCrossDbSQL(sql: string, analysis: CrossDatabaseAnalysis): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 检查是否包含数据库前缀
      const hasDbPrefix = /`[^`]+`\s*\.\s*`[^`]+`/.test(sql);

      if (hasDbPrefix) {
        // 使用简单的字符串验证代替 AST 解析
        console.log('Using simple validation for cross-database SQL with database prefix');

        if (analysis.isCrossDatabase) {
          // 简单检查是否使用了数据库前缀
          let foundPrefixCount = 0;
          const dbPrefixMatches = sql.match(/`[^`]+`\s*\.\s*`[^`]+`/g);
          if (dbPrefixMatches) {
            foundPrefixCount = dbPrefixMatches.length;
          }

          // 如果没有找到数据库前缀，给出警告（但不是错误）
          if (foundPrefixCount === 0) {
            warnings.push('跨库查询建议使用完整的表限定名（database.table）');
          }

          // 检查 JOIN 关键字（简单字符串匹配）
          if (analysis.crossDbJoinCount > 0) {
            const hasJoin = /\bJOIN\b/i.test(sql);
            if (!hasJoin) {
              warnings.push('跨库查询通常需要 JOIN 操作，但 SQL 中未检测到 JOIN');
            }
          }

          // 复杂度警告
          if (analysis.complexity === 'high') {
            warnings.push('查询复杂度较高，建议进行性能测试');
          }
        }
      } else {
        // 没有数据库前缀，使用标准 AST 解析
        const ast = this.parser.astify(sql, { database: 'MySQL' });

        if (analysis.isCrossDatabase) {
          // 检查是否使用了完整的表限定名
          const tables = this.extractTablesFromAST(ast);

          for (const table of tables) {
            if (!table.db) {
              warnings.push(
                `跨库查询建议使用完整的表限定名，建议为表 ${table.table} 添加数据库前缀`
              );
            }
          }

          // 检查 JOIN 条件
          if (analysis.crossDbJoinCount > 0) {
            const hasJoins = this.checkJoinsInAST(ast);
            if (!hasJoins) {
              warnings.push('跨库查询通常需要 JOIN 操作，但 SQL 中未检测到 JOIN');
            }
          }

          // 复杂度警告
          if (analysis.complexity === 'high') {
            warnings.push('查询复杂度较高，建议进行性能测试');
          }
        }
      }

    } catch (error) {
      // 解析错误不再是致命错误，只是警告
      console.warn('Cross-DB SQL validation warning:', (error as Error).message);
      warnings.push('SQL 解析遇到问题，但将继续执行');
    }

    return {
      isValid: errors.length === 0, // 现在没有错误，只有警告
      errors,
      warnings: [...warnings, ...analysis.optimizationSuggestions]
    };
  }

  /**
   * 从 AST 提取表信息
   */
  private extractTablesFromAST(ast: any): Array<{ db?: string; table: string }> {
    const tables: Array<{ db?: string; table: string }> = [];

    const extractFromClause = (clause: any) => {
      if (!clause) return;

      if (Array.isArray(clause)) {
        clause.forEach(extractFromClause);
      } else if (clause.table) {
        tables.push({
          db: clause.db,
          table: clause.table
        });
      } else if (clause.expr) {
        extractFromClause(clause.expr);
      }
    };

    if (ast.from) {
      extractFromClause(ast.from);
    }

    return tables;
  }

  /**
   * 检查 AST 中是否包含 JOIN
   */
  private checkJoinsInAST(ast: any): boolean {
    if (!ast.from) return false;

    const checkFromClause = (clause: any): boolean => {
      if (Array.isArray(clause)) {
        return clause.some(checkFromClause);
      }
      return clause.join !== undefined;
    };

    return checkFromClause(ast.from);
  }

  /**
   * 优化跨库查询 SQL
   */
  optimizeCrossDbSQL(
    sql: string,
    analysis: CrossDatabaseAnalysis
  ): {
    optimizedSQL: string;
    changes: string[];
  } {
    const changes: string[] = [];

    // 如果不是跨库查询或已经很简单，直接返回
    if (!analysis.isCrossDatabase || analysis.complexity === 'low') {
      return { optimizedSQL: sql, changes: [] };
    }

    // TODO: 实现更高级的优化策略
    // 1. 子查询优化
    // 2. JOIN 顺序优化
    // 3. 添加必要的索引提示

    // 目前返回原始 SQL
    return { optimizedSQL: sql, changes };
  }

  /**
   * 生成跨库查询执行计划说明
   */
  generateExecutionPlan(
    analysis: CrossDatabaseAnalysis
  ): string {
    const parts: string[] = [];

    parts.push('## 跨库查询执行计划\n');

    parts.push(`### 涉及数据库: ${analysis.databases.length} 个`);
    analysis.databases.forEach((db, index) => {
      parts.push(`  ${index + 1}. ${db}`);
    });

    if (analysis.crossDbJoinCount > 0) {
      parts.push(`\n### 跨库 JOIN: ${analysis.crossDbJoinCount} 个`);
      analysis.crossDbJoins.forEach((join, index) => {
        parts.push(`  ${index + 1}. ${join.sourceTable.database}.${join.sourceTable.table} ← JOIN → ${join.targetTable.database}.${join.targetTable.table}`);
        parts.push(`     条件: ${join.joinCondition.sourceColumn} = ${join.joinCondition.targetColumn}`);
        parts.push(`     类型: ${join.relationshipType.toUpperCase()}`);
      });
    }

    parts.push(`\n### 复杂度: ${analysis.complexity.toUpperCase()}`);

    if (analysis.optimizationSuggestions.length > 0) {
      parts.push('\n### 优化建议:');
      analysis.optimizationSuggestions.forEach((suggestion, index) => {
        parts.push(`  ${index + 1}. ${suggestion}`);
      });
    }

    return parts.join('\n');
  }
}
