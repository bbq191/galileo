/**
 * AI 生成器阶段
 *
 * 职责：
 * - 使用 SmartBatchProcessor 调用 AI 生成 SQL
 * - 支持批量处理以减少 API 调用
 * - 自动将结果保存到 Prompt 缓存和 SQL 缓存
 * - 处理跨库查询增强
 *
 * 优化效果：
 * - 通过批处理减少 API 调用：30-40%
 * - 降低成本：配合缓存可达 40%
 */

import { AICallType } from "@/lib/ai/ai-cost-tracker";
import { PromptCacheManager, PromptType } from "@/lib/ai/prompt-cache-manager";
import { SmartBatchProcessor } from "@/lib/ai/smart-batch-processor";
import type { QueryCacheManager } from "@/lib/cache/query-cache-manager";
import { DI_TOKENS } from "@/lib/di/tokens";
import "reflect-metadata";
import { inject, injectable } from "tsyringe";
import { CrossDatabaseHandler } from "../../cross-db-handler";
import { SQL_GENERATION_SYSTEM_PROMPT } from "../../prompts/sql-prompts";
import { SQLGenerationResult } from "../../types";
import { BasePipelineStage } from "../base-stage";
import { PipelineContext } from "../types";

@injectable()
export class AIGenerator extends BasePipelineStage {
  readonly name = "AIGenerator";
  readonly description = "AI 生成器 - 使用批处理优化调用 AI 生成 SQL";
  readonly priority = 4;

  /** AI 调用超时时间（毫秒） */
  private readonly AI_TIMEOUT = 30000;

  constructor(
    @inject(DI_TOKENS.SmartBatchProcessor)
    private readonly batchProcessor: SmartBatchProcessor,
    @inject(DI_TOKENS.PromptCacheManager)
    private readonly promptCache: PromptCacheManager,
    @inject(DI_TOKENS.QueryCacheManager)
    private readonly queryCacheManager: QueryCacheManager,
    @inject(DI_TOKENS.CrossDatabaseHandler)
    private readonly crossDbHandler: CrossDatabaseHandler
  ) {
    super();
  }

  /**
   * 执行 AI SQL 生成
   */
  protected async execute(context: PipelineContext): Promise<PipelineContext> {
    const { intent, metadata, options } = context;

    // 1. 获取或构建 Prompt（如果 PromptCacheChecker 已经构建，则复用）
    let prompt = context.additionalData.sqlGenerationPrompt as
      | string
      | undefined;

    if (!prompt) {
      this.log(context, "未找到预构建的 Prompt，重新构建...", "info");
      // 🆕 获取业务域推断结果（如果有）
      const domainInference = context.additionalData.domainInference;
      prompt = this.buildSQLGenerationPrompt(intent, metadata, domainInference);
      context.additionalData.sqlGenerationPrompt = prompt;
    }

    // 2. 分析是否为跨库查询
    const crossDbAnalysis = this.crossDbHandler.analyzeCrossDatabaseQuery(
      intent,
      metadata
    );

    if (crossDbAnalysis.isCrossDatabase) {
      this.log(
        context,
        `检测到跨库查询（${crossDbAnalysis.databases.length} 个数据库），增强 Prompt`,
        "info"
      );
      prompt = this.crossDbHandler.enhancePromptForCrossDb(
        prompt,
        crossDbAnalysis
      );
    }

    // 3. 使用 SmartBatchProcessor 调用 AI
    this.log(context, "使用批处理器调用 AI 生成 SQL...", "info");

    const requestId = `sql_gen_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      const response = await this.batchProcessor.addRequest({
        id: requestId,
        messages: [
          { role: "system", content: SQL_GENERATION_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        type: AICallType.SQL_GENERATION,
        promptType: PromptType.SQL_GENERATION,
        priority: 1, // SQL 生成优先级较高
        temperature: 0.1, // 低温度以获得确定性输出
        maxTokens: 2000
      });

      this.log(
        context,
        `AI 调用完成（${response.cached ? "来自缓存" : "新生成"}），Token: ${
          response.tokens?.totalTokens || 0
        }`,
        "info"
      );

      // 4. 解析 AI 响应
      const result = this.parseAIResponse(response.response);

      if (!result) {
        throw new Error("AI 响应解析失败");
      }

      // 5. 跨库验证（如果需要）
      if (crossDbAnalysis.isCrossDatabase) {
        const crossDbValidation = this.crossDbHandler.validateCrossDbSQL(
          result.sql,
          crossDbAnalysis
        );

        if (!crossDbValidation.isValid) {
          throw new Error(
            `跨库 SQL 验证失败: ${crossDbValidation.errors.join("; ")}`
          );
        }

        // 合并跨库警告
        result.warnings = [
          ...(result.warnings || []),
          ...crossDbValidation.warnings,
        ];
      }

      // 6. 保存到缓存
      await this.saveToCache(
        prompt,
        response.response,
        result,
        intent,
        options,
        response.tokens
      );

      // 7. 设置结果并继续到验证阶段
      context.result = result;

      return context;
    } catch (error) {
      this.log(
        context,
        `AI 生成失败：${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      throw error;
    }
  }

