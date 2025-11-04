/**
 * SQL 自动修正增强器
 * 自动修正常见的 SQL 错误和问题
 */

import { MetadataContext } from '@/lib/metadata/retrieval/types';

export interface FixResult {
  fixed: boolean;
  originalSQL: string;
  fixedSQL: string;
  appliedFixes: AppliedFix[];
}

export interface AppliedFix {
  type: FixType;
  description: string;
  beforeSnippet: string;
  afterSnippet: string;
}

export type FixType =
  | 'quote_format'           // 反引号格式修正
  | 'limit_addition'          // 添加 LIMIT
  | 'table_name_correction'   // 表名修正
  | 'column_name_correction'  // 字段名修正
  | 'join_type_explicit'      // 明确 JOIN 类型
  | 'syntax_correction'       // 语法修正
  | 'performance_optimization' // 性能优化
  | 'security_fix';           // 安全修复

/**
 * SQL 自动修正器
 */
export class SQLAutoFixer {
  /**
   * 自动修正 SQL
   */
  fix(sql: string, context?: MetadataContext): FixResult {
    const result: FixResult = {
      fixed: false,
      originalSQL: sql,
      fixedSQL: sql,
      appliedFixes: []
    };

    // 应用各种修正规则
    result.fixedSQL = this.fixQuoteFormat(result.fixedSQL, result.appliedFixes, context);
    result.fixedSQL = this.fixSQLServerSyntax(result.fixedSQL, result.appliedFixes);
    result.fixedSQL = this.addMissingLimit(result.fixedSQL, result.appliedFixes);
    result.fixedSQL = this.fixTableNames(result.fixedSQL, result.appliedFixes, context);
    result.fixedSQL = this.makeJoinExplicit(result.fixedSQL, result.appliedFixes);
    result.fixedSQL = this.fixCommonSyntaxErrors(result.fixedSQL, result.appliedFixes);
    result.fixedSQL = this.optimizeWhereClause(result.fixedSQL, result.appliedFixes);

    result.fixed = result.appliedFixes.length > 0;

    return result;
  }

  /**
   * 修正反引号格式
   * 例如：`db.table` -> `db`.`table`
   */
  private fixQuoteFormat(sql: string, appliedFixes: AppliedFix[], context?: MetadataContext): string {
    if (!context) return sql;

    let fixed = sql;

    // 修正 `database.table` 格式
    context.tables.forEach(table => {
      const wrongPattern = new RegExp(`\`${table.databaseName}\\.${table.tableName}\``, 'g');
      const correctFormat = `\`${table.databaseName}\`.\`${table.tableName}\``;

      if (wrongPattern.test(fixed)) {
        appliedFixes.push({
          type: 'quote_format',
          description: '修正反引号格式',
          beforeSnippet: `\`${table.databaseName}.${table.tableName}\``,
          afterSnippet: correctFormat
        });

        fixed = fixed.replace(wrongPattern, correctFormat);
      }
    });

    return fixed;
  }

  /**
   * 修正 SQL Server 语法
   * 例如：SELECT TOP 10 -> SELECT ... LIMIT 10
   */
  private fixSQLServerSyntax(sql: string, appliedFixes: AppliedFix[]): string {
    let fixed = sql;

    // 修正 TOP 语法
    const topPattern = /SELECT\s+TOP\s+(\d+)\s+/i;
    const match = topPattern.exec(fixed);

    if (match) {
      const limit = match[1];
      const before = match[0];
      const after = 'SELECT ';

      // 移除 TOP
      fixed = fixed.replace(topPattern, 'SELECT ');

      // 在末尾添加 LIMIT（如果不存在）
      if (!/LIMIT/i.test(fixed)) {
        fixed += ` LIMIT ${limit}`;
      }

      appliedFixes.push({
        type: 'syntax_correction',
        description: '将 SQL Server 的 TOP 语法转换为 MySQL 的 LIMIT 语法',
        beforeSnippet: `SELECT TOP ${limit}`,
        afterSnippet: `SELECT ... LIMIT ${limit}`
      });
    }

    return fixed;
  }

