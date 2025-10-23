/**
 * 全局常量定义
 */

/**
 * 默认分页限制
 */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * 数据库连接池配置
 */
export const CONNECTION_POOL = {
  MIN: 2,
  MAX: 10,
  IDLE_TIMEOUT: 30000, // 30 秒
  ACQUIRE_TIMEOUT: 60000, // 60 秒
} as const;

/**
 * 置信度阈值
 */
export const CONFIDENCE_THRESHOLD = {
  MIN: 0.7, // 最小可接受置信度
  HIGH: 0.85, // 高置信度
  VERY_HIGH: 0.95, // 非常高置信度
} as const;

/**
 * AI 处理配置
 */
export const AI_CONFIG = {
  BATCH_SIZE: 50, // 批量处理大小
  MAX_RETRIES: 3, // 最大重试次数
  TIMEOUT: 30000, // 超时时间（毫秒）
} as const;

/**
 * 缓存 TTL（秒）
 */
export const CACHE_TTL = {
  SHORT: 60, // 1 分钟
  MEDIUM: 300, // 5 分钟
  LONG: 1800, // 30 分钟
  VERY_LONG: 86400, // 24 小时
} as const;

/**
 * 同步配置
 */
export const SYNC_CONFIG = {
  DEFAULT_SCHEDULE: '0 * * * *', // 每小时执行一次
  MAX_DEPTH: 5, // 最大关系深度
  TIMEOUT: 600000, // 同步超时时间（10 分钟）
} as const;

/**
 * 语义优先级
 */
export const SEMANTIC_PRIORITY = {
  CRITICAL: 1, // 关键表
  HIGH: 2, // 高优先级
  NORMAL: 3, // 普通表
  LOW: 4, // 低优先级
} as const;

/**
 * 支持的数据库类型
 */
export const SUPPORTED_DATABASE_TYPES = ['mysql', 'mariadb', 'postgresql'] as const;

/**
 * 关系类型
 */
export const RELATIONSHIP_TYPES = ['one-to-one', 'one-to-many', 'many-to-many'] as const;

/**
 * HTTP 状态码
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * 错误代码
 */
export const ERROR_CODES = {
  // 数据源相关
  DATA_SOURCE_NOT_FOUND: 'DATA_SOURCE_NOT_FOUND',
  DATA_SOURCE_ALREADY_EXISTS: 'DATA_SOURCE_ALREADY_EXISTS',
  DATA_SOURCE_CONNECTION_FAILED: 'DATA_SOURCE_CONNECTION_FAILED',

  // 元数据相关
  DATABASE_NOT_FOUND: 'DATABASE_NOT_FOUND',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  COLUMN_NOT_FOUND: 'COLUMN_NOT_FOUND',

  // 同步相关
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  SYNC_FAILED: 'SYNC_FAILED',

  // 验证相关
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_PARAMETER: 'INVALID_PARAMETER',

  // 通用错误
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
} as const;

/**
 * 日志级别
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/**
 * 环境变量
 */
export const ENV = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;
