/**
 * 元数据采集器类型定义
 */

/**
 * 数据库信息
 */
export interface DatabaseInfo {
  /** 数据库名称 */
  name: string;

  /** 字符集 */
  charset?: string;

  /** 排序规则 */
  collation?: string;

  /** 表数量 */
  tableCount?: number;

  /** 创建时间 */
  createdAt?: Date;
}

/**
 * 表信息
 */
export interface TableInfo {
  /** 表名 */
  tableName: string;

  /** 数据库名 */
  databaseName: string;

  /** 表注释 */
  tableComment?: string;

  /** 表类型（BASE TABLE / VIEW） */
  tableType: 'BASE TABLE' | 'VIEW';

  /** 存储引擎 */
  engine?: string;

  /** 行数（估算值） */
  rowCount?: number;

  /** 数据长度（字节） */
  dataLength?: number;

  /** 索引长度（字节） */
  indexLength?: number;

  /** 自动增量值 */
  autoIncrement?: number;

  /** 创建时间 */
  createTime?: Date;

  /** 更新时间 */
  updateTime?: Date;

  /** 表字符集 */
  tableCollation?: string;
}

/**
 * 字段信息
 */
export interface ColumnInfo {
  /** 字段名 */
  columnName: string;

  /** 表名 */
  tableName: string;

  /** 数据库名 */
  databaseName: string;

  /** 数据类型（如 int, varchar） */
  dataType: string;

  /** 完整列类型（如 varchar(255)） */
  columnType: string;

  /** 字段注释 */
  columnComment?: string;

  /** 是否可为空 */
  isNullable: boolean;

  /** 字段键类型（PRI, UNI, MUL） */
  columnKey?: 'PRI' | 'UNI' | 'MUL' | '';

  /** 默认值 */
  defaultValue?: string | null;

  /** 额外信息（如 auto_increment） */
  extra?: string;

  /** 字段位置（第几个字段） */
  ordinalPosition: number;

  /** 字符集 */
  characterSet?: string;

  /** 排序规则 */
  collation?: string;

  /** 字符最大长度 */
  characterMaximumLength?: number;

  /** 数值精度 */
  numericPrecision?: number;

  /** 数值小数位数 */
  numericScale?: number;
}

/**
 * 索引信息
 */
export interface IndexInfo {
  /** 索引名称 */
  indexName: string;

  /** 表名 */
  tableName: string;

  /** 数据库名 */
  databaseName: string;

  /** 是否唯一索引 */
  isUnique: boolean;

  /** 索引类型（BTREE, FULLTEXT, HASH） */
  indexType: 'BTREE' | 'FULLTEXT' | 'HASH';

  /** 索引包含的列 */
  columns: {
    columnName: string;
    seqInIndex: number;
    collation?: 'A' | 'D';
  }[];

  /** 索引注释 */
  indexComment?: string;
}

/**
 * 外键信息
 */
export interface ForeignKeyInfo {
  /** 约束名称 */
  constraintName: string;

  /** 源表名 */
  tableName: string;

  /** 源字段名 */
  columnName: string;

  /** 数据库名 */
  databaseName: string;

  /** 引用表名 */
  referencedTableName: string;

  /** 引用字段名 */
  referencedColumnName: string;

  /** 引用数据库名 */
  referencedDatabaseName?: string;

  /** 删除规则（CASCADE, SET NULL, RESTRICT, NO ACTION） */
  deleteRule?: string;

  /** 更新规则 */
  updateRule?: string;
}

/**
 * 视图信息
 */
export interface ViewInfo {
  /** 视图名 */
  viewName: string;

  /** 数据库名 */
  databaseName: string;

  /** 视图定义（SQL） */
  viewDefinition: string;

  /** 检查选项 */
  checkOption?: string;

  /** 是否可更新 */
  isUpdatable: boolean;

  /** 定义者 */
  definer?: string;

  /** 安全类型 */
  securityType?: string;
}

/**
 * 采集统计信息
 */
export interface CollectionStats {
  /** 数据库数量 */
  databaseCount: number;

  /** 表数量 */
  tableCount: number;

  /** 视图数量 */
  viewCount: number;

  /** 字段数量 */
  columnCount: number;

  /** 索引数量 */
  indexCount: number;

  /** 外键数量 */
  foreignKeyCount: number;

  /** 采集开始时间 */
  startTime: Date;

  /** 采集结束时间 */
  endTime?: Date;

  /** 采集耗时（毫秒） */
  duration?: number;

  /** 错误信息 */
  errors?: string[];
}
