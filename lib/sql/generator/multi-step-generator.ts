/**
 * 多步查询生成器
 * 处理需要多步推理的复杂查询
 */

import { DeepseekClient } from '@/lib/ai/deepseek-client';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { SQLGenerator } from './sql-generator';
import {
  SQLGenerationResult,
  QueryStep,
  StepGenerationResult,
  SQLGenerationOptions
} from './types';

export class MultiStepSQLGenerator {
  private aiClient: DeepseekClient;
  private simpleGenerator: SQLGenerator;

  constructor() {
    this.aiClient = new DeepseekClient();
    this.simpleGenerator = new SQLGenerator();
  }

  /**
   * 生成复杂查询
   * 根据查询复杂度决定是否需要分步处理
   */
  async generateComplex(
    intent: QueryIntent,
    context: MetadataContext,
    options: SQLGenerationOptions = {}
  ): Promise<SQLGenerationResult> {
    // 1. 判断是否需要分步
    if (context.estimatedComplexity !== 'high') {
      // 复杂度不高，使用简单生成器
      return this.simpleGenerator.generate(intent, context, options);
    }

    console.log('检测到高复杂度查询，启动多步分解生成...');

    // 2. 分解查询步骤
    const steps = await this.decomposeQuery(intent, context);

    if (steps.length === 0) {
      throw new Error('无法分解查询步骤');
    }

    console.log(`查询已分解为 ${steps.length} 个步骤`);

    // 3. 逐步生成 SQL
    const stepResults: StepGenerationResult[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`生成步骤 ${i + 1}/${steps.length}: ${step.stepName}`);

      const result = await this.generateStep(step, context, stepResults);
      stepResults.push(result);
    }

