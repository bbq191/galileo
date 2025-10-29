/**
 * 审计日志模块 - 类型定义
 * Phase 2 - Week 9: 验证、优化与执行
 */

export interface QueryIntent {
  type: 'select' | 'aggregate' | 'statistics' | 'comparison';
  entities: {
    databases?: string[];
    tables?: string[];
    columns?: string[];
  };
  conditions?: {
    timeRange?: {
      start?: Date;
      end?: Date;
      relative?: string;
    };
    filters?: Array<{
      column: string;
      operator: string;
      value: any;
    }>;
    orderBy?: {
      column: string;
      direction: 'ASC' | 'DESC';
    };
    limit?: number;
  };
  aggregations?: {
    function: 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN';
    column: string;
    groupBy?: string[];
  };
  joins?: {
    type: 'inner' | 'left' | 'right';
    tables: string[];
  };
}

export interface AuditLog {
  id?: number;
  userId?: string;
  userName?: string;
  sessionId: string;
  naturalLanguageQuery: string;
  intent: QueryIntent;
  generatedSQL: string;
  executionResult: {
    success: boolean;
    rowCount?: number;
    error?: string;
  };
  metadata: {
    usedDatabases: string[];
    usedTables: string[];
    usedColumns: string[];
  };
  performance: {
    intentRecognitionTime: number;
    sqlGenerationTime: number;
    validationTime: number;
    executionTime: number;
    totalTime: number;
  };
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilters {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
  page?: number;
  limit?: number;
}

export interface AuditStats {
  totalQueries: number;
  successQueries: number;
  failedQueries: number;
  successRate: number;
  avgExecutionTime: number;
}

/**
 * 分页审计日志结果
 */
export interface PaginatedAuditLogs {
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * 时间范围统计
 */
export interface TimeRangeStats {
  date: string;
  totalQueries: number;
  successQueries: number;
  failedQueries: number;
  avgExecutionTime: number;
}

/**
 * 用户查询统计
 */
export interface UserQueryStats {
  userId: string;
  userName?: string;
  totalQueries: number;
  successQueries: number;
  failedQueries: number;
  avgExecutionTime: number;
  lastQueryTime: Date;
}

/**
 * 热门查询
 */
export interface PopularQuery {
  naturalLanguageQuery: string;
  count: number;
  avgExecutionTime: number;
  successRate: number;
  lastUsed: Date;
}

/**
 * 数据库使用统计
 */
export interface DatabaseUsageStats {
  databaseName: string;
  queryCount: number;
  avgExecutionTime: number;
  successRate: number;
}

/**
 * 表使用统计
 */
export interface TableUsageStats {
  tableName: string;
  databaseName: string;
  queryCount: number;
  avgExecutionTime: number;
  successRate: number;
}

/**
 * 查询模式分析
 */
export interface QueryPattern {
  pattern: string;
  description: string;
  count: number;
  avgExecutionTime: number;
  successRate: number;
  examples: string[];
}

/**
 * 性能趋势分析
 */
export interface PerformanceTrend {
  date: string;
  avgExecutionTime: number;
  queryCount: number;
  successRate: number;
  slowQueryCount: number;
}
