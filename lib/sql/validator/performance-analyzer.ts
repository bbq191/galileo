/**
 * SQL 性能分析器
 *
 * 负责分析 SQL 查询的性能，提供优化建议
 */

import { Parser } from 'node-sql-parser';
import {
  PerformanceAnalysis,
  ValidationWarning,
  OptimizationSuggestion,
  EstimatedCost,
  TableReference,
} from './types';
import { MetadataContext, TableContext } from '@/lib/metadata/retrieval/types';
import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';

/**
 * 索引信息接口
 */
interface IndexColumnInfo {
  columnName: string;
  seqInIndex: number;
}

interface TableIndexInfo {
  indexName: string;
  isUnique: boolean;
  indexType: string;
  columns: IndexColumnInfo[];
}

export class PerformanceAnalyzer {
  private parser: Parser;
  private prisma: PrismaClient;
  private indexCache: Map<string, TableIndexInfo[]>;

  constructor(prismaInstance?: PrismaClient) {
    this.parser = new Parser();
    this.prisma = prismaInstance || prisma;
    this.indexCache = new Map();
  }

  /**
   * 分析 SQL 性能
   */
  async analyze(
    sql: string,
    context: MetadataContext
  ): Promise<PerformanceAnalysis> {
    const warnings: ValidationWarning[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    try {
      const ast = this.parser.astify(sql, { database: 'MySQL' });

      // 确保 AST 是数组
      const statements = Array.isArray(ast) ? ast : [ast];

      for (const statement of statements) {
        // 1. 检查 SELECT *
        if (this.containsSelectStar(statement)) {
          suggestions.push({
            type: 'select_star',
            message: '建议明确指定需要的列，避免 SELECT *',
            impact: 'medium',
            suggestion: '只查询需要的字段可以减少网络传输和内存占用'
          });
        }

        // 2. 检查缺少 LIMIT
        if (!this.hasLimit(statement) && this.estimateResultSize(context) > 1000) {
          warnings.push({
            type: 'missing_limit',
            message: '查询可能返回大量数据，建议添加 LIMIT',
            severity: 'medium'
          });
        }

        // 3. 检查跨库 JOIN
        const crossDbJoins = this.detectCrossDbJoins(statement, context);
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
        const nonIndexedFilters = await this.checkIndexUsage(statement, context);
        for (const filter of nonIndexedFilters) {
          suggestions.push({
            type: 'missing_index',
            message: `WHERE 条件 '${filter}' 可能未使用索引`,
            impact: 'high',
            suggestion: '建议在该字段上创建索引以提高查询性能'
          });
        }

        // 5. 检查函数使用
        if (this.hasFunctionOnColumn(statement)) {
          suggestions.push({
            type: 'function_on_column',
            message: 'WHERE 子句中对列使用了函数',
            impact: 'high',
            suggestion: '在列上使用函数会导致无法使用索引，建议改写查询条件'
          });
        }

        // 6. 检查子查询
        if (this.hasSubquery(statement)) {
          const subqueryCount = this.countSubqueries(statement);
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
        if (this.hasUnion(statement)) {
          const unionCount = this.countUnions(statement);
          if (unionCount > 3) {
            warnings.push({
              type: 'excessive_unions',
              message: `查询包含 ${unionCount} 个 UNION，可能影响性能`,
              severity: 'medium'
            });
          }

          // 检查是否应该使用 UNION ALL
          if (!this.usesUnionAll(statement)) {
            suggestions.push({
              type: 'union_all',
              message: '如果不需要去重，建议使用 UNION ALL 替代 UNION',
              impact: 'medium',
              suggestion: 'UNION 会执行去重操作，UNION ALL 性能更好'
            });
          }
        }

        // 8. 检查 DISTINCT
        if (this.hasDistinct(statement)) {
          suggestions.push({
            type: 'distinct_usage',
            message: '使用了 DISTINCT，可能影响性能',
            impact: 'medium',
            suggestion: '考虑是否可以通过 GROUP BY 或优化查询逻辑避免使用 DISTINCT'
          });
        }

        // 9. 检查 OR 条件
        if (this.hasOrCondition(statement)) {
          suggestions.push({
            type: 'or_condition',
            message: 'WHERE 子句包含 OR 条件，可能无法有效使用索引',
            impact: 'medium',
            suggestion: '考虑将 OR 改写为 UNION，或使用 IN 替代多个 OR'
          });
        }

        // 10. 检查 NOT IN
        if (this.hasNotIn(statement)) {
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

        // 11. 检查排序字段
        if (statement.orderby) {
          const orderByColumns = this.extractOrderByColumns(statement);
          for (const col of orderByColumns) {
            const table = context.tables.find(t =>
              t.tableName === col.table || (!col.table && context.tables.length === 1)
            );

            if (table) {
              const indexes = await this.getTableIndexes(table.databaseName, table.tableName);
              if (!this.columnHasIndex(col.name, indexes)) {
                suggestions.push({
                  type: 'orderby_index',
                  message: `ORDER BY 列 '${col.name}' 可能未使用索引`,
                  impact: 'medium',
                  suggestion: '在排序字段上创建索引可以提高排序性能'
                });
              }
            }
          }
        }

        // 12. 检查 GROUP BY 字段
        if (statement.groupby) {
          const groupByColumns = this.extractGroupByColumns(statement);
          for (const col of groupByColumns) {
            const table = context.tables.find(t =>
              t.tableName === col.table || (!col.table && context.tables.length === 1)
            );

            if (table) {
              const indexes = await this.getTableIndexes(table.databaseName, table.tableName);
              if (!this.columnHasIndex(col.name, indexes)) {
                suggestions.push({
                  type: 'groupby_index',
                  message: `GROUP BY 列 '${col.name}' 可能未使用索引`,
                  impact: 'medium',
                  suggestion: '在分组字段上创建索引可以提高分组性能'
                });
              }
            }
          }
        }
      }

      // 13. 估算查询成本
      const estimatedCost = await this.estimateCost(statements[0], context);

      return {
        warnings,
        suggestions,
        estimatedCost
      };
    } catch (error) {
      // 如果解析失败，返回基本分析结果
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
   * 检查是否包含 SELECT *
   */
  private containsSelectStar(ast: any): boolean {
    if (ast.type !== 'select') return false;

    return ast.columns?.some((col: any) => col.expr?.type === 'column_ref' && col.expr?.column === '*');
  }

  /**
   * 检查是否有 LIMIT
   */
  private hasLimit(ast: any): boolean {
    return ast.limit !== null && ast.limit !== undefined;
  }

  /**
   * 估算结果集大小
   */
  private estimateResultSize(context: MetadataContext): number {
    if (context.tables.length === 0) return 0;

    // 简单估算：取最大表的行数（将 BigInt 转换为 Number）
    return Math.max(...context.tables.map(t => t.rowCount ? Number(t.rowCount) : 1000));
  }

  /**
   * 检测跨库 JOIN 数量
   */
  private detectCrossDbJoins(ast: any, context: MetadataContext): number {
    if (ast.type !== 'select' || !ast.from) return 0;

    const tables = this.extractTablesFromAST(ast);
    let count = 0;

    // 构建表名到数据库的映射
    const tableDbMap = new Map<string, string>();
    for (const table of context.tables) {
      tableDbMap.set(table.tableName, table.databaseName);
    }

    // 检查相邻表是否在不同数据库
    for (let i = 0; i < tables.length - 1; i++) {
      const db1 = tables[i].database || tableDbMap.get(tables[i].name);
      const db2 = tables[i + 1].database || tableDbMap.get(tables[i + 1].name);

      if (db1 && db2 && db1 !== db2) {
        count++;
      }
    }

    return count;
  }

  /**
   * 从 AST 中提取表引用
   */
  private extractTablesFromAST(ast: any): TableReference[] {
    const tables: TableReference[] = [];

    if (!ast.from) return tables;

    const fromList = Array.isArray(ast.from) ? ast.from : [ast.from];

    for (const from of fromList) {
      if (from.table) {
        tables.push({
          database: from.db,
          name: from.table,
          alias: from.as
        });
      }

      // 处理 JOIN
      if (from.join) {
        const joinTable = from.join;
        tables.push({
          database: joinTable.db,
          name: joinTable.table,
          alias: joinTable.as
        });
      }
    }

    return tables;
  }

  /**
   * 获取表的索引信息
   */
  private async getTableIndexes(databaseName: string, tableName: string): Promise<TableIndexInfo[]> {
    const cacheKey = `${databaseName}.${tableName}`;

    // 检查缓存
    if (this.indexCache.has(cacheKey)) {
      return this.indexCache.get(cacheKey)!;
    }

    try {
      // 从数据库获取表ID
      const table = await this.prisma.tableMeta.findFirst({
        where: {
          tableName,
          database: {
            databaseName
          }
        },
        include: {
          database: true
        }
      });

      if (!table) {
        return [];
      }

      // 查询索引信息（通过原始 SQL，因为 Prisma schema 中没有索引表）
      const indexes = await this.prisma.$queryRaw<any[]>`
        SELECT
          si.INDEX_NAME as indexName,
          si.NON_UNIQUE = 0 as isUnique,
          si.INDEX_TYPE as indexType,
          si.COLUMN_NAME as columnName,
          si.SEQ_IN_INDEX as seqInIndex
        FROM INFORMATION_SCHEMA.STATISTICS si
        JOIN databases_meta dm ON dm.database_name = si.TABLE_SCHEMA
        JOIN tables_meta tm ON tm.database_id = dm.id AND tm.table_name = si.TABLE_NAME
        WHERE si.TABLE_SCHEMA = ${databaseName}
          AND si.TABLE_NAME = ${tableName}
        ORDER BY si.INDEX_NAME, si.SEQ_IN_INDEX
      `;

      // 聚合索引信息
      const indexMap = new Map<string, TableIndexInfo>();

      for (const row of indexes) {
        if (!indexMap.has(row.indexName)) {
          indexMap.set(row.indexName, {
            indexName: row.indexName,
            isUnique: Boolean(row.isUnique),
            indexType: row.indexType,
            columns: []
          });
        }

        const index = indexMap.get(row.indexName)!;
        index.columns.push({
          columnName: row.columnName,
          seqInIndex: row.seqInIndex
        });
      }

      const result = Array.from(indexMap.values());

      // 缓存结果
      this.indexCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error(`Failed to get indexes for ${databaseName}.${tableName}:`, error);
      return [];
    }
  }

  /**
   * 检查列是否有索引
   */
  private columnHasIndex(columnName: string, indexes: TableIndexInfo[]): boolean {
    // 检查列是否是任何索引的第一列（最有效的情况）
    return indexes.some(index =>
      index.columns.length > 0 &&
      index.columns[0].columnName === columnName
    );
  }

  /**
   * 检查索引使用情况
   */
  private async checkIndexUsage(ast: any, context: MetadataContext): Promise<string[]> {
    const nonIndexedFilters: string[] = [];

    if (ast.type !== 'select' || !ast.where) return nonIndexedFilters;

    // 提取 WHERE 条件中的列
    const whereColumns = this.extractColumnsFromWhere(ast.where);

    for (const col of whereColumns) {
      // 查找对应的表
      const table = context.tables.find(t =>
        t.tableName === col.table || t.tableName === col.table?.split('.').pop()
      );

      if (table) {
        // 检查该列是否是主键
        const column = table.columns.find(c => c.columnName === col.name);
        if (column && column.isPrimaryKey) {
          continue; // 主键自动有索引
        }

        // 获取表的索引信息
        const indexes = await this.getTableIndexes(table.databaseName, table.tableName);

        // 检查该列是否有索引
        if (!this.columnHasIndex(col.name, indexes)) {
          nonIndexedFilters.push(`${col.table ? col.table + '.' : ''}${col.name}`);
        }
      }
    }

    return nonIndexedFilters;
  }

  /**
   * 从 WHERE 子句提取列引用
   */
  private extractColumnsFromWhere(where: any): Array<{ table?: string; name: string }> {
    const columns: Array<{ table?: string; name: string }> = [];

    const traverse = (node: any) => {
      if (!node) return;

      if (node.type === 'column_ref') {
        const col = node.column;
        if (typeof col === 'string') {
          columns.push({ name: col });
        } else if (col && typeof col === 'object') {
          // 处理 table.column 格式
          columns.push({
            table: node.table,
            name: col.column || col
          });
        }
      }

      // 递归处理二元表达式
      if (node.left) traverse(node.left);
      if (node.right) traverse(node.right);
    };

    traverse(where);
    return columns;
  }

  /**
   * 检查 WHERE 子句中是否对列使用了函数
   */
  private hasFunctionOnColumn(ast: any): boolean {
    if (ast.type !== 'select' || !ast.where) return false;

    const hasFuncOnCol = (node: any): boolean => {
      if (!node) return false;

      // 检查是否是函数调用，且参数是列引用
      if (node.type === 'function' && node.args && Array.isArray(node.args)) {
        const hasColumnArg = node.args.some((arg: any) =>
          arg.type === 'column_ref'
        );
        if (hasColumnArg) return true;
      }

      // 递归检查
      if (node.left && hasFuncOnCol(node.left)) return true;
      if (node.right && hasFuncOnCol(node.right)) return true;

      return false;
    };

    return hasFuncOnCol(ast.where);
  }

  /**
   * 估算查询成本
   */
  private async estimateCost(ast: any, context: MetadataContext): Promise<EstimatedCost> {
    let complexity: 'low' | 'medium' | 'high' = 'low';
    let estimatedRowsScanned = 0;

    const tables = this.extractTablesFromAST(ast);

    for (const table of tables) {
      const tableMeta = context.tables.find(t =>
        t.tableName === table.name ||
        (table.database && t.databaseName === table.database && t.tableName === table.name)
      );

      if (tableMeta) {
        // 将 BigInt 转换为 Number 以避免类型混合错误
        const rowCount = tableMeta.rowCount ? Number(tableMeta.rowCount) : 1000;
        estimatedRowsScanned += rowCount;
      }
    }

    // 根据扫描行数判断复杂度
    if (estimatedRowsScanned > 1000000) {
      complexity = 'high';
    } else if (estimatedRowsScanned > 10000) {
      complexity = 'medium';
    }

    // 跨库 JOIN 增加复杂度
    if (this.detectCrossDbJoins(ast, context) > 0) {
      complexity = complexity === 'low' ? 'medium' : 'high';
    }

    return {
      complexity,
      rowsScanned: estimatedRowsScanned,
      executionTimeMs: this.estimateExecutionTime(complexity, estimatedRowsScanned)
    };
  }

  /**
   * 估算执行时间
   */
  private estimateExecutionTime(complexity: string, rowsScanned: number): number {
    const baseTime = {
      low: 10,
      medium: 100,
      high: 1000
    }[complexity] || 100;

    // 每 1000 行增加 1ms
    return baseTime + (rowsScanned / 1000);
  }

  /**
   * 检查是否有子查询
   */
  private hasSubquery(ast: any): boolean {
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
  private countSubqueries(ast: any, count = 0): number {
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
   * 检查是否有 UNION
   */
  private hasUnion(ast: any): boolean {
    return ast.union !== undefined && ast.union !== null;
  }

  /**
   * 统计 UNION 数量
   */
  private countUnions(ast: any): number {
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
  private usesUnionAll(ast: any): boolean {
    // node-sql-parser 中 UNION ALL 会设置 union_all 属性
    return ast._next === 'union all' || ast.union_type === 'all';
  }

  /**
   * 检查是否有 DISTINCT
   */
  private hasDistinct(ast: any): boolean {
    return ast.distinct === 'DISTINCT' || ast.distinct === true;
  }

  /**
   * 检查是否有 OR 条件
   */
  private hasOrCondition(ast: any): boolean {
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
  private hasNotIn(ast: any): boolean {
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
   * 提取 ORDER BY 列
   */
  private extractOrderByColumns(ast: any): Array<{ table?: string; name: string }> {
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
  private extractGroupByColumns(ast: any): Array<{ table?: string; name: string }> {
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
   * 清理缓存
   */
  public clearCache(): void {
    this.indexCache.clear();
  }
}
