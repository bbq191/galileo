/**
 * 语义缓存统计监控组件
 * 追踪语义缓存的性能指标和成本节省
 */

import { injectable } from 'tsyringe';

/**
 * 语义缓存指标
 */
export interface SemanticCacheMetrics {
  /** 总查询数 */
  totalQueries: number;

  /** 语义缓存命中数 */
  semanticHits: number;

  /** 精确缓存命中数 */
  exactHits: number;

  /** 未命中数 */
  misses: number;

  /** 语义命中率（语义命中 / 总查询） */
  semanticHitRate: number;

  /** 精确命中率（精确命中 / 总查询） */
  exactHitRate: number;

  /** 总命中率（所有命中 / 总查询） */
  overallHitRate: number;

  /** 平均相似度（仅语义命中） */
  avgSimilarity: number;

  /** 节省的成本（人民币） */
  costSavings: number;

  /** 节省的时间（毫秒） */
  timeSavings: number;
}

/**
 * 命中类型
 */
export type CacheHitType = 'semantic' | 'exact' | 'miss';

/**
 * 缓存命中记录
 */
export interface CacheHitRecord {
  /** 查询 */
  query: string;

  /** 命中类型 */
  hitType: CacheHitType;

  /** 相似度（仅语义命中） */
  similarity?: number;

  /** 匹配的缓存查询（仅语义命中） */
  matchedQuery?: string;

  /** 时间戳 */
  timestamp: Date;

  /** 节省的时间（毫秒） */
  timeSaved: number;
}

/**
 * 语义缓存统计监控器
 */
@injectable()
export class SemanticCacheStats {
  private metrics: SemanticCacheMetrics;
  private recentHits: CacheHitRecord[] = [];
  private maxRecentHits = 100; // 保留最近 100 条记录

  // 成本参数（可配置）
  private readonly AI_CALL_COST = 0.05; // 每次 AI 调用成本（人民币）
  private readonly AI_CALL_TIME = 1200; // 每次 AI 调用耗时（毫秒）

  constructor() {
    this.metrics = this.initializeMetrics();
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): SemanticCacheMetrics {
    return {
      totalQueries: 0,
      semanticHits: 0,
      exactHits: 0,
      misses: 0,
      semanticHitRate: 0,
      exactHitRate: 0,
      overallHitRate: 0,
      avgSimilarity: 0,
      costSavings: 0,
      timeSavings: 0,
    };
  }

  /**
   * 记录语义缓存命中
   *
   * @param query 原始查询
   * @param similarity 相似度
   * @param matchedQuery 匹配的缓存查询
   */
  recordSemanticHit(query: string, similarity: number, matchedQuery: string): void {
    this.metrics.semanticHits++;
    this.metrics.totalQueries++;
    this.metrics.costSavings += this.AI_CALL_COST;
    this.metrics.timeSavings += this.AI_CALL_TIME;

    // 更新平均相似度（增量计算）
    const prevTotal = this.metrics.semanticHits - 1;
    this.metrics.avgSimilarity =
      (this.metrics.avgSimilarity * prevTotal + similarity) / this.metrics.semanticHits;

    // 记录命中详情
    this.addHitRecord({
      query,
      hitType: 'semantic',
      similarity,
      matchedQuery,
      timestamp: new Date(),
      timeSaved: this.AI_CALL_TIME,
    });

    this.updateRates();
  }

  /**
   * 记录精确缓存命中
   *
   * @param query 原始查询
   */
  recordExactHit(query: string): void {
    this.metrics.exactHits++;
    this.metrics.totalQueries++;
    this.metrics.costSavings += this.AI_CALL_COST;
    this.metrics.timeSavings += this.AI_CALL_TIME;

    // 记录命中详情
    this.addHitRecord({
      query,
      hitType: 'exact',
      timestamp: new Date(),
      timeSaved: this.AI_CALL_TIME,
    });

    this.updateRates();
  }

  /**
   * 记录缓存未命中
   *
   * @param query 原始查询
   */
  recordMiss(query: string): void {
    this.metrics.misses++;
    this.metrics.totalQueries++;

    // 记录未命中详情
    this.addHitRecord({
      query,
      hitType: 'miss',
      timestamp: new Date(),
      timeSaved: 0,
    });

    this.updateRates();
  }

  /**
   * 更新命中率
   */
  private updateRates(): void {
    if (this.metrics.totalQueries === 0) {
      this.metrics.semanticHitRate = 0;
      this.metrics.exactHitRate = 0;
      this.metrics.overallHitRate = 0;
      return;
    }

    this.metrics.semanticHitRate = this.metrics.semanticHits / this.metrics.totalQueries;
    this.metrics.exactHitRate = this.metrics.exactHits / this.metrics.totalQueries;
    this.metrics.overallHitRate =
      (this.metrics.semanticHits + this.metrics.exactHits) / this.metrics.totalQueries;
  }

  /**
   * 添加命中记录
   */
  private addHitRecord(record: CacheHitRecord): void {
    this.recentHits.push(record);

    // 保持最近 N 条记录
    if (this.recentHits.length > this.maxRecentHits) {
      this.recentHits.shift();
    }
  }

  /**
   * 获取指标
   */
  getMetrics(): SemanticCacheMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取最近的命中记录
   *
   * @param limit 返回的记录数，默认 10
   */
  getRecentHits(limit = 10): CacheHitRecord[] {
    return this.recentHits.slice(-limit).reverse();
  }

  /**
   * 获取语义命中记录
   *
   * @param limit 返回的记录数，默认 10
   */
  getSemanticHits(limit = 10): CacheHitRecord[] {
    return this.recentHits
      .filter((record) => record.hitType === 'semantic')
      .slice(-limit)
      .reverse();
  }

  /**
   * 获取格式化的统计报告
   */
  getReport(): string {
    const m = this.metrics;

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  语义缓存统计报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 查询统计：
  • 总查询数：${m.totalQueries}
  • 语义命中：${m.semanticHits} 次
  • 精确命中：${m.exactHits} 次
  • 未命中：${m.misses} 次

📈 命中率：
  • 语义命中率：${(m.semanticHitRate * 100).toFixed(2)}%
  • 精确命中率：${(m.exactHitRate * 100).toFixed(2)}%
  • 总命中率：${(m.overallHitRate * 100).toFixed(2)}%
  • 平均相似度：${m.avgSimilarity.toFixed(3)}

💰 成本节省：
  • 节省成本：¥${m.costSavings.toFixed(2)}
  • 节省时间：${(m.timeSavings / 1000).toFixed(2)}s

🎯 性能提升：
  • AI 调用减少：${m.semanticHits + m.exactHits} 次
  • 响应加速：平均 ${this.AI_CALL_TIME}ms/次

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
  }

  /**
   * 重置统计数据
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.recentHits = [];
  }

  /**
   * 导出统计数据（JSON 格式）
   */
  exportJSON(): string {
    return JSON.stringify(
      {
        metrics: this.metrics,
        recentHits: this.recentHits,
        exportTime: new Date().toISOString(),
      },
      null,
      2
    );
  }

  /**
   * 从 JSON 导入统计数据
   */
  importJSON(json: string): void {
    try {
      const data = JSON.parse(json);
      this.metrics = data.metrics || this.initializeMetrics();
      this.recentHits = data.recentHits || [];
    } catch (error) {
      console.error('[SemanticCacheStats] 导入数据失败:', error);
    }
  }
}

// 导出全局单例（可选）
export const semanticCacheStats = new SemanticCacheStats();
