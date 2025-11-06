/**
 * 意图识别器
 * 负责识别用户的自然语言查询意图
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { DeepseekClient } from '@/lib/ai/deepseek-client';
import { PrismaClient } from '@prisma/client';
import { QueryIntent, RawIntent } from './types';
import { INTENT_SYSTEM_PROMPT, buildIntentPrompt, buildDisambiguationPrompt } from './prompts/intent-prompts';
import { EntityResolver } from './entity-resolver';
import { TimeParser } from './time-parser';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * 意图识别器类
 */
@injectable()
export class IntentRecognizer {
  constructor(
    @inject(DI_TOKENS.DeepseekClient) private readonly aiClient: DeepseekClient,
    @inject(DI_TOKENS.EntityResolver) private readonly entityResolver: EntityResolver,
    @inject(DI_TOKENS.TimeParser) private readonly timeParser: TimeParser,
    @inject(DI_TOKENS.PrismaClient) private readonly prisma: PrismaClient,
    @inject(DI_TOKENS.QueryCacheManager) private readonly queryCacheManager: QueryCacheManager
  ) {}

  /**
   * 识别用户查询意图（带缓存）
   */
  async recognize(
    naturalLanguageQuery: string,
    options: { useCache?: boolean } = {}
  ): Promise<QueryIntent> {
    const { useCache = true } = options;

    console.log('开始识别用户意图:', naturalLanguageQuery);

    // 1. 尝试从缓存获取意图
    if (useCache) {
      const cachedIntent = await this.queryCacheManager.getIntent(naturalLanguageQuery);
      if (cachedIntent) {
        console.log('意图缓存命中，直接返回');
        return cachedIntent;
      }
    }

    // 2. 缓存未命中，使用 AI 进行意图识别
    const rawIntent = await this.recognizeWithAI(naturalLanguageQuery);

    // 3. 实体消歧（处理多义性）
    const resolvedIntent = await this.resolveAmbiguity(rawIntent);

    // 4. 解析时间表达式
    const intentWithTime = await this.parseTimeExpressions(resolvedIntent);

    // 5. 验证意图完整性
    const validatedIntent = await this.validateIntent(intentWithTime);

    // 6. 将意图写入缓存
    if (useCache) {
      await this.queryCacheManager.setIntent(naturalLanguageQuery, validatedIntent);
    }

    console.log('意图识别完成:', JSON.stringify(validatedIntent, null, 2));

    return validatedIntent;
  }

