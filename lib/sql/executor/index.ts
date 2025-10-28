/**
 * SQL 执行器模块导出
 */

// 导出主要类
export { QueryExecutor, queryExecutor } from './query-executor';
export { ResultFormatter, resultFormatter } from './result-formatter';

// 导出超时处理工具
export {
  createTimeoutPromise,
  withTimeout,
  TimeoutController,
  BatchTimeoutManager,
  AdaptiveTimeoutStrategy,
} from './timeout-handler';

// 导出类型
export type {
  ExecutionOptions,
  ExecutionResult,
  PaginatedResult,
  PaginationOptions,
  ColumnMetadata,
  QueryStatistics,
  ExtendedFieldPacket,
} from './types';

export { ExecutorError, ExecutorErrorType } from './types';
