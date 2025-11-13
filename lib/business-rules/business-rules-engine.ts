/**
 * 业务规则引擎
 * 增强 AI 对业务逻辑的理解
 */

import { PrismaClient } from '@/app/generated/prisma';
import { Redis } from 'ioredis';
import prisma from '@/lib/prisma/client';
import { getRedisClient } from '@/lib/cache/redis-client';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

/**
 * 业务术语匹配结果
 */
export interface BusinessTermMatch {
  term: string;
  category: string;
  targetType: string;
  targetTable?: string;
  targetColumn?: string;
  targetValue?: any;
  confidence: number;
  priority: number;
  semanticDescription?: string;
}

/**
 * 分表模式识别结果
 */
export interface ShardingPatternMatch {
  patternName: string;
  baseTableName: string;
  tableList: string[];
  mergeStrategy: string;
  shardKeyColumn?: string;
  shardAlgorithm?: string;
  semanticDescription?: string;
}

/**
 * 查询模板匹配结果
 */
export interface QueryTemplateMatch {
  name: string;
  category: string;
  naturalLanguagePattern: string;
  sqlTemplate: string;
  parameters: any;
  similarity: number;
  semanticDescription?: string;
  examples?: string[];
}

/**
 * 过滤规则结果
 */
export interface FilterRule {
  name: string;
  targetTable: string;
  filterCondition: string;
  autoApply: boolean;
  priority: number;
  semanticKeywords?: string[];
}

/**
 * 聚合规则结果
 */
export interface AggregationRuleResult {
  name: string;
  metricName: string;
  sourceTable: string;
  sourceColumn: string;
  aggregationFunction: string;
  unit?: string;
  semanticDescription?: string;
}

/**
 * 业务规则引擎
 */
export class BusinessRulesEngine {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor() {
    this.prisma = prisma;
    this.redis = getRedisClient();
  }

