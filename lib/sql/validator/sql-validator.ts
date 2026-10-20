/**
 * SQL 验证器主模块
 *
 * 整合语法验证、安全检查、性能分析和权限检查
 */

import { Parser } from 'node-sql-parser';
import {
  ValidationResult,
  ValidationError,
  UserPermissions,
  TableReference,
  ColumnReference,
} from './types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { SecurityChecker } from './security-checker';
import { PerformanceAnalyzer } from './performance-analyzer';
import { PermissionChecker } from './permission-checker';

export class SQLValidator {
  private parser: Parser;
  private securityChecker: SecurityChecker;
  private performanceAnalyzer: PerformanceAnalyzer;
  private permissionChecker: PermissionChecker;

  constructor() {
    this.parser = new Parser();
    this.securityChecker = new SecurityChecker();
    this.performanceAnalyzer = new PerformanceAnalyzer();
    this.permissionChecker = new PermissionChecker();
  }

  /**
   * 验证 SQL 查询
   */
  async validate(
    sql: string,
    context: MetadataContext,
    userPermissions?: UserPermissions
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
      optimizationSuggestions: [],
      estimatedCost: { complexity: 'low' }
    };

    // 1. 语法验证
    const syntaxErrors = await this.validateSyntax(sql);
    result.errors.push(...syntaxErrors);

    if (syntaxErrors.length > 0) {
      result.isValid = false;
      return result;
    }

    // 2. 安全检查
    const securityIssues = await this.securityChecker.check(sql);
    result.securityIssues.push(...securityIssues);

    if (securityIssues.some(issue => issue.severity === 'critical')) {
      result.isValid = false;
      result.errors.push({
        type: 'security',
        message: '检测到严重安全问题，查询被拒绝'
      });
      return result;
    }

    // 3. 权限检查
    if (userPermissions) {
      const permissionErrors = await this.permissionChecker.check(sql, userPermissions, context);
      result.errors.push(...permissionErrors);

      if (permissionErrors.length > 0) {
        result.isValid = false;
        return result;
      }
    }

    // 4. 语义验证（表、字段是否存在）
    const semanticErrors = await this.validateSemantics(sql, context);
    result.errors.push(...semanticErrors);

    if (semanticErrors.length > 0) {
      result.isValid = false;
      return result;
    }

    // 5. 性能分析
    const performanceAnalysis = await this.performanceAnalyzer.analyze(sql, context);
    result.warnings.push(...performanceAnalysis.warnings);
    result.optimizationSuggestions.push(...performanceAnalysis.suggestions);
    result.estimatedCost = performanceAnalysis.estimatedCost;

