/**
 * API 性能监控中间件
 * 用于收集和记录 API 请求的性能指标
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
  // 查询性能
  query_p50: number; // 中位数响应时间
  query_p95: number; // 95分位响应时间
  query_p99: number; // 99分位响应时间
  query_avg: number; // 平均响应时间
  query_count: number; // 总请求数

  // 慢查询
  slow_queries: SlowQuery[];
}

/**
 * 慢查询记录
 */
export interface SlowQuery {
  url: string;
  method: string;
  duration: number;
  timestamp: Date;
  params?: Record<string, any>;
}

/**
 * 性能监控器类
 */
export class PerformanceMonitor {
  private responseTimes: number[] = [];
  private slowQueries: SlowQuery[] = [];
  private readonly SLOW_QUERY_THRESHOLD = parseInt(
    process.env.SLOW_QUERY_THRESHOLD || '1000',
    10
  ); // 慢查询阈值（毫秒）
  private readonly MAX_RESPONSE_TIMES = 10000; // 最多保留的响应时间记录
  private readonly MAX_SLOW_QUERIES = 100; // 最多保留的慢查询记录

  /**
   * 记录请求性能
   */
  record(url: string, method: string, duration: number, params?: Record<string, any>): void {
    // 记录响应时间
    this.responseTimes.push(duration);

    // 如果超过最大记录数，移除最旧的记录
    if (this.responseTimes.length > this.MAX_RESPONSE_TIMES) {
      this.responseTimes.shift();
    }

    // 记录慢查询
    if (duration > this.SLOW_QUERY_THRESHOLD) {
      this.slowQueries.push({
        url,
        method,
        duration,
        timestamp: new Date(),
        params,
      });

      // 如果超过最大记录数，移除最旧的记录
      if (this.slowQueries.length > this.MAX_SLOW_QUERIES) {
        this.slowQueries.shift();
      }

      console.warn(`[Performance] 慢查询检测: ${method} ${url} - ${duration}ms`);
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(): PerformanceMetrics {
    if (this.responseTimes.length === 0) {
      return {
        query_p50: 0,
        query_p95: 0,
        query_p99: 0,
        query_avg: 0,
        query_count: 0,
        slow_queries: [],
      };
    }

    // 排序响应时间
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const count = sorted.length;

    // 计算百分位数
    const p50Index = Math.floor(count * 0.5);
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);

    // 计算平均值
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = sum / count;

    return {
      query_p50: sorted[p50Index] || 0,
      query_p95: sorted[p95Index] || 0,
      query_p99: sorted[p99Index] || 0,
      query_avg: Math.round(avg),
      query_count: count,
      slow_queries: this.slowQueries.slice(-20), // 返回最近20条慢查询
    };
  }

  /**
   * 重置性能指标
   */
  reset(): void {
    this.responseTimes = [];
    this.slowQueries = [];
  }

  /**
   * 获取慢查询列表
   */
  getSlowQueries(limit: number = 20): SlowQuery[] {
    return this.slowQueries.slice(-limit);
  }
}

// 全局性能监控器实例
export const performanceMonitor = new PerformanceMonitor();

/**
 * 性能监控装饰器
 * 用于包装 API 处理函数
 */
export function withPerformanceMonitor(
  handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>
) {
  return async function (request: NextRequest, ...args: any[]): Promise<NextResponse> {
    const startTime = Date.now();
    const url = request.url;
    const method = request.method;

    try {
      // 执行原始处理函数
      const response = await handler(request, ...args);

      // 记录性能
      const duration = Date.now() - startTime;

      // 提取查询参数
      const { searchParams } = new URL(url);
      const params: Record<string, any> = {};
      searchParams.forEach((value, key) => {
        params[key] = value;
      });

      performanceMonitor.record(url, method, duration, params);

      // 添加性能头
      response.headers.set('X-Response-Time', `${duration}ms`);

      return response;
    } catch (error) {
      // 即使出错也记录性能
      const duration = Date.now() - startTime;
      performanceMonitor.record(url, method, duration);

      throw error;
    }
  };
}

/**
 * 简化的性能计时器
 */
export class Timer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * 获取经过的时间（毫秒）
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 重置计时器
   */
  reset(): void {
    this.startTime = Date.now();
  }

  /**
   * 记录并打印耗时
   */
  log(label: string): void {
    const duration = this.elapsed();
    console.log(`[Timer] ${label}: ${duration}ms`);
  }
}
