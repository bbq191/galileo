/**
 * SQL 权限检查器
 *
 * 负责检查用户是否有权限执行指定的 SQL 查询
 */

import { Parser } from 'node-sql-parser';
import { ValidationError, UserPermissions, TableReference } from './types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

export class PermissionChecker {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * 检查用户权限
   */
  async check(
    sql: string,
    permissions: UserPermissions,
    context: MetadataContext
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      const ast = this.parser.astify(sql, { database: 'MySQL' });
      const statements = Array.isArray(ast) ? ast : [ast];

      for (const statement of statements) {
        // 1. 检查 SQL 类型（只允许 SELECT）
        if (statement.type !== 'select') {
          errors.push({
            type: 'permission',
            message: `不允许执行 ${statement.type.toUpperCase()} 操作`
          });
          continue;
        }

        // 2. 检查表访问权限
        const usedTables = this.extractTables(statement);
        for (const table of usedTables) {
          const database = table.database || this.inferDatabase(table.name, context);

          if (database && !permissions.canAccessTable(database, table.name)) {
            errors.push({
              type: 'permission',
              message: `没有权限访问表 ${database}.${table.name}`
            });
          }
        }

        // 3. 检查数据库访问权限
        if (permissions.allowedDatabases && permissions.allowedDatabases.length > 0) {
          const databases = this.extractDatabases(usedTables, context);
          for (const db of databases) {
            if (!permissions.allowedDatabases.includes(db)) {
              errors.push({
                type: 'permission',
                message: `没有权限访问数据库 ${db}`
              });
            }
          }
        }
      }
    } catch (error: any) {
      // 解析失败，可能是语法错误，由语法验证器处理
      console.error('Permission check parse error:', error);
    }

    return errors;
  }

  /**
   * 从 AST 提取表引用
   */
  private extractTables(ast: any): TableReference[] {
    const tables: TableReference[] = [];

    if (!ast.from) return tables;

    const processFromItem = (from: any) => {
      if (from.table) {
        tables.push({
          database: from.db,
          name: from.table,
          alias: from.as
        });
      }

      // 处理 JOIN
      if (from.join) {
        processFromItem(from.join);
      }
    };

    const fromList = Array.isArray(ast.from) ? ast.from : [ast.from];
    fromList.forEach(processFromItem);

    return tables;
  }

  /**
   * 推断表所属数据库
   */
  private inferDatabase(tableName: string, context: MetadataContext): string | undefined {
    const table = context.tables.find(t => t.tableName === tableName);
    return table?.databaseName;
  }

  /**
   * 提取所有涉及的数据库
   */
  private extractDatabases(tables: TableReference[], context: MetadataContext): string[] {
    const databases = new Set<string>();

    for (const table of tables) {
      const db = table.database || this.inferDatabase(table.name, context);
      if (db) {
        databases.add(db);
      }
    }

    return Array.from(databases);
  }
}

/**
 * 默认权限实现（仅用于开发/测试）
 */
export class DefaultUserPermissions implements UserPermissions {
  constructor(
    public userId?: string,
    public allowedDatabases?: string[],
    public allowedTables?: string[],
    public allowedOperations: string[] = ['SELECT']
  ) {}

  canAccessTable(database: string, table: string): boolean {
    // 如果没有限制，允许访问所有表
    if (!this.allowedDatabases && !this.allowedTables) {
      return true;
    }

    // 检查数据库权限
    if (this.allowedDatabases && !this.allowedDatabases.includes(database)) {
      return false;
    }

    // 检查表权限
    if (this.allowedTables) {
      const fullTableName = `${database}.${table}`;
      return this.allowedTables.includes(table) || this.allowedTables.includes(fullTableName);
    }

    return true;
  }
}
