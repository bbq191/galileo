/**
 * 业务规则引擎
 * 增强 AI 对业务逻辑的理解
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import prisma from '@/lib/prisma/client';
import { getRedisClient } from '@/lib/cache/redis-client';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

/**
 * 业务术语匹配结果
 */
export interface BusinessTermMatch {
  id?: number;
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
  id?: number;
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
  id?: number;
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
  id?: number;
  name: string;
  metricName: string;
  sourceTable: string;
  sourceColumn: string;
  aggregationFunction: string;
  unit?: string;
  semanticDescription?: string;
}

/**
 * 实际注入 Prompt 的规则（用于记录使用统计）
 */
export interface AppliedRuleIds {
  termIds: number[];
  templateIds: number[];
  filterIds: number[];
  aggregationIds: number[];
}

/**
 * 业务规则引擎
 *
 * 各 match / get 方法只负责匹配，不更新使用统计；
 * 规则真正注入 Prompt 后由调用方通过 recordUsage 记录。
 */
export class BusinessRulesEngine {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor() {
    this.prisma = prisma;
    this.redis = getRedisClient();
  }

  /**
   * 读取 Redis 缓存；Redis 不可用时返回 null 并回退到数据库，不影响规则匹配
   */
  private async getCached<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      return cached ? (JSON.parse(cached) as T) : null;
    } catch (error) {
      console.warn('[BusinessRulesEngine] 读取缓存失败，回退到数据库:', error);
      return null;
    }
  }

  private async setCached(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      console.warn('[BusinessRulesEngine] 写入缓存失败:', error);
    }
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
      const cached = await this.getCached<BusinessTermMatch[]>(cacheKey);

      if (cached) {
        console.log('[BusinessRulesEngine] 业务术语匹配 - Redis 缓存命中');
        return cached;
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
            id: term.id,
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
      await this.setCached(cacheKey, matches, 3600);

      console.log(`[BusinessRulesEngine] 业务术语匹配完成，找到 ${matches.length} 个匹配项`);
      return matches;

    } catch (error) {
      console.error('[BusinessRulesEngine] 业务术语匹配失败:', error);
      // 降级：返回空数组，不阻塞 SQL 生成流程
      return [];
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
            id: template.id,
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
            id: filter.id,
            name: filter.name,
            targetTable: filter.targetTable,
            filterCondition: filter.filterCondition,
            autoApply: filter.autoApply,
            priority: filter.priority,
            semanticKeywords
          });

          console.log(`[BusinessRulesEngine] 找到适用的过滤规则: ${filter.name} (优先级: ${filter.priority}, 自动应用: ${filter.autoApply})`);
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
      const cached = await this.getCached<AggregationRuleResult>(cacheKey);

      if (cached) {
        console.log('[BusinessRulesEngine] 聚合规则 - Redis 缓存命中');
        return cached;
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
        id: rule.id,
        name: rule.name,
        metricName: rule.metricName,
        sourceTable: rule.sourceTable,
        sourceColumn: rule.sourceColumn,
        aggregationFunction: rule.aggregationFunction,
        unit: rule.unit || undefined,
        semanticDescription: rule.semanticDescription || undefined
      };

      // 写入 Redis 缓存（TTL: 1 小时）
      await this.setCached(cacheKey, result, 3600);

      console.log(`[BusinessRulesEngine] 找到聚合规则: ${rule.name} (${rule.aggregationFunction})`);

      return result;

    } catch (error) {
      console.error('[BusinessRulesEngine] 获取聚合规则失败:', error);
      // 降级：返回 null，不阻塞 SQL 生成流程
      return null;
    }
  }

  /**
   * 计算查询与模板模式的相似度
   *
   * 模式示例：`查询{指标}最{高/低}的{N}个{维度}`
   * - 含 `/` 的占位符是候选关键词（高 或 低）
   * - 其他占位符匹配任意内容
   * 中文问题没有空格，不能按词切分比较。按模式构造正则：不匹配为 0，
   * 匹配时模式中的固定文字越多越具体，得分越高（0.5 ~ 1）。
   */
  private calculateSimilarity(query: string, pattern: string): number {
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let literalLength = 0;

    const source = pattern
      .split(/(\{[^}]*\})/)
      .filter(Boolean)
      .map((part) => {
        const placeholder = /^\{([^}]*)\}$/.exec(part);
        if (!placeholder) {
          literalLength += part.length;
          return escape(part);
        }
        const alternatives = placeholder[1].split('/').map((a) => a.trim()).filter(Boolean);
        if (alternatives.length > 1) {
          literalLength += Math.min(...alternatives.map((a) => a.length));
          return `(?:${alternatives.map(escape).join('|')})`;
        }
        return '.+?';
      })
      .join('');

    if (literalLength === 0 || !new RegExp(source).test(query)) {
      return 0;
    }
    return 0.5 + Math.min(0.5, literalLength / 20);
  }

  /**
   * 匹配问题中提到的聚合指标
   *
   * 按指标名长度从长到短匹配，被更长指标包含的短指标不再重复命中
   * （如「平均观看时长」不会同时命中「观看时长」）
   */
  async matchAggregationRules(naturalLanguageQuery: string): Promise<AggregationRuleResult[]> {
    try {
      const rules = await this.prisma.aggregationRule.findMany({ where: { isEnabled: true } });
      const sorted = [...rules].sort((a, b) => b.metricName.length - a.metricName.length);

      const matched: AggregationRuleResult[] = [];
      let remaining = naturalLanguageQuery;
      for (const rule of sorted) {
        if (!remaining.includes(rule.metricName)) continue;
        remaining = remaining.split(rule.metricName).join(' ');
        matched.push({
          id: rule.id,
          name: rule.name,
          metricName: rule.metricName,
          sourceTable: rule.sourceTable,
          sourceColumn: rule.sourceColumn,
          aggregationFunction: rule.aggregationFunction,
          unit: rule.unit || undefined,
          semanticDescription: rule.semanticDescription || undefined,
        });
      }
      return matched;
    } catch (error) {
      console.error('[BusinessRulesEngine] 匹配聚合规则失败:', error);
      return [];
    }
  }

  /**
   * 记录规则使用统计（仅针对实际注入 Prompt 的规则，异步执行不阻塞主流程）
   */
  recordUsage(applied: AppliedRuleIds): void {
    const now = new Date();
    const data = { usageCount: { increment: 1 }, lastUsedAt: now };
    const updates = [
      applied.termIds.length && this.prisma.businessTermMapping.updateMany({ where: { id: { in: applied.termIds } }, data }),
      applied.templateIds.length && this.prisma.queryTemplate.updateMany({ where: { id: { in: applied.templateIds } }, data }),
      applied.filterIds.length && this.prisma.commonFilter.updateMany({ where: { id: { in: applied.filterIds } }, data }),
      applied.aggregationIds.length && this.prisma.aggregationRule.updateMany({ where: { id: { in: applied.aggregationIds } }, data }),
    ].filter(Boolean);

    Promise.all(updates).catch((error) => {
      console.error('[BusinessRulesEngine] 更新规则使用统计失败:', error);
    });
  }
}
