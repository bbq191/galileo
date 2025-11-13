/**
 * AI 推断器
 *
 * 功能：
 * - 使用 Deepseek AI 模型推断表之间的隐式关系
 * - 分析字段语义描述推断关联关系
 * - 为规则引擎无法覆盖的场景提供补充
 */

import type { ColumnInfo } from '@/lib/metadata/types';
import type { InferredRelationship, RelationshipType } from './types';
import { getDeepseekClient } from '@/lib/ai';

/**
 * 调用 Deepseek API 的辅助函数
 */
async function callDeepseekAPI(
  prompt: string,
  options: {
    temperature?: number;
    max_tokens?: number;
  } = {}
): Promise<string> {
  const client = getDeepseekClient();
  return await client.chat(
    [
      {
        role: 'user',
        content: prompt,
      },
    ],
    options
  );
}

/**
 * AI 推断结果（原始 JSON）
 */
interface AIInferenceResult {
  hasRelationship: boolean;
  confidence: number;
  type: RelationshipType;
  reasoning: string;
}

/**
 * 关系推断 Prompt 模板
 */
const RELATIONSHIP_INFERENCE_PROMPT = `请分析以下两个数据库字段之间是否存在关联关系：

源表: {source_table}
源字段: {source_column} ({source_type})
源字段描述: {source_description}

目标表: {target_table}
目标字段: {target_column} ({target_type})
目标字段描述: {target_description}

请判断:
1. 是否存在关联关系？(是/否)
2. 置信度分数 (0.00-1.00)
3. 关系类型 (one-to-one/one-to-many/many-to-many)
4. 推断理由

请以 JSON 格式返回，不要包含任何其他文字：
{
  "hasRelationship": true/false,
  "confidence": 0.85,
  "type": "one-to-many",
  "reasoning": "推断理由"
}`;

/**
 * 批量关系推断 Prompt 模板
 */
const BATCH_RELATIONSHIP_INFERENCE_PROMPT = `请分析以下多组数据库字段之间是否存在关联关系。

字段对列表:
{field_pairs}

对于每一对字段，请判断:
1. 是否存在关联关系？
2. 置信度分数 (0.00-1.00)
3. 关系类型 (one-to-one/one-to-many/many-to-many)
4. 推断理由

请以 JSON 数组格式返回，不要包含任何其他文字：
[
  {
    "pairIndex": 0,
    "hasRelationship": true/false,
    "confidence": 0.85,
    "type": "one-to-many",
    "reasoning": "推断理由"
  }
]`;

/**
 * AI 推断器类
 */
export class AIInferencer {
  /**
   * 推断两个字段之间的关系
   */
  async inferRelationship(
    sourceColumn: ColumnInfo,
    targetColumn: ColumnInfo
  ): Promise<InferredRelationship | null> {
    try {
      // 构建 prompt
      const prompt = this.buildPrompt(sourceColumn, targetColumn);

      // 调用 Deepseek API
      const response = await callDeepseekAPI(prompt, {
        temperature: 0.2, // 低温度，确保输出稳定
        max_tokens: 500,
      });

      // 解析响应
      const result = this.parseAIResponse(response);

      // 如果没有关系，返回 null
      if (!result.hasRelationship) {
        return null;
      }

      // 构建推断结果
      return {
        sourceTable: sourceColumn.tableName,
        sourceColumn: sourceColumn.columnName,
        sourceDatabaseName: sourceColumn.databaseName,
        targetTable: targetColumn.tableName,
        targetColumn: targetColumn.columnName,
        targetDatabaseName: targetColumn.databaseName,
        relationshipType: result.type as RelationshipType,
        confidenceScore: result.confidence,
        inferenceMethod: 'ai',
        reasoning: result.reasoning,
      };
    } catch (error) {
      console.error('AI 推断失败:', error);
      return null;
    }
  }

