/**
 * 元数据检索相关的类型定义
 */

/**
 * 元数据上下文
 * SQL 生成所需的完整上下文信息
 */
export interface MetadataContext {
  /** 涉及的表 */
  tables: TableContext[];
  /** 表之间的关系 */
  relationships: RelationshipContext[];
  /** 所有字段（扁平化） */
  columns: ColumnContext[];
  /** 估算的查询复杂度 */
  estimatedComplexity: 'low' | 'medium' | 'high';
  /** @deprecated 相关的表(使用 tables 代替) */
  relevantTables?: TableContext[];
}

/**
 * 表上下文
 */
export interface TableContext {
  /** 表ID */
  id: number;
  /** 数据库名 */
  databaseName: string;
  /** 表名 */
  tableName: string;
  /** 表注释 */
  tableComment?: string;
  /** 语义描述 */
  semanticDescription?: string;
  /** 字段列表 */
  columns: ColumnContext[];
  /** 主键列表 */
  primaryKeys: string[];
  /** 索引列表 */
  indexes: string[];
  /** 估算的行数 */
  rowCount?: number;
  /** 数据源信息 */
  database?: {
    id: number;
    databaseName: string;
    sourceId: number;
  };
}

/**
 * 字段上下文
 */
export interface ColumnContext {
  /** 字段ID */
  id: number;
  /** 字段名 */
  columnName: string;
  /** 数据类型 */
  dataType: string;
  /** 字段注释 */
  columnComment?: string;
  /** 语义描述 */
  semanticDescription?: string;
  /** 是否为主键 */
  isPrimaryKey: boolean;
  /** 是否可为空 */
  isNullable: boolean;
  /** 示例值（辅助理解） */
  sampleValues?: any[];
}

/**
 * 关系上下文
 */
export interface RelationshipContext {
  /** 源表 */
  sourceTable: string;
  /** 源字段 */
  sourceColumn: string;
  /** 目标表 */
  targetTable: string;
  /** 目标字段 */
  targetColumn: string;
  /** 关系类型 */
  type: 'explicit' | 'inferred';
  /** 置信度（仅推断关系） */
  confidence?: number;
  /** 关系ID */
  id?: number;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  /** 最大返回数量 */
  limit?: number;
  /** 置信度阈值 */
  threshold?: number;
  /** 是否包含示例数据 */
  includeSampleData?: boolean;
  /** 是否包含索引信息 */
  includeIndexes?: boolean;
  /** 业务域过滤（按业务域 ID 列表） */
  domainIds?: number[];
  /** 数据源过滤（只在指定数据源的表中检索） */
  dataSourceId?: number;
  /** 查询业务域推断结果 */
  domainInference?: {
    domainId: number;
    domainName: string;
    confidence: number;
  };
}

/**
 * 表搜索结果
 */
export interface TableSearchResult {
  /** 表元数据 */
  table: any;
  /** 相关性分数 */
  score: number;
  /** 匹配原因 */
  matchReason: string;
}

/**
 * 复杂度评估结果
 */
export interface ComplexityAssessment {
  /** 复杂度等级 */
  level: 'low' | 'medium' | 'high';
  /** 涉及的表数量 */
  tableCount: number;
  /** 总字段数 */
  totalColumns: number;
  /** 跨库JOIN数量 */
  crossDbJoins: number;
  /** 估算的扫描行数 */
  estimatedRowsScanned: number;
  /** 警告信息 */
  warnings: string[];
}
