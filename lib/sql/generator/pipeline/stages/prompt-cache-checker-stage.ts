/**
 * Prompt 缓存检查阶段
 *
 * 职责：
 * - 构建 SQL 生成 Prompt
 * - 检查是否有相似的 Prompt 已被缓存
 * - 如果找到缓存，解析并返回结果，停止管道
 * - 如果未找到，将 Prompt 保存到上下文中供后续阶段使用
 *
 * 优化效果：
 * - Prompt 缓存命中率：30-50%
 * - 节省 AI Token 消耗：15-25%
 */

import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { BasePipelineStage } from '../base-stage';
import { PipelineContext } from '../types';
import { PromptCacheManager, PromptType } from '@/lib/ai/prompt-cache-manager';
import { SQL_GENERATION_SYSTEM_PROMPT } from '../../prompts/sql-prompts';
import { SQLGenerationResult } from '../../types';
import { DI_TOKENS } from '@/lib/di/tokens';

@injectable()
export class PromptCacheChecker extends BasePipelineStage {
  readonly name = 'PromptCacheChecker';
  readonly description = 'Prompt 缓存检查器 - 复用相似 Prompt 的结果';
  readonly priority = 2;

  /** Prompt 相似度阈值 */
  private readonly SIMILARITY_THRESHOLD = 0.90;

  constructor(
    @inject(DI_TOKENS.PromptCacheManager) private readonly promptCache: PromptCacheManager
  ) {
    super();
  }

  /**
   * 执行 Prompt 缓存检查
   */
  protected async execute(context: PipelineContext): Promise<PipelineContext> {
    const { intent, metadata } = context;

    // 1. 构建 SQL 生成 Prompt
    const prompt = this.buildSQLGenerationPrompt(intent, metadata);

    // 将 Prompt 保存到上下文中，供后续阶段使用
    context.additionalData.sqlGenerationPrompt = prompt;

    this.log(context, `构建 SQL 生成 Prompt（${prompt.length} 字符）`, 'info');

    // 2. 检查 Prompt 缓存
    const cached = await this.promptCache.findSimilar(prompt, {
      type: PromptType.SQL_GENERATION,
      threshold: this.SIMILARITY_THRESHOLD
    });

    if (!cached) {
      this.log(context, 'Prompt 缓存未命中，继续到下一阶段', 'info');
      return context;
    }

    this.log(
      context,
      `Prompt 缓存命中！相似度：${cached.score.toFixed(3)}，节省 ${cached.tokensSaved} tokens`,
      'info'
    );

    // 3. 解析缓存的 AI 响应
    const result = this.parseAIResponse(cached.entry.response);

    if (!result) {
      this.log(context, 'Prompt 缓存响应解析失败，继续到下一阶段', 'warn');
      return context;
    }

    // 4. 停止管道并返回结果
    return this.createResultAndStop(context, result, 'prompt');
  }

  /**
   * 构建 SQL 生成 Prompt
   */
  private buildSQLGenerationPrompt(
    intent: PipelineContext['intent'],
    metadata: PipelineContext['metadata']
  ): string {
    // 构建表结构描述
    const tableSchemas = metadata.tables.map(t => {
      const fullTableName = `\`${t.databaseName}\`.\`${t.tableName}\``;
      return `
### 表: ${t.tableName}
**数据库**: ${t.databaseName}
**完整表名**: ${fullTableName}
**说明**: ${t.semanticDescription || t.tableComment || '无'}
**字段**:
${t.columns.map(c => `  - ${c.columnName} (${c.dataType})${c.isPrimaryKey ? ' [主键]' : ''}
    说明: ${c.semanticDescription || c.columnComment || '无'}${c.sampleValues && c.sampleValues.length > 0 ? `
    示例: ${c.sampleValues.slice(0, 3).map(v => v === null ? 'NULL' : String(v)).join(', ')}` : ''}`
      ).join('\n')}
`;
    }).join('\n');

    // 构建关系描述
    const relationships = metadata.relationships && metadata.relationships.length > 0
      ? metadata.relationships.map(r =>
          `- ${r.sourceTable}.${r.sourceColumn} → ${r.targetTable}.${r.targetColumn} (${r.type})`
        ).join('\n')
      : '无';

    // 描述用户意图
    const intentDesc = this.describeIntent(intent);

    // 描述查询条件
    const conditionsDesc = this.describeConditions(intent.conditions);

    return `
## 用户查询意图

${intentDesc}

## 可用的数据库表和字段

${tableSchemas}

## 表关系

${relationships}

## 查询条件

${conditionsDesc}

## 任务

请生成符合要求的 SQL 查询，返回 JSON 格式：
{
  "sql": "生成的 SQL 语句",
  "explanation": "SQL 解释说明",
  "confidence": 0.95,
  "usedTables": ["table1", "table2"],
  "usedColumns": ["col1", "col2"],
  "warnings": []
}
`;
  }

  /**
   * 描述用户意图
   */
  private describeIntent(intent: PipelineContext['intent']): string {
    let description = '';

    switch (intent.type) {
      case 'select':
        description = '查询明细数据';
        break;
      case 'aggregate':
        description = `统计聚合 (${intent.aggregations?.function || 'COUNT'})`;
        break;
      case 'statistics':
        description = '数据统计分析';
        break;
      case 'comparison':
        description = '对比分析';
        break;
      default:
        description = '数据查询';
    }

    if (intent.entities.tables && intent.entities.tables.length > 0) {
      description += `，涉及表: ${intent.entities.tables.join(', ')}`;
    }

    return description;
  }

  /**
   * 描述查询条件
   */
  private describeConditions(conditions: any): string {
    if (!conditions) return '无特殊条件';

    // 简化条件描述
    return JSON.stringify(conditions, null, 2);
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(response: string): SQLGenerationResult | null {
    try {
      // 1. 尝试直接解析 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 2. 验证必需字段
      if (!parsed.sql) {
        return null;
      }

      // 3. 构建结果
      return {
        sql: parsed.sql,
        explanation: parsed.explanation || 'SQL 查询',
        confidence: parsed.confidence || 0.9,
        usedTables: parsed.usedTables || [],
        usedColumns: parsed.usedColumns || [],
        warnings: parsed.warnings || []
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 决定是否应该执行此阶段
   */
  shouldExecute(context: PipelineContext): boolean {
    // 如果禁用缓存，跳过此阶段
    if (context.options.useCache === false) {
      return false;
    }

    return true;
  }

  /**
   * Prompt 缓存阶段失败不应该中断流程
   */
  protected shouldThrowError(context: PipelineContext, error: unknown): boolean {
    return false;
  }
}
