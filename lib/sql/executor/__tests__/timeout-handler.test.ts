/**
 * 超时处理器单元测试
 */

import {
  createTimeoutPromise,
  withTimeout,
  TimeoutController,
  BatchTimeoutManager,
  AdaptiveTimeoutStrategy,
} from '../timeout-handler';
import { ExecutorError, ExecutorErrorType } from '../types';

describe('超时处理器', () => {
  describe('createTimeoutPromise', () => {
    it('应该在指定时间后超时', async () => {
      const timeoutPromise = createTimeoutPromise(100);

      await expect(timeoutPromise).rejects.toThrow('查询超时');
    }, 200);

    it('应该抛出 ExecutorError', async () => {
      const timeoutPromise = createTimeoutPromise(50);

      await expect(timeoutPromise).rejects.toThrow(ExecutorError);
    }, 200);
  });

  describe('withTimeout', () => {
    it('应该在超时前返回结果', async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('成功'), 50);
      });

      const result = await withTimeout(promise, 200);
      expect(result).toBe('成功');
    }, 300);

    it('应该在超时后抛出错误', async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('成功'), 200);
      });

      await expect(withTimeout(promise, 100)).rejects.toThrow(ExecutorError);
    }, 300);

    it('应该使用自定义超时消息', async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('成功'), 200);
      });

      await expect(withTimeout(promise, 50, '自定义超时消息')).rejects.toThrow(
        '自定义超时消息'
      );
    }, 300);
  });

  describe('TimeoutController', () => {
    it('应该在超时时设置标志', (done) => {
      const controller = new TimeoutController(100, () => {
        expect(controller.hasTimedOut()).toBe(true);
        done();
      });

      controller.start();
      expect(controller.hasTimedOut()).toBe(false);
    }, 200);

    it('应该能够取消超时', () => {
      const controller = new TimeoutController(100);
      controller.start();
      controller.cancel();

      expect(controller.hasCancelled()).toBe(true);
    });

    it('应该返回剩余时间', () => {
      const controller = new TimeoutController(1000);
      const remaining = controller.getRemainingTime();

      expect(remaining).toBe(1000);
    });
  });

  describe('BatchTimeoutManager', () => {
    it('应该跟踪剩余时间', async () => {
      const manager = new BatchTimeoutManager(1000);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const remaining = manager.getRemainingTime();
      expect(remaining).toBeLessThan(1000);
      expect(remaining).toBeGreaterThan(0);
    }, 200);

    it('应该检测超时', async () => {
      const manager = new BatchTimeoutManager(100);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(manager.isTimedOut()).toBe(true);
    }, 200);

    it('应该创建查询超时 Promise', async () => {
      const manager = new BatchTimeoutManager(100);
      const timeoutPromise = manager.createQueryTimeout('测试查询');

      await expect(timeoutPromise).rejects.toThrow();
    }, 200);
  });

  describe('AdaptiveTimeoutStrategy', () => {
    const strategy = new AdaptiveTimeoutStrategy(10000);

    it('应该根据复杂度计算超时时间', () => {
      expect(strategy.calculateTimeout('low')).toBe(10000);
      expect(strategy.calculateTimeout('medium')).toBe(20000);
      expect(strategy.calculateTimeout('high')).toBe(30000);
    });

    it('应该根据表数量和行数估算超时时间', () => {
      // 简单查询
      expect(strategy.estimateTimeout(1, 100)).toBe(10000);

      // 多表查询
      expect(strategy.estimateTimeout(4, 100)).toBeGreaterThan(10000);

      // 大数据量查询
      expect(strategy.estimateTimeout(1, 200000)).toBeGreaterThan(10000);

      // 不应超过最大值
      expect(strategy.estimateTimeout(10, 10000000)).toBeLessThanOrEqual(300000);
    });

    it('应该根据历史时间预测超时', () => {
      const avgTime = 5000;
      const stdDev = 1000;

      const timeout = strategy.predictTimeout(avgTime, stdDev);

      // 应该是平均时间 + 3倍标准差
      expect(timeout).toBeGreaterThanOrEqual(avgTime + 3 * stdDev);
    });
  });
});
