/**
 * 元数据存储模块类型定义
 */

// Use a more compatible JSON type definition
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * 数据库元数据创建输入
 */
export interface CreateDatabaseMetaInput {
  sourceId: number;
  databaseName: string;
  domainId?: number | null;
  semanticDescription?: string | null;
}

/**
 * 数据库元数据更新输入
 */
export interface UpdateDatabaseMetaInput {
  domainId?: number | null;
  semanticDescription?: string | null;
  lastSyncedAt?: Date | null;
}

/**
 * 表元数据创建输入
 */
export interface CreateTableMetaInput {
  databaseId: number;
  tableName: string;
  tableComment?: string | null;
  semanticDescription?: string | null;
  semanticPriority?: number;
  rowCount?: bigint;
  structureHash?: string | null;
  createdTime?: Date | null;
  updatedTime?: Date | null;
}

/**
 * 表元数据更新输入
 */
export interface UpdateTableMetaInput {
  tableComment?: string | null;
  semanticDescription?: string | null;
  semanticPriority?: number;
  rowCount?: bigint;
  structureHash?: string | null;
  createdTime?: Date | null;
  updatedTime?: Date | null;
  lastSyncedAt?: Date | null;
}

/**
 * 字段元数据创建输入
 */
export interface CreateColumnMetaInput {
  tableId: number;
  columnName: string;
  dataType: string;
  columnType: string;
  columnComment?: string | null;
  semanticDescription?: string | null;
  semanticSource?: 'rule' | 'ai' | 'manual';
  isNullable?: boolean;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  defaultValue?: string | null;
  ordinalPosition: number;
}

/**
 * 字段元数据更新输入
 */
export interface UpdateColumnMetaInput {
  dataType?: string;
  columnType?: string;
  columnComment?: string | null;
  semanticDescription?: string | null;
  semanticSource?: 'rule' | 'ai' | 'manual';
  isNullable?: boolean;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  defaultValue?: string | null;
  ordinalPosition?: number;
}

/**
 * 显式关系创建输入
 */
export interface CreateExplicitRelationshipInput {
  sourceTableId: number;
  sourceColumnId: number;
  targetTableId: number;
  targetColumnId: number;
  constraintName?: string | null;
  relationshipType?: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';
}

/**
 * 推断关系创建输入
 */
export interface CreateInferredRelationshipInput {
  sourceTableId: number;
  sourceColumnId: number;
  targetTableId: number;
  targetColumnId: number;
  confidenceScore: number;
  relationshipType?: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';
  inferenceMethod?: 'rule' | 'ai' | 'hybrid';
  reasoning?: string | null;
  isVerified?: boolean;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
}

/**
 * 推断关系验证输入
 */
export interface VerifyInferredRelationshipInput {
  isVerified: boolean;
  verifiedBy: string;
  verifiedAt?: Date;
}

/**
 * 元数据变更记录输入
 */
export interface CreateMetadataChangeInput {
  changeType:
    | 'database_added'
    | 'database_removed'
    | 'table_added'
    | 'table_removed'
    | 'table_modified'
    | 'column_added'
    | 'column_removed'
    | 'column_modified';
  entityType: 'database' | 'table' | 'column';
  entityId: number;
  oldValue?: JsonValue | null;
  newValue?: JsonValue | null;
}

/**
 * 批量保存结果
 */
export interface BatchSaveResult {
  /** 成功数量 */
  successCount: number;

  /** 失败数量 */
  failureCount: number;

  /** 跳过数量 */
  skippedCount: number;

  /** 错误列表 */
  errors: Array<{
    entity: string;
    error: string;
  }>;

  /** 耗时（毫秒） */
  duration: number;
}

/**
 * 同步统计
 */
export interface SyncStats {
  /** 数据库数量 */
  databaseCount: number;

  /** 新增表数量 */
  tablesAdded: number;

  /** 更新表数量 */
  tablesUpdated: number;

  /** 删除表数量 */
  tablesRemoved: number;

  /** 新增字段数量 */
  columnsAdded: number;

  /** 更新字段数量 */
  columnsUpdated: number;

  /** 删除字段数量 */
  columnsRemoved: number;

  /** 新增关系数量 */
  relationshipsAdded: number;

  /** 耗时（毫秒） */
  duration: number;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 页码（从 1 开始） */
  page?: number;

  /** 每页数量 */
  limit?: number;

  /** 排序字段 */
  orderBy?: string;

  /** 排序方向 */
  orderDirection?: 'asc' | 'desc';

  /** 搜索关键词 */
  search?: string;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  /** 数据列表 */
  data: T[];

  /** 总数 */
  total: number;

  /** 当前页 */
  page: number;

  /** 每页数量 */
  limit: number;

  /** 总页数 */
  totalPages: number;

  /** 是否有下一页 */
  hasNext: boolean;

  /** 是否有上一页 */
  hasPrev: boolean;
}