    return result;
  }

  /**
   * 语法验证
   */
  private async validateSyntax(sql: string): Promise<ValidationError[]> {
    try {
      // 检查 FROM 或 JOIN 后是否包含数据库前缀（格式：FROM `db`.`table`）
      const hasDbPrefix = /(?:FROM|JOIN)\s+`[^`]+`\s*\.\s*`[^`]+`/i.test(sql);

      if (hasDbPrefix) {
        // 对于包含数据库前缀的SQL，使用简单的语法检查
        console.log('Using simple syntax validation for database-prefixed SQL');

        // 基本的SQL语法检查
        const sqlUpper = sql.trim().toUpperCase();

        // 检查是否以SELECT或WITH开头
        if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
          return [{
            type: 'syntax',
            message: 'SQL 必须以 SELECT 或 WITH 开头'
          }];
        }

        // 检查括号匹配
        const openParens = (sql.match(/\(/g) || []).length;
        const closeParens = (sql.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          return [{
            type: 'syntax',
            message: `括号不匹配：左括号 ${openParens} 个，右括号 ${closeParens} 个`
          }];
        }

        // 检查反引号匹配
        const backticks = (sql.match(/`/g) || []).length;
        if (backticks % 2 !== 0) {
          return [{
            type: 'syntax',
            message: '反引号（`）不匹配'
          }];
        }

        // 简单验证通过
        return [];
      }

      // 如果没有数据库前缀，使用标准的AST解析验证
      this.parser.astify(sql, { database: 'MySQL' });
      return [];
    } catch (error: any) {
      // 解析失败，返回语法错误
      console.warn('SQL syntax validation failed:', error.message);
      return [{
        type: 'syntax',
        message: `SQL 语法错误: ${error.message}`,
        position: error.location ? {
          line: error.location.start?.line || 0,
          column: error.location.start?.column || 0
        } : undefined
      }];
    }
  }

  /**
   * 语义验证
   */
  private async validateSemantics(
    sql: string,
    context: MetadataContext
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      // 检查 FROM 或 JOIN 后是否包含数据库前缀（格式：FROM `db`.`table`）
      const hasDbPrefix = /(?:FROM|JOIN)\s+`[^`]+`\s*\.\s*`[^`]+`/i.test(sql);

      if (hasDbPrefix) {
        // 对于包含数据库前缀的SQL，使用简单的字符串匹配来验证
        console.log('Using simple semantic validation for database-prefixed SQL');

        // 只提取 FROM / JOIN 之后的表引用（格式：`db`.`table` 或 db.table），
        // 否则 SELECT 列表、ON 条件中的「别名.字段」（如 u.name）会被误判为「库.表」
        const tableMatches = sql.matchAll(
          /\b(?:FROM|JOIN)\s+((?:`[^`]+`|\w+)\s*\.\s*(?:`[^`]+`|\w+))/gi
        );

        for (const [, reference] of tableMatches) {
          // 解析数据库名和表名
          const parts = reference.replace(/`/g, '').split('.');
          if (parts.length === 2) {
            const [dbName, tableName] = parts.map(p => p.trim());

            // 检查表是否存在
            const exists = context.tables.some(t =>
              t.tableName === tableName &&
              (!dbName || t.databaseName === dbName)
            );

            if (!exists) {
              errors.push({
                type: 'semantic',
                message: `表 ${dbName}.${tableName} 不存在或未在元数据中找到`
              });
            }
          }
        }

        // 对于包含数据库前缀的SQL，字段验证较为困难，暂时跳过
        // 因为需要复杂的解析才能准确提取字段引用
        console.log('Skipping column validation for database-prefixed SQL');

        return errors;
      }

      // 如果没有数据库前缀，使用标准的AST验证
      const ast = this.parser.astify(sql, { database: 'MySQL' });
      const statements = Array.isArray(ast) ? ast : [ast];

      for (const statement of statements) {
        // 提取查询中使用的表和字段
        const usedTables = this.extractTables(statement);
        const usedColumns = this.extractColumns(statement);

        // 构建别名到真实表名的映射
        const aliasMap = new Map<string, TableReference>();
        for (const table of usedTables) {
          // 真实表名可以通过表名本身访问
          aliasMap.set(table.name, table);
          // 如果有别名，也可以通过别名访问
          if (table.alias) {
            aliasMap.set(table.alias, table);
          }
        }

        // 检查表是否存在
        for (const table of usedTables) {
          const exists = context.tables.some(t =>
            t.tableName === table.name &&
            (!table.database || t.databaseName === table.database)
          );

          if (!exists) {
            errors.push({
              type: 'semantic',
              message: `表 ${table.database ? table.database + '.' : ''}${table.name} 不存在或未在元数据中找到`
            });
          }
        }

        // 检查字段是否存在
        for (const column of usedColumns) {
          // 跳过 * 通配符
          if (column.name === '*') {
            continue;
          }

          let tableRef: TableReference | undefined;
          let metadataTable;

          if (column.table) {
            // 字段指定了表名或别名，通过别名映射找到真实表
            tableRef = aliasMap.get(column.table);
            if (tableRef) {
              metadataTable = context.tables.find(t =>
                t.tableName === tableRef!.name &&
                (!tableRef!.database || t.databaseName === tableRef!.database)
              );
            }
          } else if (usedTables.length === 1) {
            // 如果只有一个表，且字段没有指定表名，则使用该表
            tableRef = usedTables[0];
            metadataTable = context.tables.find(t =>
              t.tableName === tableRef!.name &&
              (!tableRef!.database || t.databaseName === tableRef!.database)
            );
          }

          // 如果找到了表，检查字段是否存在
          if (metadataTable) {
            const columnExists = metadataTable.columns.some(c => c.columnName === column.name);
            if (!columnExists) {
              errors.push({
                type: 'semantic',
                message: `字段 ${column.table ? column.table + '.' : ''}${column.name} 在表 ${metadataTable.tableName} 中不存在`
              });
            }
          } else if (column.table) {
            // 如果指定了表但找不到，可能是表不存在（已经在表验证中报告）或别名错误
            // 这里只在表名/别名在查询中不存在时报告
            if (!aliasMap.has(column.table)) {
              errors.push({
                type: 'semantic',
                message: `引用了未知的表或别名: ${column.table}`
              });
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Semantic validation error:', error);
      // 语法错误已经在语法验证阶段捕获，这里只记录警告
      console.warn('Skipping semantic validation due to parsing error');
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
   * 从 AST 提取列引用
   */
  private extractColumns(ast: any): ColumnReference[] {
    const columns: ColumnReference[] = [];

    // 从 SELECT 子句提取
    if (ast.columns) {
      for (const col of ast.columns) {
        if (col.expr?.type === 'column_ref') {
          const column = col.expr.column;
          if (typeof column === 'string') {
            columns.push({
              table: col.expr.table,
              name: column,
              alias: col.as
            });
          } else if (column && typeof column === 'object') {
            columns.push({
              table: col.expr.table,
              name: column.column || column,
              alias: col.as
            });
          }
        }
      }
    }

    // 从 WHERE 子句提取
    if (ast.where) {
      this.extractColumnsFromNode(ast.where, columns);
    }

    // 跳过 GROUP BY 和 ORDER BY 的验证
    // 因为它们可能引用 SELECT 子句中的别名，这在 MySQL 中是合法的
    // 如果引用的列不存在，数据库执行时会报错

    return columns;
  }

  /**
   * 递归从节点提取列引用
   */
  private extractColumnsFromNode(node: any, columns: ColumnReference[]) {
    if (!node) return;

    if (node.type === 'column_ref') {
      const column = node.column;
      if (typeof column === 'string') {
        columns.push({
          table: node.table,
          name: column
        });
      }
    }

    // 递归处理子节点
    if (node.left) this.extractColumnsFromNode(node.left, columns);
    if (node.right) this.extractColumnsFromNode(node.right, columns);
    if (node.args && Array.isArray(node.args)) {
      for (const arg of node.args) {
        this.extractColumnsFromNode(arg, columns);
      }
    }
  }
}
