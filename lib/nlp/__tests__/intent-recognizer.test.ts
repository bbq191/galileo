/**
 * 意图识别器单元测试
 */

import { IntentRecognizer } from '../intent-recognizer';
import { DeepseekClient } from '@/lib/ai/deepseek-client';

// Mock Deepseek Client
jest.mock('@/lib/ai/deepseek-client');

describe('IntentRecognizer', () => {
  let recognizer: IntentRecognizer;
  let mockAIClient: jest.Mocked<DeepseekClient>;

  beforeEach(() => {
    // 创建 Mock AI Client
    mockAIClient = {
      chat: jest.fn(),
    } as any;

    recognizer = new IntentRecognizer(mockAIClient);
  });

  afterEach(async () => {
    await recognizer.cleanup();
  });

  describe('简单查询', () => {
    it('应该正确识别简单的表查询', async () => {
      // Mock AI 响应
      mockAIClient.chat.mockResolvedValueOnce(JSON.stringify({
        type: 'select',
        confidence: 0.95,
        entities: {
          tables: ['users'],
        },
        conditions: {},
      }));

      const result = await recognizer.recognize('查询用户表的所有数据');

      expect(result.type).toBe('select');
      expect(result.entities.tables).toBeDefined();
    });
  });

  describe('聚合查询', () => {
    it('应该正确识别聚合查询意图', async () => {
      // Mock AI 响应
      mockAIClient.chat.mockResolvedValueOnce(JSON.stringify({
        type: 'aggregate',
        confidence: 0.9,
        entities: {
          tables: ['orders'],
          columns: ['amount'],
        },
        conditions: {
          timeRange: {
            relative: '最近一个月',
          },
          orderBy: {
            column: 'amount',
            direction: 'DESC',
          },
          limit: 10,
        },
        aggregations: {
          function: 'SUM',
          column: 'amount',
          groupBy: ['product_id'],
        },
      }));

      const result = await recognizer.recognize('查询最近一个月销售额TOP10的产品');

      expect(result.type).toBe('aggregate');
      expect(result.aggregations).toBeDefined();
      expect(result.aggregations?.function).toBe('SUM');
      expect(result.conditions.limit).toBe(10);
    });
  });

  describe('时间范围解析', () => {
    it('应该解析相对时间表达式', async () => {
      mockAIClient.chat.mockResolvedValueOnce(JSON.stringify({
        type: 'select',
        entities: {
          tables: ['orders'],
        },
        conditions: {
          timeRange: {
            relative: '最近7天',
          },
        },
      }));

      const result = await recognizer.recognize('查询最近7天的订单');

      expect(result.conditions.timeRange).toBeDefined();
      expect(result.conditions.timeRange?.start).toBeDefined();
      expect(result.conditions.timeRange?.end).toBeDefined();
    });
  });

  describe('跨表查询', () => {
    it('应该识别需要JOIN的查询', async () => {
      mockAIClient.chat.mockResolvedValueOnce(JSON.stringify({
        type: 'select',
        entities: {
          tables: ['orders', 'products'],
          columns: ['order_id', 'product_name'],
        },
        joins: {
          type: 'inner',
          tables: ['orders', 'products'],
        },
      }));

      const result = await recognizer.recognize('查询订单和产品信息');

      expect(result.entities.tables?.length).toBeGreaterThan(1);
      expect(result.joins).toBeDefined();
    });
  });

  describe('错误处理', () => {
    it('应该处理AI返回格式错误', async () => {
      mockAIClient.chat.mockResolvedValueOnce('这不是有效的JSON');

      await expect(recognizer.recognize('测试查询')).rejects.toThrow();
    });

    it('应该处理缺少必要字段的情况', async () => {
      mockAIClient.chat.mockResolvedValueOnce(JSON.stringify({
        type: 'select',
        // 缺少 entities
      }));

      await expect(recognizer.recognize('测试查询')).rejects.toThrow('无法识别查询涉及的表');
    });
  });

  describe('意图类型标准化', () => {
    it('应该正确标准化查询类型', async () => {
      const testCases = [
        { input: 'query', expected: 'select' },
        { input: 'sum', expected: 'aggregate' },
        { input: 'stats', expected: 'statistics' },
        { input: 'compare', expected: 'comparison' },
      ];

      for (const testCase of testCases) {
        mockAIClient.chat.mockResolvedValueOnce(JSON.stringify({
          type: testCase.input,
          entities: {
            tables: ['test_table'],
          },
        }));

        const result = await recognizer.recognize('测试查询');
        expect(result.type).toBe(testCase.expected);
      }
    });
  });
});
