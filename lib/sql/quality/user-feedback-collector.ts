/**
 * 用户反馈收集系统
 * 收集用户对 SQL 生成质量的反馈，用于持续改进
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';

export interface SQLFeedback {
  id?: number;
  queryId?: number;           // 关联的查询 ID
  naturalLanguageQuery: string;
  generatedSQL: string;
  correctedSQL?: string;       // 用户修正后的 SQL
  rating: FeedbackRating;      // 评分
  feedbackType: FeedbackType[];
  comment?: string;            // 用户评论
  userId?: string;
  timestamp: Date;
}

export type FeedbackRating = 'excellent' | 'good' | 'fair' | 'poor';

export type FeedbackType =
  | 'incorrect_intent'         // 意图理解错误
  | 'wrong_tables'             // 使用了错误的表
  | 'wrong_columns'            // 使用了错误的字段
  | 'missing_condition'        // 缺少条件
  | 'wrong_join'               // JOIN 错误
  | 'syntax_error'             // 语法错误
  | 'performance_issue'        // 性能问题
  | 'other';                   // 其他问题

export interface FeedbackAnalytics {
  totalFeedback: number;
  ratingDistribution: Record<FeedbackRating, number>;
  commonIssues: Array<{
    type: FeedbackType;
    count: number;
    percentage: number;
  }>;
  averageRating: number;
  improvementTrends: {
    lastWeek: number;
    lastMonth: number;
  };
}

/**
 * 用户反馈收集器
 */
export class UserFeedbackCollector {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * 提交用户反馈
   */
  async submitFeedback(feedback: SQLFeedback): Promise<number> {
    try {
      const result = await this.prisma.$executeRaw`
        INSERT INTO sql_feedback (
          query_id,
          natural_language_query,
          generated_sql,
          corrected_sql,
          rating,
          feedback_types,
          comment,
          user_id,
          timestamp
        ) VALUES (
          ${feedback.queryId || null},
          ${feedback.naturalLanguageQuery},
          ${feedback.generatedSQL},
          ${feedback.correctedSQL || null},
          ${feedback.rating},
          ${JSON.stringify(feedback.feedbackType)},
          ${feedback.comment || null},
          ${feedback.userId || null},
          ${feedback.timestamp || new Date()}
        )
      `;

      console.log('反馈已提交:', result);
      return result as number;

    } catch (error) {
      console.error('提交反馈失败:', error);
      throw new Error('Failed to submit feedback');
    }
  }

  /**
   * 获取反馈分析
   */
  async getAnalytics(timeRange?: { start: Date; end: Date }): Promise<FeedbackAnalytics> {
    try {
      // 获取总数
      const totalFeedback = await this.getTotalFeedback(timeRange);

      // 获取评分分布
      const ratingDistribution = await this.getRatingDistribution(timeRange);

      // 获取常见问题
      const commonIssues = await this.getCommonIssues(timeRange);

      // 计算平均评分
      const averageRating = this.calculateAverageRating(ratingDistribution);

      // 获取改进趋势
      const improvementTrends = await this.getImprovementTrends();

      return {
        totalFeedback,
        ratingDistribution,
        commonIssues,
        averageRating,
        improvementTrends
      };

    } catch (error) {
      console.error('获取反馈分析失败:', error);
      throw new Error('Failed to get feedback analytics');
    }
  }

  /**
   * 获取需要改进的查询模式
   */
  async getImprovementOpportunities(limit: number = 10): Promise<ImprovementOpportunity[]> {
    try {
      const opportunities: ImprovementOpportunity[] = [];

      // 获取评分低的查询
      const poorRatedQueries = await this.prisma.$queryRaw<any[]>`
        SELECT
          natural_language_query,
          generated_sql,
          corrected_sql,
          COUNT(*) as occurrence_count,
          AVG(CASE rating
            WHEN 'excellent' THEN 5
            WHEN 'good' THEN 4
            WHEN 'fair' THEN 3
            WHEN 'poor' THEN 2
            ELSE 1
          END) as avg_rating
        FROM sql_feedback
        WHERE rating IN ('poor', 'fair')
        AND corrected_sql IS NOT NULL
        GROUP BY natural_language_query, generated_sql, corrected_sql
        ORDER BY occurrence_count DESC, avg_rating ASC
        LIMIT ${limit}
      `;

      for (const query of poorRatedQueries) {
        // 分析常见问题类型
        const issueTypes = await this.getIssueTypesForQuery(query.natural_language_query);

        opportunities.push({
          naturalLanguageQuery: query.natural_language_query,
          problematicSQL: query.generated_sql,
          correctedSQL: query.corrected_sql,
          occurrenceCount: query.occurrence_count,
          averageRating: query.avg_rating,
          commonIssues: issueTypes
        });
      }

      return opportunities;

    } catch (error) {
      console.error('获取改进机会失败:', error);
      return [];
    }
  }

