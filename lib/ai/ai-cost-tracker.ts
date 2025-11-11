/**
 * AI 成本跟踪器
 *
 * 功能：
 * - 记录每次 AI 调用的 Token 使用量
 * - 统计成本（基于 Token 数量）
 * - 生成成本报告
 * - 监控告警（超过预算阈值）
 *
 * 成本模型（参考 Deepseek 官方定价）：
 * - Prompt Token: ¥0.001 / 1K tokens
 * - Completion Token: ¥0.002 / 1K tokens
 * - 本地 Ollama: ¥0 (仅计算 Token 数量)
 */

import { injectable, inject } from 'tsyringe';
import type { Redis } from 'ioredis';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * AI 调用类型
 */
export enum AICallType {
  /** 语义标注 */
  SEMANTIC_ANNOTATION = 'semantic_annotation',
  /** 关系推断 */
  RELATIONSHIP_INFERENCE = 'relationship_inference',
  /** 意图识别 */
  INTENT_RECOGNITION = 'intent_recognition',
  /** SQL 生成 */
  SQL_GENERATION = 'sql_generation',
  /** 其他 */
  OTHER = 'other',
}

/**
 * AI 调用记录
 */
export interface AICallRecord {
  /** 记录 ID */
  id: string;

  /** 调用类型 */
  type: AICallType;

  /** 时间戳 */
  timestamp: Date;

  /** 模型名称 */
  model: string;

  /** 是否是缓存命中 */
  cached: boolean;

  /** Token 统计 */
  tokens: {
    /** Prompt Token 数 */
    promptTokens: number;
    /** 响应 Token 数 */
    completionTokens: number;
    /** 总 Token 数 */
    totalTokens: number;
  };

  /** 成本（人民币，单位：元） */
  cost: {
    /** Prompt 成本 */
    promptCost: number;
    /** Completion 成本 */
    completionCost: number;
    /** 总成本 */
    totalCost: number;
  };

  /** 响应时间（毫秒） */
  latency?: number;

  /** 是否成功 */
  success: boolean;

  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 成本统计（按时间段）
 */
export interface CostStatistics {
  /** 时间段 */
  period: {
    start: Date;
    end: Date;
  };

  /** 总调用次数 */
  totalCalls: number;

  /** 成功调用次数 */
  successCalls: number;

  /** 失败调用次数 */
  failedCalls: number;

  /** 缓存命中次数 */
  cachedCalls: number;

  /** 缓存命中率 */
  cacheHitRate: number;

  /** Token 统计 */
  tokens: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
  };

  /** 成本统计 */
  costs: {
    totalPromptCost: number;
    totalCompletionCost: number;
    totalCost: number;
  };

  /** 按类型统计 */
  byType: Record<AICallType, {
    calls: number;
    tokens: number;
    cost: number;
  }>;

  /** 平均响应时间（毫秒） */
  avgLatency: number;
}

/**
 * 成本告警配置
 */
export interface CostAlertConfig {
  /** 每日预算（元） */
  dailyBudget?: number;

  /** 每周预算（元） */
  weeklyBudget?: number;

  /** 每月预算（元） */
  monthlyBudget?: number;

  /** 告警阈值（预算的百分比，0-1） */
  alertThreshold?: number;

  /** 告警回调 */
  onAlert?: (stats: CostStatistics, threshold: number) => void;
}

/**
 * AI 成本跟踪器
 */
@injectable()
export class AICostTracker {
  private redis?: Redis;
  private alertConfig?: CostAlertConfig;

  /** 内存缓存（最近的记录） */
  private recentRecords: AICallRecord[] = [];
  private readonly maxRecentRecords = 1000;

  /** 定价模型（人民币/1K tokens） */
  private pricing = {
    /** Prompt Token 价格 */
    promptTokenPrice: 0.001,
    /** Completion Token 价格 */
    completionTokenPrice: 0.002,
  };

  constructor(
    @inject(DI_TOKENS.RedisClient) redis?: Redis
  ) {
    this.redis = redis;
  }

