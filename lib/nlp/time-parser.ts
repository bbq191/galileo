/**
 * 时间表达式解析器
 * 将自然语言时间表达式转换为具体的时间范围
 */

import 'reflect-metadata';
import { injectable } from 'tsyringe';
import { ParsedTimeRange } from './types';

/**
 * 时间表达式模式映射
 */
const TIME_PATTERNS = {
  // 相对时间模式
  last_n_days: /最近|近|过去\s*(\d+)\s*天/,
  last_n_weeks: /最近|近|过去\s*(\d+)\s*周/,
  last_n_months: /最近|近|过去\s*(\d+)\s*个?月/,
  last_n_years: /最近|近|过去\s*(\d+)\s*年/,

  // 具体时间单位
  today: /今天|今日/,
  yesterday: /昨天|昨日/,
  this_week: /本周|这周/,
  last_week: /上周|上星期/,
  this_month: /本月|这个月/,
  last_month: /上月|上个月/,
  this_year: /今年|本年/,
  last_year: /去年|上年/,

  // 具体日期范围
  date_range: /(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s*[至到~]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
};

/**
 * 时间解析器
 */
@injectable()
export class TimeParser {
  /**
   * 解析时间表达式
   */
  parse(timeExpression: string): ParsedTimeRange {
    if (!timeExpression) {
      return {};
    }

    // 尝试匹配各种时间模式
    for (const [pattern, regex] of Object.entries(TIME_PATTERNS)) {
      const match = timeExpression.match(regex);
      if (match) {
        return this.parsePattern(pattern, match);
      }
    }

    // 如果无法解析，返回原始相对时间
    return {
      relative: timeExpression,
    };
  }

  /**
   * 根据模式解析时间
   */
  private parsePattern(pattern: string, match: RegExpMatchArray): ParsedTimeRange {
    const now = new Date();

    switch (pattern) {
      case 'last_n_days': {
        const days = parseInt(match[1]);
        return {
          start: this.subtractDays(now, days),
          end: now,
          relative: `最近${days}天`,
          normalized: `last_${days}_days`,
        };
      }

      case 'last_n_weeks': {
        const weeks = parseInt(match[1]);
        return {
          start: this.subtractDays(now, weeks * 7),
          end: now,
          relative: `最近${weeks}周`,
          normalized: `last_${weeks}_weeks`,
        };
      }

      case 'last_n_months': {
        const months = parseInt(match[1]);
        return {
          start: this.subtractMonths(now, months),
          end: now,
          relative: `最近${months}个月`,
          normalized: `last_${months}_months`,
        };
      }

      case 'last_n_years': {
        const years = parseInt(match[1]);
        return {
          start: this.subtractYears(now, years),
          end: now,
          relative: `最近${years}年`,
          normalized: `last_${years}_years`,
        };
      }

      case 'today': {
        return {
          start: this.getStartOfDay(now),
          end: now,
          relative: '今天',
          normalized: 'today',
        };
      }

      case 'yesterday': {
        const yesterday = this.subtractDays(now, 1);
        return {
          start: this.getStartOfDay(yesterday),
          end: this.getEndOfDay(yesterday),
          relative: '昨天',
          normalized: 'yesterday',
        };
      }

      case 'this_week': {
        return {
          start: this.getStartOfWeek(now),
          end: now,
          relative: '本周',
          normalized: 'this_week',
        };
      }

      case 'last_week': {
        const lastWeekDate = this.subtractDays(now, 7);
        return {
          start: this.getStartOfWeek(lastWeekDate),
          end: this.getEndOfWeek(lastWeekDate),
          relative: '上周',
          normalized: 'last_week',
        };
      }

      case 'this_month': {
        return {
          start: this.getStartOfMonth(now),
          end: now,
          relative: '本月',
          normalized: 'this_month',
        };
      }

      case 'last_month': {
        const lastMonthDate = this.subtractMonths(now, 1);
        return {
          start: this.getStartOfMonth(lastMonthDate),
          end: this.getEndOfMonth(lastMonthDate),
          relative: '上月',
          normalized: 'last_month',
        };
      }

      case 'this_year': {
        return {
          start: this.getStartOfYear(now),
          end: now,
          relative: '今年',
          normalized: 'this_year',
        };
      }

      case 'last_year': {
        const lastYearDate = this.subtractYears(now, 1);
        return {
          start: this.getStartOfYear(lastYearDate),
          end: this.getEndOfYear(lastYearDate),
          relative: '去年',
          normalized: 'last_year',
        };
      }

      case 'date_range': {
        return {
          start: this.parseDate(match[1]),
          end: this.parseDate(match[2]),
          relative: `${match[1]} 至 ${match[2]}`,
          normalized: 'custom_range',
        };
      }

      default:
        return {};
    }
  }

  // 日期计算辅助方法
  private subtractDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  }

  private subtractMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() - months);
    return result;
  }

  private subtractYears(date: Date, years: number): Date {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() - years);
    return result;
  }

  private getStartOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private getEndOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private getStartOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1); // 周一为一周开始
    result.setDate(diff);
    return this.getStartOfDay(result);
  }

  private getEndOfWeek(date: Date): Date {
    const result = this.getStartOfWeek(date);
    result.setDate(result.getDate() + 6);
    return this.getEndOfDay(result);
  }

  private getStartOfMonth(date: Date): Date {
    const result = new Date(date);
    result.setDate(1);
    return this.getStartOfDay(result);
  }

  private getEndOfMonth(date: Date): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 1, 0);
    return this.getEndOfDay(result);
  }

  private getStartOfYear(date: Date): Date {
    const result = new Date(date);
    result.setMonth(0, 1);
    return this.getStartOfDay(result);
  }

  private getEndOfYear(date: Date): Date {
    const result = new Date(date);
    result.setMonth(11, 31);
    return this.getEndOfDay(result);
  }

  private parseDate(dateStr: string): Date {
    // 标准化日期分隔符
    const normalized = dateStr.replace(/[/]/g, '-');
    return new Date(normalized);
  }
}
