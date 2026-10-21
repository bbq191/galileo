/**
 * 全局通用类型定义
 */

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * 排序参数
 */
export interface SortParams {
  orderBy: string;
  orderDirection: 'asc' | 'desc';
}

/**
 * 数据库类型
 */
export type { DatabaseType } from '@/lib/database/connection-config';

/**
 * 数据源状态
 */
export type DataSourceStatus = 'active' | 'inactive' | 'error';

/**
 * 关系类型
 */
export type RelationshipType = 'one-to-one' | 'one-to-many' | 'many-to-many';

/**
 * 语义来源
 */
export type SemanticSource = 'rule' | 'ai' | 'manual';

/**
 * 推断方法
 */
export type InferenceMethod = 'rule' | 'ai' | 'hybrid';

/**
 * 语义优先级
 */
export type SemanticPriority = 1 | 2 | 3 | 4;

/**
 * 错误级别
 */
export type ErrorLevel = 'info' | 'warning' | 'error' | 'critical';

/**
 * 同步状态
 */
export type SyncStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 异步操作结果
 */
export interface AsyncResult<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

/**
 * 时间范围
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * 键值对
 */
export type KeyValuePair<K extends string | number | symbol = string, V = any> = {
  [key in K]: V;
};

/**
 * 可选字段
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * 必需字段
 */
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/**
 * 深度只读
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * ID 类型
 */
export type ID = number | string;

/**
 * 时间戳类型
 */
export type Timestamp = Date | string;
