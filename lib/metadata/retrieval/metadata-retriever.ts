/**
 * 元数据检索器
 * 基于用户意图检索相关的元数据
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext, SearchOptions } from './types';
import { SemanticSearch } from './semantic-search';
import { RelevanceRanker } from './relevance-ranker';
import { ContextBuilder } from './context-builder';
import { MultiLevelCache } from '@/lib/cache/multi-level-cache';

/**
 * 元数据检索器
 */
export class MetadataRetriever {
  private prisma: PrismaClient;
  private semanticSearch: SemanticSearch;
  private ranker: RelevanceRanker;
  private contextBuilder: ContextBuilder;
  private cache: MultiLevelCache;

  constructor(prismaInstance?: PrismaClient) {
    this.prisma = prismaInstance || prisma;
    this.semanticSearch = new SemanticSearch();
    this.ranker = new RelevanceRanker();
    this.contextBuilder = new ContextBuilder();
    this.cache = new MultiLevelCache({
      ttl: 300, // 5分钟缓存
      maxSize: 100,
    });
  }

  /**
   * 检索 SQL 生成所需的元数据上下文
   */
  async retrieveContext(
    intent: QueryIntent,
    options: SearchOptions = {}
  ): Promise<MetadataContext> {
    console.log('开始检索元数据上下文...');

    // 1. 搜索相关表
    const tables = await this.searchTables(intent, options);
    console.log(`找到 ${tables.length} 个相关表`);

    if (tables.length === 0) {
      throw new Error('未找到相关的表');
    }

    // 2. 构建元数据上下文
    const context = await this.contextBuilder.buildMetadataContext(
      tables.map(r => r.table),
      {
        includeSampleData: options.includeSampleData,
        includeIndexes: options.includeIndexes,
      }
    );

    console.log('元数据上下文构建完成');
    console.log(`- 表数量: ${context.tables.length}`);
    console.log(`- 关系数量: ${context.relationships.length}`);
    console.log(`- 总字段数: ${context.columns.length}`);
    console.log(`- 复杂度: ${context.estimatedComplexity}`);

    return context;
  }

  /**
   * 搜索相关表
   */
  private async searchTables(
    intent: QueryIntent,
    options: SearchOptions
  ): Promise<any[]> {
    const searchResults = [];
    let hasExactMatch = false;

    // 1. 基于表名提示搜索
    if (intent.entities.tables && intent.entities.tables.length > 0) {
      for (const tableHint of intent.entities.tables) {
        const results = await this.semanticSearch.searchTables(tableHint, {
          limit: 5,
          threshold: 0.3,
        });

        // 检查是否有精确匹配（分数接近1.0）
        const exactMatches = results.filter(r => r.score >= 0.95);
        if (exactMatches.length > 0) {
          hasExactMatch = true;
          console.log(`找到精确匹配的表: ${exactMatches.map(r => r.table.tableName).join(', ')}`);
          // 只使用精确匹配的表，忽略其他相似的表
          searchResults.push(...exactMatches);
        } else {
          // 没有精确匹配，使用所有搜索结果
          searchResults.push(...results);
        }
      }
    }

    // 2. 基于字段名提示搜索（辅助）
    // 如果已经有精确匹配的表，并且只有一个表，不再通过字段搜索额外的表
    if (!hasExactMatch || searchResults.length > 1) {
      if (intent.entities.columns && intent.entities.columns.length > 0) {
        for (const columnHint of intent.entities.columns) {
          const columnResults = await this.semanticSearch.searchColumns(
            columnHint,
            undefined,
            { limit: 3 }
          );

          // 将字段所属的表加入结果
          for (const colResult of columnResults) {
            const table = colResult.column.table;
            if (table) {
              searchResults.push({
                table,
                score: colResult.score * 0.7, // 降低权重
                matchReason: `字段"${columnHint}"匹配`,
              });
            }
          }
        }
      }
    } else {
      console.log('已有精确匹配的单表，跳过字段搜索以避免引入无关表');
    }

    // 3. 去重
    const uniqueResults = this.ranker.deduplicate(searchResults);

    // 4. 根据意图类型调整排序
    const rankedResults = this.ranker.rankByIntent(uniqueResults, intent.type);

    // 5. 过滤低分结果
    const filteredResults = this.ranker.filterLowScores(
      rankedResults,
      options.threshold || 0.3
    );

    // 6. 限制返回数量
    // 如果有精确匹配，优先返回精确匹配的表，减少其他表的干扰
    let limit = options.limit || 10;
    if (hasExactMatch && intent.entities.tables.length === 1) {
      limit = Math.min(limit, 2); // 最多返回2个表，减少干扰
      console.log(`精确匹配单表查询，限制返回 ${limit} 个表`);
    }

    return filteredResults.slice(0, limit);
  }

  /**
   * 获取表详情
   */
  async getTableDetails(tableId: number): Promise<any> {
    const cacheKey = `table:${tableId}`;

    // 检查缓存
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 查询数据库
    const table = await this.prisma.tableMeta.findUnique({
      where: { id: tableId },
      include: {
        database: true,
        columns: {
          orderBy: { ordinalPosition: 'asc' },
        },
      },
    });

    if (!table) {
      throw new Error(`表不存在: ID=${tableId}`);
    }

    // 缓存结果
    await this.cache.set(cacheKey, table);

    return table;
  }

  /**
   * 获取关系路径
   * 找到两个表之间的关联路径
   */
  async getRelationshipPath(
    sourceTableId: number,
    targetTableId: number
  ): Promise<any[]> {
    // 简单实现：直接查找
    const directRels = await this.prisma.explicitRelationship.findMany({
      where: {
        OR: [
          { sourceTableId, targetTableId },
          { sourceTableId: targetTableId, targetTableId: sourceTableId },
        ],
      },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });

    if (directRels.length > 0) {
      return directRels;
    }

    // 检查推断关系
    const inferredRels = await this.prisma.inferredRelationship.findMany({
      where: {
        OR: [
          { sourceTableId, targetTableId },
          { sourceTableId: targetTableId, targetTableId: sourceTableId },
        ],
        confidenceScore: { gte: 0.75 },
      },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });

    return inferredRels;
  }

  /**
   * 搜索字段
   */
  async searchColumns(
    query: string,
    tableId?: number,
    options: SearchOptions = {}
  ): Promise<any[]> {
    return await this.semanticSearch.searchColumns(query, tableId, options);
  }

  /**
   * 获取数据库统计信息
   */
  async getDatabaseStats(databaseId: number): Promise<any> {
    const cacheKey = `db:stats:${databaseId}`;

    // 检查缓存
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 统计表数量
    const tableCount = await this.prisma.tableMeta.count({
      where: { databaseId },
    });

    // 统计关系数量
    const relCount = await this.prisma.explicitRelationship.count({
      where: {
        OR: [
          { sourceTable: { databaseId } },
          { targetTable: { databaseId } },
        ],
      },
    });

    const stats = {
      tableCount,
      relationshipCount: relCount,
    };

    // 缓存结果
    await this.cache.set(cacheKey, stats, { ttl: 600 }); // 10分钟

    return stats;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
    await this.semanticSearch.disconnect();
    await this.contextBuilder.disconnect();
  }
}
