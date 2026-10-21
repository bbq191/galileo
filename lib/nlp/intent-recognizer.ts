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
import type { SemanticCacheManager } from '@/lib/cache/semantic-cache-manager';
import type { SemanticCacheStats } from '@/lib/cache/semantic-cache-stats';
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
    @inject(DI_TOKENS.QueryCacheManager) private readonly queryCacheManager: QueryCacheManager,
    @inject(DI_TOKENS.SemanticCacheManager) private readonly semanticCacheManager: SemanticCacheManager,
    @inject(DI_TOKENS.SemanticCacheStats) private readonly semanticCacheStats: SemanticCacheStats
  ) {}

  /**
   * 识别用户查询意图（带缓存）
   */
  async recognize(
    naturalLanguageQuery: string,
    options: { useCache?: boolean; useSemanticCache?: boolean } = {}
  ): Promise<QueryIntent> {
    const { useCache = true, useSemanticCache = true } = options;

    console.log('开始识别用户意图:', naturalLanguageQuery);

    // 1. 尝试从精确缓存获取意图
    if (useCache) {
      const cachedIntent = await this.queryCacheManager.getIntent(naturalLanguageQuery);
      if (cachedIntent) {
        console.log('✓ 精确缓存命中，直接返回');
        this.semanticCacheStats.recordExactHit(naturalLanguageQuery);
        return cachedIntent;
      }
    }

    // 2. 尝试从语义缓存获取相似查询的意图
    if (useSemanticCache) {
      const similarResult = await this.semanticCacheManager.findSimilar(naturalLanguageQuery, {
        threshold: 0.85, // 相似度阈值
        limit: 1,
      });

      if (similarResult) {
        console.log(`✓ 语义缓存命中！`);
        console.log(`  原始查询: "${similarResult.entry.originalQuery}"`);
        console.log(`  相似度: ${(similarResult.score * 100).toFixed(2)}%`);

        // 记录语义缓存命中统计
        this.semanticCacheStats.recordSemanticHit(
          naturalLanguageQuery,
          similarResult.score,
          similarResult.entry.originalQuery
        );

        // 返回缓存的意图
        return similarResult.entry.intent;
      }
    }

    // 3. 所有缓存都未命中，记录统计
    this.semanticCacheStats.recordMiss(naturalLanguageQuery);
    console.log('✗ 缓存未命中，使用 AI 进行意图识别');

    // 4. 使用 AI 进行意图识别
    const rawIntent = await this.recognizeWithAI(naturalLanguageQuery);

    // 5. 实体消歧（处理多义性）
    const resolvedIntent = await this.resolveAmbiguity(rawIntent);

    // 6. 解析时间表达式
    const intentWithTime = await this.parseTimeExpressions(resolvedIntent);

    // 7. 验证意图完整性
    const validatedIntent = await this.validateIntent(intentWithTime);

    // 8. 将意图写入精确缓存
    if (useCache) {
      await this.queryCacheManager.setIntent(naturalLanguageQuery, validatedIntent);
    }

    // 9. 将意图写入语义缓存
    if (useSemanticCache) {
      await this.semanticCacheManager.addQuery(naturalLanguageQuery, validatedIntent);
      console.log('✓ 已将查询添加到语义缓存');
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
   * 获取数据库中所有可用的表（包含业务域信息）
   */
  private async getAvailableTables(): Promise<Array<{
    name: string;
    description: string;
    database: string;
    domain?: string;
    domainDescription?: string;
  }>> {
    try {
      const tables = await this.prisma.tableMeta.findMany({
        take: 100, // 限制返回前 100 个表
        include: {
          database: {
            include: {
              domain: true, // 包含业务域信息
            },
          },
        },
        orderBy: {
          id: 'asc',
        },
      });

      return tables.map(table => ({
        name: table.tableName,
        description: table.tableComment || table.semanticDescription || '',
        database: table.database.databaseName,
        domain: table.database.domain?.name, // 业务域名称
        domainDescription: table.database.domain?.description || undefined, // 业务域描述
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
        // AI 可能返回没有 column 的 orderBy（如只有 direction），视为无排序
        orderBy: validatedColumns.validOrderBy && intent.conditions?.orderBy?.column ? intent.conditions.orderBy : undefined,
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
   * 智能搜索相似字段
   */
  private findSimilarColumn(
    targetColumn: string,
    availableColumns: Array<{ columnName: string; columnComment?: string; semanticDescription?: string; dataType: string }>
  ): { columnName: string; confidence: number } | null {
    // 时间字段的别名
    const timeFieldAliases: Record<string, string[]> = {
      create_time: ['starttime', 'opentime', 'createtime', 'created_at', 'create_time'],
      update_time: ['endtime', 'updatetime', 'updated_at', 'update_time'],
      time: ['starttime', 'opentime', 'endtime', 'createtime', 'time'],
    };

    // ID 字段的别名
    const idFieldAliases: Record<string, string[]> = {
      room_id: ['live_id', 'uid', 'id', 'room_id'],
      user_id: ['uid', 'userid', 'user_id'],
      id: ['uid', 'id', 'live_id'],
    };

    const lowerTarget = targetColumn.toLowerCase();

    // 1. 精确匹配（不区分大小写）
    const exactMatch = availableColumns.find(col => col.columnName.toLowerCase() === lowerTarget);
    if (exactMatch) {
      return { columnName: exactMatch.columnName, confidence: 1.0 };
    }

    // 2. 检查时间字段别名
    for (const [alias, candidates] of Object.entries(timeFieldAliases)) {
      if (lowerTarget.includes(alias) || alias.includes(lowerTarget)) {
        const match = availableColumns.find(col =>
          candidates.some(c => col.columnName.toLowerCase() === c.toLowerCase())
        );
        if (match) {
          return { columnName: match.columnName, confidence: 0.85 };
        }
      }
    }

    // 3. 检查 ID 字段别名
    for (const [alias, candidates] of Object.entries(idFieldAliases)) {
      if (lowerTarget.includes(alias) || alias.includes(lowerTarget)) {
        const match = availableColumns.find(col =>
          candidates.some(c => col.columnName.toLowerCase() === c.toLowerCase())
        );
        if (match) {
          return { columnName: match.columnName, confidence: 0.85 };
        }
      }
    }

    // 4. 基于数据类型的推断
    if (lowerTarget.includes('time') || lowerTarget.includes('date')) {
      // 寻找时间类型字段
      const timeColumn = availableColumns.find(col =>
        col.dataType.toLowerCase().includes('time') ||
        col.dataType.toLowerCase().includes('date')
      );
      if (timeColumn) {
        return { columnName: timeColumn.columnName, confidence: 0.7 };
      }
    }

    // 5. 模糊匹配（Levenshtein 距离）
    const fuzzyMatch = availableColumns
      .map(col => ({
        ...col,
        similarity: this.calculateSimilarity(lowerTarget, col.columnName.toLowerCase()),
      }))
      .filter(col => col.similarity > 0.6)
      .sort((a, b) => b.similarity - a.similarity)[0];

    if (fuzzyMatch) {
      return { columnName: fuzzyMatch.columnName, confidence: fuzzyMatch.similarity };
    }

    return null;
  }

  /**
   * 计算字符串相似度（简单的 Levenshtein 距离）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Levenshtein 距离算法
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * 验证字段是否存在于表中（增强版，支持智能匹配）
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

    // 收集所有有效字段（包含完整元数据）
    const allColumns: Array<{ columnName: string; columnComment?: string; semanticDescription?: string; dataType: string }> = [];
    tableMetas.forEach((table: any) => {
      table.columns.forEach((col: any) => {
        allColumns.push({
          columnName: col.columnName,
          columnComment: col.columnComment,
          semanticDescription: col.semanticDescription,
          dataType: col.dataType,
        });
      });
    });

    const allValidColumnNames = new Set<string>(allColumns.map(c => c.columnName));

    console.log('[IntentRecognizer] 表中的有效字段:', Array.from(allValidColumnNames));

    // 验证 SELECT 字段（支持智能匹配）
    const validSelectColumns = selectColumns.map(col => {
      if (allValidColumnNames.has(col)) {
        return col;
      }

      // 尝试智能匹配
      const similar = this.findSimilarColumn(col, allColumns);
      if (similar && similar.confidence > 0.7) {
        warnings.push(`字段"${col}"不存在，已自动替换为"${similar.columnName}"（相似度: ${(similar.confidence * 100).toFixed(0)}%）`);
        return similar.columnName;
      }

      warnings.push(`字段"${col}"不存在且无法找到替代字段，已忽略`);
      return null;
    }).filter((col): col is string => col !== null);

    // 验证聚合字段（支持智能匹配）
    let validAggregation = true;
    const validAggregationColumns: string[] = [];
    if (aggregationColumns.length > 0) {
      for (const col of aggregationColumns) {
        if (allValidColumnNames.has(col)) {
          validAggregationColumns.push(col);
          continue;
        }

        // 尝试智能匹配
        const similar = this.findSimilarColumn(col, allColumns);
        if (similar && similar.confidence > 0.7) {
          warnings.push(`聚合字段"${col}"不存在，已自动替换为"${similar.columnName}"（相似度: ${(similar.confidence * 100).toFixed(0)}%）`);
          validAggregationColumns.push(similar.columnName);
        } else {
          warnings.push(`聚合字段"${col}"不存在且无法找到替代字段，已移除聚合操作`);
          validAggregation = false;
        }
      }
    }

    // 验证 GROUP BY 字段（特殊处理：month 等派生字段标记为需要生成）
    if (groupByColumns.length > 0) {
      for (const col of groupByColumns) {
        // 特殊处理：month, year, date 等派生字段
        if (['month', 'year', 'date', 'day', 'week'].includes(col.toLowerCase())) {
          warnings.push(`GROUP BY 字段"${col}"是时间派生字段，SQL 生成时需要使用时间函数`);
          // 不影响 validAggregation
          continue;
        }

        if (allValidColumnNames.has(col)) {
          continue;
        }

        // 尝试智能匹配
        const similar = this.findSimilarColumn(col, allColumns);
        if (!similar || similar.confidence < 0.7) {
          warnings.push(`GROUP BY 字段"${col}"不存在且无法找到替代字段，已移除聚合操作`);
          validAggregation = false;
        }
      }
    }

    // 验证 ORDER BY 字段
    let validOrderBy = true;
    if (orderByColumns.length > 0) {
      for (const col of orderByColumns) {
        // 特殊处理派生字段
        if (['month', 'year', 'date', 'day', 'week'].includes(col.toLowerCase())) {
          warnings.push(`排序字段"${col}"是时间派生字段，SQL 生成时需要使用时间函数`);
          continue;
        }

        if (allValidColumnNames.has(col)) {
          continue;
        }

        const similar = this.findSimilarColumn(col, allColumns);
        if (!similar || similar.confidence < 0.7) {
          warnings.push(`排序字段"${col}"不存在且无法找到替代字段，已移除排序`);
          validOrderBy = false;
        }
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
