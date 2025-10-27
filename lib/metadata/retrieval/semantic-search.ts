/**
 * 语义搜索引擎
 * 基于语义相似度搜索表和字段
 */

import { PrismaClient } from '@prisma/client';
import { TableSearchResult, SearchOptions } from './types';

/**
 * 语义搜索引擎
 */
export class SemanticSearch {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * 搜索表
   */
  async searchTables(
    query: string,
    options: SearchOptions = {}
  ): Promise<TableSearchResult[]> {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;

    try {
      // 1. 精确匹配
      const exactMatches = await this.findExactTableMatches(query, limit);
      if (exactMatches.length > 0) {
        return exactMatches;
      }

      // 2. 模糊匹配
      const fuzzyMatches = await this.findFuzzyTableMatches(query, limit);

      // 3. 过滤低分结果
      const filteredMatches = fuzzyMatches.filter(m => m.score >= threshold);

      // 4. 按分数排序
      return filteredMatches.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('搜索表时出错:', error);
      return [];
    }
  }

  /**
   * 精确匹配表
   */
  private async findExactTableMatches(
    query: string,
    limit: number
  ): Promise<TableSearchResult[]> {
    const tables = await this.prisma.tableMeta.findMany({
      where: {
        OR: [
          { tableName: { equals: query } },
          { tableName: { equals: query.toLowerCase() } },
          { tableName: { equals: query.toUpperCase() } },
        ],
      },
      include: {
        database: true,
        columns: true,
      },
      take: limit,
    });

    return tables.map((table: any) => ({
      table,
      score: 1.0,
      matchReason: '精确匹配表名',
    }));
  }

  /**
   * 模糊匹配表
   */
  private async findFuzzyTableMatches(
    query: string,
    limit: number
  ): Promise<TableSearchResult[]> {
    const tables = await this.prisma.tableMeta.findMany({
      where: {
        OR: [
          { tableName: { contains: query } },
          { tableComment: { contains: query } },
          { semanticDescription: { contains: query } },
        ],
      },
      include: {
        database: true,
        columns: true,
      },
      take: limit * 2, // 多获取一些，后续过滤
    });

    return tables.map((table: any) => {
      const { score, reason } = this.calculateTableRelevance(query, table);
      return {
        table,
        score,
        matchReason: reason,
      };
    });
  }

  /**
   * 计算表相关性分数
   */
  private calculateTableRelevance(
    query: string,
    table: any
  ): { score: number; reason: string } {
    const queryLower = query.toLowerCase();
    const tableName = (table.tableName || '').toLowerCase();
    const tableComment = (table.tableComment || '').toLowerCase();
    const semanticDesc = (table.semanticDescription || '').toLowerCase();

    let score = 0;
    const reasons: string[] = [];

    // 1. 表名匹配
    if (tableName === queryLower) {
      score += 1.0;
      reasons.push('精确匹配表名');
    } else if (tableName.includes(queryLower)) {
      score += 0.7;
      reasons.push('表名包含关键词');
    } else if (queryLower.includes(tableName)) {
      score += 0.6;
      reasons.push('关键词包含表名');
    }

    // 2. 注释匹配
    if (tableComment.includes(queryLower)) {
      score += 0.5;
      reasons.push('注释包含关键词');
    }

    // 3. 语义描述匹配
    if (semanticDesc.includes(queryLower)) {
      score += 0.6;
      reasons.push('语义描述包含关键词');
    }

    // 4. 字段名匹配（次要因素）
    const matchingColumns = (table.columns || []).filter((col: any) =>
      col.columnName.toLowerCase().includes(queryLower)
    );
    if (matchingColumns.length > 0) {
      score += 0.3 * Math.min(matchingColumns.length / 5, 1);
      reasons.push(`${matchingColumns.length}个字段名匹配`);
    }

    // 归一化分数
    score = Math.min(score, 1.0);

    return {
      score,
      reason: reasons.join('; ') || '未知匹配',
    };
  }

  /**
   * 搜索字段
   */
  async searchColumns(
    query: string,
    tableId?: number,
    options: SearchOptions = {}
  ): Promise<any[]> {
    const limit = options.limit || 10;

    try {
      const where: any = {
        OR: [
          { columnName: { contains: query } },
          { columnComment: { contains: query } },
          { semanticDescription: { contains: query } },
        ],
      };

      if (tableId) {
        where.tableId = tableId;
      }

      const columns = await this.prisma.columnMeta.findMany({
        where,
        include: {
          table: {
            include: {
              database: true,
            },
          },
        },
        take: limit,
      });

      return columns.map((column: any) => ({
        column,
        score: this.calculateColumnRelevance(query, column),
      }));
    } catch (error) {
      console.error('搜索字段时出错:', error);
      return [];
    }
  }

  /**
   * 计算字段相关性分数
   */
  private calculateColumnRelevance(query: string, column: any): number {
    const queryLower = query.toLowerCase();
    const columnName = (column.columnName || '').toLowerCase();
    const columnComment = (column.columnComment || '').toLowerCase();
    const semanticDesc = (column.semanticDescription || '').toLowerCase();

    let score = 0;

    // 字段名匹配
    if (columnName === queryLower) {
      score += 1.0;
    } else if (columnName.includes(queryLower)) {
      score += 0.7;
    }

    // 注释匹配
    if (columnComment.includes(queryLower)) {
      score += 0.5;
    }

    // 语义描述匹配
    if (semanticDesc.includes(queryLower)) {
      score += 0.6;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 关闭数据库连接
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
