/**
 * 语义搜索引擎
 * 基于语义相似度搜索表和字段
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import { TableSearchResult, SearchOptions } from './types';
import { VectorSearchService } from '@/lib/vector/vector-search-service';

/**
 * 语义搜索引擎
 */
export class SemanticSearch {
  private prisma: PrismaClient;
  private vectorSearch?: VectorSearchService;
  private useVectorSearch: boolean;

  constructor(options: { enableVectorSearch?: boolean } = {}) {
    this.prisma = prisma;
    this.useVectorSearch = options.enableVectorSearch !== false;

    // 初始化向量搜索（可选）
    if (this.useVectorSearch) {
      this.vectorSearch = new VectorSearchService();
      this.vectorSearch.initialize().catch(err => {
        console.warn('向量搜索初始化失败，将只使用关键词搜索:', err.message);
        this.useVectorSearch = false;
      });
    }
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
      // 1. 精确匹配（优先级最高）
      const exactMatches = await this.findExactTableMatches(query, limit);
      if (exactMatches.length > 0) {
        return exactMatches;
      }

      // 2. 并行执行关键词搜索和向量搜索
      const [keywordResults, vectorResults] = await Promise.all([
        this.findFuzzyTableMatches(query, limit),
        this.findVectorTableMatches(query, limit),
      ]);

      // 3. 合并结果
      const mergedResults = this.mergeSearchResults(
        keywordResults,
        vectorResults,
        0.6 // 向量搜索权重
      );

      // 4. 过滤低分结果
      const filteredMatches = mergedResults.filter(m => m.score >= threshold);

      // 5. 按分数排序
      return filteredMatches.sort((a, b) => b.score - a.score).slice(0, limit);
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
   * 使用向量搜索查找表
   */
  private async findVectorTableMatches(
    query: string,
    limit: number
  ): Promise<TableSearchResult[]> {
    if (!this.useVectorSearch || !this.vectorSearch) {
      return [];
    }

    try {
      const vectorResults = await this.vectorSearch.searchTables(query, {
        limit,
        threshold: 0.4, // 向量相似度阈值
      });

      // 获取完整的表信息
      const tableIds = vectorResults
        .map(r => r.item.id)
        .filter(id => id !== undefined);

      const tables = await this.prisma.tableMeta.findMany({
        where: {
          id: { in: tableIds },
        },
        include: {
          database: true,
          columns: true,
        },
      });

      // 构建结果
      return vectorResults.map(vr => {
        const table = tables.find((t: any) => t.id === vr.item.id);
        if (!table) {
          return null;
        }

        return {
          table,
          score: vr.score,
          matchReason: '向量语义匹配',
        };
      }).filter(r => r !== null) as TableSearchResult[];
    } catch (error) {
      console.warn('向量搜索失败:', error);
      return [];
    }
  }

  /**
   * 合并关键词搜索和向量搜索的结果
   */
  private mergeSearchResults(
    keywordResults: TableSearchResult[],
    vectorResults: TableSearchResult[],
    vectorWeight: number = 0.6
  ): TableSearchResult[] {
    const resultMap = new Map<number, TableSearchResult>();

    // 1. 处理关键词搜索结果
    for (const result of keywordResults) {
      const tableId = result.table.id;
      resultMap.set(tableId, {
        ...result,
        score: result.score * (1 - vectorWeight),
      });
    }

    // 2. 合并向量搜索结果
    for (const result of vectorResults) {
      const tableId = result.table.id;
      const existing = resultMap.get(tableId);

      if (existing) {
        // 表已存在，合并分数
        existing.score += result.score * vectorWeight;
        existing.matchReason = `${existing.matchReason} + ${result.matchReason}`;
      } else {
        // 新表，添加到结果
        resultMap.set(tableId, {
          ...result,
          score: result.score * vectorWeight,
        });
      }
    }

    // 3. 归一化分数（确保最高分为 1.0）
    const results = Array.from(resultMap.values());
    if (results.length > 0) {
      const maxScore = Math.max(...results.map(r => r.score));
      if (maxScore > 1.0) {
        results.forEach(r => {
          r.score = r.score / maxScore;
        });
      }
    }

    return results;
  }

  /**
   * 获取向量搜索服务
   */
  getVectorSearchService(): VectorSearchService | undefined {
    return this.vectorSearch;
  }

  /**
   * 关闭数据库连接
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    if (this.vectorSearch) {
      await this.vectorSearch.close();
    }
  }
}
