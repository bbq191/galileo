/**
 * 语义搜索引擎
 * 基于语义相似度搜索表和字段
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import { TableSearchResult, SearchOptions } from './types';
import { VectorSearchService } from '@/lib/vector/vector-search-service';

/**
 * 搜索缓存配置
 */
interface SearchCacheConfig {
  maxSize: number;
  ttl: number; // 缓存存活时间（毫秒）
}

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * 语义搜索引擎
 */
export class SemanticSearch {
  private prisma: PrismaClient;
  private vectorSearch?: VectorSearchService;
  private useVectorSearch: boolean;

  // 搜索结果缓存（懒加载优化）
  private searchCache: Map<string, CacheEntry<TableSearchResult[]>>;
  private columnSearchCache: Map<string, CacheEntry<any[]>>;
  private cacheConfig: SearchCacheConfig;

  constructor(options: {
    enableVectorSearch?: boolean;
    cacheMaxSize?: number;
    cacheTTL?: number;
  } = {}) {
    this.prisma = prisma;
    this.useVectorSearch = options.enableVectorSearch !== false;

    // 初始化缓存配置
    this.cacheConfig = {
      maxSize: options.cacheMaxSize ?? 100,
      ttl: options.cacheTTL ?? 300000, // 默认5分钟
    };
    this.searchCache = new Map();
    this.columnSearchCache = new Map();

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
   * 生成缓存键
   */
  private getCacheKey(query: string, options: SearchOptions): string {
    return `${query}:${options.limit || 10}:${options.threshold || 0.3}`;
  }

  /**
   * 从缓存获取数据
   */
  private getFromCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string
  ): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > this.cacheConfig.ttl) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * 保存到缓存
   */
  private saveToCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    data: T
  ): void {
    // 如果缓存已满，删除最旧的条目
    if (cache.size >= this.cacheConfig.maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }

    cache.set(key, {
      data,
      timestamp: Date.now(),
    });
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

    // 检查缓存（懒加载优化）
    const cacheKey = this.getCacheKey(query, options);
    const cached = this.getFromCache(this.searchCache, cacheKey);
    if (cached) {
      console.log(`缓存命中: ${cacheKey}`);
      return cached;
    }

    try {
      // 1. 精确匹配（优先级最高）
      const exactMatches = await this.findExactTableMatches(query, limit);
      if (exactMatches.length > 0) {
        this.saveToCache(this.searchCache, cacheKey, exactMatches);
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
      const results = filteredMatches.sort((a, b) => b.score - a.score).slice(0, limit);

      // 保存到缓存
      this.saveToCache(this.searchCache, cacheKey, results);

      return results;
    } catch (error) {
      console.error('搜索表时出错:', error);
      return [];
    }
  }

  /**
   * 精确匹配表（懒加载优化：不自动加载列数据）
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
      // 懒加载优化：只加载数据库信息，不加载列数据
      // 列数据会在 context-builder 中按需加载
      include: {
        database: true,
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
   * 模糊匹配表（懒加载优化：不自动加载列数据）
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
      // 懒加载优化：只加载数据库信息，不加载列数据
      include: {
        database: true,
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
   * 计算表相关性分数（懒加载优化：不依赖列数据）
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

    // 4. 字段名匹配（次要因素）- 懒加载优化：仅在列数据已加载时才使用
    if (table.columns && Array.isArray(table.columns)) {
      const matchingColumns = table.columns.filter((col: any) =>
        col.columnName.toLowerCase().includes(queryLower)
      );
      if (matchingColumns.length > 0) {
        score += 0.3 * Math.min(matchingColumns.length / 5, 1);
        reasons.push(`${matchingColumns.length}个字段名匹配`);
      }
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

    // 检查缓存（懒加载优化）
    const cacheKey = `${query}:${tableId || 'all'}:${limit}`;
    const cached = this.getFromCache(this.columnSearchCache, cacheKey);
    if (cached) {
      console.log(`字段搜索缓存命中: ${cacheKey}`);
      return cached;
    }

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

      const results = columns.map((column: any) => ({
        column,
        score: this.calculateColumnRelevance(query, column),
      }));

      // 保存到缓存
      this.saveToCache(this.columnSearchCache, cacheKey, results);

      return results;
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
   * 使用向量搜索查找表（懒加载优化：不自动加载列数据）
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

      // 获取完整的表信息（懒加载优化：不加载列数据）
      const tableIds = vectorResults
        .map(r => r.item.id)
        .filter(id => id !== undefined);

      const tables = await this.prisma.tableMeta.findMany({
        where: {
          id: { in: tableIds },
        },
        include: {
          database: true,
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
   * 批量搜索表（懒加载优化）
   * 使用单个查询代替多个独立查询，显著减少数据库往返次数
   */
  async searchTablesInBatch(
    queries: string[],
    options: SearchOptions = {}
  ): Promise<Map<string, TableSearchResult[]>> {
    if (queries.length === 0) {
      return new Map();
    }

    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;
    const results = new Map<string, TableSearchResult[]>();

    try {
      // 批量精确匹配（懒加载优化：不加载列数据）
      const exactMatches = await this.prisma.tableMeta.findMany({
        where: {
          tableName: { in: queries },
        },
        include: {
          database: true,
        },
      });

      // 将精确匹配的结果分配到对应的查询
      for (const query of queries) {
        const matches = exactMatches.filter(
          (table: any) => table.tableName.toLowerCase() === query.toLowerCase()
        );

        if (matches.length > 0) {
          results.set(
            query,
            matches.map((table: any) => ({
              table,
              score: 1.0,
              matchReason: '精确匹配表名',
            }))
          );
        }
      }

      // 对没有精确匹配的查询进行模糊搜索
      const remainingQueries = queries.filter(q => !results.has(q));
      if (remainingQueries.length > 0) {
        // 批量模糊匹配（懒加载优化：不加载列数据）
        const fuzzyMatches = await this.prisma.tableMeta.findMany({
          where: {
            OR: remainingQueries.flatMap(query => [
              { tableName: { contains: query } },
              { tableComment: { contains: query } },
              { semanticDescription: { contains: query } },
            ]),
          },
          include: {
            database: true,
          },
          take: limit * remainingQueries.length,
        });

        // 为每个查询计算相关性并分配结果
        for (const query of remainingQueries) {
          const queryResults = fuzzyMatches
            .map((table: any) => {
              const { score, reason } = this.calculateTableRelevance(query, table);
              return {
                table,
                score,
                matchReason: reason,
              };
            })
            .filter(r => r.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

          results.set(query, queryResults);
        }
      }

      return results;
    } catch (error) {
      console.error('批量搜索表时出错:', error);
      return results;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.searchCache.clear();
    this.columnSearchCache.clear();
    console.log('搜索缓存已清除');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    searchCacheSize: number;
    columnSearchCacheSize: number;
    maxSize: number;
    ttl: number;
  } {
    return {
      searchCacheSize: this.searchCache.size,
      columnSearchCacheSize: this.columnSearchCache.size,
      maxSize: this.cacheConfig.maxSize,
      ttl: this.cacheConfig.ttl,
    };
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
    // 清除缓存
    this.clearCache();

    await this.prisma.$disconnect();
    if (this.vectorSearch) {
      await this.vectorSearch.close();
    }
  }
}