    // 4. 合并为最终 SQL（使用 CTE）
    return this.combineSteps(stepResults);
  }

  /**
   * 分解查询步骤
   * 使用 AI 辅助将复杂查询分解为多个简单步骤
   */
  private async decomposeQuery(
    intent: QueryIntent,
    context: MetadataContext
  ): Promise<QueryStep[]> {
    const crossDbJoins = this.countCrossDbJoins(context);

    const prompt = `
请将以下复杂查询分解为多个简单步骤：

## 用户意图
${JSON.stringify(intent, null, 2)}

## 涉及的表
${context.tables.map(t => `- ${t.databaseName}.${t.tableName} (${t.columns.length} 个字段)`).join('\n')}

## 查询复杂度信息
- 涉及表数量: ${context.tables.length}
- 跨库关联数量: ${crossDbJoins}
- 复杂度等级: ${context.estimatedComplexity}

## 任务要求

请按逻辑顺序分解查询步骤，每个步骤应该是独立可执行的子查询。

分解原则：
1. 优先在同一数据库内进行过滤和聚合
2. 跨库关联尽量后置
3. 每个步骤应该有明确的输入和输出
4. 步骤之间通过 CTE（Common Table Expression）连接

返回 JSON 数组，每个元素包含：
- stepName: 步骤名称（简短描述）
- description: 步骤详细说明
- tables: 涉及的表（数组）
- outputColumns: 输出的列（数组）
- stepType: 步骤类型（filter/join/aggregate/sort/limit）

示例返回格式：
[
  {
    "stepName": "过滤订单数据",
    "description": "从订单表筛选最近一个月的订单",
    "tables": ["sales_db.orders"],
    "outputColumns": ["order_id", "product_id", "amount", "order_date"],
    "stepType": "filter"
  },
  {
    "stepName": "关联产品信息",
    "description": "将订单与产品表进行跨库关联",
    "tables": ["sales_db.orders", "product_db.products"],
    "outputColumns": ["product_id", "product_name", "amount"],
    "stepType": "join"
  },
  {
    "stepName": "聚合销售额",
    "description": "按产品分组统计销售总额",
    "tables": ["product_db.products"],
    "outputColumns": ["product_name", "total_amount"],
    "stepType": "aggregate"
  }
]

请仅返回 JSON 数组，不要包含其他说明文字。
`;

    try {
      const response = await this.aiClient.chat([
        {
          role: 'system',
          content: '你是一个 SQL 查询分解专家。请将复杂查询分解为多个逻辑步骤，返回标准的 JSON 格式。'
        },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.2,
        maxTokens: 2000
      });

      // 提取 JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('AI 未返回有效的 JSON 数组');
      }

      const steps: QueryStep[] = JSON.parse(jsonMatch[0]);

      // 验证步骤
      if (!Array.isArray(steps) || steps.length === 0) {
        throw new Error('分解结果无效：步骤数量为 0');
      }

      // 验证每个步骤的必需字段
      for (const step of steps) {
        if (!step.stepName || !step.description || !step.tables || !step.outputColumns) {
          throw new Error(`步骤缺少必需字段: ${JSON.stringify(step)}`);
        }
      }

      return steps;

    } catch (error) {
      console.error('查询分解失败:', error);
      throw new Error(`查询分解失败: ${(error as Error).message}`);
    }
  }

  /**
   * 生成单个步骤的 SQL
   */
  private async generateStep(
    step: QueryStep,
    context: MetadataContext,
    previousSteps: StepGenerationResult[]
  ): Promise<StepGenerationResult> {
    // 构建该步骤的上下文（仅包含相关的表）
    const stepContext: MetadataContext = {
      ...context,
      tables: context.tables.filter(t =>
        step.tables.some(st =>
          st.includes(t.tableName) || st.includes(`${t.databaseName}.${t.tableName}`)
        )
      )
    };

    // 如果没有找到相关表，使用所有表
    if (stepContext.tables.length === 0) {
      stepContext.tables = context.tables;
    }

    // 构建步骤的查询意图
    const stepIntent: QueryIntent = {
      type: this.mapStepTypeToIntentType(step.stepType),
      entities: {
        tables: step.tables,
        columns: step.outputColumns
      },
      conditions: {},
      ...(step.intent || {})
    };

    // 构建 Prompt
    const prompt = this.buildStepPrompt(step, stepContext, previousSteps);

    try {
      const response = await this.aiClient.chat([
        {
          role: 'system',
          content: '你是一个 SQL 生成专家。请根据步骤要求生成精确的 SQL 子查询。'
        },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.1,
        maxTokens: 1500
      });

      // 提取 SQL
      const sqlMatch = response.match(/```sql\n([\s\S]*?)\n```/) ||
                       response.match(/SELECT[\s\S]*?(?:;|$)/i);

      if (!sqlMatch) {
        throw new Error('AI 未返回有效的 SQL');
      }

      const sql = sqlMatch[1] || sqlMatch[0];

      return {
        step,
        sql: sql.trim(),
        confidence: 0.85,
        usedTables: step.tables,
        usedColumns: step.outputColumns
      };

    } catch (error) {
      console.error(`步骤 "${step.stepName}" SQL 生成失败:`, error);
      throw new Error(`步骤 "${step.stepName}" SQL 生成失败: ${(error as Error).message}`);
    }
  }

  /**
   * 构建步骤生成 Prompt
   */
  private buildStepPrompt(
    step: QueryStep,
    context: MetadataContext,
    previousSteps: StepGenerationResult[]
  ): string {
    const tableSchemas = context.tables.map(t => `
### ${t.databaseName}.${t.tableName}
${t.columns.map(c => `- ${c.columnName} (${c.dataType})`).join('\n')}
`).join('\n');

    const previousStepsDesc = previousSteps.length > 0
      ? `
## 前序步骤

${previousSteps.map((s, idx) => `
### 步骤 ${idx + 1}: ${s.step.stepName}
输出列: ${s.step.outputColumns.join(', ')}
CTE 名称: step${idx + 1}
`).join('\n')}

你可以在当前步骤中引用前面的 CTE，例如：FROM step${previousSteps.length}
`
      : '';

    return `
## 当前步骤

名称: ${step.stepName}
说明: ${step.description}
类型: ${step.stepType || 'unknown'}
需要输出的列: ${step.outputColumns.join(', ')}

## 可用的表

${tableSchemas}

${previousStepsDesc}

## 任务

请生成此步骤的 SQL 查询。要求：
1. ${step.stepType === 'filter' ? '应用必要的过滤条件' : ''}
2. ${step.stepType === 'join' ? '正确处理表关联' : ''}
3. ${step.stepType === 'aggregate' ? '使用适当的聚合函数和 GROUP BY' : ''}
4. 只输出 ${step.outputColumns.join(', ')} 这些列
5. ${previousSteps.length > 0 ? '可以引用前序步骤的 CTE' : '直接查询原始表'}
6. 使用完整表名：\`database\`.\`table\`

请直接返回 SQL 语句，使用 \`\`\`sql 包裹。
`;
  }

  /**
   * 合并步骤为 CTE
   */
  private combineSteps(steps: StepGenerationResult[]): SQLGenerationResult {
    if (steps.length === 0) {
      throw new Error('没有步骤可以合并');
    }

    // 单个步骤，直接返回
    if (steps.length === 1) {
      return {
        sql: steps[0].sql,
        explanation: `单步查询: ${steps[0].step.description}`,
        confidence: steps[0].confidence,
        usedTables: steps[0].usedTables,
        usedColumns: steps[0].usedColumns,
        warnings: []
      };
    }

    // 多个步骤，使用 CTE 合并
    const ctes = steps.map((step, idx) => {
      const stepSql = step.sql.trim().replace(/;$/, ''); // 移除末尾分号
      return `step${idx + 1} AS (\n  ${stepSql}\n)`;
    }).join(',\n');

    // 最终查询从最后一个 CTE 选择
    const finalSql = `WITH ${ctes}\nSELECT * FROM step${steps.length}`;

    // 计算总体置信度（取最小值）
    const minConfidence = Math.min(...steps.map(s => s.confidence));

    // 合并所有使用的表和列
    const allTables = [...new Set(steps.flatMap(s => s.usedTables))];
    const allColumns = [...new Set(steps.flatMap(s => s.usedColumns))];

    // 生成解释
    const explanation = `多步 CTE 查询（${steps.length} 个步骤）：\n${
      steps.map((s, idx) => `${idx + 1}. ${s.step.stepName}: ${s.step.description}`).join('\n')
    }`;

    return {
      sql: finalSql,
      explanation,
      confidence: minConfidence,
      usedTables: allTables,
      usedColumns: allColumns,
      warnings: [
        `复杂查询已分解为 ${steps.length} 步 CTE`,
        '多步 CTE 可能影响性能，建议在非高峰时段执行'
      ]
    };
  }

  /**
   * 统计跨库 JOIN 数量
   */
  private countCrossDbJoins(context: MetadataContext): number {
    if (!context.relationships || context.relationships.length === 0) {
      return 0;
    }

    let count = 0;
    const tableDbMap = new Map<string, string>();

    // 构建表名到数据库的映射
    for (const table of context.tables) {
      tableDbMap.set(table.tableName, table.databaseName);
    }

    // 统计跨库关系
    for (const rel of context.relationships) {
      const sourceDb = tableDbMap.get(rel.sourceTable);
      const targetDb = tableDbMap.get(rel.targetTable);

      if (sourceDb && targetDb && sourceDb !== targetDb) {
        count++;
      }
    }

    return count;
  }

  /**
   * 将步骤类型映射到查询意图类型
   */
  private mapStepTypeToIntentType(stepType?: string): 'select' | 'aggregate' | 'statistics' | 'comparison' {
    switch (stepType) {
      case 'aggregate':
        return 'aggregate';
      case 'filter':
      case 'join':
      case 'sort':
      case 'limit':
        return 'select';
      default:
        return 'select';
    }
  }
}
