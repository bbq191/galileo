/**
 * MySQL/MariaDB Schema 采集器
 * 实现从 MySQL/MariaDB 数据库采集元数据
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
 * MySQL/MariaDB Schema 采集器
 */
export class MySQLSchemaCollector extends BaseCollector {
  /**
   * 采集数据库列表
   */
  async collectDatabases(connectionId: string): Promise<DatabaseInfo[]> {
    console.log(`[${connectionId}] 开始采集数据库列表...`);

    const sql = `
      SELECT
        SCHEMA_NAME as name,
        DEFAULT_CHARACTER_SET_NAME as charset,
        DEFAULT_COLLATION_NAME as collation
      FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
      ORDER BY SCHEMA_NAME
    `;

    const databases = await this.query<DatabaseInfo>(sql);

    // 获取每个数据库的表数量
    for (const db of databases) {
      const countSql = `
        SELECT COUNT(*) as tableCount
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
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
   * 采集指定数据库的所有表
   */
  async collectTables(
    connectionId: string,
    database: string
  ): Promise<TableInfo[]> {
    console.log(`[${connectionId}] 开始采集数据库 [${database}] 的表...`);

    const sql = `
      SELECT
        TABLE_NAME as tableName,
        ? as databaseName,
        TABLE_COMMENT as tableComment,
        TABLE_TYPE as tableType,
        ENGINE as engine,
        TABLE_ROWS as rowCount,
        DATA_LENGTH as dataLength,
        INDEX_LENGTH as indexLength,
        AUTO_INCREMENT as autoIncrement,
        CREATE_TIME as createTime,
        UPDATE_TIME as updateTime,
        TABLE_COLLATION as tableCollation
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `;

    const tables = await this.query<TableInfo>(sql, [database, database]);

    console.log(
      `[${connectionId}] ✓ 找到 ${tables.length} 张表（${database}）`
    );
    return tables;
  }

  /**
   * 采集指定表的所有字段
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
        COLUMN_NAME as columnName,
        ? as tableName,
        ? as databaseName,
        DATA_TYPE as dataType,
        COLUMN_TYPE as columnType,
        COLUMN_COMMENT as columnComment,
        IS_NULLABLE = 'YES' as isNullable,
        COLUMN_KEY as columnKey,
        COLUMN_DEFAULT as defaultValue,
        EXTRA as extra,
        ORDINAL_POSITION as ordinalPosition,
        CHARACTER_SET_NAME as characterSet,
        COLLATION_NAME as collation,
        CHARACTER_MAXIMUM_LENGTH as characterMaximumLength,
        NUMERIC_PRECISION as numericPrecision,
        NUMERIC_SCALE as numericScale
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;

    const columns = await this.query<ColumnInfo>(sql, [
      table,
      database,
      database,
      table,
    ]);

    console.log(
      `[${connectionId}] ✓ 找到 ${columns.length} 个字段（${database}.${table}）`
    );
    return columns;
  }

  /**
   * 采集指定表的所有索引
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
        INDEX_NAME as indexName,
        ? as tableName,
        ? as databaseName,
        NON_UNIQUE = 0 as isUnique,
        INDEX_TYPE as indexType,
        COLUMN_NAME as columnName,
        SEQ_IN_INDEX as seqInIndex,
        COLLATION as collation,
        INDEX_COMMENT as indexComment
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;

    const rows = await this.query<any>(sql, [table, database, database, table]);

    // 将多行数据聚合成索引对象
    const indexMap = new Map<string, IndexInfo>();

    for (const row of rows) {
      if (!indexMap.has(row.indexName)) {
        indexMap.set(row.indexName, {
          indexName: row.indexName,
          tableName: table,
          databaseName: database,
          isUnique: row.isUnique,
          indexType: row.indexType,
          columns: [],
          indexComment: row.indexComment,
        });
      }

      const index = indexMap.get(row.indexName)!;
      index.columns.push({
        columnName: row.columnName,
        seqInIndex: row.seqInIndex,
        collation: row.collation,
      });
    }

    const indexes = Array.from(indexMap.values());

    console.log(
      `[${connectionId}] ✓ 找到 ${indexes.length} 个索引（${database}.${table}）`
    );
    return indexes;
  }

  /**
   * 采集指定数据库的所有外键关系
   */
  async collectForeignKeys(
    connectionId: string,
    database: string
  ): Promise<ForeignKeyInfo[]> {
    console.log(`[${connectionId}] 开始采集数据库 [${database}] 的外键...`);

    const sql = `
      SELECT
        CONSTRAINT_NAME as constraintName,
        TABLE_NAME as tableName,
        COLUMN_NAME as columnName,
        ? as databaseName,
        REFERENCED_TABLE_NAME as referencedTableName,
        REFERENCED_COLUMN_NAME as referencedColumnName,
        REFERENCED_TABLE_SCHEMA as referencedDatabaseName
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
    `;

    const foreignKeys = await this.query<ForeignKeyInfo>(sql, [
      database,
      database,
    ]);

    // 获取外键的删除/更新规则
    if (foreignKeys.length > 0) {
      const rulesSql = `
        SELECT
          CONSTRAINT_NAME as constraintName,
          DELETE_RULE as deleteRule,
          UPDATE_RULE as updateRule
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ?
      `;

      const rules = await this.query<any>(rulesSql, [database]);
      const rulesMap = new Map(
        rules.map((r) => [r.constraintName, r])
      );

      for (const fk of foreignKeys) {
        const rule = rulesMap.get(fk.constraintName);
        if (rule) {
          fk.deleteRule = rule.deleteRule;
          fk.updateRule = rule.updateRule;
        }
      }
    }

    console.log(
      `[${connectionId}] ✓ 找到 ${foreignKeys.length} 个外键（${database}）`
    );
    return foreignKeys;
  }

  /**
   * 采集指定数据库的所有视图
   */
  async collectViews(
    connectionId: string,
    database: string
  ): Promise<ViewInfo[]> {
    console.log(`[${connectionId}] 开始采集数据库 [${database}] 的视图...`);

    const sql = `
      SELECT
        TABLE_NAME as viewName,
        ? as databaseName,
        VIEW_DEFINITION as viewDefinition,
        CHECK_OPTION as checkOption,
        IS_UPDATABLE = 'YES' as isUpdatable,
        DEFINER as definer,
        SECURITY_TYPE as securityType
      FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `;

    const views = await this.query<ViewInfo>(sql, [database, database]);

    console.log(
      `[${connectionId}] ✓ 找到 ${views.length} 个视图（${database}）`
    );
    return views;
  }

  /**
   * 获取表的 DDL 语句
   * 用于生成结构哈希
   */
  async getTableDDL(database: string, table: string): Promise<string> {
    const sql = `SHOW CREATE TABLE \`${database}\`.\`${table}\``;

    try {
      const [result] = await this.query<any>(sql);
      return result['Create Table'] || result['Create View'] || '';
    } catch (error) {
      console.error(`获取表 DDL 失败 (${database}.${table}):`, error);
      return '';
    }
  }

  /**
   * 批量采集指定数据库的所有元数据
   */
  async collectAll(connectionId: string, database: string) {
    console.log(`\n========================================`);
    console.log(`[${connectionId}] 开始采集数据库 [${database}] 的所有元数据`);
    console.log(`========================================\n`);

    const startTime = Date.now();

    try {
      // 1. 采集表
      const tables = await this.collectTables(connectionId, database);

      let totalColumns = 0;
      let totalIndexes = 0;

      // 2. 为每张表采集字段和索引
      for (const table of tables) {
        if (table.tableType === 'BASE TABLE') {
          const columns = await this.collectColumns(
            connectionId,
            database,
            table.tableName
          );
          const indexes = await this.collectIndexes(
            connectionId,
            database,
            table.tableName
          );

          totalColumns += columns.length;
          totalIndexes += indexes.length;
        }
      }

      // 3. 采集外键
      const foreignKeys = await this.collectForeignKeys(connectionId, database);

      // 4. 采集视图
      const views = await this.collectViews(connectionId, database);

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`\n========================================`);
      console.log(`采集完成 - ${database}`);
      console.log(`========================================`);
      console.log(`表数量: ${tables.length}`);
      console.log(`字段数量: ${totalColumns}`);
      console.log(`索引数量: ${totalIndexes}`);
      console.log(`外键数量: ${foreignKeys.length}`);
      console.log(`视图数量: ${views.length}`);
      console.log(`耗时: ${duration}ms`);
      console.log(`========================================\n`);

      return {
        tables,
        foreignKeys,
        views,
        stats: {
          databaseCount: 1,
          tableCount: tables.length,
          viewCount: views.length,
          columnCount: totalColumns,
          indexCount: totalIndexes,
          foreignKeyCount: foreignKeys.length,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          duration,
          errors: [],
        },
      };
    } catch (error) {
      console.error(`采集数据库 ${database} 失败:`, error);
      throw error;
    }
  }
}
