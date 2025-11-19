/**
 * AI 推理策略
 *
 * 职责：使用 LLM 综合分析数据库元数据并推断业务域
 */

import type { BusinessDomain } from '@/app/generated/prisma';
import { getDeepseekClient } from '@/lib/ai';
import type { StrategyResult, DatabaseMetadataForInference } from '../domain-inference.types';

/**
 * AI 推理策略
 */
export class AIReasoningStrategy {
  /**
   * 推断业务域
   */
  async infer(
    database: DatabaseMetadataForInference,
    domains: BusinessDomain[]
  ): Promise<StrategyResult | null> {
    try {
      const prompt = this.buildPrompt(database, domains);
      const client = getDeepseekClient();

      const response = await client.chat(
        [
          {
            role: 'system',
            content: '你是一个数据库业务域分类专家。根据数据库的元数据，判断它最可能属于哪个业务域。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          temperature: 0.2, // 降低随机性，提高确定性
          max_tokens: 500,
        }
      );

      // 解析 AI 响应
      const result = this.parseResponse(response, domains);
      return result;
    } catch (error) {
      console.error('[AIReasoningStrategy] AI 推理失败:', error);
      return null;
    }
  }

  /**
   * 构建推断提示词
   */
  private buildPrompt(
    database: DatabaseMetadataForInference,
    domains: BusinessDomain[]
  ): string {
    // 提取前 20 个表名及其描述
    const tableList = database.tables
      .slice(0, 20)
      .map(t => {
        const desc = t.semanticDescription || t.tableComment || '';
        return `- ${t.tableName}${desc ? ` (${desc})` : ''}`;
      })
      .join('\n');

    // 构建业务域列表
    const domainList = domains
      .map((d, idx) => `${idx + 1}. ${d.name} - ${d.description || '无描述'}`)
      .join('\n');

    return `数据库信息：
- 数据库名: ${database.databaseName}
- 语义描述: ${database.semanticDescription || '无'}
- 表数量: ${database.tables.length}
- 主要表名:
${tableList}

可选业务域：
${domainList}

请分析该数据库最可能属于哪个业务域，返回 JSON 格式：
{
  "domainName": "业务域名称",
  "confidence": 0.85,
  "reasoning": "推理依据"
}

注意：
1. domainName 必须是上面列出的业务域名称之一
2. confidence 范围是 0.0-1.0，表示置信度
3. reasoning 用简短的中文说明推理依据`;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    response: string,
    domains: BusinessDomain[]
  ): StrategyResult | null {
    try {
      // 尝试提取 JSON（可能包含在代码块中）
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[AIReasoningStrategy] 响应中未找到 JSON:', response);
        return null;
      }

      const json = JSON.parse(jsonMatch[0]);

      // 验证必要字段
      if (!json.domainName) {
        console.error('[AIReasoningStrategy] 响应缺少 domainName 字段:', json);
        return null;
      }

      // 查找对应的业务域
      const domain = domains.find(d => d.name === json.domainName);
      if (!domain) {
        console.error('[AIReasoningStrategy] 未找到业务域:', json.domainName);
        return null;
      }

      return {
        strategyName: 'ai_reasoning',
        domainId: domain.id,
        score: json.confidence || 0.5,
        features: [json.reasoning || 'AI 推理结果'],
        weight: 0.3, // AI 推理策略权重
      };
    } catch (error) {
      console.error('[AIReasoningStrategy] 解析响应失败:', error);
      console.error('[AIReasoningStrategy] 原始响应:', response);
      return null;
    }
  }
}
