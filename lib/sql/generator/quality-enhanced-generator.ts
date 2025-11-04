/**
 * 质量增强的 SQL 生成器
 * 集成所有质量优化功能
 */

import { SQLGenerator } from './sql-generator';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { SQLGenerationResult, SQLGenerationOptions } from './types';
import { DeepseekClient } from '@/lib/ai/deepseek-client';
import { SQLQualityAssessor } from '../quality/sql-quality-assessor';
import { SQLAutoFixer } from '../quality/sql-auto-fixer';
import { UserFeedbackCollector } from '../quality/user-feedback-collector';
import { QueryTemplateMatcher, QUERY_TEMPLATES } from '../templates/query-templates';

export interface QualityEnhancedOptions extends SQLGenerationOptions {
  enableQualityAssessment?: boolean;
  enableAutoFix?: boolean;
  enableTemplateMatching?: boolean;
  minQualityScore?: number; // 最低质量分数（0-100）
}

export interface QualityEnhancedResult extends SQLGenerationResult {
  qualityAssessment?: any;
  appliedFixes?: any[];
  matchedTemplate?: any;
  attemptedRetries?: number;
}

/**
 * 质量增强的 SQL 生成器
 *
 * 集成功能：
 * 1. 查询模板匹配 - 快速识别常见查询模式
 * 2. SQL 质量评估 - 自动评估生成的 SQL 质量
 * 3. SQL 自动修正 - 自动修正常见错误
 * 4. 质量反馈循环 - 不满足质量标准时自动重试
 */
export class QualityEnhancedSQLGenerator extends SQLGenerator {
  private qualityAssessor: SQLQualityAssessor;
  private autoFixer: SQLAutoFixer;
  private feedbackCollector: UserFeedbackCollector;
  private templateMatcher: QueryTemplateMatcher;

  constructor(aiClient?: DeepseekClient) {
    super(aiClient);
    this.qualityAssessor = new SQLQualityAssessor();
    this.autoFixer = new SQLAutoFixer();
    this.feedbackCollector = new UserFeedbackCollector();
    this.templateMatcher = new QueryTemplateMatcher();
  }

  /**
   * 生成 SQL（质量增强版）
   */
  async generate(
    intent: QueryIntent,
    context: MetadataContext,
    options: QualityEnhancedOptions = {}
  ): Promise<QualityEnhancedResult> {
    const {
      enableQualityAssessment = true,
      enableAutoFix = true,
      enableTemplateMatching = true,
      minQualityScore = 70,
      maxRetries = 2
    } = options;

    console.log('[QualityEnhancedGenerator] 开始质量增强的 SQL 生成...');

    // 步骤 1: 尝试模板匹配
    let templateResult: any = null;
    if (enableTemplateMatching) {
      templateResult = await this.tryTemplateMatch(intent, context);
      if (templateResult) {
        console.log('[QualityEnhancedGenerator] 使用模板生成 SQL');
        // 如果模板匹配成功且质量足够，直接返回
        if (templateResult.confidence > 0.8) {
          return {
            ...templateResult.result,
            matchedTemplate: templateResult.template,
            confidence: templateResult.confidence
          };
        }
      }
    }

    // 步骤 2: 使用 AI 生成 SQL
    let attempts = 0;
    let bestResult: SQLGenerationResult | null = null;
    let bestQualityScore = 0;

    while (attempts <= maxRetries) {
      attempts++;

      console.log(`[QualityEnhancedGenerator] 尝试第 ${attempts} 次生成...`);

      // 2.1 调用基础生成器
      const result = await super.generate(intent, context, {
        ...options,
        maxRetries: 0 // 禁用基础生成器的重试，由质量增强器统一管理
      });

      // 2.2 应用自动修正
      let finalSQL = result.sql;
      let appliedFixes: any[] = [];

      if (enableAutoFix) {
        const fixResult = this.autoFixer.smartFix(result.sql, context);
        if (fixResult.fixed) {
          console.log(`[QualityEnhancedGenerator] 应用了 ${fixResult.appliedFixes.length} 个自动修正`);
          finalSQL = fixResult.fixedSQL;
          appliedFixes = fixResult.appliedFixes;
        }
      }

      // 2.3 评估质量
      let qualityScore = 100;
      let qualityAssessment = null;

      if (enableQualityAssessment) {
        qualityAssessment = this.qualityAssessor.assess(finalSQL, context);
        qualityScore = qualityAssessment.overallScore;

        console.log(`[QualityEnhancedGenerator] 质量评分: ${qualityScore}/100`);

        // 合并质量警告到结果
        if (qualityAssessment.warnings.length > 0) {
          result.warnings = [
            ...(result.warnings || []),
            ...qualityAssessment.warnings
          ];
        }
      }

      // 2.4 更新最佳结果
      if (qualityScore > bestQualityScore) {
        bestResult = { ...result, sql: finalSQL };
        bestQualityScore = qualityScore;
      }

      // 2.5 检查是否满足质量要求
      if (qualityScore >= minQualityScore) {
        console.log(`[QualityEnhancedGenerator] 质量达标，生成成功`);

        return {
          ...result,
          sql: finalSQL,
          qualityAssessment,
          appliedFixes,
          matchedTemplate: templateResult?.template,
          attemptedRetries: attempts - 1
        };
      }

      // 2.6 如果未达标且还有重试机会，记录反馈并继续
      if (attempts <= maxRetries) {
        console.log(`[QualityEnhancedGenerator] 质量未达标 (${qualityScore}/${minQualityScore})，准备重试...`);

        // 可以在这里添加更智能的重试策略
        // 例如：根据质量问题调整 prompt
      }
    }

    // 步骤 3: 所有尝试都未达到质量标准，返回最佳结果
    console.warn(`[QualityEnhancedGenerator] 经过 ${attempts} 次尝试，未能达到质量标准 ${minQualityScore}。返回最佳结果 (质量: ${bestQualityScore})`);

    if (!bestResult) {
      throw new Error('SQL 生成失败');
    }

    return {
      ...bestResult,
      attemptedRetries: attempts - 1,
      warnings: [
        ...(bestResult.warnings || []),
        `质量评分 ${bestQualityScore} 未达到期望的 ${minQualityScore}，可能需要人工审查`
      ]
    };
  }

