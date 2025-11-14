/**
 * 元数据检索器
 * 基于用户意图检索相关的元数据
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@/app/generated/prisma';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext, SearchOptions } from './types';
import { SemanticSearch } from './semantic-search';
import { RelevanceRanker } from './relevance-ranker';
import { ContextBuilder } from './context-builder';
import { MultiLevelCache } from '@/lib/cache/multi-level-cache';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * 元数据检索器
 */
@injectable()
export class MetadataRetriever {
  private prisma: PrismaClient;
  private semanticSearch: SemanticSearch;
  private ranker: RelevanceRanker;
  private contextBuilder: ContextBuilder;
  private cache: MultiLevelCache;

  constructor(
    @inject(DI_TOKENS.PrismaClient) prisma: PrismaClient,
    @inject(DI_TOKENS.MultiLevelCache) cache: MultiLevelCache
  ) {
    this.prisma = prisma;
    this.cache = cache;
    this.semanticSearch = new SemanticSearch();
    this.ranker = new RelevanceRanker();
    this.contextBuilder = new ContextBuilder();
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
        // 默认禁用示例数据加载以减少数据库查询（懒加载优化）
        includeSampleData: options.includeSampleData ?? false,
        includeIndexes: options.includeIndexes ?? false,
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

    // 1. 基于表名提示搜索（懒加载优化：使用批量搜索）
    if (intent.entities.tables && intent.entities.tables.length > 0) {
      // 如果有多个表提示，使用批量搜索以减少数据库查询次数
      if (intent.entities.tables.length > 1) {
        const batchResults = await this.semanticSearch.searchTablesInBatch(
          intent.entities.tables,
          {
            limit: 5,
            threshold: 0.3,
          }
        );

        // 处理批量搜索结果
        for (const [tableHint, results] of batchResults) {
          const exactMatches = results.filter(r => r.score >= 0.95);
          if (exactMatches.length > 0) {
            hasExactMatch = true;
            console.log(`找到精确匹配的表: ${exactMatches.map(r => r.table.tableName).join(', ')}`);
            searchResults.push(...exactMatches);
          } else {
            searchResults.push(...results);
          }
        }
      } else {
        // 单个表提示，使用常规搜索（可以利用缓存）
        const tableHint = intent.entities.tables[0];
        const results = await this.semanticSearch.searchTables(tableHint, {
          limit: 5,
          threshold: 0.3,
        });

        const exactMatches = results.filter(r => r.score >= 0.95);
        if (exactMatches.length > 0) {
          hasExactMatch = true;
          console.log(`找到精确匹配的表: ${exactMatches.map(r => r.table.tableName).join(', ')}`);
          searchResults.push(...exactMatches);
        } else {
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
    if (hasExactMatch && intent.entities.tables && intent.entities.tables.length === 1) {
      limit = Math.min(limit, 2); // 最多返回2个表，减少干扰
      console.log(`精确匹配单表查询，限制返回 ${limit} 个表`);
    }

    return filteredResults.slice(0, limit);
  }

  /**
   * 获取表详情
   */
  async getTableDetails(tableId: number): Promise<any> {
    return await this.cache.get(
      'table',
      { id: tableId },
      async () => {
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

        return table;
      }
    );
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
    return await this.cache.get(
      'database-stats',
      { id: databaseId },
      async () => {
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

        return {
          tableCount,
          relationshipCount: relCount,
        };
      }
    );
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

/**
 * 导出默认实例（向后兼容）
 */
let _metadataRetriever: MetadataRetriever | null = null;

export function getMetadataRetriever(): MetadataRetriever {
  if (!_metadataRetriever) {
    const { getService } = require('@/lib/di/setup');
    try {
      _metadataRetriever = getService(DI_TOKENS.MetadataRetriever);
    } catch {
      // 回退方案：创建不使用 DI 的实例
      const prisma = require('@/lib/prisma/client').default;
      const { MultiLevelCache } = require('@/lib/cache/multi-level-cache');
      const cache = new MultiLevelCache();
      _metadataRetriever = new MetadataRetriever(prisma, cache);
    }
  }
  return _metadataRetriever!;
}

export const metadataRetriever = new Proxy({} as MetadataRetriever, {
  get(_target, prop) {
    return getMetadataRetriever()[prop as keyof MetadataRetriever];
  }
});
