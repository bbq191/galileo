/**
 * API 类型统一导出
 *
 * 此文件导出所有 API 相关的类型定义，
 * 供前端和后端共享使用，确保类型一致性
 */

// 导出所有类型
export type {
  // 标准响应格式
  ApiResponse,
  PaginatedApiResponse,
  PaginationParams,
  SortParams,

  // 数据源相关
  CreateDataSourceRequest,
  UpdateDataSourceRequest,
  GetTablesRequest,
  GetTablesResponse,

  // 关系图谱相关
  GetRelationshipGraphResponse,
  GraphNode,
  GraphEdge,
  GraphMetadata,
  VerifyRelationshipRequest,

  // 查询相关
  ExecuteQueryRequest,
  ExecuteQueryResponse,
  PreviewQueryRequest,
  PreviewQueryResponse,
  QueryHistoryResponse,
  QueryDetailResponse,

  // 审计相关
  AuditLogsResponse,
  AuditStatsResponse,
} from './types';