  /**
   * 构建 SQL 生成 Prompt（简化版本，与 PromptCacheChecker 保持一致）
   *
   * @author xusy
   */
  private buildSQLGenerationPrompt(
    intent: PipelineContext["intent"],
    metadata: PipelineContext["metadata"],
    domainInference?: {
      domainId: number;
      domainName: string;
      confidence: number;
      matchedKeywords: string[];
    }
  ): string {
    // 构建表结构描述
    const tableSchemas = metadata.tables
      .map((t) => {
        const fullTableName = `\`${t.databaseName}\`.\`${t.tableName}\``;
        return `
### 表: ${t.tableName}
**数据库**: ${t.databaseName}
**完整表名**: ${fullTableName}
**说明**: ${t.tableComment || t.semanticDescription || "无"}
**字段**:
${t.columns
  .map(
    (c) => `  - ${c.columnName} (${c.dataType})${
      c.isPrimaryKey ? " [主键]" : ""
    }
    说明: ${c.columnComment || c.semanticDescription || "无"}${
      c.sampleValues && c.sampleValues.length > 0
        ? `
    示例: ${c.sampleValues
      .slice(0, 3)
      .map((v) => (v === null ? "NULL" : String(v)))
      .join(", ")}`
        : ""
    }`
  )
  .join("\n")}
`;
      })
      .join("\n");

    // 构建关系描述
    const relationships =
      metadata.relationships && metadata.relationships.length > 0
        ? metadata.relationships
            .map(
              (r) =>
                `- ${r.sourceTable}.${r.sourceColumn} → ${r.targetTable}.${r.targetColumn} (${r.type})`
            )
            .join("\n")
        : "无";

    // 描述用户意图
    const intentDesc = this.describeIntent(intent);

    // 描述查询条件
    const conditionsDesc = this.describeConditions(intent.conditions);

    // 🆕 构建业务域上下文（如果有）
    const { buildDomainContextSection } = require('../../prompts/sql-prompts');
    const domainContext = buildDomainContextSection(domainInference);

    return `
## 用户查询意图

${intentDesc}

${domainContext ? `\n${domainContext}\n` : ''}
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
  private describeIntent(intent: PipelineContext["intent"]): string {
    let description = "";

    switch (intent.type) {
      case "select":
        description = "查询明细数据";
        break;
      case "aggregate":
        description = `统计聚合 (${intent.aggregations?.function || "COUNT"})`;
        break;
      case "statistics":
        description = "数据统计分析";
        break;
      case "comparison":
        description = "对比分析";
        break;
      default:
        description = "数据查询";
    }

    if (intent.entities.tables && intent.entities.tables.length > 0) {
      description += `，涉及表: ${intent.entities.tables.join(", ")}`;
    }

    return description;
  }

  /**
   * 描述查询条件
   */
  private describeConditions(conditions: any): string {
    if (!conditions) return "无特殊条件";
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
        explanation: parsed.explanation || "SQL 查询",
        confidence: parsed.confidence || 0.9,
        usedTables: parsed.usedTables || [],
        usedColumns: parsed.usedColumns || [],
        estimatedRows: parsed.estimatedRows,
        warnings: parsed.warnings || [],
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 保存到缓存
   */
  private async saveToCache(
    prompt: string,
    aiResponse: string,
    result: SQLGenerationResult,
    intent: PipelineContext["intent"],
    options: PipelineContext["options"],
    tokens?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }
  ): Promise<void> {
    try {
      // 1. 保存 Prompt 缓存
      if (tokens) {
        await this.promptCache.addPrompt(
          prompt,
          aiResponse,
          PromptType.SQL_GENERATION,
          tokens,
          "deepseek-chat",
          0.1
        );
      }

      // 2. 保存 SQL 缓存
      if (options.useCache !== false) {
        await this.queryCacheManager.setSQL(intent, result);
      }
    } catch (error) {
      // 缓存保存失败不影响主流程
      console.warn("保存缓存失败:", error);
    }
  }

  /**
   * AI 生成阶段是必须执行的
   */
  shouldExecute(context: PipelineContext): boolean {
    // 如果已经有结果（前面的阶段已生成），则跳过
    return !context.result;
  }

  /**
   * AI 生成失败应该抛出错误
   */
  protected shouldThrowError(
    context: PipelineContext,
    error: unknown
  ): boolean {
    return true;
  }
}