  /**
   * 批量推断关系
   * 性能优化：一次 API 调用处理多个字段对
   */
  async inferRelationshipsBatch(
    fieldPairs: Array<{
      source: ColumnInfo;
      target: ColumnInfo;
    }>
  ): Promise<Array<InferredRelationship | null>> {
    if (fieldPairs.length === 0) {
      return [];
    }

    // 如果只有一对，直接调用单个推断
    if (fieldPairs.length === 1) {
      const result = await this.inferRelationship(
        fieldPairs[0].source,
        fieldPairs[0].target
      );
      return [result];
    }

    try {
      // 构建批量 prompt
      const prompt = this.buildBatchPrompt(fieldPairs);

      // 调用 Deepseek API
      const response = await callDeepseekAPI(prompt, {
        temperature: 0.2,
        max_tokens: 2000, // 批量处理需要更多 token
      });

      // 解析批量响应
      const results = this.parseBatchAIResponse(response);

      // 转换为 InferredRelationship 数组
      return fieldPairs.map((pair, index) => {
        const result = results.find((r) => r.pairIndex === index);
        if (!result || !result.hasRelationship) {
          return null;
        }

        return {
          sourceTable: pair.source.tableName,
          sourceColumn: pair.source.columnName,
          sourceDatabaseName: pair.source.databaseName,
          targetTable: pair.target.tableName,
          targetColumn: pair.target.columnName,
          targetDatabaseName: pair.target.databaseName,
          relationshipType: result.type as RelationshipType,
          confidenceScore: result.confidence,
          inferenceMethod: 'ai',
          reasoning: result.reasoning,
        };
      });
    } catch (error) {
      console.error('批量 AI 推断失败:', error);
      // 返回全部 null
      return fieldPairs.map(() => null);
    }
  }

  /**
   * 构建单个推断的 Prompt
   */
  private buildPrompt(source: ColumnInfo, target: ColumnInfo): string {
    return RELATIONSHIP_INFERENCE_PROMPT.replace('{source_table}', source.tableName)
      .replace('{source_column}', source.columnName)
      .replace('{source_type}', source.dataType)
      .replace(
        '{source_description}',
        source.columnComment || '（无描述）'
      )
      .replace('{target_table}', target.tableName)
      .replace('{target_column}', target.columnName)
      .replace('{target_type}', target.dataType)
      .replace(
        '{target_description}',
        target.columnComment || '（无描述）'
      );
  }

  /**
   * 构建批量推断的 Prompt
   */
  private buildBatchPrompt(
    fieldPairs: Array<{ source: ColumnInfo; target: ColumnInfo }>
  ): string {
    const pairDescriptions = fieldPairs
      .map((pair, index) => {
        return `【字段对 ${index}】
源表: ${pair.source.tableName}
源字段: ${pair.source.columnName} (${pair.source.dataType})
源字段描述: ${pair.source.columnComment || '（无描述）'}

目标表: ${pair.target.tableName}
目标字段: ${pair.target.columnName} (${pair.target.dataType})
目标字段描述: ${pair.target.columnComment || '（无描述）'}`;
      })
      .join('\n\n');

    return BATCH_RELATIONSHIP_INFERENCE_PROMPT.replace(
      '{field_pairs}',
      pairDescriptions
    );
  }

  /**
   * 解析 AI 响应（单个）
   */
  private parseAIResponse(response: string): AIInferenceResult {
    try {
      // 提取 JSON 部分（去除可能的思考过程）
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('未找到 JSON 响应');
      }

      let jsonStr = jsonMatch[0];

      // 尝试修复常见的 JSON 格式问题
      try {
        // 1. 移除多余的逗号（如 ,} 或 ,]）
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

        // 2. 修复缺少引号的属性名（如果有）
        jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

        // 3. 修复未加引号的值：unknown, undefined, NaN 等
        jsonStr = jsonStr.replace(/:\s*(unknown|undefined|NaN)\s*([,}\]])/gi, ': null$2');

        // 4. 移除注释（如果有）
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

        const parsed = JSON.parse(jsonStr);

        // 如果 hasRelationship 是 null（从 unknown 转换而来），设为 false
        if (parsed.hasRelationship === null || parsed.hasRelationship === undefined) {
          parsed.hasRelationship = false;
        }

