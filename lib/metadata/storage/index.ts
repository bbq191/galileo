/**
 * 元数据存储模块
 * 导出所有公共接口和类
 */

// 类型定义
export type {
  CreateDatabaseMetaInput,
  UpdateDatabaseMetaInput,
  CreateTableMetaInput,
  UpdateTableMetaInput,
  CreateColumnMetaInput,
  UpdateColumnMetaInput,
  CreateExplicitRelationshipInput,
  CreateInferredRelationshipInput,
  VerifyInferredRelationshipInput,
  CreateMetadataChangeInput,
  BatchSaveResult,
  SyncStats,
  QueryOptions,
  PaginatedResult,
} from './types';

// 核心类
export { MetadataRepository, metadataRepository } from './metadata-repository';
export { ChangeTracker, changeTracker } from './change-tracker';
export type { ChangeType, ChangeDetail } from './change-tracker';
