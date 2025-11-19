/**
 * SQL 列提取器
 *
 * 功能：
 * - 从 SQL 语句中提取使用的列
 * - 支持 SELECT、WHERE、JOIN 等子句
 * - 处理别名和复杂表达式
 */

import { Parser } from 'node-sql-parser';

/**
 * 列信息
 */
export interface ColumnInfo {
  /** 列名 */
  column: string;
  /** 表名（如果可以确定） */
  table?: string;
  /** 数据库名（如果可以确定） */
  database?: string;
  /** 别名（如果有） */
  alias?: string;
  /** 在哪个子句中使用 */
  usedIn: ('SELECT' | 'WHERE' | 'JOIN' | 'ORDER BY' | 'GROUP BY' | 'HAVING')[];
}

/**
 * 列提取器类
 */
export class ColumnExtractor {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * 从 SQL 中提取所有使用的列
   */
  extractColumns(sql: string): ColumnInfo[] {
    try {
      // 解析 SQL
      const ast = this.parser.astify(sql, { database: 'MySQL' });

      // 如果是数组，取第一个查询
      const query = Array.isArray(ast) ? ast[0] : ast;

      const columns: Map<string, ColumnInfo> = new Map();

      // 只处理 SELECT 类型的查询
      if (!query || query.type !== 'select') {
        return [];
      }

      // 提取 SELECT 子句中的列
      if ('columns' in query && query.columns) {
        this.extractFromSelect(query.columns as any, columns);
      }

      // 提取 WHERE 子句中的列
      if ('where' in query && query.where) {
        this.extractFromWhere(query.where as any, columns);
      }

      // 提取 JOIN 子句中的列
      if ('from' in query && query.from) {
        this.extractFromJoin(query.from as any, columns);
      }

      // 提取 ORDER BY 子句中的列
      if ('orderby' in query && query.orderby) {
        this.extractFromOrderBy(query.orderby as any, columns);
      }

      // 提取 GROUP BY 子句中的列
      if ('groupby' in query && query.groupby) {
        this.extractFromGroupBy(query.groupby as any, columns);
      }

      // 提取 HAVING 子句中的列
      if ('having' in query && query.having) {
        this.extractFromHaving(query.having as any, columns);
      }

      return Array.from(columns.values());
    } catch (error) {
      // 解析失败时使用简单正则提取
      console.warn('SQL 解析失败，使用简单提取:', error);
      return this.extractColumnsSimple(sql);
    }
  }

  /**
   * 从 SELECT 子句提取列
   */
  private extractFromSelect(columns: any[], columnMap: Map<string, ColumnInfo>): void {
    for (const col of columns) {
      if (col.expr.type === 'column_ref') {
        const key = this.getColumnKey(col.expr);
        if (!columnMap.has(key)) {
          columnMap.set(key, {
            column: col.expr.column || '*',
            table: col.expr.table,
            database: col.expr.db,
            alias: col.as,
            usedIn: ['SELECT'],
          });
        } else {
          const existing = columnMap.get(key)!;
          if (!existing.usedIn.includes('SELECT')) {
            existing.usedIn.push('SELECT');
          }
        }
      } else if (col.expr.type === 'aggr_func') {
        // 聚合函数中的列
        this.extractFromExpression(col.expr, columnMap, 'SELECT');
      }
    }
  }

  /**
   * 从 WHERE 子句提取列
   */
  private extractFromWhere(where: any, columnMap: Map<string, ColumnInfo>): void {
    this.extractFromExpression(where, columnMap, 'WHERE');
  }

  /**
   * 从 JOIN 子句提取列
   */
  private extractFromJoin(from: any[], columnMap: Map<string, ColumnInfo>): void {
    for (const item of from) {
      if (item.on) {
        this.extractFromExpression(item.on, columnMap, 'JOIN');
      }
    }
  }

  /**
   * 从 ORDER BY 子句提取列
   */
  private extractFromOrderBy(orderby: any[], columnMap: Map<string, ColumnInfo>): void {
    for (const item of orderby) {
      if (item.expr.type === 'column_ref') {
        this.addColumn(item.expr, columnMap, 'ORDER BY');
      }
    }
  }