  /**
   * 配置成本告警
   */
  configureAlerts(config: CostAlertConfig): void {
    this.alertConfig = config;
    console.log('[AICostTracker] 成本告警已配置', config);
  }

  /**
   * 设置定价模型
   */
  setPricing(pricing: {
    promptTokenPrice?: number;
    completionTokenPrice?: number;
  }): void {
    if (pricing.promptTokenPrice !== undefined) {
      this.pricing.promptTokenPrice = pricing.promptTokenPrice;
    }
    if (pricing.completionTokenPrice !== undefined) {
      this.pricing.completionTokenPrice = pricing.completionTokenPrice;
    }
    console.log('[AICostTracker] 定价模型已更新', this.pricing);
  }

  /**
   * 记录 AI 调用
   *
   * @param record AI 调用记录
   *
   * @example
   * ```typescript
   * await costTracker.track({
   *   type: AICallType.SEMANTIC_ANNOTATION,
   *   model: 'deepseek-r1:1.5b',
   *   cached: false,
   *   tokens: { promptTokens: 150, completionTokens: 80, totalTokens: 230 },
   *   latency: 1250,
   *   success: true
   * });
   * ```
   */
  async track(
    record: Omit<AICallRecord, 'id' | 'timestamp' | 'cost'>
  ): Promise<void> {
    const { promptTokens, completionTokens, totalTokens } = record.tokens;

    // 计算成本
    const promptCost = (promptTokens / 1000) * this.pricing.promptTokenPrice;
    const completionCost = (completionTokens / 1000) * this.pricing.completionTokenPrice;
    const totalCost = promptCost + completionCost;

    const fullRecord: AICallRecord = {
      id: `ai_call:${Date.now()}:${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      cost: {
        promptCost,
        completionCost,
        totalCost,
      },
      ...record,
    };

    // 1. 添加到内存缓存
    this.recentRecords.push(fullRecord);
    if (this.recentRecords.length > this.maxRecentRecords) {
      this.recentRecords.shift(); // 移除最旧的记录
    }

    // 2. 持久化到 Redis
    if (this.redis) {
      const key = `ai_cost:records:${this.getDateKey(fullRecord.timestamp)}`;
      await this.redis.rpush(key, JSON.stringify(fullRecord));
      // 设置 90 天过期
      await this.redis.expire(key, 90 * 24 * 60 * 60);
    }

    // 3. 检查告警
    await this.checkAlerts(fullRecord);
  }

  /**
   * 获取统计数据
   *
   * @param start 开始时间
   * @param end 结束时间
   * @returns 统计数据
   *
   * @example
   * ```typescript
   * // 获取今天的统计
   * const today = await costTracker.getStatistics(
   *   new Date(new Date().setHours(0, 0, 0, 0)),
   *   new Date()
   * );
   * console.log(`今日成本: ¥${today.costs.totalCost.toFixed(2)}`);
   * console.log(`缓存命中率: ${(today.cacheHitRate * 100).toFixed(1)}%`);
   * ```
   */
  async getStatistics(start: Date, end: Date): Promise<CostStatistics> {
    const records = await this.getRecords(start, end);

    const stats: CostStatistics = {
      period: { start, end },
      totalCalls: records.length,
      successCalls: 0,
      failedCalls: 0,
      cachedCalls: 0,
      cacheHitRate: 0,
      tokens: {
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
      },
      costs: {
        totalPromptCost: 0,
        totalCompletionCost: 0,
        totalCost: 0,
      },
      byType: {} as any,
      avgLatency: 0,
    };

    // 初始化按类型统计
    for (const type of Object.values(AICallType)) {
      stats.byType[type] = {
        calls: 0,
        tokens: 0,
        cost: 0,
      };
    }

    let totalLatency = 0;
    let latencyCount = 0;

    // 遍历记录，计算统计
    for (const record of records) {
      // 成功/失败统计
      if (record.success) {
        stats.successCalls++;
      } else {
        stats.failedCalls++;
      }

      // 缓存统计
      if (record.cached) {
        stats.cachedCalls++;
      }

      // Token 统计
      stats.tokens.totalPromptTokens += record.tokens.promptTokens;
      stats.tokens.totalCompletionTokens += record.tokens.completionTokens;
      stats.tokens.totalTokens += record.tokens.totalTokens;

      // 成本统计
      stats.costs.totalPromptCost += record.cost.promptCost;
      stats.costs.totalCompletionCost += record.cost.completionCost;
      stats.costs.totalCost += record.cost.totalCost;

      // 按类型统计
      const typeStats = stats.byType[record.type];
      typeStats.calls++;
      typeStats.tokens += record.tokens.totalTokens;
      typeStats.cost += record.cost.totalCost;

      // 响应时间统计
      if (record.latency !== undefined) {
        totalLatency += record.latency;
        latencyCount++;
      }
    }

    // 计算缓存命中率
    stats.cacheHitRate = stats.totalCalls > 0 ? stats.cachedCalls / stats.totalCalls : 0;

    // 计算平均响应时间
    stats.avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

    return stats;
  }

  /**
   * 获取今日统计
   */
  async getTodayStatistics(): Promise<CostStatistics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.getStatistics(today, new Date());
  }

  /**
   * 获取本周统计
   */
  async getWeekStatistics(): Promise<CostStatistics> {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return this.getStatistics(weekStart, new Date());
  }

  /**
   * 获取本月统计
   */
  async getMonthStatistics(): Promise<CostStatistics> {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return this.getStatistics(monthStart, new Date());
  }

  /**
   * 生成成本报告
   *
   * @param period 'day' | 'week' | 'month'
   * @returns Markdown 格式的报告
   */
  async generateReport(period: 'day' | 'week' | 'month'): Promise<string> {
    let stats: CostStatistics;
    let title: string;

    switch (period) {
      case 'day':
        stats = await this.getTodayStatistics();
        title = '今日 AI 成本报告';
        break;
      case 'week':
        stats = await this.getWeekStatistics();
        title = '本周 AI 成本报告';
        break;
      case 'month':
        stats = await this.getMonthStatistics();
        title = '本月 AI 成本报告';
        break;
    }

    const report = `
# ${title}

**时间段**: ${stats.period.start.toLocaleDateString()} - ${stats.period.end.toLocaleDateString()}

---

## 📊 总览

| 指标 | 数值 |
|------|------|
| 总调用次数 | ${stats.totalCalls} |
| 成功调用 | ${stats.successCalls} (${((stats.successCalls / stats.totalCalls) * 100).toFixed(1)}%) |
| 失败调用 | ${stats.failedCalls} (${((stats.failedCalls / stats.totalCalls) * 100).toFixed(1)}%) |
| 缓存命中 | ${stats.cachedCalls} (${(stats.cacheHitRate * 100).toFixed(1)}%) |
| 平均响应时间 | ${stats.avgLatency.toFixed(0)} ms |

---

## 💰 成本统计

| 项目 | Token 数 | 成本 (¥) |
|------|---------|---------|
| Prompt Tokens | ${stats.tokens.totalPromptTokens.toLocaleString()} | ¥${stats.costs.totalPromptCost.toFixed(4)} |
| Completion Tokens | ${stats.tokens.totalCompletionTokens.toLocaleString()} | ¥${stats.costs.totalCompletionCost.toFixed(4)} |
| **总计** | **${stats.tokens.totalTokens.toLocaleString()}** | **¥${stats.costs.totalCost.toFixed(4)}** |

---

## 📈 按类型统计

| 类型 | 调用次数 | Token 数 | 成本 (¥) |
|------|---------|---------|---------|
${Object.entries(stats.byType).map(([type, data]) =>
  `| ${type} | ${data.calls} | ${data.tokens.toLocaleString()} | ¥${data.cost.toFixed(4)} |`
).join('\n')}

---

## 💡 优化建议

${this.generateOptimizationTips(stats)}

---

**报告生成时间**: ${new Date().toLocaleString()}
`;

    return report.trim();
  }

  /**
   * 生成优化建议
   */
  private generateOptimizationTips(stats: CostStatistics): string {
    const tips: string[] = [];

    // 缓存命中率建议
    if (stats.cacheHitRate < 0.5) {
      tips.push('- 📌 缓存命中率较低，建议优化缓存策略或增加预热');
    } else if (stats.cacheHitRate > 0.7) {
      tips.push('- ✅ 缓存命中率良好，继续保持');
    }

    // 成本建议
    const avgCostPerCall = stats.costs.totalCost / stats.totalCalls;
    if (avgCostPerCall > 0.01) {
      tips.push('- 📌 平均每次调用成本较高，建议优化 Prompt 长度或使用更小的模型');
    }

    // 失败率建议
    const failureRate = stats.failedCalls / stats.totalCalls;
    if (failureRate > 0.05) {
      tips.push('- ⚠️ 失败率较高，建议检查 API 连接和重试机制');
    }

    // 响应时间建议
    if (stats.avgLatency > 5000) {
      tips.push('- 📌 平均响应时间较长，建议优化 Prompt 或使用更快的模型');
    }

    return tips.length > 0 ? tips.join('\n') : '- ✅ 各项指标正常，无需优化';
  }

  /**
   * 检查成本告警
   */
  private async checkAlerts(record: AICallRecord): Promise<void> {
    if (!this.alertConfig) {
      return;
    }

    const { dailyBudget, weeklyBudget, monthlyBudget, alertThreshold = 0.8, onAlert } = this.alertConfig;

    // 检查每日预算
    if (dailyBudget) {
      const todayStats = await this.getTodayStatistics();
      if (todayStats.costs.totalCost >= dailyBudget * alertThreshold) {
        console.warn(`[AICostTracker] ⚠️ 每日成本接近预算: ¥${todayStats.costs.totalCost.toFixed(2)} / ¥${dailyBudget}`);
        onAlert?.(todayStats, alertThreshold);
      }
    }

    // 检查每周预算
    if (weeklyBudget) {
      const weekStats = await this.getWeekStatistics();
      if (weekStats.costs.totalCost >= weeklyBudget * alertThreshold) {
        console.warn(`[AICostTracker] ⚠️ 每周成本接近预算: ¥${weekStats.costs.totalCost.toFixed(2)} / ¥${weeklyBudget}`);
        onAlert?.(weekStats, alertThreshold);
      }
    }

    // 检查每月预算
    if (monthlyBudget) {
      const monthStats = await this.getMonthStatistics();
      if (monthStats.costs.totalCost >= monthlyBudget * alertThreshold) {
        console.warn(`[AICostTracker] ⚠️ 每月成本接近预算: ¥${monthStats.costs.totalCost.toFixed(2)} / ¥${monthlyBudget}`);
        onAlert?.(monthStats, alertThreshold);
      }
    }
  }

  /**
   * 获取记录
   */
  private async getRecords(start: Date, end: Date): Promise<AICallRecord[]> {
    const records: AICallRecord[] = [];

    // 1. 从 Redis 加载
    if (this.redis) {
      const dates = this.getDateRange(start, end);
      for (const date of dates) {
        const key = `ai_cost:records:${date}`;
        const data = await this.redis.lrange(key, 0, -1);
        for (const item of data) {
          const record = JSON.parse(item) as AICallRecord;
          record.timestamp = new Date(record.timestamp);
          if (record.timestamp >= start && record.timestamp <= end) {
            records.push(record);
          }
        }
      }
    }

    // 2. 从内存缓存加载
    for (const record of this.recentRecords) {
      if (record.timestamp >= start && record.timestamp <= end) {
        // 避免重复
        if (!records.find(r => r.id === record.id)) {
          records.push(record);
        }
      }
    }

    return records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * 获取日期 Key（YYYY-MM-DD）
   */
  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * 获取日期范围
   */
  private getDateRange(start: Date, end: Date): string[] {
    const dates: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(this.getDateKey(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }
}
