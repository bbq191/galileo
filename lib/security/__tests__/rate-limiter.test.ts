/**
 * 速率限制器单元测试
 */

import { rateLimiters, getIdentifier, checkRateLimit } from '../rate-limiter';

describe('Rate Limiter', () => {
  describe('getIdentifier', () => {
    it('应该优先使用用户 ID', () => {
      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-user-id': 'user-123',
          'x-forwarded-for': '192.168.1.1',
        },
      });

      const identifier = getIdentifier(request);
      expect(identifier).toBe('user:user-123');
    });

    it('应该在没有用户 ID 时使用 x-forwarded-for', () => {
      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      });

      const identifier = getIdentifier(request);
      expect(identifier).toBe('ip:192.168.1.1');
    });

    it('应该在没有用户 ID 时使用 x-real-ip', () => {
      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-real-ip': '192.168.1.2',
        },
      });

      const identifier = getIdentifier(request);
      expect(identifier).toBe('ip:192.168.1.2');
    });

    it('应该在没有任何 IP 头时使用默认值', () => {
      const request = new Request('http://localhost:3000/api/test');

      const identifier = getIdentifier(request);
      expect(identifier).toBe('ip:127.0.0.1');
    });
  });

  describe('checkRateLimit', () => {
    it('应该允许在限制内的请求', async () => {
      const identifier = `test-user-${Date.now()}`;
      const limiter = rateLimiters.general;

      const result = await checkRateLimit(limiter, identifier);

      expect(result.success).toBe(true);
      expect(result.limit).toBeGreaterThan(0);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('应该在超过限制后拒绝请求', async () => {
      const identifier = `test-user-limit-${Date.now()}`;
      const limiter = rateLimiters.query; // 10 req/min

      // 消耗所有配额
      for (let i = 0; i < 10; i++) {
        await checkRateLimit(limiter, identifier);
      }

      // 第11个请求应该被拒绝
      const result = await checkRateLimit(limiter, identifier);

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    }, 10000); // 增加超时时间，因为可能需要等待

    it('应该正确返回剩余配额', async () => {
      const identifier = `test-user-remaining-${Date.now()}`;
      const limiter = rateLimiters.general; // 30 req/min

      const firstResult = await checkRateLimit(limiter, identifier);
      expect(firstResult.success).toBe(true);

      const secondResult = await checkRateLimit(limiter, identifier);
      expect(secondResult.success).toBe(true);
      expect(secondResult.remaining).toBeLessThan(firstResult.remaining);
    });
  });

  describe('Rate Limiters Configuration', () => {
    it('查询限制器应配置为 10 req/min', () => {
      expect(rateLimiters.query.points).toBe(10);
    });

    it('元数据限制器应配置为 5 req/hour', () => {
      expect(rateLimiters.metadata.points).toBe(5);
    });

    it('一般限制器应配置为 30 req/min', () => {
      expect(rateLimiters.general.points).toBe(30);
    });

    it('AI 限制器应配置为 20 req/min', () => {
      expect(rateLimiters.ai.points).toBe(20);
    });
  });
});
