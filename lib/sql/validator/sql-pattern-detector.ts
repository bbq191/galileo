/**
 * SQL 模式检测器
 * 负责检测 SQL 中的各种模式（SELECT *, LIMIT, DISTINCT, OR, NOT IN, UNION, 子查询等）
 */

import { Parser } from 'node-sql-parser';

export class SQLPatternDetector {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * 检查是否包含 SELECT *
   */
  containsSelectStar(ast: any): boolean {
    if (ast.type !== 'select') return false;
    return ast.columns?.some((col: any) => col.expr?.type === 'column_ref' && col.expr?.column === '*');
  }

  /**
   * 检查是否有 LIMIT
   */
  hasLimit(ast: any): boolean {
    return ast.limit !== null && ast.limit !== undefined;
  }

  /**
   * 检查是否有 DISTINCT
   */
  hasDistinct(ast: any): boolean {
    return ast.distinct === 'DISTINCT' || ast.distinct === true;
  }

  /**
   * 检查是否有 OR 条件
   */
  hasOrCondition(ast: any): boolean {
    if (!ast.where) return false;

    const checkOr = (node: any): boolean => {
      if (!node) return false;

      if (node.type === 'binary_expr' && node.operator === 'OR') {
        return true;
      }

      if (node.left && checkOr(node.left)) return true;
      if (node.right && checkOr(node.right)) return true;

      return false;
    };

    return checkOr(ast.where);
  }

  /**
   * 检查是否有 NOT IN
   */
  hasNotIn(ast: any): boolean {
    if (!ast.where) return false;

    const checkNotIn = (node: any): boolean => {
      if (!node) return false;

      if (node.type === 'binary_expr' && node.operator === 'NOT IN') {
        return true;
      }

      if (node.left && checkNotIn(node.left)) return true;
      if (node.right && checkNotIn(node.right)) return true;

      return false;
    };

    return checkNotIn(ast.where);
  }

  /**
   * 检查是否有 UNION
   */
  hasUnion(ast: any): boolean {
    return ast.union !== undefined && ast.union !== null;
  }

  /**
   * 统计 UNION 数量
   */
  countUnions(ast: any): number {
    let count = 0;
    let current = ast;

    while (current && current.union) {
      count++;
      current = current.union;
    }

    return count;
  }

  /**
   * 检查是否使用 UNION ALL
   */
  usesUnionAll(ast: any): boolean {
    return ast._next === 'union all' || ast.union_type === 'all';
  }

  /**
   * 检查 WHERE 子句中是否对列使用了函数
   */
  hasFunctionOnColumn(ast: any): boolean {
    if (ast.type !== 'select' || !ast.where) return false;

    const hasFuncOnCol = (node: any): boolean => {
      if (!node) return false;

      if (node.type === 'function' && node.args && Array.isArray(node.args)) {
        const hasColumnArg = node.args.some((arg: any) =>
          arg.type === 'column_ref'
        );
        if (hasColumnArg) return true;
      }

      if (node.left && hasFuncOnCol(node.left)) return true;
      if (node.right && hasFuncOnCol(node.right)) return true;

      return false;
    };

    return hasFuncOnCol(ast.where);
  }

  /**
   * 检查是否有子查询
   */
  hasSubquery(ast: any): boolean {
    const checkNode = (node: any): boolean => {
      if (!node) return false;

      // 检查 FROM 子句中的子查询
      if (node.from) {
        const fromList = Array.isArray(node.from) ? node.from : [node.from];
        for (const from of fromList) {
          if (from.expr && from.expr.type === 'select') {
            return true;
          }
        }
      }

      // 检查 WHERE 子句中的子查询
      if (node.where && this.containsSubquery(node.where)) {
        return true;
      }

      // 检查 SELECT 列中的子查询
      if (node.columns) {
        for (const col of node.columns) {
          if (col.expr && col.expr.type === 'select') {
            return true;
          }
        }
      }

      return false;
    };

    return checkNode(ast);
  }

  /**
   * 递归检查节点是否包含子查询
   */
  private containsSubquery(node: any): boolean {
    if (!node) return false;

    if (node.type === 'select') return true;

    if (node.left && this.containsSubquery(node.left)) return true;
    if (node.right && this.containsSubquery(node.right)) return true;

    return false;
  }

  /**
   * 统计子查询数量
   */
  countSubqueries(ast: any): number {
    const traverse = (node: any): number => {
      if (!node) return 0;

      let localCount = 0;

      // 检查 FROM 子句
      if (node.from) {
        const fromList = Array.isArray(node.from) ? node.from : [node.from];
        for (const from of fromList) {
          if (from.expr && from.expr.type === 'select') {
            localCount++;
            localCount += traverse(from.expr);
          }
        }
      }

      // 检查 WHERE 子句
      if (node.where) {
        localCount += this.countSubqueriesInExpression(node.where);
      }

      // 检查 SELECT 列
      if (node.columns) {
        for (const col of node.columns) {
          if (col.expr && col.expr.type === 'select') {
            localCount++;
            localCount += traverse(col.expr);
          }
        }
      }

      return localCount;
    };

    return traverse(ast);
  }

  /**
   * 在表达式中统计子查询
   */
  private countSubqueriesInExpression(expr: any): number {
    if (!expr) return 0;

    let count = 0;

    if (expr.type === 'select') {
      count++;
      count += this.countSubqueries(expr);
    }

    if (expr.left) count += this.countSubqueriesInExpression(expr.left);
    if (expr.right) count += this.countSubqueriesInExpression(expr.right);

    return count;
  }

  /**
   * 提取 ORDER BY 列
   */
  extractOrderByColumns(ast: any): Array<{ table?: string; name: string }> {
    const columns: Array<{ table?: string; name: string }> = [];

    if (!ast.orderby) return columns;

    const orderByList = Array.isArray(ast.orderby) ? ast.orderby : [ast.orderby];

    for (const orderBy of orderByList) {
      if (orderBy.expr && orderBy.expr.type === 'column_ref') {
        const col = orderBy.expr.column;
        if (typeof col === 'string') {
          columns.push({ name: col });
        } else if (col && typeof col === 'object') {
          columns.push({
            table: orderBy.expr.table,
            name: col.column || col
          });
        }
      }
    }

    return columns;
  }

  /**
   * 提取 GROUP BY 列
   */
  extractGroupByColumns(ast: any): Array<{ table?: string; name: string }> {
    const columns: Array<{ table?: string; name: string }> = [];

    if (!ast.groupby) return columns;

    const groupByList = Array.isArray(ast.groupby) ? ast.groupby : [ast.groupby];

    for (const groupBy of groupByList) {
      if (groupBy.type === 'column_ref') {
        const col = groupBy.column;
        if (typeof col === 'string') {
          columns.push({ name: col });
        } else if (col && typeof col === 'object') {
          columns.push({
            table: groupBy.table,
            name: col.column || col
          });
        }
      }
    }

    return columns;
  }

  /**
   * 从 WHERE 子句提取列引用
   */
  extractColumnsFromWhere(where: any): Array<{ table?: string; name: string }> {
    const columns: Array<{ table?: string; name: string }> = [];

    const traverse = (node: any) => {
      if (!node) return;

      if (node.type === 'column_ref') {
        const col = node.column;
        if (typeof col === 'string') {
          columns.push({ name: col });
        } else if (col && typeof col === 'object') {
          columns.push({
            table: node.table,
            name: col.column || col
          });
        }
      }

      if (node.left) traverse(node.left);
      if (node.right) traverse(node.right);
    };

    traverse(where);
    return columns;
  }
}
