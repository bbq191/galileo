/**
 * 前端共享的接口响应类型
 *
 * 与 __tests__/api 下的契约测试保持一致，修改时两边同步。
 */

/**
 * GET /api/statistics/overview 的 data 字段
 */
export interface StatisticsOverview {
  system: {
    healthScore: number;
    performanceScore: number;
    reliabilityScore: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  queries: {
    total: number;
    success: number;
    failed: number;
    /** 百分比，0-100 */
    successRate: number;
    /** 毫秒 */
    avgExecutionTime: number;
    /** 毫秒 */
    p95ExecutionTime: number;
  };
  cache: {
    /** 比例，0-1 */
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  };
  audit: {
    totalRecords: number;
    avgRecordsPerDay: number;
    recentErrors: number;
  };
}

export type HealthCheckStatus = 'ok' | 'degraded' | 'error';

/**
 * GET /api/health 的完整响应体（无信封，降级时 HTTP 503）
 */
export interface HealthResponse {
  status: HealthCheckStatus;
  timestamp: string;
  checks: Record<string, { status: HealthCheckStatus; message?: string; [key: string]: unknown }> & {
    redis?: { status: HealthCheckStatus; connected?: boolean };
  };
  message?: string;
  error?: string;
}

/** 请求 /api/health 时使用的 apiFetch 选项 */
export const HEALTH_FETCH_OPTIONS = { envelope: 'none', acceptStatuses: [503] } as const;