  /**
   * 尝试使用模板生成 SQL
   */
  private async tryTemplateMatch(
    intent: QueryIntent,
    context: MetadataContext
  ): Promise<{ template: any; result: SQLGenerationResult; confidence: number } | null> {
    try {
      // 从 intent 中提取自然语言查询
      // 注意：这里假设 intent 包含原始查询，实际可能需要从其他地方获取
      const naturalQuery = intent.originalQuery || '';

      if (!naturalQuery) {
        return null;
      }

      // 匹配模板
      const matches = this.templateMatcher.match(naturalQuery);

      if (matches.length === 0) {
        return null;
      }

      const bestMatch = matches[0];

      // 尝试填充模板
      const sql = this.templateMatcher.fillTemplate(
        bestMatch.template,
        intent,
        context
      );

      if (!sql) {
        // 模板无法自动填充，需要 AI 辅助
        return null;
      }

      // 创建结果
      const result: SQLGenerationResult = {
        sql,
        explanation: `使用模板 "${bestMatch.template.name}" 生成`,
        confidence: bestMatch.confidence,
        usedTables: intent.entities.tables || [],
        usedColumns: intent.entities.columns || [],
        warnings: [`使用预定义模板生成，建议人工验证`]
      };

      return {
        template: bestMatch.template,
        result,
        confidence: bestMatch.confidence
      };

    } catch (error) {
      console.error('[QualityEnhancedGenerator] 模板匹配失败:', error);
      return null;
    }
  }

  /**
   * 记录用户反馈
   * 用于持续改进 SQL 生成质量
   */
  async recordFeedback(feedback: {
    queryId?: number;
    naturalLanguageQuery: string;
    generatedSQL: string;
    correctedSQL?: string;
    rating: 'excellent' | 'good' | 'fair' | 'poor';
    feedbackType: string[];
    comment?: string;
    userId?: string;
  }): Promise<void> {
    try {
      await this.feedbackCollector.submitFeedback({
        ...feedback,
        timestamp: new Date()
      });

      console.log('[QualityEnhancedGenerator] 用户反馈已记录');

    } catch (error) {
      console.error('[QualityEnhancedGenerator] 记录反馈失败:', error);
    }
  }

  /**
   * 获取质量分析报告
   */
  async getQualityReport(timeRange?: { start: Date; end: Date }): Promise<any> {
    try {
      return await this.feedbackCollector.getAnalytics(timeRange);
    } catch (error) {
      console.error('[QualityEnhancedGenerator] 获取质量报告失败:', error);
      return null;
    }
  }

  /**
   * 获取改进建议
   */
  async getImprovementOpportunities(limit: number = 10): Promise<any[]> {
    try {
      return await this.feedbackCollector.getImprovementOpportunities(limit);
    } catch (error) {
      console.error('[QualityEnhancedGenerator] 获取改进建议失败:', error);
      return [];
    }
  }

  /**
   * 导出训练数据
   */
  async exportTrainingData(outputPath?: string): Promise<any[]> {
    try {
      return await this.feedbackCollector.exportForTraining(outputPath);
    } catch (error) {
      console.error('[QualityEnhancedGenerator] 导出训练数据失败:', error);
      return [];
    }
  }
}
