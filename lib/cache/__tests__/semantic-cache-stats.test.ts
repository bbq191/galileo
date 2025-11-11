/**
 * SemanticCacheStats 单元测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SemanticCacheStats } from '../semantic-cache-stats';

describe('SemanticCacheStats', () => {
  let stats: SemanticCacheStats;

  beforeEach(() => {
    stats = new SemanticCacheStats();
  });

  describe('命中记录', () => {
    it('应该正确记录语义缓存命中', () => {
      stats.recordSemanticHit('查询用户订单', 0.87, '获取用户订单');

      const metrics = stats.getMetrics();
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.semanticHits).toBe(1);
      expect(metrics.exactHits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.avgSimilarity).toBe(0.87);
    });

    it('应该正确记录精确缓存命中', () => {
      stats.recordExactHit('查询用户订单');

      const metrics = stats.getMetrics();
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.exactHits).toBe(1);
      expect(metrics.semanticHits).toBe(0);
      expect(metrics.misses).toBe(0);
    });

    it('应该正确记录缓存未命中', () => {
      stats.recordMiss('查询用户订单');

      const metrics = stats.getMetrics();
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.misses).toBe(1);
      expect(metrics.semanticHits).toBe(0);
      expect(metrics.exactHits).toBe(0);
    });

    it('应该正确记录混合场景', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');
      stats.recordMiss('查询C');
      stats.recordSemanticHit('查询D', 0.90, '获取D');

      const metrics = stats.getMetrics();
      expect(metrics.totalQueries).toBe(4);
      expect(metrics.semanticHits).toBe(2);
      expect(metrics.exactHits).toBe(1);
      expect(metrics.misses).toBe(1);
    });
  });

  describe('命中率计算', () => {
    it('应该正确计算语义命中率', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordSemanticHit('查询B', 0.90, '获取B');
      stats.recordMiss('查询C');
      stats.recordMiss('查询D');

      const metrics = stats.getMetrics();
      expect(metrics.semanticHitRate).toBe(0.5); // 2/4
    });

    it('应该正确计算精确命中率', () => {
      stats.recordExactHit('查询A');
      stats.recordExactHit('查询B');
      stats.recordMiss('查询C');
      stats.recordMiss('查询D');

      const metrics = stats.getMetrics();
      expect(metrics.exactHitRate).toBe(0.5); // 2/4
    });

    it('应该正确计算总命中率', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');
      stats.recordMiss('查询C');
      stats.recordMiss('查询D');

      const metrics = stats.getMetrics();
      expect(metrics.overallHitRate).toBe(0.5); // (1+1)/4
    });

    it('零查询时命中率应该为 0', () => {
      const metrics = stats.getMetrics();
      expect(metrics.semanticHitRate).toBe(0);
      expect(metrics.exactHitRate).toBe(0);
      expect(metrics.overallHitRate).toBe(0);
    });
  });

  describe('平均相似度计算', () => {
    it('应该正确计算平均相似度', () => {
      stats.recordSemanticHit('查询A', 0.80, '获取A');
      stats.recordSemanticHit('查询B', 0.90, '获取B');
      stats.recordSemanticHit('查询C', 0.85, '获取C');

      const metrics = stats.getMetrics();
      expect(metrics.avgSimilarity).toBeCloseTo(0.85, 2); // (0.80+0.90+0.85)/3
    });

    it('单次语义命中的平均相似度应该等于该相似度', () => {
      stats.recordSemanticHit('查询A', 0.87, '获取A');

      const metrics = stats.getMetrics();
      expect(metrics.avgSimilarity).toBe(0.87);
    });

    it('没有语义命中时平均相似度应该为 0', () => {
      stats.recordExactHit('查询A');
      stats.recordMiss('查询B');

      const metrics = stats.getMetrics();
      expect(metrics.avgSimilarity).toBe(0);
    });
  });

  describe('成本节省计算', () => {
    it('应该正确计算成本节省', () => {
      // 默认每次 AI 调用成本 ¥0.05
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');

      const metrics = stats.getMetrics();
      expect(metrics.costSavings).toBe(0.1); // 2 * 0.05
    });

    it('应该正确计算时间节省', () => {
      // 默认每次 AI 调用耗时 1200ms
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');

      const metrics = stats.getMetrics();
      expect(metrics.timeSavings).toBe(2400); // 2 * 1200
    });

    it('未命中不应该计算成本节省', () => {
      stats.recordMiss('查询A');
      stats.recordMiss('查询B');

      const metrics = stats.getMetrics();
      expect(metrics.costSavings).toBe(0);
      expect(metrics.timeSavings).toBe(0);
    });
  });

  describe('最近命中记录', () => {
    it('应该返回最近的命中记录', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');
      stats.recordMiss('查询C');

      const recentHits = stats.getRecentHits(10);
      expect(recentHits).toHaveLength(3);
      expect(recentHits[0].query).toBe('查询C'); // 最新的在前
      expect(recentHits[1].query).toBe('查询B');
      expect(recentHits[2].query).toBe('查询A');
    });

    it('应该限制返回的记录数', () => {
      for (let i = 0; i < 20; i++) {
        stats.recordMiss(`查询${i}`);
      }

      const recentHits = stats.getRecentHits(5);
      expect(recentHits).toHaveLength(5);
    });

    it('应该只返回语义命中记录', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');
      stats.recordSemanticHit('查询C', 0.90, '获取C');
      stats.recordMiss('查询D');

      const semanticHits = stats.getSemanticHits(10);
      expect(semanticHits).toHaveLength(2);
      expect(semanticHits[0].query).toBe('查询C');
      expect(semanticHits[1].query).toBe('查询A');
    });
  });

  describe('统计报告', () => {
    it('应该生成格式化的统计报告', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');
      stats.recordMiss('查询C');

      const report = stats.getReport();
      expect(report).toContain('语义缓存统计报告');
      expect(report).toContain('总查询数：3');
      expect(report).toContain('语义命中：1 次');
      expect(report).toContain('精确命中：1 次');
      expect(report).toContain('未命中：1 次');
    });
  });

  describe('数据导入导出', () => {
    it('应该能导出统计数据', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');

      const exported = stats.exportJSON();
      expect(exported).toBeTruthy();

      const parsed = JSON.parse(exported);
      expect(parsed.metrics.totalQueries).toBe(2);
      expect(parsed.metrics.semanticHits).toBe(1);
      expect(parsed.metrics.exactHits).toBe(1);
    });

    it('应该能导入统计数据', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      const exported = stats.exportJSON();

      const newStats = new SemanticCacheStats();
      newStats.importJSON(exported);

      const metrics = newStats.getMetrics();
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.semanticHits).toBe(1);
    });
  });

  describe('重置功能', () => {
    it('应该能重置所有统计数据', () => {
      stats.recordSemanticHit('查询A', 0.85, '获取A');
      stats.recordExactHit('查询B');
      stats.recordMiss('查询C');

      stats.reset();

      const metrics = stats.getMetrics();
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.semanticHits).toBe(0);
      expect(metrics.exactHits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.avgSimilarity).toBe(0);
      expect(metrics.costSavings).toBe(0);
      expect(metrics.timeSavings).toBe(0);
    });
  });
});