  /**
   * 匹配业务术语
   * 从自然语言查询中识别业务术语并映射到数据库实体
   *
   * 实现说明：
   * 1. 使用 Redis 缓存提高性能
   * 2. 从数据库读取真实数据
   * 3. 按优先级和置信度排序
   * 4. 更新使用统计
   * 5. 错误降级策略
   */
  async matchBusinessTerms(naturalLanguageQuery: string): Promise<BusinessTermMatch[]> {
    console.log('[BusinessRulesEngine] 匹配业务术语:', naturalLanguageQuery);

    try {
      // Level 1: 检查 Redis 缓存
      const cacheKey = `business_term:${naturalLanguageQuery}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        console.log('[BusinessRulesEngine] 业务术语匹配 - Redis 缓存命中');
        return JSON.parse(cached);
      }

      // Level 2: 从数据库查询所有启用的业务术语
      const allTerms = await this.prisma.businessTermMapping.findMany({
        where: {
          isEnabled: true
        },
        orderBy: [
          { priority: 'asc' },
          { confidence: 'desc' }
        ]
      });

      // Level 3: 匹配逻辑
      const matches: BusinessTermMatch[] = [];

      for (const term of allTerms) {
        // 精确匹配或模糊匹配
        if (naturalLanguageQuery.includes(term.term)) {
          // 解析 targetValue（JSON 字符串）
          let targetValue: any = {};
          try {
            targetValue = term.targetValue ? JSON.parse(term.targetValue) : {};
          } catch (e) {
            console.error(`[BusinessRulesEngine] 解析 targetValue 失败:`, e);
          }

          matches.push({
            term: term.term,
            category: term.category,
            targetType: term.targetType,
            targetTable: term.targetTable || undefined,
            targetColumn: term.targetColumn || undefined,
            targetValue,
            priority: term.priority,
            confidence: term.confidence.toNumber(), // Prisma Decimal 转 number
            semanticDescription: term.semanticDescription || undefined
          });

          console.log(`[BusinessRulesEngine] 匹配到业务术语: ${term.term} (${term.category})`);

          // 更新使用统计（异步，不阻塞主流程）
          this.updateTermUsage(term.id).catch(err => {
            console.error('[BusinessRulesEngine] 更新使用统计失败:', err);
          });
        }
      }

      // 按优先级和置信度排序
      matches.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.confidence - a.confidence;
      });

      // 写入 Redis 缓存（TTL: 1 小时）
      await this.redis.set(cacheKey, JSON.stringify(matches), 'EX', 3600);

      console.log(`[BusinessRulesEngine] 业务术语匹配完成，找到 ${matches.length} 个匹配项`);
      return matches;

    } catch (error) {
      console.error('[BusinessRulesEngine] 业务术语匹配失败:', error);
      // 降级：返回空数组，不阻塞 SQL 生成流程
      return [];
    }
  }

  /**
   * 更新术语使用统计
   * @param termId 术语 ID
   */
  private async updateTermUsage(termId: number): Promise<void> {
    try {
      await this.prisma.businessTermMapping.update({
        where: { id: termId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        }
      });
    } catch (error) {
      console.error(`[BusinessRulesEngine] 更新术语使用统计失败 (ID: ${termId}):`, error);
    }
  }

  /**
   * 识别分表模式
   * 检测查询是否涉及分表，并返回分表信息
   *
   * 实现说明：
   * 1. 从数据库读取分表模式
   * 2. 使用 Redis 缓存
   * 3. 匹配意图和上下文中的表
   * 4. 更新使用统计
   */
  async detectShardingPatterns(
    intent: QueryIntent,
    context: MetadataContext
  ): Promise<ShardingPatternMatch[]> {
    console.log('[BusinessRulesEngine] 检测分表模式...');

    const matches: ShardingPatternMatch[] = [];

    try {
      // 从数据库查询所有启用的分表模式
      const allPatterns = await this.prisma.shardingPattern.findMany({
        where: {
          isEnabled: true
        },
        orderBy: {
          usageCount: 'desc'
        }
      });

      // 检查意图中的表是否匹配分表模式
      for (const pattern of allPatterns) {
        // 检查是否有表名匹配基表名
        const hasMatch = intent.entities.tables?.some(tableName =>
          tableName === pattern.baseTableName ||
          tableName.startsWith(pattern.baseTableName + '_')
        );

        // 或者检查上下文中的表
        const hasContextMatch = context.tables.some(table =>
          table.tableName === pattern.baseTableName ||
          table.tableName.startsWith(pattern.baseTableName + '_')
        );

        if (hasMatch || hasContextMatch) {
          // 解析 tableList（JSON 数组）
          let tableList: string[] = [];
          try {
            tableList = pattern.tableList ? JSON.parse(pattern.tableList) : [];
          } catch (e) {
            console.error(`[BusinessRulesEngine] 解析 tableList 失败:`, e);
          }

          matches.push({
            patternName: pattern.patternName,
            baseTableName: pattern.baseTableName,
            tableList,
            mergeStrategy: pattern.mergeStrategy,
            shardKeyColumn: pattern.shardKeyColumn || undefined,
            shardAlgorithm: pattern.shardAlgorithm || undefined,
            semanticDescription: pattern.semanticDescription || undefined
          });

          console.log(`[BusinessRulesEngine] 检测到分表模式: ${pattern.patternName} (${pattern.shardCount} 个分表)`);

          // 更新使用统计（异步，不阻塞主流程）
          this.updatePatternUsage(pattern.id).catch(err => {
            console.error('[BusinessRulesEngine] 更新分表模式使用统计失败:', err);
          });
        }
      }

      console.log(`[BusinessRulesEngine] 分表模式检测完成，找到 ${matches.length} 个匹配项`);
      return matches;

    } catch (error) {
      console.error('[BusinessRulesEngine] 分表模式检测失败:', error);
      // 降级：返回空数组，不阻塞 SQL 生成流程
      return [];
    }
  }

  /**
   * 更新分表模式使用统计
   * @param patternId 模式 ID
   */
  private async updatePatternUsage(patternId: number): Promise<void> {
    try {
      await this.prisma.shardingPattern.update({
        where: { id: patternId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        }
      });
    } catch (error) {
      console.error(`[BusinessRulesEngine] 更新分表模式使用统计失败 (ID: ${patternId}):`, error);
    }
  }

  /**
   * 匹配相似查询模板
   * 使用 Few-shot 学习提供查询示例
   *
   * 实现说明：
   * 1. 从数据库读取查询模板
   * 2. 计算相似度（简单的关键词匹配）
   * 3. 返回 Top K 结果
   * 4. 更新使用统计
   */
  async matchQueryTemplates(
    naturalLanguageQuery: string,
    intent: QueryIntent,
    topK: number = 3
  ): Promise<QueryTemplateMatch[]> {
    console.log('[BusinessRulesEngine] 匹配查询模板...');

    try {
      // 从数据库查询所有启用的查询模板
      const allTemplates = await this.prisma.queryTemplate.findMany({
        where: {
          isEnabled: true
        },
        orderBy: {
          usageCount: 'desc'
        }
      });

      const matches: QueryTemplateMatch[] = [];

      // 计算相似度（简单的关键词匹配，实际应使用向量相似度）
      for (const template of allTemplates) {
        const similarity = this.calculateSimilarity(
          naturalLanguageQuery,
          template.naturalLanguagePattern
        );

        if (similarity > 0.3) { // 相似度阈值
          // 解析 parameters 和 examples（JSON 字符串）
          let parameters: any = {};
          let examples: string[] = [];
          try {
            parameters = template.parameters ? JSON.parse(template.parameters) : {};
            examples = template.examples ? JSON.parse(template.examples) : [];
          } catch (e) {
            console.error(`[BusinessRulesEngine] 解析模板数据失败:`, e);
          }

          matches.push({
            name: template.name,
            category: template.category,
            naturalLanguagePattern: template.naturalLanguagePattern,
            sqlTemplate: template.sqlTemplate,
            parameters,
            similarity,
            semanticDescription: template.semanticDescription || undefined,
            examples
          });

          console.log(`[BusinessRulesEngine] 匹配到查询模板: ${template.name} (相似度: ${similarity.toFixed(2)})`);

          // 更新使用统计（异步，不阻塞主流程）
          this.updateTemplateUsage(template.id).catch(err => {
            console.error('[BusinessRulesEngine] 更新模板使用统计失败:', err);
          });
        }
      }

      // 按相似度排序
      matches.sort((a, b) => b.similarity - a.similarity);

      // 返回 Top K
      const topMatches = matches.slice(0, topK);
      console.log(`[BusinessRulesEngine] 查询模板匹配完成，返回 ${topMatches.length} 个结果`);

      return topMatches;

    } catch (error) {
      console.error('[BusinessRulesEngine] 查询模板匹配失败:', error);
      // 降级：返回空数组，不阻塞 SQL 生成流程
      return [];
    }
  }

  /**
   * 更新查询模板使用统计
   * @param templateId 模板 ID
   */
  private async updateTemplateUsage(templateId: number): Promise<void> {
    try {
      await this.prisma.queryTemplate.update({
        where: { id: templateId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        }
      });
    } catch (error) {
      console.error(`[BusinessRulesEngine] 更新模板使用统计失败 (ID: ${templateId}):`, error);
    }
  }

  /**
   * 获取适用的常用过滤规则
   *
   * 实现说明：
   * 1. 从数据库读取过滤规则
   * 2. 按优先级排序
   * 3. 匹配目标表
   * 4. 更新使用统计
   */
  async getApplicableFilters(tables: string[]): Promise<FilterRule[]> {
    console.log('[BusinessRulesEngine] 获取常用过滤规则...');

    const filters: FilterRule[] = [];

    try {
      // 从数据库查询所有启用的过滤规则
      const allFilters = await this.prisma.commonFilter.findMany({
        where: {
          isEnabled: true
        },
        orderBy: {
          priority: 'asc'
        }
      });

      for (const filter of allFilters) {
        // 检查是否有表匹配（* 表示所有表）
        const applicable = filter.targetTable === '*' || tables.includes(filter.targetTable);

        if (applicable) {
          // 解析 semanticKeywords（JSON 数组）
          let semanticKeywords: string[] = [];
          try {
            semanticKeywords = filter.semanticKeywords ? JSON.parse(filter.semanticKeywords) : [];
          } catch (e) {
            console.error(`[BusinessRulesEngine] 解析 semanticKeywords 失败:`, e);
          }

          filters.push({
            name: filter.name,
            targetTable: filter.targetTable,
            filterCondition: filter.filterCondition,
            autoApply: filter.autoApply,
            priority: filter.priority,
            semanticKeywords
          });

          console.log(`[BusinessRulesEngine] 找到适用的过滤规则: ${filter.name} (优先级: ${filter.priority}, 自动应用: ${filter.autoApply})`);

          // 更新使用统计（异步，不阻塞主流程）
          this.updateFilterUsage(filter.id).catch(err => {
            console.error('[BusinessRulesEngine] 更新过滤规则使用统计失败:', err);
          });
        }
      }

      console.log(`[BusinessRulesEngine] 过滤规则获取完成，找到 ${filters.length} 个适用规则`);
      return filters;

    } catch (error) {
      console.error('[BusinessRulesEngine] 获取过滤规则失败:', error);
      // 降级：返回空数组，不阻塞 SQL 生成流程
      return [];
    }
  }

  /**
   * 更新过滤规则使用统计
   * @param filterId 过滤规则 ID
   */
  private async updateFilterUsage(filterId: number): Promise<void> {
    try {
      await this.prisma.commonFilter.update({
        where: { id: filterId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        }
      });
    } catch (error) {
      console.error(`[BusinessRulesEngine] 更新过滤规则使用统计失败 (ID: ${filterId}):`, error);
    }
  }

  /**
   * 获取聚合计算规则
   *
   * 实现说明：
   * 1. 从数据库读取聚合规则
   * 2. 使用 Redis 缓存
   * 3. 按指标名称匹配
   * 4. 更新使用统计
   */
  async getAggregationRule(metricName: string): Promise<AggregationRuleResult | null> {
    console.log('[BusinessRulesEngine] 获取聚合规则:', metricName);

    try {
      // Level 1: 检查 Redis 缓存
      const cacheKey = `aggregation_rule:${metricName}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        console.log('[BusinessRulesEngine] 聚合规则 - Redis 缓存命中');
        return JSON.parse(cached);
      }

      // Level 2: 从数据库查询
      const rule = await this.prisma.aggregationRule.findFirst({
        where: {
          metricName,
          isEnabled: true
        }
      });

      if (!rule) {
        console.log(`[BusinessRulesEngine] 未找到聚合规则: ${metricName}`);
        return null;
      }

      const result: AggregationRuleResult = {
        name: rule.name,
        metricName: rule.metricName,
        sourceTable: rule.sourceTable,
        sourceColumn: rule.sourceColumn,
        aggregationFunction: rule.aggregationFunction,
        unit: rule.unit || undefined,
        semanticDescription: rule.semanticDescription || undefined
      };

      // 写入 Redis 缓存（TTL: 1 小时）
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);

