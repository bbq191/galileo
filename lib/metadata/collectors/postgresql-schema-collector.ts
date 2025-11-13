/**
 * PostgreSQL 元数据采集器
 *
 * 功能：
 * - 采集 PostgreSQL 数据库的表结构
 * - 采集列信息、索引、约束等
 * - 支持多 Schema
 * - 与 MySQL 采集器保持一致的接口
 */

import { BaseCollector } from './base-collector';
import type {
  DatabaseInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  ViewInfo,
} from '../types';

/**
 * PostgreSQL 元数据采集器类
 */
export class PostgreSQLSchemaCollector extends BaseCollector {
  /**
   * 采集数据库列表
   */
  async collectDatabases(connectionId: string): Promise<DatabaseInfo[]> {
    console.log(`[${connectionId}] 开始采集数据库列表...`);

    const sql = `
      SELECT
        datname as name,
        pg_encoding_to_char(encoding) as charset,
        datcollate as collation
      FROM pg_database
      WHERE datistemplate = false
        AND datname NOT IN ('postgres', 'template0', 'template1')
      ORDER BY datname
    `;

    const databases = await this.query<DatabaseInfo>(sql);

    // 获取每个数据库的表数量
    for (const db of databases) {
      const countSql = `
        SELECT COUNT(*) as "tableCount"
        FROM information_schema.tables
        WHERE table_catalog = $1
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type = 'BASE TABLE'
      `;
      const [result] = await this.query<{ tableCount: number }>(countSql, [
        db.name,
      ]);
      db.tableCount = result?.tableCount || 0;
    }

    console.log(`[${connectionId}] ✓ 找到 ${databases.length} 个数据库`);
    return databases;
  }

  /**
   * 采集数据库中的所有表
   */
  async collectTables(
    connectionId: string,
    database: string
  ): Promise<TableInfo[]> {
    console.log(`[${connectionId}] 开始采集数据库 [${database}] 的表...`);

    const sql = `
      SELECT
        t.table_name AS "tableName",
        $1 AS "databaseName",
        obj_description(('"' || t.table_schema || '"."' || t.table_name || '"')::regclass) AS "tableComment",
        t.table_type AS "tableType",
        'PostgreSQL' AS engine,
        COALESCE(c.reltuples::bigint, 0) AS "rowCount",
        pg_total_relation_size(('"' || t.table_schema || '"."' || t.table_name || '"')::regclass) AS "dataLength",
        pg_indexes_size(('"' || t.table_schema || '"."' || t.table_name || '"')::regclass) AS "indexLength"
      FROM information_schema.tables t
      LEFT JOIN pg_class c ON c.relname = t.table_name
      WHERE t.table_catalog = $1
        AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `;

    const tables = await this.query<TableInfo>(sql, [database]);

    console.log(
      `[${connectionId}] ✓ 找到 ${tables.length} 张表（${database}）`
    );
    return tables;
  }

  /**
   * 采集表的列信息
   */
  async collectColumns(
    connectionId: string,
    database: string,
    table: string
  ): Promise<ColumnInfo[]> {
    console.log(
      `[${connectionId}] 开始采集表 [${database}.${table}] 的字段...`
    );

    const sql = `
      SELECT
        c.column_name AS "columnName",
        $1 AS "tableName",
        $2 AS "databaseName",
        c.data_type AS "dataType",
        c.udt_name ||
          CASE
            WHEN c.character_maximum_length IS NOT NULL
            THEN '(' || c.character_maximum_length || ')'
            ELSE ''
          END AS "columnType",
        pgd.description AS "columnComment",
        c.is_nullable = 'YES' AS "isNullable",
        CASE
          WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'PRI'
          WHEN tc.constraint_type = 'UNIQUE' THEN 'UNI'
          ELSE ''
        END AS "columnKey",
        c.column_default AS "defaultValue",
        CASE
          WHEN c.column_default LIKE 'nextval%' THEN 'auto_increment'
          ELSE ''
        END AS extra,
        c.ordinal_position AS "ordinalPosition",
        NULL AS "characterSet",
        c.collation_name AS collation,
        c.character_maximum_length AS "characterMaximumLength",
        c.numeric_precision AS "numericPrecision",
        c.numeric_scale AS "numericScale"
      FROM information_schema.columns c
      LEFT JOIN pg_catalog.pg_description pgd
        ON pgd.objoid = ('"' || c.table_schema || '"."' || c.table_name || '"')::regclass
        AND pgd.objsubid = c.ordinal_position
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_schema = kcu.table_schema
        AND c.table_name = kcu.table_name
        AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc
        ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema = tc.table_schema
      WHERE c.table_catalog = $2
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND c.table_name = $1
      ORDER BY c.ordinal_position
    `;

    const columns = await this.query<ColumnInfo>(sql, [table, database]);

    console.log(
      `[${connectionId}] ✓ 找到 ${columns.length} 个字段（${database}.${table}）`
    );
    return columns;
  }

