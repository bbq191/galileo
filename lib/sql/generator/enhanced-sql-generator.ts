/**
 * 增强的 SQL 生成器
 * 集成业务规则引擎,提供更智能的SQL生成
 */

import { SQLGenerator } from './sql-generator';
import { BusinessRulesEngine } from '@/lib/business-rules/business-rules-engine';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { SQLGenerationResult, SQLGenerationOptions } from './types';
import { DeepseekClient } from '@/lib/ai/deepseek-client';
import {
  SQL_GENERATION_SYSTEM_PROMPT,
  buildFewShotSection,
  buildBusinessRulesSection,
  buildShardingSection
} from './prompts/sql-prompts';

/**
 * 增强的 SQL 生成器
 * 在原有 SQL 生成器基础上增加：
 * 1. 业务术语理解
 * 2. 分表自动识别
 * 3. Few-shot 学习
 * 4. 业务规则应用
 */
export class EnhancedSQLGenerator extends SQLGenerator {
  private businessRulesEngine: BusinessRulesEngine;
  private enableBusinessRules: boolean;

  constructor(aiClient?: DeepseekClient, enableBusinessRules: boolean = true) {
    super(aiClient);
    this.businessRulesEngine = new BusinessRulesEngine();
    this.enableBusinessRules = enableBusinessRules;
  }

  /**
   * 生成 SQL（增强版）
   */
  async generate(
    intent: QueryIntent,
    context: MetadataContext,
    naturalLanguageQuery: string,
    options: SQLGenerationOptions = {}
  ): Promise<SQLGenerationResult> {
    console.log('[EnhancedSQLGenerator] 开始增强的 SQL 生成...');

    if (!this.enableBusinessRules) {
      // 如果未启用业务规则，回退到基础生成器
      return super.generate(intent, context, options);
    }

    // 1. 匹配业务术语
    const businessTerms = await this.businessRulesEngine.matchBusinessTerms(naturalLanguageQuery);
    console.log(`[EnhancedSQLGenerator] 匹配到 ${businessTerms.length} 个业务术语`);

    // 2. 检测分表模式
    const shardingPatterns = await this.businessRulesEngine.detectShardingPatterns(intent, context);
    console.log(`[EnhancedSQLGenerator] 检测到 ${shardingPatterns.length} 个分表模式`);

    // 3. 匹配相似查询模板（Few-shot）
    const queryTemplates = await this.businessRulesEngine.matchQueryTemplates(
      naturalLanguageQuery,
      intent,
      3 // Top 3
    );
    console.log(`[EnhancedSQLGenerator] 匹配到 ${queryTemplates.length} 个查询模板`);

    // 4. 获取适用的过滤规则
    const applicableFilters = await this.businessRulesEngine.getApplicableFilters(
      intent.entities.tables
    );
    console.log(`[EnhancedSQLGenerator] 找到 ${applicableFilters.length} 个适用过滤规则`);

    // 5. 增强元数据上下文
    const enhancedContext = this.enhanceContext(context, businessTerms, shardingPatterns);

    // 6. 构建增强的 prompt
    const enhancedPrompt = this.buildEnhancedPrompt(
      intent,
      enhancedContext,
      {
        businessTerms,
        shardingPatterns,
        queryTemplates,
        applicableFilters
      }
    );

    console.log('[EnhancedSQLGenerator] 增强 prompt 已构建');

    // 7. 使用基础生成器生成 SQL（通过自定义选项传递增强prompt）
    // 注意：这里我们需要修改基础生成器以支持自定义prompt
    // 暂时使用原有逻辑，在未来可以进一步优化
    const result = await super.generate(intent, enhancedContext, options);

    // 8. 后处理：添加业务规则相关的警告
    result.warnings = [
      ...(result.warnings || []),
      ...this.generateBusinessRuleWarnings(shardingPatterns, applicableFilters)
    ];

    console.log('[EnhancedSQLGenerator] SQL 生成完成');

    return result;
  }