        // 验证必需字段
        if (
          typeof parsed.hasRelationship !== 'boolean' ||
          typeof parsed.confidence !== 'number'
        ) {
          throw new Error('AI 响应格式不正确');
        }

        // 归一化置信度
        parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

        // 默认值
        if (!parsed.type) {
          parsed.type = 'one-to-many';
        }
        if (!parsed.reasoning) {
          parsed.reasoning = 'AI 推断';
        }

        return parsed as AIInferenceResult;
      } catch (parseError) {
        // 如果修复后仍然无法解析，记录详细错误
        console.error('JSON 解析失败，修复后的JSON:', jsonStr);
        throw parseError;
      }
    } catch (error) {
      console.error('AI 响应解析失败:', error);
      console.error('原始响应:', response);
      console.error('错误详情:', error instanceof Error ? error.message : String(error));
      throw new Error('AI 响应解析失败');
    }
  }

  /**
   * 解析批量 AI 响应
   */
  private parseBatchAIResponse(
    response: string
  ): Array<AIInferenceResult & { pairIndex: number }> {
    try {
      // 提取 JSON 数组
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('未找到 JSON 数组响应');
      }

      let jsonStr = jsonMatch[0];

      // 尝试修复常见的 JSON 格式问题
      try {
        // 1. 移除多余的逗号（如 ,} 或 ,]）
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

        // 2. 修复缺少引号的属性名（如果有）
        jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

        // 3. 修复未加引号的值：unknown, undefined, NaN 等
        jsonStr = jsonStr.replace(/:\s*(unknown|undefined|NaN)\s*([,}\]])/gi, ': null$2');

        // 4. 移除注释（如果有）
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed)) {
          throw new Error('AI 响应不是数组');
        }

        // 验证和归一化每个结果
        const validResults: Array<AIInferenceResult & { pairIndex: number }> = [];

        for (const item of parsed) {
          try {
            // 如果 hasRelationship 是 null（从 unknown 转换而来），设为 false
            if (item.hasRelationship === null || item.hasRelationship === undefined) {
              item.hasRelationship = false;
            }

            // 验证必需字段
            if (
              typeof item.pairIndex !== 'number' ||
              typeof item.hasRelationship !== 'boolean' ||
              typeof item.confidence !== 'number'
            ) {
              console.warn('跳过格式不正确的批量响应项:', item);
              continue;
            }

            // 归一化置信度
            item.confidence = Math.max(0, Math.min(1, item.confidence));

            // 默认值
            if (!item.type) {
              item.type = 'one-to-many';
            }
            if (!item.reasoning) {
              item.reasoning = 'AI 推断';
            }

            validResults.push(item);
          } catch (itemError) {
            console.warn('处理批量响应项时出错:', itemError, item);
            continue;
          }
        }

        return validResults;
      } catch (parseError) {
        // 如果修复后仍然无法解析，记录详细错误
        console.error('JSON 解析失败，修复后的JSON:', jsonStr);
        throw parseError;
      }
    } catch (error) {
      console.error('批量 AI 响应解析失败:', error);
      console.error('原始响应:', response);
      console.error('错误详情:', error instanceof Error ? error.message : String(error));

      // 返回空数组而不是抛出异常，允许推断继续进行
      return [];
    }
  }

  /**
   * 推断字段是否为外键候选
   * （辅助方法，用于优化推断流程）
   */
  isForeignKeyCandidate(column: ColumnInfo): boolean {
    const name = column.columnName.toLowerCase();

    // 常见外键模式
    return (
      name.endsWith('_id') ||
      name.endsWith('id') ||
      name.includes('_fk') ||
      name.endsWith('_key') ||
      name === 'parent_id' ||
      name === 'created_by' ||
      name === 'updated_by' ||
      name === 'deleted_by'
    );
  }

  /**
   * 推断字段是否为主键候选
   */
  isPrimaryKeyCandidate(column: ColumnInfo): boolean {
    const name = column.columnName.toLowerCase();
    return name === 'id' || name.endsWith('_id') && name.split('_').length === 2;
  }
}

/**
 * 导出默认实例
 */
export const aiInferencer = new AIInferencer();
