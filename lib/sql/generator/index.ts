/**
 * SQL 生成模块导出
 */

export { SQLGenerator } from './sql-generator';
export { CrossDatabaseHandler } from './cross-db-handler';
export { MultiStepSQLGenerator } from './multi-step-generator';
export type {
  SQLGenerationResult,
  SQLGenerationOptions,
  PromptBuilder,
  SQLFormatter,
  QueryStep,
  StepGenerationResult
} from './types';
export type {
  CrossDatabaseAnalysis,
  CrossDatabaseJoin,
  CrossDbStrategy
} from './cross-db-handler';
export {
  SQL_GENERATION_SYSTEM_PROMPT,
  CROSS_DATABASE_PROMPT_ADDITION,
  AGGREGATION_QUERY_PROMPT_ADDITION,
  TIME_RANGE_QUERY_PROMPT_ADDITION,
  COMPLEX_JOIN_PROMPT_ADDITION
} from './prompts/sql-prompts';
