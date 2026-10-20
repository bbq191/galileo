/**
 * API 类型定义
 */

/**
 * 标准 API 响应格式
 */
export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message?: string;
  data?: T;
  error?: string | { message: string; details?: any };
}

/**
 * 分页 API 响应格式
 */
export interface PaginatedApiResponse<T = any> extends ApiResponse<T> {
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

/**
 * 分页请求参数
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * 排序参数
 */
export interface SortParams {
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * 数据源创建请求
 */
export interface CreateDataSourceRequest {
  name: string;
  type: 'mysql' | 'mariadb' | 'postgresql';
  host: string;
  port: number;
  username: string;
  password: string;
  databases?: string[];
}

/**
 * 数据源更新请求
 */
export interface UpdateDataSourceRequest {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  status?: 'active' | 'inactive' | 'error';
}

/**
 * 表查询请求
 */
export interface GetTablesRequest extends PaginationParams, SortParams {
  databaseId?: number;
  sourceId?: number;
  search?: string;
}

/**
 * 表查询响应
 */
export interface GetTablesResponse {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * 关系图谱响应
 */
export interface GetRelationshipGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: GraphMetadata;
}

/**
 * 关系图谱节点
 */
export interface GraphNode {
  /** 表 ID */
  tableId: number;
  /** 表名 */
  tableName: string;
  /** 数据库名 */
  databaseName: string;
  /** 出度（指向其他表的关系数） */
  outDegree: number;
  /** 入度（被其他表指向的关系数） */
  inDegree: number;
}

/**
 * 关系图谱边
 */
export interface GraphEdge {
  /** 源表 ID */
  sourceTableId: number;
  /** 目标表 ID */
  targetTableId: number;
  /** 源字段 */
  sourceColumn: string;
  /** 目标字段 */
  targetColumn: string;
  /** 置信度 */
  confidence: number;
  /** 关系类型 */
  type: 'explicit' | 'inferred' | 'verified';
  /** 关系模式 */
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

/**
 * 关系图谱元数据
 */
export interface GraphMetadata {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  maxInDegree: number;
  maxOutDegree: number;
}

/**
 * 关系验证请求
 */
export interface VerifyRelationshipRequest {
  relationshipId: number;
  verified: boolean;
  verifiedBy?: string;
  action?: 'verify' | 'reject' | 'convert';
}

// ==================== 查询相关类型 ====================

/**
 * 查询执行请求
 */
export interface ExecuteQueryRequest {
  query: string;  // 自然语言查询
  options?: {
    enableCache?: boolean;
    maxRows?: number;
    timeout?: number;
  };
}

/**
 * 查询执行响应
 */
export interface ExecuteQueryResponse {
  success: boolean;
  data?: any[];
  metadata?: {
    generatedSQL: string;
    explanation: string;
    rowCount: number;
    executionTime: number;
    fromCache: boolean;
    columns: Array<{
      name: string;
      type: string;
    }>;
  };
  warnings?: string[];
  optimizationSuggestions?: Array<{
    type: string;
    message: string;
    impact: string;
  }>;
  error?: string;
  /** validation_failed：SQL 未通过校验（HTTP 422） */
  errorCode?: 'validation_failed';
  errors?: Array<{
    type: string;
    message: string;
  }>;
}

/**
 * SQL 预览请求
 */
export interface PreviewQueryRequest {
  query: string;  // 自然语言查询
}

/**
 * SQL 预览响应
 */
export interface PreviewQueryResponse {
  success: boolean;
  sql?: string;
  explanation?: string;
  confidence?: number;
  intent?: {
    type: string;
    entities: any;
  };
  validation?: {
    isValid: boolean;
    errors?: Array<{
      type: string;
      message: string;
    }>;
    warnings?: Array<{
      type: string;
      message: string;
    }>;
    optimizationSuggestions?: Array<{
      type: string;
      message: string;
      impact: string;
    }>;
    estimatedCost?: {
      complexity: string;
      rowsScanned?: number;
      executionTimeMs?: number;
    };
  };
  usedTables?: string[];
  usedColumns?: string[];
  /** 与 ExecuteQueryResponse 保持一致的顶层字段 */
  warnings?: string[];
  optimizationSuggestions?: Array<{
    type: string;
    message: string;
    impact: string;
  }>;
  error?: string;
  /** validation_failed：SQL 未通过校验（HTTP 422） */
  errorCode?: 'validation_failed';
}

/**
 * 查询历史响应
 */
export interface QueryHistoryResponse {
  success: boolean;
  data?: Array<{
    id: number;
    naturalLanguageQuery: string;
    generatedSQL: string;
    executionSuccess: boolean;
    rowCount?: number;
    executionTime: number;
    timestamp: string;
  }>;
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  error?: string;
}

/**
 * 查询详情响应
 */
export interface QueryDetailResponse {
  success: boolean;
  data?: {
    id: number;
    userId?: string;
    userName?: string;
    sessionId: string;
    naturalLanguageQuery: string;
    intent: any;
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
    timestamp: string;
    ipAddress?: string;
    userAgent?: string;
  };
  error?: string;
}

// ==================== 审计相关类型 ====================

/**
 * 审计日志响应
 */
export interface AuditLogsResponse {
  success: boolean;
  data?: Array<{
    id: number;
    userId?: string;
    userName?: string;
    sessionId: string;
    naturalLanguageQuery: string;
    generatedSQL: string;
    executionSuccess: boolean;
    executionError?: string;
    rowCount?: number;
    usedDatabases: string[];
    usedTables: string[];
    performance: {
      intentRecognitionTime: number;
      sqlGenerationTime: number;
      validationTime: number;
      executionTime: number;
      totalTime: number;
    };
    timestamp: string;
    ipAddress?: string;
  }>;
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  error?: string;
}

/**
 * 审计统计响应
 */
export interface AuditStatsResponse {
  success: boolean;
  data?: {
    overview: {
      totalQueries: number;
      successQueries: number;
      failedQueries: number;
      successRate: number;
      avgExecutionTime: number;
    };
    anomalies?: Array<{
      type: string;
      severity: string;
      description: string;
      count: number;
      details?: any;
    }>;
  };
  error?: string;
}
