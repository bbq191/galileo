/**
 * SQL 执行器类型定义
 */

import type { FieldPacket } from 'mysql2/promise';

/**
 * 执行选项
 */
export interface ExecutionOptions {
  /** 超时时间（毫秒），默认 30000ms */
  timeout?: number;
  /** 最大返回行数，默认 10000 */
  maxRows?: number;
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存键（可选，默认自动生成） */
  cacheKey?: string;
  /** 查询参数（用于参数化查询） */
  parameters?: any[];
}

/**
 * 列元数据
 */
export interface ColumnMetadata {
  /** 列名 */
  name: string;
  /** 数据类型 */
  type: string;
  /** 原始类型 ID */
  typeId?: number;
  /** 字段长度 */
  length?: number;
  /** 表名 */
  table?: string;
  /** 数据库名 */
  database?: string;
  /** 是否可为空 */
  nullable?: boolean;
  /** 字符集 */
  charset?: string;
}

/**
 * 执行结果
 */
export interface ExecutionResult<T = any> {
  /** 执行是否成功 */
  success: boolean;
  /** 查询结果数据 */
  data?: T[];
  /** 错误信息 */
  error?: string;
  /** 执行耗时（毫秒） */
  executionTime: number;
  /** 返回行数 */
  rowCount: number;
  /** 是否来自缓存 */
  fromCache: boolean;
  /** 列元数据 */
  metadata: {
    columns: ColumnMetadata[];
  };
}

/**
 * 分页执行结果
 */
export interface PaginatedResult<T = any> extends ExecutionResult<T> {
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页大小 */
    pageSize: number;
    /** 总行数 */
    totalRows: number;
    /** 总页数 */
    totalPages: number;
  };
}

/**
 * 分页选项
 */
export interface PaginationOptions {
  /** 页码（从 1 开始） */
  page?: number;
  /** 每页大小 */
  pageSize?: number;
}

/**
 * 查询统计信息
 */
export interface QueryStatistics {
  /** 查询 ID */
  queryId: string;
  /** 开始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime?: Date;
  /** 总耗时（毫秒） */
  duration?: number;
  /** 返回行数 */
  rowCount?: number;
  /** 是否成功 */
  success: boolean;
  /** 是否超时 */
  timedOut: boolean;
  /** 是否来自缓存 */
  fromCache: boolean;
}

/**
 * SQL 执行器错误类型
 */
export enum ExecutorErrorType {
  /** 连接错误 */
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  /** 超时错误 */
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  /** 语法错误 */
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  /** 权限错误 */
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  /** 表或字段不存在 */
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  /** 未知错误 */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * SQL 执行器错误
 */
export class ExecutorError extends Error {
  constructor(
    public readonly type: ExecutorErrorType,
    message: string,
    public readonly originalError?: any
  ) {
    super(message);
    this.name = 'ExecutorError';
  }
}

/**
 * MySQL Field Packet 类型扩展
 */
export interface ExtendedFieldPacket extends FieldPacket {
  name: string;
  type: number;
  length: number;
  table?: string;
  db?: string;
  flags?: number;
  decimals?: number;
  characterSet?: number;
}
