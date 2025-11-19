/**
 * 业务域推断监控指标
 *
 * 职责：收集和统计推断性能指标
 */

/**
 * 推断指标数据
 */
export interface InferenceMetrics {
  // 推断次数统计
  totalInferences: number; // 总推断次数
  successfulInferences: number; // 成功推断次数
  failedInferences: number; // 失败推断次数

  // 置信度统计
  totalConfidence: number; // 置信度总和（用于计算平均值）
  highConfidenceCount: number; // 高置信度推断次数（>= autoApplyThreshold）
  lowConfidenceCount: number; // 低置信度推断次数（< confidenceThreshold）

  // 审核统计
  autoAppliedCount: number; // 自动应用次数
  manualReviewCount: number; // 需要人工审核次数

  // 策略统计
  strategyHits: {
    naming_rule: number;
    vector_similarity: number;
    ai_reasoning: number;
  };

  // 耗时统计（毫秒）
  totalDuration: number; // 总耗时
  minDuration: number; // 最小耗时
  maxDuration: number; // 最大耗时

  // 缓存统计
  cacheHits: number; // 缓存命中次数
  cacheMisses: number; // 缓存未命中次数

  // 时间戳
  startTime: number; // 统计开始时间
  lastUpdated: number; // 最后更新时间
}

/**
 * 推断事件类型
 */
export type InferenceEvent =
  | 'inference_success'
  | 'inference_failed'
  | 'auto_applied'
  | 'manual_review'
  | 'cache_hit'
  | 'cache_miss';

/**
 * 监控指标收集器
 */
export class InferenceMetricsCollector {
  private metrics: InferenceMetrics;

  constructor() {
    this.metrics = this.initializeMetrics();
  }

  /**
   * 初始化指标
   */
  private initializeMetrics(): InferenceMetrics {
    const now = Date.now();
    return {
      totalInferences: 0,
      successfulInferences: 0,
      failedInferences: 0,
      totalConfidence: 0,
      highConfidenceCount: 0,
      lowConfidenceCount: 0,
      autoAppliedCount: 0,
      manualReviewCount: 0,
      strategyHits: {
        naming_rule: 0,
        vector_similarity: 0,
        ai_reasoning: 0,
      },
      totalDuration: 0,
      minDuration: Number.MAX_SAFE_INTEGER,
      maxDuration: 0,
      cacheHits: 0,
      cacheMisses: 0,
      startTime: now,
      lastUpdated: now,
    };
  }

  /**
   * 记录推断成功事件
   */
  recordInferenceSuccess(
    confidence: number,
    strategies: Array<{ strategyName: string }>,
    duration: number,
    requiresReview: boolean
  ): void {
    this.metrics.totalInferences++;
    this.metrics.successfulInferences++;
    this.metrics.totalConfidence += confidence;
    this.metrics.totalDuration += duration;
    this.metrics.minDuration = Math.min(this.metrics.minDuration, duration);
    this.metrics.maxDuration = Math.max(this.metrics.maxDuration, duration);

    // 置信度分类
    if (confidence >= 0.8) {
      this.metrics.highConfidenceCount++;
    }
    if (confidence < 0.7) {
      this.metrics.lowConfidenceCount++;
    }

    // 审核统计
    if (requiresReview) {
      this.metrics.manualReviewCount++;
    }

    // 策略统计
    for (const strategy of strategies) {
      const strategyName = strategy.strategyName as keyof typeof this.metrics.strategyHits;
      if (strategyName in this.metrics.strategyHits) {
        this.metrics.strategyHits[strategyName]++;
      }
    }

    this.metrics.lastUpdated = Date.now();
  }

  /**
   * 记录推断失败事件
   */
  recordInferenceFailed(): void {
    this.metrics.totalInferences++;
    this.metrics.failedInferences++;
    this.metrics.lastUpdated = Date.now();
  }

  /**
   * 记录自动应用事件
   */
  recordAutoApplied(): void {
    this.metrics.autoAppliedCount++;
    this.metrics.lastUpdated = Date.now();
  }

  /**
   * 记录缓存命中事件
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++;
    this.metrics.lastUpdated = Date.now();
  }

  /**
   * 记录缓存未命中事件
   */
  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
    this.metrics.lastUpdated = Date.now();
  }

  /**
   * 获取当前指标
   */
  getMetrics(): InferenceMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取计算后的统计信息
   */
  getStats() {
    const totalInferences = this.metrics.totalInferences;
    const avgConfidence =
      this.metrics.successfulInferences > 0
        ? this.metrics.totalConfidence / this.metrics.successfulInferences
        : 0;

    const avgDuration =
      this.metrics.successfulInferences > 0
        ? this.metrics.totalDuration / this.metrics.successfulInferences
        : 0;

    const successRate =
      totalInferences > 0
        ? this.metrics.successfulInferences / totalInferences
        : 0;

    const autoApplyRate =
      this.metrics.successfulInferences > 0
        ? this.metrics.autoAppliedCount / this.metrics.successfulInferences
        : 0;

    const manualReviewRate =
      this.metrics.successfulInferences > 0
        ? this.metrics.manualReviewCount / this.metrics.successfulInferences
        : 0;

    const cacheHitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
        : 0;

    const uptime = Date.now() - this.metrics.startTime;

    return {
      // 基础统计
      totalInferences,
      successfulInferences: this.metrics.successfulInferences,
      failedInferences: this.metrics.failedInferences,
      successRate,

      // 置信度统计
      avgConfidence,
      highConfidenceCount: this.metrics.highConfidenceCount,
      lowConfidenceCount: this.metrics.lowConfidenceCount,

      // 审核统计
      autoAppliedCount: this.metrics.autoAppliedCount,
      manualReviewCount: this.metrics.manualReviewCount,
      autoApplyRate,
      manualReviewRate,

      // 策略统计
      strategyHits: { ...this.metrics.strategyHits },

      // 耗时统计（毫秒）
      avgDuration,
      minDuration: this.metrics.minDuration === Number.MAX_SAFE_INTEGER ? 0 : this.metrics.minDuration,
      maxDuration: this.metrics.maxDuration,

      // 缓存统计
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      cacheHitRate,

      // 运行时间
      uptime,
      startTime: this.metrics.startTime,
      lastUpdated: this.metrics.lastUpdated,
    };
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
  }

  /**
   * 导出指标为 JSON
   */
  export(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

// 全局单例（用于收集系统级指标）
export const globalInferenceMetrics = new InferenceMetricsCollector();