  /**
   * 添加缺失的 LIMIT
   */
  private addMissingLimit(sql: string, appliedFixes: AppliedFix[]): string {
    // 如果是 SELECT 查询且没有 LIMIT，添加默认 LIMIT
    if (/^SELECT/i.test(sql) && !/LIMIT\s+\d+/i.test(sql)) {
      const defaultLimit = 100;
      const fixed = sql.trim() + ` LIMIT ${defaultLimit}`;

      appliedFixes.push({
        type: 'limit_addition',
        description: '添加默认 LIMIT 以防止返回过多数据',
        beforeSnippet: sql.substring(sql.length - 30),
        afterSnippet: `... LIMIT ${defaultLimit}`
      });

      return fixed;
    }

    return sql;
  }

  /**
   * 修正表名
   */
  private fixTableNames(sql: string, appliedFixes: AppliedFix[], context?: MetadataContext): string {
    if (!context) return sql;

    let fixed = sql;

    // 常见的表名错误模式
    const commonMistakes = [
      // db_table_name -> tb_table_name
      { pattern: /`db_([^`]+)`/, replacement: 'tb_$1', description: '修正表名前缀 db_ -> tb_' }
    ];

    for (const mistake of commonMistakes) {
      const matches = fixed.match(new RegExp(mistake.pattern, 'g'));
      if (matches) {
        for (const match of matches) {
          const tableName = match.replace(/`/g, '');
          const correctedName = tableName.replace(/^db_/, 'tb_');

          // 检查修正后的表名是否在元数据中
          const exists = context.tables.some(t => t.tableName === correctedName);