  /**
   * 从 GROUP BY 子句提取列
   */
  private extractFromGroupBy(groupby: any[] | any, columnMap: Map<string, ColumnInfo>): void {
    // 确保 groupby 是可迭代的
    if (!groupby) return;

    // 如果不是数组，转换为数组
    const items = Array.isArray(groupby) ? groupby : [groupby];

    for (const item of items) {
      if (item && item.type === 'column_ref') {
        this.addColumn(item, columnMap, 'GROUP BY');
      }
    }
  }

  /**
   * 从 HAVING 子句提取列
   */
  private extractFromHaving(having: any, columnMap: Map<string, ColumnInfo>): void {
    this.extractFromExpression(having, columnMap, 'HAVING');
  }

  /**
   * 从表达式中提取列（递归）
   */
  private extractFromExpression(
    expr: any,
    columnMap: Map<string, ColumnInfo>,
    usedIn: ColumnInfo['usedIn'][number]
  ): void {
    if (!expr) return;

    if (expr.type === 'column_ref') {
      this.addColumn(expr, columnMap, usedIn);
    } else if (expr.type === 'binary_expr') {
      this.extractFromExpression(expr.left, columnMap, usedIn);
      this.extractFromExpression(expr.right, columnMap, usedIn);
    } else if (expr.type === 'aggr_func' && expr.args) {
      if (expr.args.expr) {
        this.extractFromExpression(expr.args.expr, columnMap, usedIn);
      }
    } else if (expr.type === 'function' && expr.args) {
      if (Array.isArray(expr.args.value)) {
        for (const arg of expr.args.value) {
          this.extractFromExpression(arg, columnMap, usedIn);
        }
      }
    }
  }

  /**
   * 添加列到映射
   */
  private addColumn(
    col: any,
    columnMap: Map<string, ColumnInfo>,
    usedIn: ColumnInfo['usedIn'][number]
  ): void {
    const key = this.getColumnKey(col);
    if (!columnMap.has(key)) {
      columnMap.set(key, {
        column: col.column || '*',
        table: col.table,
        database: col.db,
        usedIn: [usedIn],
      });
    } else {
      const existing = columnMap.get(key)!;
      if (!existing.usedIn.includes(usedIn)) {
        existing.usedIn.push(usedIn);
      }
    }
  }

  /**
   * 生成列的唯一键
   */
  private getColumnKey(col: any): string {
    const parts = [];
    if (col.db) parts.push(col.db);
    if (col.table) parts.push(col.table);
    parts.push(col.column || '*');
    return parts.join('.');
  }

  /**
   * 简单正则提取（AST 解析失败时的备选方案）
   */
  private extractColumnsSimple(sql: string): ColumnInfo[] {
    const columns: ColumnInfo[] = [];

    // 提取 SELECT 子句
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/is);
    if (selectMatch) {
      const selectClause = selectMatch[1];
      const columnMatches = selectClause.matchAll(/(?:(\w+)\.)?(\w+)(?:\s+AS\s+(\w+))?/gi);
      for (const match of columnMatches) {
        if (match[2] !== '*' && !this.isKeyword(match[2])) {
          columns.push({
            column: match[2],
            table: match[1],
            alias: match[3],
            usedIn: ['SELECT'],
          });
        }
      }
    }

    // 提取 WHERE 子句
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER BY|GROUP BY|LIMIT|$)/is);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const columnMatches = whereClause.matchAll(/(?:(\w+)\.)?(\w+)\s*[=<>!]/gi);
      for (const match of columnMatches) {
        if (!this.isKeyword(match[2])) {
          const existing = columns.find(c => c.column === match[2] && c.table === match[1]);
          if (existing) {
            if (!existing.usedIn.includes('WHERE')) {
              existing.usedIn.push('WHERE');
            }
          } else {
            columns.push({
              column: match[2],
              table: match[1],
              usedIn: ['WHERE'],
            });
          }
        }
      }
    }

    return columns;
  }

  /**
   * 检查是否为 SQL 关键字
   */
  private isKeyword(word: string): boolean {
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE',
      'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT',
      'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER',
    ];
    return keywords.includes(word.toUpperCase());
  }
}

/**
 * 便捷函数：从 SQL 提取列
 */
export function extractColumnsFromSQL(sql: string): ColumnInfo[] {
  const extractor = new ColumnExtractor();
  return extractor.extractColumns(sql);
}
