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

export interface GraphNode {
  id: number;
  label: string;
  type: 'table';
  databaseId: number;
  databaseName: string;
  tableId: number;
}

export interface GraphEdge {
  id: string;
  source: number;
  target: number;
  type: 'explicit' | 'inferred';
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
  confidence?: number;
  sourceColumn: string;
  targetColumn: string;
  isVerified?: boolean;
}

export interface GraphMetadata {
  nodeCount: number;
  edgeCount: number;
  explicitEdgeCount: number;
  inferredEdgeCount: number;
  depth: number;
  centerTableId: number | null;
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