      console.log(`[BusinessRulesEngine] 找到聚合规则: ${rule.name} (${rule.aggregationFunction})`);

      // 更新使用统计（异步，不阻塞主流程）
      this.updateAggregationUsage(rule.id).catch(err => {
        console.error('[BusinessRulesEngine] 更新聚合规则使用统计失败:', err);
      });

      return result;

    } catch (error) {
      console.error('[BusinessRulesEngine] 获取聚合规则失败:', error);
      // 降级：返回 null，不阻塞 SQL 生成流程
      return null;
    }
  }

  /**
   * 更新聚合规则使用统计
   * @param ruleId 聚合规则 ID
   */
  private async updateAggregationUsage(ruleId: number): Promise<void> {
    try {
      await this.prisma.aggregationRule.update({
        where: { id: ruleId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        }
      });
    } catch (error) {
      console.error(`[BusinessRulesEngine] 更新聚合规则使用统计失败 (ID: ${ruleId}):`, error);
    }
  }

  /**
   * 计算相似度（简单实现）
   * 实际应使用向量嵌入 + 余弦相似度
   *
   * @param query1 查询文本 1
   * @param query2 查询文本 2
   * @returns 相似度分数 (0-1)
   */
  private calculateSimilarity(query1: string, query2: string): number {
    // 简单的 Jaccard 相似度
    const words1 = new Set(query1.split(/[\s,，。！？、]+/));
    const words2 = new Set(query2.split(/[\s,，。！？、]+/));

    // 计算交集
    const words1Array = Array.from(words1);
    const intersection = new Set(words1Array.filter(x => words2.has(x)));

    // 计算并集
    const union = new Set([...words1Array, ...Array.from(words2)]);

    return intersection.size / union.size;
  }

  /**
   * 清理资源
   * 断开数据库连接
   */
  async cleanup(): Promise<void> {
    console.log('[BusinessRulesEngine] 清理资源...');
    try {
      await this.prisma.$disconnect();
      // Redis 客户端由全局单例管理，不在此处断开
      console.log('[BusinessRulesEngine] 资源清理完成');
    } catch (error) {
      console.error('[BusinessRulesEngine] 资源清理失败:', error);
    }
  }
}
