/**
 * 时间解析器单元测试
 */

import { TimeParser } from '../time-parser';

describe('TimeParser', () => {
  let parser: TimeParser;

  beforeEach(() => {
    parser = new TimeParser();
  });

  describe('相对时间解析', () => {
    it('应该正确解析"最近7天"', () => {
      const result = parser.parse('最近7天');

      expect(result.normalized).toBe('last_7_days');
      expect(result.relative).toBe('最近7天');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();

      // 验证时间范围约为7天
      const diff = result.end!.getTime() - result.start!.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBeCloseTo(7, 0);
    });

    it('应该正确解析"最近30天"', () => {
      const result = parser.parse('最近30天');

      expect(result.normalized).toBe('last_30_days');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();
    });

    it('应该正确解析"最近1个月"', () => {
      const result = parser.parse('最近1个月');

      expect(result.normalized).toBe('last_1_months');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();
    });

    it('应该正确解析"过去3周"', () => {
      const result = parser.parse('过去3周');

      expect(result.normalized).toBe('last_3_weeks');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();
    });
  });

  describe('具体时间单位', () => {
    it('应该正确解析"今天"', () => {
      const result = parser.parse('今天');

      expect(result.normalized).toBe('today');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();

      // 验证开始时间是当天00:00:00
      expect(result.start!.getHours()).toBe(0);
      expect(result.start!.getMinutes()).toBe(0);
      expect(result.start!.getSeconds()).toBe(0);
    });

    it('应该正确解析"昨天"', () => {
      const result = parser.parse('昨天');

      expect(result.normalized).toBe('yesterday');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();
    });

    it('应该正确解析"本周"', () => {
      const result = parser.parse('本周');

      expect(result.normalized).toBe('this_week');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();

      // 验证开始时间是周一
      expect(result.start!.getDay()).toBe(1);
    });

    it('应该正确解析"本月"', () => {
      const result = parser.parse('本月');

      expect(result.normalized).toBe('this_month');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();

      // 验证开始时间是1号
      expect(result.start!.getDate()).toBe(1);
    });

    it('应该正确解析"今年"', () => {
      const result = parser.parse('今年');

      expect(result.normalized).toBe('this_year');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();

      // 验证开始时间是1月1日
      expect(result.start!.getMonth()).toBe(0);
      expect(result.start!.getDate()).toBe(1);
    });
  });

  describe('日期范围', () => {
    it('应该正确解析日期范围（使用"-"分隔）', () => {
      const result = parser.parse('2025-01-01至2025-01-31');

      expect(result.normalized).toBe('custom_range');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();
      expect(result.start!.getFullYear()).toBe(2025);
      expect(result.start!.getMonth()).toBe(0);
      expect(result.start!.getDate()).toBe(1);
      expect(result.end!.getMonth()).toBe(0);
      expect(result.end!.getDate()).toBe(31);
    });

    it('应该正确解析日期范围（使用"/"分隔）', () => {
      const result = parser.parse('2025/1/1到2025/1/31');

      expect(result.normalized).toBe('custom_range');
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();
    });
  });

  describe('无法解析的表达式', () => {
    it('应该返回原始相对时间', () => {
      const result = parser.parse('未知的时间表达式');

      expect(result.relative).toBe('未知的时间表达式');
      expect(result.start).toBeUndefined();
      expect(result.end).toBeUndefined();
      expect(result.normalized).toBeUndefined();
    });

    it('应该处理空字符串', () => {
      const result = parser.parse('');

      expect(result).toEqual({});
    });
  });
});
