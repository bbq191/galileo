/**
 * 元数据管理模块导出
 */

// 类型定义
export type {
  DatabaseInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  ViewInfo,
  CollectionStats,
} from './types';

// 采集器
export {
  BaseCollector,
  MySQLSchemaCollector,
  CollectorFactory,
} from './collectors';

export type { SchemaCollector } from './collectors';