  /**
   * 学习用户修正
   * 分析用户对 SQL 的修正模式，用于改进生成算法
   */
  async learnFromCorrections(): Promise<CorrectionPattern[]> {
    try {
      const corrections = await this.prisma.$queryRaw<any[]>`
        SELECT
          generated_sql,
          corrected_sql,
          feedback_types,
          COUNT(*) as frequency
        FROM sql_feedback
        WHERE corrected_sql IS NOT NULL
        AND corrected_sql != generated_sql
        GROUP BY generated_sql, corrected_sql, feedback_types
        HAVING COUNT(*) >= 3
        ORDER BY frequency DESC
        LIMIT 50
      `;

      const patterns: CorrectionPattern[] = [];

      for (const correction of corrections) {
        const pattern = this.extractCorrectionPattern(
          correction.generated_sql,
          correction.corrected_sql
        );

        if (pattern) {
          patterns.push({
            ...pattern,
            frequency: correction.frequency,
            issueTypes: JSON.parse(correction.feedback_types || '[]')
          });
        }
      }

      return patterns;

    } catch (error) {
      console.error('学习用户修正失败:', error);
      return [];
    }
  }

  /**
   * 导出反馈数据用于训练
   */
  async exportForTraining(outputPath?: string): Promise<TrainingData[]> {
    try {
      const feedbackData = await this.prisma.$queryRaw<any[]>`
        SELECT
          natural_language_query,
          generated_sql,
          corrected_sql,
          rating,
          feedback_types,
          comment
        FROM sql_feedback
        WHERE rating IN ('poor', 'fair')
        AND corrected_sql IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 1000
      `;

      const trainingData: TrainingData[] = feedbackData.map(item => ({
        input: item.natural_language_query,
        badOutput: item.generated_sql,
        goodOutput: item.corrected_sql || item.generated_sql,
        issues: JSON.parse(item.feedback_types || '[]'),
        rating: item.rating,
        note: item.comment
      }));

      // 如果指定了输出路径，写入文件
      if (outputPath) {
        const fs = require('fs');
        fs.writeFileSync(outputPath, JSON.stringify(trainingData, null, 2));
        console.log(`训练数据已导出到: ${outputPath}`);
      }

      return trainingData;

    } catch (error) {
      console.error('导出训练数据失败:', error);
      return [];
    }
  }

  // ========== 私有辅助方法 ==========

  private async getTotalFeedback(timeRange?: { start: Date; end: Date }): Promise<number> {
    if (timeRange) {
      const result = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count
        FROM sql_feedback
        WHERE timestamp >= ${timeRange.start}
        AND timestamp <= ${timeRange.end}
      `;
      return result[0]?.count || 0;
    } else {
      const result = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM sql_feedback
      `;
      return result[0]?.count || 0;
    }
  }

  private async getRatingDistribution(
    timeRange?: { start: Date; end: Date }
  ): Promise<Record<FeedbackRating, number>> {
    const query = timeRange
      ? `SELECT rating, COUNT(*) as count
         FROM sql_feedback
         WHERE timestamp >= ? AND timestamp <= ?
         GROUP BY rating`
      : `SELECT rating, COUNT(*) as count
         FROM sql_feedback
         GROUP BY rating`;

    const results = timeRange
      ? await this.prisma.$queryRawUnsafe<any[]>(query, timeRange.start, timeRange.end)
      : await this.prisma.$queryRawUnsafe<any[]>(query);

    const distribution: Record<FeedbackRating, number> = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0
    };

    for (const row of results) {
      distribution[row.rating as FeedbackRating] = row.count;
    }