          if (exists) {
            fixed = fixed.replace(match, `\`${correctedName}\``);

            appliedFixes.push({
              type: 'table_name_correction',
              description: mistake.description,
              beforeSnippet: match,
              afterSnippet: `\`${correctedName}\``
            });
          }
        }
      }
    }

    return fixed;
  }

  /**
   * 明确 JOIN 类型
   */
  private makeJoinExplicit(sql: string, appliedFixes: AppliedFix[]): string {
    let fixed = sql;

    // 将隐式 JOIN 改为 INNER JOIN
    const implicitJoinPattern = /\bJOIN\b(?!\s+(?:INNER|LEFT|RIGHT|FULL|CROSS))/gi;

    if (implicitJoinPattern.test(fixed)) {
      fixed = fixed.replace(implicitJoinPattern, 'INNER JOIN');

      appliedFixes.push({
        type: 'join_type_explicit',
        description: '明确指定 JOIN 类型为 INNER JOIN',
        beforeSnippet: 'JOIN',
        afterSnippet: 'INNER JOIN'
      });
    }

    return fixed;
  }

  /**
   * 修正常见语法错误
   */
  private fixCommonSyntaxErrors(sql: string, appliedFixes: AppliedFix[]): string {
    let fixed = sql;

    // 1. 修正多余的分号
    if (fixed.endsWith(';;')) {
      fixed = fixed.replace(/;+$/, ';');

      appliedFixes.push({
        type: 'syntax_correction',
        description: '移除多余的分号',
        beforeSnippet: ';;',
        afterSnippet: ';'
      });
    }

    // 2. 修正多余的空白
    const beforeTrim = fixed;
    fixed = fixed.replace(/\s+/g, ' ').trim();

    if (beforeTrim !== fixed && beforeTrim.length - fixed.length > 10) {
      appliedFixes.push({
        type: 'syntax_correction',
        description: '规范化空白字符',
        beforeSnippet: '多余的空白',
        afterSnippet: '单个空格'
      });
    }

    // 3. 修正关键字大小写（可选，这里统一为大写）
    const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'GROUP BY', 'ORDER BY', 'LIMIT', 'AS', 'AND', 'OR'];
    for (const keyword of keywords) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'gi');
      fixed = fixed.replace(pattern, keyword);
    }

    return fixed;
  }

  /**
   * 优化 WHERE 子句
   */
  private optimizeWhereClause(sql: string, appliedFixes: AppliedFix[]): string {
    let fixed = sql;

    // 1. 移除无意义的 WHERE 1=1
    if (/WHERE\s+1\s*=\s*1\s*(?:AND|$)/i.test(fixed)) {
      fixed = fixed.replace(/WHERE\s+1\s*=\s*1\s+AND\s+/i, 'WHERE ');
      fixed = fixed.replace(/WHERE\s+1\s*=\s*1\s*$/i, '');

      appliedFixes.push({
        type: 'performance_optimization',
        description: '移除无意义的 WHERE 1=1 条件',
        beforeSnippet: 'WHERE 1=1 AND ...',
        afterSnippet: 'WHERE ...'
      });
    }

    // 2. 移除孤立的占位符
    if (/WHERE\s+\?/i.test(fixed)) {
      fixed = fixed.replace(/WHERE\s+\?/, '');

      appliedFixes.push({
        type: 'syntax_correction',
        description: '移除无效的占位符',
        beforeSnippet: 'WHERE ?',
        afterSnippet: ''
      });
    }

    return fixed;
  }

  /**
   * 安全修复
   */
  private applySecurityFixes(sql: string, appliedFixes: AppliedFix[]): string {
    let fixed = sql;

    // 检测并移除潜在的 SQL 注入代码
    const injectionPatterns = [
      { pattern: /;\s*DROP/i, replacement: '', description: '移除潜在的 DROP 注入' },
      { pattern: /UNION\s+SELECT/i, replacement: '', description: '移除潜在的 UNION 注入' }
    ];

    for (const { pattern, replacement, description } of injectionPatterns) {
      if (pattern.test(fixed)) {
        const before = fixed;
        fixed = fixed.replace(pattern, replacement);

        appliedFixes.push({
          type: 'security_fix',
          description,
          beforeSnippet: before.match(pattern)?.[0] || '注入代码',
          afterSnippet: replacement || '已移除'
        });
      }
    }

    return fixed;
  }

  /**
   * 智能修正（基于元数据）
   */
  smartFix(sql: string, context: MetadataContext): FixResult {
    const result = this.fix(sql, context);

    // 额外的智能修正
    result.fixedSQL = this.inferMissingJoinConditions(result.fixedSQL, result.appliedFixes, context);
    result.fixedSQL = this.suggestIndexedColumns(result.fixedSQL, result.appliedFixes, context);

    result.fixed = result.appliedFixes.length > 0;

    return result;
  }

  /**
   * 推断缺失的 JOIN 条件
   */
  private inferMissingJoinConditions(sql: string, appliedFixes: AppliedFix[], context: MetadataContext): string {
    // 检查 JOIN 是否有 ON 条件
    const joinPattern = /JOIN\s+`([^`]+)`\.`([^`]+)`(?!\s+ON)/i;
    const match = joinPattern.exec(sql);

    if (match && context.relationships) {
      const tableName = match[2];

      // 查找相关的关系
      const relationship = context.relationships.find(r =>
        r.targetTable === tableName || r.sourceTable === tableName
      );

      if (relationship) {
        const onCondition = ` ON ${relationship.sourceTable}.${relationship.sourceColumn} = ${relationship.targetTable}.${relationship.targetColumn}`;
        const fixed = sql.replace(joinPattern, match[0] + onCondition);

        appliedFixes.push({
          type: 'syntax_correction',
          description: '根据元数据推断并添加 JOIN 条件',
          beforeSnippet: `JOIN ${tableName}`,
          afterSnippet: `JOIN ${tableName} ${onCondition}`
        });

        return fixed;
      }
    }

    return sql;
  }

  /**
   * 建议使用索引列
   */
  private suggestIndexedColumns(sql: string, appliedFixes: AppliedFix[], context: MetadataContext): string {
    // 这个方法不直接修改 SQL，而是添加建议
    // 检查 WHERE 子句中的字段是否有索引

    const wherePattern = /WHERE\s+`?(\w+)`?\s*=/i;
    const match = wherePattern.exec(sql);

    if (match) {
      const columnName = match[1];

      // 查找该字段是否为主键或索引
      const table = context.tables[0]; // 简化：假设是第一个表
      if (table) {
        const column = table.columns.find(c => c.columnName === columnName);

        if (column && !column.isPrimaryKey) {
          appliedFixes.push({
            type: 'performance_optimization',
            description: `建议为字段 ${columnName} 添加索引以提高查询性能`,
            beforeSnippet: `WHERE ${columnName} =`,
            afterSnippet: `WHERE ${columnName} = （建议添加索引）`
          });
        }
      }
    }

    return sql;
  }
}
