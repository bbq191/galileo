/**
 * AICostTracker 单元测试
 */

import { AICostTracker, AICallType } from '../ai-cost-tracker';

describe('AICostTracker', () => {
  let costTracker: AICostTracker;

  beforeEach(() => {
    costTracker = new AICostTracker();
  });

  describe('成本计算', () => {
    it('应该正确计算成本', async () => {
      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
        },
        latency: 1000,
        success: true,
      });

      const stats = await costTracker.getTodayStatistics();

      expect(stats.totalCalls).toBe(1);
      expect(stats.tokens.totalTokens).toBe(1500);
      // 1000 * 0.001 / 1000 + 500 * 0.002 / 1000 = 0.001 + 0.001 = 0.002
      expect(stats.costs.totalCost).toBeCloseTo(0.002, 5);
    });

    it('应该支持自定义定价', async () => {
      costTracker.setPricing({
        promptTokenPrice: 0.002,
        completionTokenPrice: 0.004,
      });

      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
        },
        latency: 1000,
        success: true,
      });

      const stats = await costTracker.getTodayStatistics();

      // 1000 * 0.002 / 1000 + 500 * 0.004 / 1000 = 0.002 + 0.002 = 0.004
      expect(stats.costs.totalCost).toBeCloseTo(0.004, 5);
    });
  });

  describe('统计功能', () => {
    it('应该正确统计成功和失败调用', async () => {
      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 1000,
        success: true,
      });

      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 1000,
        success: false,
        error: 'API error',
      });

      const stats = await costTracker.getTodayStatistics();

      expect(stats.totalCalls).toBe(2);
      expect(stats.successCalls).toBe(1);
      expect(stats.failedCalls).toBe(1);
    });

    it('应该正确计算缓存命中率', async () => {
      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: true,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 100,
        success: true,
      });

      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 1000,
        success: true,
      });

      const stats = await costTracker.getTodayStatistics();

      expect(stats.totalCalls).toBe(2);
      expect(stats.cachedCalls).toBe(1);
      expect(stats.cacheHitRate).toBe(0.5);
    });

    it('应该按类型统计', async () => {
      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 1000,
        success: true,
      });

      await costTracker.track({
        type: AICallType.RELATIONSHIP_INFERENCE,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        latency: 1500,
        success: true,
      });

      const stats = await costTracker.getTodayStatistics();

      expect(stats.byType[AICallType.SEMANTIC_ANNOTATION].calls).toBe(1);
      expect(stats.byType[AICallType.SEMANTIC_ANNOTATION].tokens).toBe(150);

      expect(stats.byType[AICallType.RELATIONSHIP_INFERENCE].calls).toBe(1);
      expect(stats.byType[AICallType.RELATIONSHIP_INFERENCE].tokens).toBe(300);
    });

    it('应该正确计算平均响应时间', async () => {
      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 1000,
        success: true,
      });

      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 2000,
        success: true,
      });

      const stats = await costTracker.getTodayStatistics();

      expect(stats.avgLatency).toBe(1500);
    });
  });

  describe('报告生成', () => {
    it('应该生成每日报告', async () => {
      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 1000,
        success: true,
      });

      const report = await costTracker.generateReport('day');

      expect(report).toContain('今日 AI 成本报告');
      expect(report).toContain('总调用次数');
      expect(report).toContain('成本统计');
    });

    it('应该生成每周报告', async () => {
      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 1000,
        success: true,
      });

      const report = await costTracker.generateReport('week');

      expect(report).toContain('本周 AI 成本报告');
    });

    it('应该生成每月报告', async () => {
      await costTracker.track({
        type: AICallType.SEMANTIC_ANNOTATION,
        model: 'deepseek-r1:1.5b',
        cached: false,
        tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        latency: 1000,
        success: true,
      });

      const report = await costTracker.generateReport('month');

      expect(report).toContain('本月 AI 成本报告');
    });
  });

  describe('成本告警', () => {
    it('应该配置成本告警', () => {
      const alertConfig = {
        dailyBudget: 10,
        weeklyBudget: 50,
        monthlyBudget: 200,
        alertThreshold: 0.8,
      };

      costTracker.configureAlerts(alertConfig);

      // 验证配置成功（无报错）
      expect(true).toBe(true);
    });
  });
});