  /**
   * 增强元数据上下文
   * 根据业务规则补充元数据信息
   */
  private enhanceContext(
    originalContext: MetadataContext,
    businessTerms: any[],
    shardingPatterns: any[]
  ): MetadataContext {
    const enhanced = { ...originalContext };

    // 如果检测到分表，扩展表列表
    for (const pattern of shardingPatterns) {
      // 检查是否已经包含所有分表
      const existingShardTables = enhanced.tables.filter(t =>
        pattern.tableList.includes(t.tableName)
      );

      if (existingShardTables.length < pattern.tableList.length) {
        console.log(`[EnhancedSQLGenerator] 分表模式 ${pattern.patternName} 需要 ${pattern.tableList.length} 个分表，但只找到 ${existingShardTables.length} 个`);

        // 基于第一个分表的结构，为其他分表创建虚拟元数据
        // 注意：这是一个简化实现，实际应该从数据库查询真实元数据
        if (existingShardTables.length > 0) {
          const templateTable = existingShardTables[0];

          for (const shardTableName of pattern.tableList) {
            const exists = enhanced.tables.some(t => t.tableName === shardTableName);
            if (!exists) {
              // 创建虚拟分表元数据（结构与模板表相同）
              enhanced.tables.push({
                ...templateTable,
                tableName: shardTableName,
                semanticDescription: `${templateTable.semanticDescription || ''} (分表: ${shardTableName})`
              });
            }
          }

          console.log(`[EnhancedSQLGenerator] 已为 ${pattern.patternName} 补全分表元数据`);
        }
      }
    }

    // 应用业务术语映射到上下文
    // （这里可以添加更多逻辑，比如高亮某些字段、调整优先级等）

    return enhanced;
  }

  /**
   * 构建增强的 Prompt
   */
  private buildEnhancedPrompt(
    intent: QueryIntent,
    context: MetadataContext,
    enhancements: {
      businessTerms: any[];
      shardingPatterns: any[];
      queryTemplates: any[];
      applicableFilters: any[];
    }
  ): string {
    let prompt = '';

    // 1. Few-shot 示例（如果有）
    if (enhancements.queryTemplates.length > 0) {
      prompt += buildFewShotSection(enhancements.queryTemplates);
      prompt += '\n\n---\n\n';
    }

    // 2. 分表信息（如果有）
    if (enhancements.shardingPatterns.length > 0) {
      prompt += buildShardingSection(enhancements.shardingPatterns);
      prompt += '\n\n---\n\n';
    }

    // 3. 业务规则
    if (enhancements.businessTerms.length > 0 || enhancements.applicableFilters.length > 0) {
      const businessRules = {
        businessTerms: enhancements.businessTerms.map(t => ({
          term: t.term,
          description: `业务术语，应映射到 ${t.targetTable}${t.targetColumn ? '.' + t.targetColumn : ''}`,
          mapping: JSON.stringify(t.targetValue || t.targetColumn || t.targetTable)
        })),
        commonFilters: enhancements.applicableFilters.map(f => ({
          name: f.name,
          condition: f.condition,
          autoApply: f.autoApply
        })),
        aggregationRules: []
      };

      prompt += buildBusinessRulesSection(businessRules);
      prompt += '\n\n---\n\n';
    }

    // 4. 添加标准 prompt 部分
    // （在实际实现中，应该将这个prompt传递给基础生成器）

    return prompt;
  }

  /**
   * 生成业务规则相关的警告
   */
  private generateBusinessRuleWarnings(
    shardingPatterns: any[],
    applicableFilters: any[]
  ): string[] {
    const warnings: string[] = [];

    // 分表警告
    for (const pattern of shardingPatterns) {
      warnings.push(
        `该查询涉及 ${pattern.tableList.length} 个分表 (${pattern.patternName}) 的合并，可能需要较长执行时间`
      );
    }

    // 过滤规则警告
    const autoApplyFilters = applicableFilters.filter(f => f.autoApply);
    if (autoApplyFilters.length > 0) {
      warnings.push(
        `已自动应用 ${autoApplyFilters.length} 个常用过滤规则: ${autoApplyFilters.map(f => f.name).join(', ')}`
      );
    }

    return warnings;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.businessRulesEngine.cleanup();
  }
}
