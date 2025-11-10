/**
 * 查询成本估算器
 * 负责估算 SQL 查询的执行成本
 */

import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { EstimatedCost, TableReference } from './types';

export class QueryCostEstimator {
  /**
   * 估算查询成本
   */
  async estimateCost(
    ast: any,
    context: MetadataContext,
    crossDbJoinCount: number
  ): Promise<EstimatedCost> {
    let complexity: 'low' | 'medium' | 'high' = 'low';
    let estimatedRowsScanned = 0;

    const tables = this.extractTablesFromAST(ast);

    for (const table of tables) {
      const tableMeta = context.tables.find(t =>
        t.tableName === table.name ||
        (table.database && t.databaseName === table.database && t.tableName === table.name)
      );

      if (tableMeta) {
        // 将 BigInt 转换为 Number
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
    if (crossDbJoinCount > 0) {
      complexity = complexity === 'low' ? 'medium' : 'high';
    }

    return {
      complexity,
      rowsScanned: estimatedRowsScanned,
      executionTimeMs: this.estimateExecutionTime(complexity, estimatedRowsScanned)
    };
  }

  /**
   * 估算结果集大小
   */
  estimateResultSize(context: MetadataContext): number {
    if (context.tables.length === 0) return 0;

    // 简单估算：取最大表的行数
    return Math.max(...context.tables.map(t => t.rowCount ? Number(t.rowCount) : 1000));
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
   * 从 AST 中提取表引用
   */
  extractTablesFromAST(ast: any): TableReference[] {
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
   * 检测跨库 JOIN 数量
   */
  detectCrossDbJoins(ast: any, context: MetadataContext): number {
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
}
