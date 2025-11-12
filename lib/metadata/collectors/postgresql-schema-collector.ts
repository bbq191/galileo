/**
 * PostgreSQL 元数据采集器
 *
 * 功能：
 * - 采集 PostgreSQL 数据库的表结构
 * - 采集列信息、索引、约束等
 * - 支持多 Schema
 * - 与 MySQL 采集器保持一致的接口
 */

import type { ConnectionPool } from '@/lib/database/connection-pool';
import type { SchemaCollector, TableMetadata, ColumnMetadata } from './base-collector';

/**
 * PostgreSQL 元数据采集器类
 */
export class PostgreSQLSchemaCollector implements SchemaCollector {
  constructor(private pool: ConnectionPool) {}

  /**
   * 采集数据库中的所有表
   */
  async collectTables(databaseName: string): Promise<TableMetadata[]> {
    const connection = this.pool.getConnection();
    const tables: TableMetadata[] = [];

    try {
      // PostgreSQL 使用 information_schema 查询表信息
      const [rows] = await connection.execute(
        `
        SELECT
          table_schema AS "schema",
          table_name AS "tableName",
          obj_description(('"' || table_schema || '"."' || table_name || '"')::regclass) AS "tableComment"
        FROM information_schema.tables
        WHERE table_catalog = $1
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
        `,
        [databaseName]
      );

      for (const row of rows as any[]) {
        // 获取行数估算
        const [countRows] = await connection.execute(
          `
          SELECT reltuples::bigint AS estimate
          FROM pg_class
          WHERE oid = ('"' || $1 || '"."' || $2 || '"')::regclass
          `,
          [row.schema, row.tableName]
        );

        const rowCount = (countRows as any[])[0]?.estimate || 0;

        tables.push({
          tableName: row.tableName,
          tableComment: row.tableComment || '',
          schema: row.schema,
          rowCount: parseInt(rowCount.toString()),
          engine: 'PostgreSQL', // PostgreSQL 使用不同的存储引擎概念
          collation: null,
        });
      }

      return tables;
    } catch (error) {
      console.error('[PostgreSQL Collector] 采集表失败:', error);
      throw error;
    }
  }

  /**
   * 采集表的列信息
   */
  async collectColumns(
    databaseName: string,
    tableName: string,
    schema?: string
  ): Promise<ColumnMetadata[]> {
    const connection = this.pool.getConnection();
    const columns: ColumnMetadata[] = [];

    try {
      const schemaName = schema || 'public';

      // 查询列信息
      const [rows] = await connection.execute(
        `
        SELECT
          c.column_name AS "columnName",
          c.ordinal_position AS "ordinalPosition",
          c.column_default AS "columnDefault",
          c.is_nullable AS "isNullable",
          c.data_type AS "dataType",
          c.character_maximum_length AS "characterMaxLength",
          c.numeric_precision AS "numericPrecision",
          c.numeric_scale AS "numericScale",
          pgd.description AS "columnComment",
          CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END AS "isPrimaryKey",
          CASE WHEN tc.constraint_type = 'UNIQUE' THEN true ELSE false END AS "isUnique"
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
        WHERE c.table_catalog = $1
          AND c.table_schema = $2
          AND c.table_name = $3
        ORDER BY c.ordinal_position
        `,
        [databaseName, schemaName, tableName]
      );

      for (const row of rows as any[]) {
        columns.push({
          columnName: row.columnName,
          ordinalPosition: row.ordinalPosition,
          columnDefault: row.columnDefault,
          isNullable: row.isNullable === 'YES',
          dataType: row.dataType,
          characterMaximumLength: row.characterMaxLength,
          numericPrecision: row.numericPrecision,
          numericScale: row.numericScale,
          columnComment: row.columnComment || '',
          isPrimaryKey: row.isPrimaryKey || false,
          isUnique: row.isUnique || false,
        });
      }

      return columns;
    } catch (error) {
      console.error('[PostgreSQL Collector] 采集列失败:', error);
      throw error;
    }
  }

  /**
   * 采集外键关系
   */
  async collectForeignKeys(
    databaseName: string,
    tableName?: string
  ): Promise<Array<{
    constraintName: string;
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    sourceSchema?: string;
    targetSchema?: string;
  }>> {
    const connection = this.pool.getConnection();
    const foreignKeys: Array<{
      constraintName: string;
      sourceTable: string;
      sourceColumn: string;
      targetTable: string;
      targetColumn: string;
      sourceSchema?: string;
      targetSchema?: string;
    }> = [];

    try {
      let query = `
        SELECT
          tc.constraint_name AS "constraintName",
          tc.table_schema AS "sourceSchema",
          tc.table_name AS "sourceTable",
          kcu.column_name AS "sourceColumn",
          ccu.table_schema AS "targetSchema",
          ccu.table_name AS "targetTable",
          ccu.column_name AS "targetColumn"
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_catalog = $1
      `;

      const params = [databaseName];

      if (tableName) {
        query += ` AND tc.table_name = $2`;
        params.push(tableName);
      }

      const [rows] = await connection.execute(query, params);

      for (const row of rows as any[]) {
        foreignKeys.push({
          constraintName: row.constraintName,
          sourceSchema: row.sourceSchema,
          sourceTable: row.sourceTable,
          sourceColumn: row.sourceColumn,
          targetSchema: row.targetSchema,
          targetTable: row.targetTable,
          targetColumn: row.targetColumn,
        });
      }

      return foreignKeys;
    } catch (error) {
      console.error('[PostgreSQL Collector] 采集外键失败:', error);
      throw error;
    }
  }

  /**
   * 采集索引信息
   */
  async collectIndexes(
    databaseName: string,
    tableName: string,
    schema?: string
  ): Promise<Array<{
    indexName: string;
    columnName: string;
    isUnique: boolean;
    isPrimary: boolean;
  }>> {
    const connection = this.pool.getConnection();
    const schemaName = schema || 'public';

    try {
      const [rows] = await connection.execute(
        `
        SELECT
          i.relname AS "indexName",
          a.attname AS "columnName",
          ix.indisunique AS "isUnique",
          ix.indisprimary AS "isPrimary"
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_attribute a ON a.attrelid = t.oid
        WHERE t.relname = $1
          AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)
          AND a.attnum = ANY(ix.indkey)
        ORDER BY i.relname, a.attnum
        `,
        [tableName, schemaName]
      );

      return (rows as any[]).map(row => ({
        indexName: row.indexName,
        columnName: row.columnName,
        isUnique: row.isUnique,
        isPrimary: row.isPrimary,
      }));
    } catch (error) {
      console.error('[PostgreSQL Collector] 采集索引失败:', error);
      return [];
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const connection = this.pool.getConnection();
      await connection.execute('SELECT 1');
      return true;
    } catch (error) {
      console.error('[PostgreSQL Collector] 连接测试失败:', error);
      return false;
    }
  }
}
