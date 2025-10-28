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
