/**
 * Schema 采集器抽象基类
 * 定义所有采集器的通用接口
 */

import type { ConnectionPool } from '@/lib/database/connection-pool';
import type {
  DatabaseInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  ViewInfo,
} from '../types';

/**
 * Schema 采集器接口
 */
export interface SchemaCollector {
  /**
   * 采集数据库列表
   * @param connectionId 连接 ID
   */
  collectDatabases(connectionId: string): Promise<DatabaseInfo[]>;

  /**
   * 采集指定数据库的所有表
   * @param connectionId 连接 ID
   * @param database 数据库名
   */
  collectTables(connectionId: string, database: string): Promise<TableInfo[]>;

  /**
   * 采集指定表的所有字段
   * @param connectionId 连接 ID
   * @param database 数据库名
   * @param table 表名
   */
  collectColumns(
    connectionId: string,
    database: string,
    table: string
  ): Promise<ColumnInfo[]>;

  /**
   * 采集指定表的所有索引
   * @param connectionId 连接 ID
   * @param database 数据库名
   * @param table 表名
   */
  collectIndexes(
    connectionId: string,
    database: string,
    table: string
  ): Promise<IndexInfo[]>;

  /**
   * 采集指定数据库的所有外键关系
   * @param connectionId 连接 ID
   * @param database 数据库名
   */
  collectForeignKeys(
    connectionId: string,
    database: string
  ): Promise<ForeignKeyInfo[]>;

  /**
   * 采集指定数据库的所有视图
   * @param connectionId 连接 ID
   * @param database 数据库名
   */
  collectViews(connectionId: string, database: string): Promise<ViewInfo[]>;
}

/**
 * 抽象基类实现
 */
export abstract class BaseCollector implements SchemaCollector {
  protected pool: ConnectionPool;

  constructor(pool: ConnectionPool) {
    this.pool = pool;
  }

  /**
   * 执行查询并处理错误
   */
  protected async query<T>(sql: string, params?: any[]): Promise<T[]> {
    try {
      const [rows] = await this.pool.query<T[]>(sql, params);
      return rows;
    } catch (error) {
      console.error('查询执行失败:', error);
      throw new Error(`Failed to execute query: ${error}`);
    }
  }

  /**
   * 抽象方法：子类必须实现
   */
  abstract collectDatabases(connectionId: string): Promise<DatabaseInfo[]>;
  abstract collectTables(
    connectionId: string,
    database: string
  ): Promise<TableInfo[]>;
  abstract collectColumns(
    connectionId: string,
    database: string,
    table: string
  ): Promise<ColumnInfo[]>;
  abstract collectIndexes(
    connectionId: string,
    database: string,
    table: string
  ): Promise<IndexInfo[]>;
  abstract collectForeignKeys(
    connectionId: string,
    database: string
  ): Promise<ForeignKeyInfo[]>;
  abstract collectViews(
    connectionId: string,
    database: string
  ): Promise<ViewInfo[]>;
}
