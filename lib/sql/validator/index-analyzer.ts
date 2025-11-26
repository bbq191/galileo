/**
 * 索引分析器
 * 负责分析表的索引使用情况
 */

import { PrismaClient } from '@prisma/client';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { SQLPatternDetector } from './sql-pattern-detector';

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

export class IndexAnalyzer {
  private prisma: PrismaClient;
  private indexCache: Map<string, TableIndexInfo[]>;
  private patternDetector: SQLPatternDetector;

  constructor(prismaInstance: PrismaClient) {
    this.prisma = prismaInstance;
    this.indexCache = new Map();
    this.patternDetector = new SQLPatternDetector();
  }

  /**
   * 获取表的索引信息
   */
  async getTableIndexes(databaseName: string, tableName: string): Promise<TableIndexInfo[]> {
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

      // 查询索引信息
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
  columnHasIndex(columnName: string, indexes: TableIndexInfo[]): boolean {
    // 检查列是否是任何索引的第一列（最有效的情况）
    return indexes.some(index =>
      index.columns.length > 0 &&
      index.columns[0].columnName === columnName
    );
  }

  /**
   * 检查索引使用情况
   */
  async checkIndexUsage(ast: any, context: MetadataContext): Promise<string[]> {
    const nonIndexedFilters: string[] = [];

    if (ast.type !== 'select' || !ast.where) return nonIndexedFilters;

    // 提取 WHERE 条件中的列
    const whereColumns = this.patternDetector.extractColumnsFromWhere(ast.where);

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
   * 检查 ORDER BY 字段的索引使用
   */
  async checkOrderByIndexes(
    ast: any,
    context: MetadataContext
  ): Promise<Array<{ column: string; hasIndex: boolean }>> {
    const results: Array<{ column: string; hasIndex: boolean }> = [];

    if (!ast.orderby) return results;

    const orderByColumns = this.patternDetector.extractOrderByColumns(ast);

    for (const col of orderByColumns) {
      const table = context.tables.find(t =>
        t.tableName === col.table || (!col.table && context.tables.length === 1)
      );

      if (table) {
        const indexes = await this.getTableIndexes(table.databaseName, table.tableName);
        const hasIndex = this.columnHasIndex(col.name, indexes);
        results.push({
          column: `${col.table ? col.table + '.' : ''}${col.name}`,
          hasIndex
        });
      }
    }

    return results;
  }

  /**
   * 检查 GROUP BY 字段的索引使用
   */
  async checkGroupByIndexes(
    ast: any,
    context: MetadataContext
  ): Promise<Array<{ column: string; hasIndex: boolean }>> {
    const results: Array<{ column: string; hasIndex: boolean }> = [];

    if (!ast.groupby) return results;

    const groupByColumns = this.patternDetector.extractGroupByColumns(ast);

    for (const col of groupByColumns) {
      const table = context.tables.find(t =>
        t.tableName === col.table || (!col.table && context.tables.length === 1)
      );

      if (table) {
        const indexes = await this.getTableIndexes(table.databaseName, table.tableName);
        const hasIndex = this.columnHasIndex(col.name, indexes);
        results.push({
          column: `${col.table ? col.table + '.' : ''}${col.name}`,
          hasIndex
        });
      }
    }

    return results;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.indexCache.clear();
  }
}