  /**
   * 采集外键关系
   */
  async collectForeignKeys(
    connectionId: string,
    database: string
  ): Promise<ForeignKeyInfo[]> {
    console.log(`[${connectionId}] 开始采集数据库 [${database}] 的外键...`);

    const sql = `
      SELECT
        tc.constraint_name AS "constraintName",
        tc.table_name AS "tableName",
        kcu.column_name AS "columnName",
        $1 AS "databaseName",
        ccu.table_name AS "referencedTableName",
        ccu.column_name AS "referencedColumnName",
        ccu.table_schema AS "referencedDatabaseName",
        rc.delete_rule AS "deleteRule",
        rc.update_rule AS "updateRule"
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      LEFT JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_catalog = $1
        AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY tc.constraint_name
    `;

    const foreignKeys = await this.query<ForeignKeyInfo>(sql, [database]);

    console.log(
      `[${connectionId}] ✓ 找到 ${foreignKeys.length} 个外键（${database}）`
    );
    return foreignKeys;
  }

  /**
   * 采集索引信息
   */
  async collectIndexes(
    connectionId: string,
    database: string,
    table: string
  ): Promise<IndexInfo[]> {
    console.log(
      `[${connectionId}] 开始采集表 [${database}.${table}] 的索引...`
    );

    const sql = `
      SELECT
        i.relname AS "indexName",
        $1 AS "tableName",
        $2 AS "databaseName",
        ix.indisunique AS "isUnique",
        am.amname AS "indexType",
        a.attname AS "columnName",
        a.attnum AS "seqInIndex",
        obj_description(i.oid) AS "indexComment"
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE t.relname = $1
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY i.relname, a.attnum
    `;

    const rows = await this.query<any>(sql, [table, database]);

    // 将多行数据聚合成索引对象
    const indexMap = new Map<string, IndexInfo>();

    for (const row of rows) {
      if (!indexMap.has(row.indexName)) {
        indexMap.set(row.indexName, {
          indexName: row.indexName,
          tableName: table,
          databaseName: database,
          isUnique: row.isUnique,
          indexType: row.indexType.toUpperCase() as 'BTREE' | 'FULLTEXT' | 'HASH',
          columns: [],
          indexComment: row.indexComment,
        });
      }

      const index = indexMap.get(row.indexName)!;
      index.columns.push({
        columnName: row.columnName,
        seqInIndex: row.seqInIndex,
      });
    }

    const indexes = Array.from(indexMap.values());

    console.log(
      `[${connectionId}] ✓ 找到 ${indexes.length} 个索引（${database}.${table}）`
    );
    return indexes;
  }

  /**
   * 采集视图信息
   */
  async collectViews(
    connectionId: string,
    database: string
  ): Promise<ViewInfo[]> {
    console.log(`[${connectionId}] 开始采集数据库 [${database}] 的视图...`);

    const sql = `
      SELECT
        table_name AS "viewName",
        $1 AS "databaseName",
        view_definition AS "viewDefinition",
        check_option AS "checkOption",
        is_updatable = 'YES' AS "isUpdatable"
      FROM information_schema.views
      WHERE table_catalog = $1
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_name
    `;

    const views = await this.query<ViewInfo>(sql, [database]);

    console.log(
      `[${connectionId}] ✓ 找到 ${views.length} 个视图（${database}）`
    );
    return views;
  }
}