  /**
   * 使用 AI 识别意图
   */
  private async recognizeWithAI(query: string): Promise<RawIntent> {
    try {
      // 获取数据库中的所有表名和描述
      const availableTables = await this.getAvailableTables();
      console.log(`[IntentRecognizer] 找到 ${availableTables.length} 个可用表`);

      const prompt = buildIntentPrompt(query, availableTables);

      const response = await this.aiClient.chat(
        [
          { role: 'system', content: INTENT_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        {
          temperature: 0.3, // 降低温度以获得更确定的结果
          max_tokens: 1500,
        }
      );

      console.log('[IntentRecognizer] AI 原始响应:', response);

      // 解析 AI 返回的 JSON
      const rawIntent = this.parseAIResponse(response);

      console.log('[IntentRecognizer] 解析后的原始意图:', JSON.stringify(rawIntent, null, 2));

      return rawIntent;
    } catch (error) {
      console.error('AI 意图识别失败:', error);
      throw new Error(`意图识别失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取数据库中所有可用的表
   */
  private async getAvailableTables(): Promise<Array<{ name: string; description: string; database: string }>> {
    try {
      const tables = await this.prisma.tableMeta.findMany({
        take: 100, // 限制返回前 100 个表
        include: {
          database: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      return tables.map(table => ({
        name: table.tableName,
        description: table.tableSemanticDescription || table.tableComment || '',
        database: table.database.databaseName,
      }));
    } catch (error) {
      console.error('[IntentRecognizer] 获取可用表失败:', error);
      return [];
    }
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(response: string): RawIntent {
    try {
      // 尝试提取 JSON（AI 可能返回带解释的文本）
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // 如果没有找到 JSON，尝试直接解析
      return JSON.parse(response);
    } catch (error) {
      console.error('解析 AI 响应失败:', response);
      throw new Error('AI 返回的响应格式不正确');
    }
  }

  /**
   * 实体消歧处理
   */
  private async resolveAmbiguity(rawIntent: RawIntent): Promise<RawIntent> {
    const resolvedIntent = { ...rawIntent };

    console.log('[IntentRecognizer] 开始实体消歧，原始表名:', rawIntent.entities?.tables);

    // 处理表名消歧
    if (rawIntent.entities?.tables && rawIntent.entities.tables.length > 0) {
      const resolvedTables = [];

      for (const tableHint of rawIntent.entities.tables) {
        console.log(`[IntentRecognizer] 搜索表: ${tableHint}`);
        const matches = await this.entityResolver.searchTables(tableHint, 5);
        console.log(`[IntentRecognizer] 找到 ${matches.length} 个匹配的表`);

        if (matches.length === 0) {
          console.warn(`未找到匹配的表: ${tableHint}`);
          continue;
        }

        if (matches.length === 1 || matches[0].score >= 0.9) {
          // 唯一匹配或高置信度匹配
          resolvedTables.push(matches[0].matched.tableName);
        } else {
          // 多个匹配，需要消歧
          const bestMatch = await this.disambiguateEntity(tableHint, matches);
          if (bestMatch) {
            resolvedTables.push(bestMatch.matched.tableName);
          } else {
            // 如果无法消歧，选择分数最高的
            resolvedTables.push(matches[0].matched.tableName);
            if (!resolvedIntent.ambiguities) {
              resolvedIntent.ambiguities = [];
            }
            resolvedIntent.ambiguities.push(
              `表名"${tableHint}"存在多个匹配，已选择"${matches[0].matched.tableName}"`
            );
          }
        }
      }

      resolvedIntent.entities = {
        ...resolvedIntent.entities,
        tables: resolvedTables,
      };

      console.log('[IntentRecognizer] 表名消歧完成，解析后的表名:', resolvedTables);
    } else {
      console.warn('[IntentRecognizer] 原始意图中没有表名');
    }

    // 处理字段名消歧
    if (rawIntent.entities?.columns && rawIntent.entities.columns.length > 0) {
      const resolvedColumns = [];

      for (const columnHint of rawIntent.entities.columns) {
        const matches = await this.entityResolver.searchColumns(columnHint, undefined, 5);

        if (matches.length === 0) {
          console.warn(`未找到匹配的字段: ${columnHint}`);
          continue;
        }

        if (matches.length === 1 || matches[0].score >= 0.9) {
          resolvedColumns.push(matches[0].matched.columnName);
        } else {
          // 选择分数最高的
          resolvedColumns.push(matches[0].matched.columnName);
          if (!resolvedIntent.ambiguities) {
            resolvedIntent.ambiguities = [];
          }
          resolvedIntent.ambiguities.push(
            `字段名"${columnHint}"存在多个匹配，已选择"${matches[0].matched.columnName}"`
          );
        }
      }

      resolvedIntent.entities = {
        ...resolvedIntent.entities,
        columns: resolvedColumns,
      };
    }

    return resolvedIntent;
  }

  /**
   * 使用 AI 进行实体消歧
   */
  private async disambiguateEntity(
    hint: string,
    candidates: any[]
  ): Promise<any | null> {
    try {
      const prompt = buildDisambiguationPrompt(hint, candidates);

      const response = await this.aiClient.chat(
        [
          { role: 'system', content: '你是一个实体消歧专家，帮助选择最合适的实体匹配。' },
          { role: 'user', content: prompt }
        ],
        {
          temperature: 0.3,
          max_tokens: 500,
        }
      );

      const result = this.parseAIResponse(response) as any;

      if (result.selectedIndex > 0 && result.selectedIndex <= candidates.length) {
        return candidates[result.selectedIndex - 1];
      }

      return null;
    } catch (error) {
      console.error('实体消歧失败:', error);
      return null;
    }
  }

  /**
   * 解析时间表达式
   */
  private async parseTimeExpressions(intent: RawIntent): Promise<RawIntent> {
    const resolvedIntent = { ...intent };

    if (intent.conditions?.timeRange?.relative) {
      const parsedTime = this.timeParser.parse(intent.conditions.timeRange.relative);

      resolvedIntent.conditions = {
        ...resolvedIntent.conditions,
        timeRange: {
          ...parsedTime,
        },
      };
    }

    return resolvedIntent;
  }

  /**
   * 验证意图完整性
   */
  private async validateIntent(intent: RawIntent): Promise<QueryIntent> {
    // 检查必要字段是否存在
    if (!intent.entities?.tables || intent.entities.tables.length === 0) {
      throw new Error('无法识别查询涉及的表');
    }

    // 验证字段是否真实存在
    const validatedColumns = await this.validateColumns(
      intent.entities.tables,
      intent.entities.columns || [],
      intent.aggregations?.column ? [intent.aggregations.column] : [],
      intent.conditions?.orderBy?.column ? [intent.conditions.orderBy.column] : [],
      intent.aggregations?.groupBy || []
    );

    // 补充缺失的关联关系
    if (intent.entities.tables.length > 1 && !intent.joins) {
      intent.joins = await this.inferJoins(intent.entities.tables);
    }

    // 转换为标准格式
    const validatedIntent: QueryIntent = {
      type: this.normalizeQueryType(intent.type),
      entities: {
        databases: intent.entities.databases || [],
        tables: intent.entities.tables || [],
        columns: validatedColumns.validColumns,
      },
      conditions: {
        timeRange: intent.conditions?.timeRange,
        filters: intent.conditions?.filters || [],
        orderBy: validatedColumns.validOrderBy ? intent.conditions?.orderBy : undefined,
        limit: intent.conditions?.limit,
      },
      aggregations: validatedColumns.validAggregation ? intent.aggregations : undefined,
      joins: intent.joins,
      confidence: intent.confidence || 0.8,
      ambiguities: [
        ...(intent.ambiguities || []),
        ...validatedColumns.warnings
      ],
    };

    return validatedIntent;
  }

  /**
   * 验证字段是否存在于表中
   */
  private async validateColumns(
    tables: string[],
    selectColumns: string[],
    aggregationColumns: string[],
    orderByColumns: string[],
    groupByColumns: string[]
  ): Promise<{
    validColumns: string[];
    validAggregation: boolean;
    validOrderBy: boolean;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // 获取表的所有字段
    const tableMetas = await this.prisma.tableMeta.findMany({
      where: {
        tableName: { in: tables },
      },
      include: {
        columns: true,
      },
    });

    if (tableMetas.length === 0) {
      return {
        validColumns: [],
        validAggregation: false,
        validOrderBy: false,
        warnings: ['未找到表的元数据'],
      };
    }

    // 收集所有有效字段
    const allValidColumns = new Set<string>();
    tableMetas.forEach((table: any) => {
      table.columns.forEach((col: any) => {
        allValidColumns.add(col.columnName);
      });
    });

    console.log('[IntentRecognizer] 表中的有效字段:', Array.from(allValidColumns));

    // 验证 SELECT 字段
    const validSelectColumns = selectColumns.filter(col => {
      if (!allValidColumns.has(col)) {
        warnings.push(`字段"${col}"不存在于表中，已忽略`);
        return false;
      }
      return true;
    });

    // 验证聚合字段
    let validAggregation = true;
    if (aggregationColumns.length > 0) {
      const invalidAggCols = aggregationColumns.filter(col => !allValidColumns.has(col));
      if (invalidAggCols.length > 0) {
        warnings.push(`聚合字段"${invalidAggCols.join(', ')}"不存在，已移除聚合操作`);
        validAggregation = false;
      }
    }

    // 验证 GROUP BY 字段
    if (groupByColumns.length > 0) {
      const invalidGroupByCols = groupByColumns.filter(col => !allValidColumns.has(col));
      if (invalidGroupByCols.length > 0) {
        warnings.push(`GROUP BY 字段"${invalidGroupByCols.join(', ')}"不存在，已移除聚合操作`);
        validAggregation = false;
      }
    }

    // 验证 ORDER BY 字段
    let validOrderBy = true;
    if (orderByColumns.length > 0) {
      const invalidOrderByCols = orderByColumns.filter(col => !allValidColumns.has(col));
      if (invalidOrderByCols.length > 0) {
        warnings.push(`排序字段"${invalidOrderByCols.join(', ')}"不存在，已移除排序`);
        validOrderBy = false;
      }
    }

    console.log('[IntentRecognizer] 字段验证结果:', {
      validSelectColumns,
      validAggregation,
      validOrderBy,
      warnings,
    });

    return {
      validColumns: validSelectColumns,
      validAggregation,
      validOrderBy,
      warnings,
    };
  }

  /**
   * 标准化查询类型
   */
  private normalizeQueryType(type: string): 'select' | 'aggregate' | 'statistics' | 'comparison' {
    const typeMap: Record<string, 'select' | 'aggregate' | 'statistics' | 'comparison'> = {
      'select': 'select',
      'query': 'select',
      'aggregate': 'aggregate',
      'sum': 'aggregate',
      'count': 'aggregate',
      'avg': 'aggregate',
      'statistics': 'statistics',
      'stats': 'statistics',
      'comparison': 'comparison',
      'compare': 'comparison',
    };

    return typeMap[type.toLowerCase()] || 'select';
  }

  /**
   * 推断表关联关系
   */
  private async inferJoins(tables: string[]): Promise<any> {
    try {
      // 获取表的元数据
      const tableMetas = await this.prisma.tableMeta.findMany({
        where: {
          tableName: { in: tables },
        },
        include: {
          database: true,
        },
      });

      if (tableMetas.length < 2) {
        return undefined;
      }

      const tableIds = tableMetas.map((t: any) => t.id);

      // 查询显式关系
      const explicitRels = await this.prisma.explicitRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
        },
      });

      // 查询推断关系（高置信度）
      const inferredRels = await this.prisma.inferredRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
          confidenceScore: { gte: 0.75 },
        },
      });

      // 如果找到了关系，返回 JOIN 信息
      if (explicitRels.length > 0 || inferredRels.length > 0) {
        return {
          type: 'inner',
          tables,
          relationships: [...explicitRels, ...inferredRels],
        };
      }

      return undefined;
    } catch (error) {
      console.error('推断表关系失败:', error);
      return undefined;
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.entityResolver.disconnect();
    await this.prisma.$disconnect();
  }
}

// Re-export types for convenience
export type { QueryIntent, RawIntent } from './types';
