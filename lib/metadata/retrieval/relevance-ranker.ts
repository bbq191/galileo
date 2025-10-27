/**
 * 相关性排序器
 * 根据多个因素对搜索结果进行排序
 */

import { TableSearchResult } from './types';

/**
 * 排序权重配置
 */
interface RankingWeights {
  /** 名称匹配权重 */
  nameMatch: number;
  /** 语义描述权重 */
  semanticMatch: number;
  /** 使用频率权重 */
  usageFrequency: number;
  /** 数据新鲜度权重 */
  dataFreshness: number;
}

/**
 * 默认排序权重
 */
const DEFAULT_WEIGHTS: RankingWeights = {
  nameMatch: 0.5,
  semanticMatch: 0.3,
  usageFrequency: 0.1,
  dataFreshness: 0.1,
};

/**
 * 相关性排序器
 */
export class RelevanceRanker {
  private weights: RankingWeights;

  constructor(weights?: Partial<RankingWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * 对表搜索结果进行排序
   */
  rankTables(results: TableSearchResult[]): TableSearchResult[] {
    return results
      .map(result => ({
        ...result,
        finalScore: this.calculateFinalScore(result),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * 计算最终分数
   */
  private calculateFinalScore(result: TableSearchResult): number {
    const { table, score } = result;

    // 基础分数（来自语义搜索）
    let finalScore = score * this.weights.nameMatch;

    // 语义描述质量加分
    if (table.semanticDescription && table.semanticDescription.length > 20) {
      finalScore += 0.1 * this.weights.semanticMatch;
    }

    // 字段数量适中加分
    const columnCount = table.columns?.length || 0;
    if (columnCount > 0 && columnCount < 50) {
      finalScore += 0.05 * this.weights.semanticMatch;
    }

    // 有主键加分
    const hasPrimaryKey = table.columns?.some((col: any) => col.isPrimaryKey);
    if (hasPrimaryKey) {
      finalScore += 0.05;
    }

    return Math.min(finalScore, 1.0);
  }

  /**
   * 根据查询意图调整排序
   */
  rankByIntent(
    results: TableSearchResult[],
    intentType: 'select' | 'aggregate' | 'statistics' | 'comparison'
  ): TableSearchResult[] {
    return results.map(result => {
      let adjustedScore = result.score;

      switch (intentType) {
        case 'aggregate':
          // 聚合查询偏好有数值字段的表
          if (this.hasNumericColumns(result.table)) {
            adjustedScore *= 1.2;
          }
          break;

        case 'statistics':
          // 统计查询偏好有时间字段的表
          if (this.hasTimeColumns(result.table)) {
            adjustedScore *= 1.2;
          }
          break;

        default:
          // 其他类型不调整
          break;
      }

      return {
        ...result,
        score: Math.min(adjustedScore, 1.0),
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * 检查是否有数值字段
   */
  private hasNumericColumns(table: any): boolean {
    const numericTypes = ['INT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BIGINT', 'NUMERIC'];
    return (table.columns || []).some((col: any) =>
      numericTypes.some(type => col.dataType?.toUpperCase().includes(type))
    );
  }

  /**
   * 检查是否有时间字段
   */
  private hasTimeColumns(table: any): boolean {
    const timeTypes = ['DATE', 'DATETIME', 'TIMESTAMP', 'TIME'];
    return (table.columns || []).some((col: any) =>
      timeTypes.some(type => col.dataType?.toUpperCase().includes(type))
    );
  }

  /**
   * 过滤低分结果
   */
  filterLowScores(
    results: TableSearchResult[],
    threshold: number = 0.3
  ): TableSearchResult[] {
    return results.filter(r => r.score >= threshold);
  }

  /**
   * 去重（基于表ID）
   */
  deduplicate(results: TableSearchResult[]): TableSearchResult[] {
    const seen = new Set<number>();
    return results.filter(r => {
      if (seen.has(r.table.id)) {
        return false;
      }
      seen.add(r.table.id);
      return true;
    });
  }
}