    return distribution;
  }

  private async getCommonIssues(timeRange?: { start: Date; end: Date }): Promise<any[]> {
    // 简化实现：从 feedback_types JSON 字段中提取问题类型
    const allFeedback = await this.prisma.$queryRaw<any[]>`
      SELECT feedback_types FROM sql_feedback
      ${timeRange ? this.prisma.$queryRaw`WHERE timestamp >= ${timeRange.start} AND timestamp <= ${timeRange.end}` : this.prisma.$queryRaw``}
    `;

    const issueCount: Record<string, number> = {};
    let totalIssues = 0;

    for (const item of allFeedback) {
      const types = JSON.parse(item.feedback_types || '[]');
      for (const type of types) {
        issueCount[type] = (issueCount[type] || 0) + 1;
        totalIssues++;
      }
    }

    return Object.entries(issueCount)
      .map(([type, count]) => ({
        type: type as FeedbackType,
        count,
        percentage: (count / totalIssues) * 100
      }))
      .sort((a, b) => b.count - a.count);
  }

  private calculateAverageRating(distribution: Record<FeedbackRating, number>): number {
    const ratingValues: Record<FeedbackRating, number> = {
      excellent: 5,
      good: 4,
      fair: 3,
      poor: 2
    };

    let totalScore = 0;
    let totalCount = 0;

    for (const [rating, count] of Object.entries(distribution)) {
      totalScore += ratingValues[rating as FeedbackRating] * count;
      totalCount += count;
    }

    return totalCount > 0 ? totalScore / totalCount : 0;
  }

  private async getImprovementTrends(): Promise<{ lastWeek: number; lastMonth: number }> {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const lastWeekRating = await this.getAverageRatingForPeriod(oneWeekAgo, now);
    const lastMonthRating = await this.getAverageRatingForPeriod(oneMonthAgo, now);

    return {
      lastWeek: lastWeekRating,
      lastMonth: lastMonthRating
    };
  }

  private async getAverageRatingForPeriod(start: Date, end: Date): Promise<number> {
    const distribution = await this.getRatingDistribution({ start, end });
    return this.calculateAverageRating(distribution);
  }

  private async getIssueTypesForQuery(naturalLanguageQuery: string): Promise<FeedbackType[]> {
    const results = await this.prisma.$queryRaw<any[]>`
      SELECT feedback_types
      FROM sql_feedback
      WHERE natural_language_query = ${naturalLanguageQuery}
    `;

    const allTypes = new Set<FeedbackType>();

    for (const result of results) {
      const types = JSON.parse(result.feedback_types || '[]');
      types.forEach((type: FeedbackType) => allTypes.add(type));
    }

    return Array.from(allTypes);
  }

  private extractCorrectionPattern(
    generatedSQL: string,
    correctedSQL: string
  ): CorrectionPattern | null {
    // 简单的模式提取：比较两个 SQL 的差异
    if (generatedSQL === correctedSQL) {
      return null;
    }

    // 提取关键差异
    const pattern: CorrectionPattern = {
      description: '用户修正了 SQL',
      beforePattern: generatedSQL,
      afterPattern: correctedSQL,
      frequency: 1,
      issueTypes: []
    };

    // 分析差异类型
    if (generatedSQL.toUpperCase().includes('SELECT *') && !correctedSQL.toUpperCase().includes('SELECT *')) {
      pattern.description = '用户将 SELECT * 改为明确的字段列表';
      pattern.issueTypes.push('wrong_columns');
    } else if (!generatedSQL.toUpperCase().includes('LIMIT') && correctedSQL.toUpperCase().includes('LIMIT')) {
      pattern.description = '用户添加了 LIMIT 子句';
      pattern.issueTypes.push('missing_condition');
    } else if (generatedSQL.toUpperCase().includes('JOIN') !== correctedSQL.toUpperCase().includes('JOIN')) {
      pattern.description = '用户修正了 JOIN 条件';
      pattern.issueTypes.push('wrong_join');
    }

    return pattern;
  }
}

// ========== 接口定义 ==========

export interface ImprovementOpportunity {
  naturalLanguageQuery: string;
  problematicSQL: string;
  correctedSQL: string;
  occurrenceCount: number;
  averageRating: number;
  commonIssues: FeedbackType[];
}

export interface CorrectionPattern {
  description: string;
  beforePattern: string;
  afterPattern: string;
  frequency: number;
  issueTypes: FeedbackType[];
}

export interface TrainingData {
  input: string;           // 自然语言查询
  badOutput: string;       // 错误的 SQL
  goodOutput: string;      // 正确的 SQL
  issues: FeedbackType[];
  rating: FeedbackRating;
  note?: string;
}
