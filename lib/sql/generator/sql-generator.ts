/**
 * SQL 生成器
 * 基于用户意图和元数据上下文生成 SQL 查询
 */

import { Parser } from 'node-sql-parser';
import { DeepseekClient, getDeepseekClient } from '@/lib/ai/deepseek-client';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { SQLGenerationResult, SQLGenerationOptions } from './types';
import { SQL_GENERATION_SYSTEM_PROMPT } from './prompts/sql-prompts';
import { CrossDatabaseHandler } from './cross-db-handler';

export class SQLGenerator {
  private aiClient: DeepseekClient;
  private parser: Parser;
  private crossDbHandler: CrossDatabaseHandler;

  constructor(aiClient?: DeepseekClient) {
    this.aiClient = aiClient || getDeepseekClient();
    this.parser = new Parser();
    this.crossDbHandler = new CrossDatabaseHandler();
  }

  /**
   * 生成 SQL 查询
   */
  async generate(
    intent: QueryIntent,
    context: MetadataContext,
    options: SQLGenerationOptions = {}
  ): Promise<SQLGenerationResult> {
    const maxRetries = options.maxRetries || 2;
    let lastError: Error | null = null;

    // 1. 分析是否为跨库查询
    const crossDbAnalysis = this.crossDbHandler.analyzeCrossDatabaseQuery(intent, context);

    // 带重试机制的生成
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 2. 构建 SQL 生成 Prompt
        let prompt = this.buildSQLGenerationPrompt(intent, context);

        // 3. 如果是跨库查询，增强 Prompt
        if (crossDbAnalysis.isCrossDatabase) {
          prompt = this.crossDbHandler.enhancePromptForCrossDb(prompt, crossDbAnalysis);
        }

        // 4. 调用 AI 生成 SQL
        const aiResponse = await this.aiClient.chat([
          { role: 'system', content: SQL_GENERATION_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ], {
          timeout: options.timeout || 30000,
          temperature: 0.1, // 降低温度以获得更确定的输出
          maxTokens: 2000
        });

        // 5. 解析 AI 返回的结果
        const result = this.parseAIResponse(aiResponse);

        // 6. 后处理 SQL（标准化格式）
        result.sql = this.formatSQL(result.sql);

        // 7. 基础验证
        this.validateSQLStructure(result.sql);

        // 8. 跨库 SQL 特殊验证
        if (crossDbAnalysis.isCrossDatabase) {
          const crossDbValidation = this.crossDbHandler.validateCrossDbSQL(result.sql, crossDbAnalysis);

          if (!crossDbValidation.isValid) {
            throw new Error(`跨库 SQL 验证失败: ${crossDbValidation.errors.join('; ')}`);
          }

          // 合并跨库警告
          result.warnings = [
            ...(result.warnings || []),
            ...crossDbValidation.warnings
          ];
        }

        return result;

      } catch (error) {
        lastError = error as Error;
        console.warn(`SQL generation attempt ${attempt + 1} failed:`, error);

        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          throw new Error(`SQL 生成失败（已重试 ${maxRetries} 次）: ${lastError.message}`);
        }

        // 等待一小段时间后重试
        await this.delay(1000 * (attempt + 1));
      }
    }

    // 理论上不会执行到这里，但为了类型安全
    throw lastError || new Error('SQL 生成失败');
  }

  /**
   * 构建 SQL 生成 Prompt
   */
  private buildSQLGenerationPrompt(
    intent: QueryIntent,
    context: MetadataContext
  ): string {
    // 构建表结构描述
    const tableSchemas = context.tables.map(t => `
### 表: ${t.databaseName}.${t.tableName}
**表说明**: ${t.semanticDescription || t.tableComment || '无'}
**字段**:
${t.columns.map(c => `  - ${c.columnName} (${c.dataType})${c.isPrimaryKey ? ' [主键]' : ''}
    说明: ${c.semanticDescription || c.columnComment || '无'}${c.sampleValues && c.sampleValues.length > 0 ? `
    示例值: ${c.sampleValues.slice(0, 3).map(v => v === null ? 'NULL' : String(v)).join(', ')}` : ''}`
    ).join('\n')}
`).join('\n');

    // 构建关系描述
    const relationships = context.relationships && context.relationships.length > 0
      ? context.relationships.map(r =>
          `- ${r.sourceTable}.${r.sourceColumn} → ${r.targetTable}.${r.targetColumn} (${r.type}${r.confidence ? `, 置信度: ${r.confidence}` : ''})`
        ).join('\n')
      : '无显式关系';

    return `
## 用户查询意图

用户想要: ${this.describeIntent(intent)}

## 可用的数据库表和字段

${tableSchemas}

## 表关系

${relationships}

## 查询条件

${this.describeConditions(intent.conditions)}

## 任务

请生成符合以下要求的 SQL 查询：

1. 使用上述表和字段
2. 处理跨表关联（如果需要）
3. 应用查询条件和过滤
4. 如果涉及跨库查询，使用完整的数据库名限定表名：\`database\`.\`table\`
5. 确保 SQL 语法正确且高效
6. 添加必要的注释说明

返回 JSON 格式：
{
  "sql": "生成的 SQL 语句",
  "explanation": "SQL 解释说明",
  "confidence": 0.95,
  "usedTables": ["table1", "table2"],
  "usedColumns": ["col1", "col2"],
  "warnings": ["跨库 JOIN 可能影响性能"]
}
`;
  }

  /**
   * 描述用户意图
   */
  private describeIntent(intent: QueryIntent): string {
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

    const parts: string[] = [];

    if (conditions.timeRange) {
      parts.push(`时间范围: ${conditions.timeRange.relative || '自定义'}`);
    }

    if (conditions.filters && conditions.filters.length > 0) {
      parts.push(`过滤条件: ${conditions.filters.length} 个`);
      conditions.filters.forEach((filter: any, index: number) => {
        parts.push(`  - 条件 ${index + 1}: ${filter.column} ${filter.operator} ${filter.value}`);
      });
    }

    if (conditions.orderBy) {
      parts.push(`排序: ${conditions.orderBy.column} ${conditions.orderBy.direction}`);
    }

    if (conditions.limit) {
      parts.push(`限制: 前 ${conditions.limit} 条`);
    }

    return parts.length > 0 ? parts.join('\n') : '无特殊条件';
  }

  /**
   * 解析 AI 返回的响应
   */
  private parseAIResponse(response: string): SQLGenerationResult {
    try {
      // 尝试提取 JSON（AI 可能会在 JSON 前后添加其他文本）
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI 响应中未找到有效的 JSON 格式');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证必需字段
      if (!parsed.sql) {
        throw new Error('AI 响应缺少 sql 字段');
      }

      return {
        sql: parsed.sql,
        explanation: parsed.explanation || '',
        confidence: parsed.confidence || 0.8,
        usedTables: parsed.usedTables || [],
        usedColumns: parsed.usedColumns || [],
        estimatedRows: parsed.estimatedRows,
        warnings: parsed.warnings || []
      };

    } catch (error) {
      console.error('Failed to parse AI response:', response);
      throw new Error(`解析 AI 响应失败: ${(error as Error).message}`);
    }
  }

  /**
   * 格式化 SQL
   */
  private formatSQL(sql: string): string {
    try {
      // 移除多余的空白字符
      sql = sql.trim();

      // 使用 node-sql-parser 格式化
      const ast = this.parser.astify(sql, { database: 'MySQL' });
      const formatted = this.parser.sqlify(ast, { database: 'MySQL' });

      return formatted;

    } catch (error) {
      console.warn('SQL formatting failed, returning original SQL:', error);
      // 如果格式化失败，返回原始 SQL
      return sql;
    }
  }

  /**
   * 验证 SQL 结构
   */
  private validateSQLStructure(sql: string): void {
    try {
      const ast = this.parser.astify(sql, { database: 'MySQL' });

      // 确保只是 SELECT 查询
      if (ast.type !== 'select') {
        throw new Error(`不允许的 SQL 类型: ${ast.type}`);
      }

    } catch (error) {
      throw new Error(`SQL 结构验证失败: ${(error as Error).message}`);
    }
  }

  /**
   * 延迟函数（用于重试）
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
