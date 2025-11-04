/**
 * 查询执行器
 * 负责执行验证通过的 SQL 查询
 */

import crypto from 'crypto';
import connectionManager from '@/lib/database/connection-manager';
import { queryCacheManager } from '@/lib/cache/query-cache-manager';
import { withTimeout } from './timeout-handler';
import { resultFormatter } from './result-formatter';
import type { MetadataContext } from '@/lib/metadata/retrieval/types';
import type {
  ExecutionOptions,
  ExecutionResult,
  PaginatedResult,
  PaginationOptions,
  ExecutorError,
  ExecutorErrorType,
  QueryStatistics,
} from './types';
import { ExecutorError as ExecutorErrorClass } from './types';

/**
 * 查询执行器类
 */
export class QueryExecutor {
  // 默认执行选项
  private readonly DEFAULT_OPTIONS: Required<ExecutionOptions> = {
    timeout: 30000, // 30 秒
    maxRows: 10000, // 最多 10000 行
    enableCache: true,
    cacheKey: '',
    parameters: [],
  };

  /**
   * 执行 SQL 查询
   */
  async execute<T = any>(
    sql: string,
    context: MetadataContext,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };

    // 生成查询统计 ID
    const queryId = this.generateQueryId(sql);

    try {
      // 1. 检查缓存
      if (mergedOptions.enableCache) {
        const cached = await queryCacheManager.getResult<T>(sql);

        if (cached) {
          console.log(`[QueryExecutor] 缓存命中: ${queryId}`);
          return {
            ...cached,
            executionTime: Date.now() - startTime,
            fromCache: true,
          };
        }
      }

      // 2. 确定主数据源（查询涉及的第一个数据库）
      const primaryDb = context.tables[0]?.databaseName;
      if (!primaryDb) {
        throw new ExecutorErrorClass(
          ExecutorErrorClass.prototype.constructor.name as any,
          '无法确定主数据源：上下文中没有表信息'
        );
      }

      // 3. 获取数据库连接
      const sourceId = context.tables[0].database?.sourceId;
      if (!sourceId) {
        throw new ExecutorErrorClass(
          ExecutorErrorClass.prototype.constructor.name as any,
          '无法获取数据源 ID'
        );
      }

      const pool = await connectionManager.getConnection(sourceId.toString());

      // 4. 自动添加 LIMIT（如果未指定）
      const limitedSQL = this.ensureLimitClause(sql, mergedOptions.maxRows);

      // 5. 为 SQL 添加数据库前缀（如果需要）
      const qualifiedSQL = this.ensureDatabasePrefix(limitedSQL, context);

      // 6. 执行查询（带超时）
      console.log(`[QueryExecutor] 执行查询: ${queryId}`);
      console.log(`[QueryExecutor] SQL: ${qualifiedSQL.substring(0, 200)}...`);

      const queryPromise = pool.query(qualifiedSQL, mergedOptions.parameters);
      const [rows, fields] = await withTimeout(
        queryPromise,
        mergedOptions.timeout,
        `查询执行超时（超过 ${mergedOptions.timeout}ms）`
      );

      // 6. 格式化结果
      const formattedData = resultFormatter.formatResultData<T>(
        rows as any[],
        fields
      );
      const columnMetadata = resultFormatter.formatColumnMetadata(fields);

      const result: ExecutionResult<T> = {
        success: true,
        data: formattedData,
        executionTime: Date.now() - startTime,
        rowCount: formattedData.length,
        fromCache: false,
        metadata: {
          columns: columnMetadata,
        },
      };

      // 7. 缓存结果（由 queryCacheManager 内部判断是否缓存）
      if (mergedOptions.enableCache) {
        await queryCacheManager.setResult(sql, result);
      }

      console.log(
        `[QueryExecutor] 查询成功: ${queryId}, 返回 ${result.rowCount} 行, 耗时 ${result.executionTime}ms`
      );

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      const normalizedError = this.normalizeError(error);

      console.error(
        `[QueryExecutor] 查询失败: ${queryId}, 耗时 ${executionTime}ms`,
        normalizedError
      );

      return {
        success: false,
        error: normalizedError,
        executionTime,
        rowCount: 0,
        fromCache: false,
        metadata: { columns: [] },
      };
    }
  }

  /**
   * 分页查询
   */
  async executePaginated<T = any>(
    sql: string,
    context: MetadataContext,
    paginationOptions: PaginationOptions = {},
    executionOptions: ExecutionOptions = {}
  ): Promise<PaginatedResult<T>> {
    const page = paginationOptions.page || 1;
    const pageSize = paginationOptions.pageSize || 50;

    // 验证分页参数
    if (page < 1) {
      throw new Error('页码必须大于等于 1');
    }
    if (pageSize < 1 || pageSize > 1000) {
      throw new Error('每页大小必须在 1-1000 之间');
    }

    try {
      // 1. 执行 COUNT 查询获取总数
      const countSQL = this.buildCountQuery(sql);
      const countResult = await this.execute<{ total: number }>(
        countSQL,
        context,
        { ...executionOptions, enableCache: false }
      );

      const totalRows = countResult.data?.[0]?.total || 0;
      const totalPages = Math.ceil(totalRows / pageSize);

      // 2. 添加分页子句
      const offset = (page - 1) * pageSize;
      const paginatedSQL = this.addPaginationClause(sql, pageSize, offset);

      // 3. 执行分页查询
      const result = await this.execute<T>(paginatedSQL, context, executionOptions);

      return {
        ...result,
        pagination: {
          page,
          pageSize,
          totalRows,
          totalPages,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 批量执行查询
   */
  async executeBatch<T = any>(
    queries: Array<{ sql: string; context: MetadataContext }>,
    options: ExecutionOptions = {}
  ): Promise<Array<ExecutionResult<T>>> {
    const results: Array<ExecutionResult<T>> = [];

    for (const query of queries) {
      const result = await this.execute<T>(query.sql, query.context, options);
      results.push(result);

      // 如果某个查询失败且要求全部成功，则停止执行
      if (!result.success && options.timeout) {
        break;
      }
    }

    return results;
  }

  /**
   * 干运行（验证 SQL 但不实际执行）
   */
  async dryRun(
    sql: string,
    context: MetadataContext
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // 使用 EXPLAIN 验证 SQL
      const explainSQL = `EXPLAIN ${sql}`;
      const result = await this.execute(explainSQL, context, {
        timeout: 5000,
        enableCache: false,
      });

      return {
        valid: result.success,
        error: result.error,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || '未知错误',
      };
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 确保表名使用数据库前缀
   */
  private ensureDatabasePrefix(sql: string, context: MetadataContext): string {
    try {
      // 构建表名到数据库的映射
      const tableDbMap = new Map<string, string>();
      for (const table of context.tables) {
        tableDbMap.set(table.tableName, table.databaseName);
      }

      // 检查 SQL 是否已经包含数据库前缀
      const hasDatabasePrefix = context.tables.some(t =>
        sql.includes(`\`${t.databaseName}\`.\`${t.tableName}\``) ||
        sql.includes(`${t.databaseName}.${t.tableName}`)
      );

      // 如果已经有前缀，直接返回
      if (hasDatabasePrefix) {
        return sql;
      }

      // 否则，为每个表名添加数据库前缀
      let modifiedSQL = sql;
      for (const [tableName, databaseName] of tableDbMap.entries()) {
        // 匹配表名的正则表达式（带或不带反引号）
        const patterns = [
          new RegExp(`\\b${tableName}\\b`, 'g'),  // 无反引号
          new RegExp(`\`${tableName}\``, 'g')     // 带反引号
        ];

        for (const pattern of patterns) {
          modifiedSQL = modifiedSQL.replace(pattern, `\`${databaseName}\`.\`${tableName}\``);
        }
      }

      return modifiedSQL;
    } catch (error) {
      // 如果处理失败，返回原始 SQL
      console.warn('[QueryExecutor] Failed to add database prefix, using original SQL:', error);
      return sql;
    }
  }

  /**
   * 确保 SQL 有 LIMIT 子句
   */
  private ensureLimitClause(sql: string, maxRows: number): string {
    // 移除末尾的分号
    const trimmedSQL = sql.trim().replace(/;$/, '');

    // 检查是否已有 LIMIT
    if (/\bLIMIT\s+\d+/i.test(trimmedSQL)) {
      return trimmedSQL;
    }

    // 添加 LIMIT
    return `${trimmedSQL} LIMIT ${maxRows}`;
  }

  /**
   * 构建 COUNT 查询
   */
  private buildCountQuery(sql: string): string {
    // 移除末尾的分号和 LIMIT 子句
    let trimmedSQL = sql.trim().replace(/;$/, '');
    trimmedSQL = trimmedSQL.replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?/gi, '');

    // 包装为子查询
    return `SELECT COUNT(*) as total FROM (${trimmedSQL}) as count_query`;
  }

  /**
   * 添加分页子句
   */
  private addPaginationClause(
    sql: string,
    limit: number,
    offset: number
  ): string {
    // 移除末尾的分号和现有的 LIMIT
    let trimmedSQL = sql.trim().replace(/;$/, '');
    trimmedSQL = trimmedSQL.replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?/gi, '');

    return `${trimmedSQL} LIMIT ${limit} OFFSET ${offset}`;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(sql: string): string {
    const hash = crypto.createHash('md5').update(sql).digest('hex');
    return `query:result:${hash}`;
  }

  /**
   * 生成查询 ID
   */
  private generateQueryId(sql: string): string {
    return crypto.createHash('md5').update(sql).digest('hex').substring(0, 8);
  }

  /**
   * 标准化错误信息
   */
  private normalizeError(error: any): string {
    const message = error.message || String(error);

    // 常见错误的友好提示
    const errorPatterns: Array<{ pattern: RegExp; message: string }> = [
      { pattern: /Access denied/i, message: '数据库访问权限不足' },
      { pattern: /doesn't exist/i, message: '查询的表或字段不存在' },
      { pattern: /Syntax error/i, message: 'SQL 语法错误' },
      { pattern: /timeout|timed out/i, message: '查询超时，请优化查询条件或增加超时时间' },
      { pattern: /Unknown column/i, message: '未知的列名' },
      { pattern: /Unknown table/i, message: '未知的表名' },
      { pattern: /Connection refused/i, message: '无法连接到数据库' },
      { pattern: /Too many connections/i, message: '数据库连接数已满' },
      { pattern: /Deadlock/i, message: '发生死锁，请重试' },
      { pattern: /Lock wait timeout/i, message: '等待锁超时' },
    ];

    for (const { pattern, message: friendlyMessage } of errorPatterns) {
      if (pattern.test(message)) {
        return friendlyMessage;
      }
    }

    // 如果是 ExecutorError，直接返回消息
    if (error.name === 'ExecutorError') {
      return message;
    }

    // 其他错误
    return `查询执行失败: ${message}`;
  }

  /**
   * 获取查询统计信息
   */
  getStatistics(queryId: string): QueryStatistics | null {
    // TODO: 实现查询统计跟踪
    return null;
  }
}

// 导出单例
export const queryExecutor = new QueryExecutor();
