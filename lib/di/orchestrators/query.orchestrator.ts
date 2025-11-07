/**
 * QueryOrchestrator - 查询编排器
 *
 * 职责：
 * - 协调完整的查询处理流程
 * - 管理查询缓存和执行策略
 * - 提供自然语言查询和直接SQL执行
 * - 处理跨库查询和结果格式化
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../tokens';
import type { IntentRecognizer, QueryIntent } from '@/lib/nlp/intent-recognizer';
import type { EntityResolver } from '@/lib/nlp/entity-resolver';
import type { TimeParser } from '@/lib/nlp/time-parser';
import type { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import type { CrossDatabaseHandler } from '@/lib/sql/generator/cross-db-handler';
import type { QueryExecutor } from '@/lib/sql/executor/query-executor';
import type { ResultFormatter } from '@/lib/sql/executor/result-formatter';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import type { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import type { MetadataContext } from '@/lib/metadata/types';

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 是否启用缓存 */
  enableCache?: boolean;

  /** 最大返回行数 */
  maxRows?: number;

  /** 查询超时（毫秒） */
  timeout?: number;

  /** 是否只解释不执行 */
  explainOnly?: boolean;

  /** 会话 ID */
  sessionId?: string;
}

/**
 * 查询结果
 */
export interface QueryResult {
  /** 是否成功 */
  success: boolean;

  /** 查询数据 */
  data?: any[];

  /** 查询意图（用于审计日志） */
  intent?: QueryIntent;

  /** 元数据 */
  metadata?: {
    /** 生成的 SQL */
    generatedSQL: string;

    /** 查询解释 */
    explanation: string;

    /** 返回行数 */
    rowCount: number;

    /** 执行时间（毫秒） */
    executionTime: number;

    /** 是否来自缓存 */
    fromCache: boolean;

    /** 列信息 */
    columns: Array<{
      name: string;
      type: string;
    }>;

    /** 使用的数据库 */
    usedDatabases?: string[];

    /** 使用的表 */
    usedTables?: string[];
  };

  /** 性能指标 */
  performance?: {
    /** 意图识别耗时 */
    intentRecognitionTime: number;

    /** 元数据检索耗时 */
    metadataRetrievalTime: number;

    /** SQL 生成耗时 */
    sqlGenerationTime: number;

    /** 查询执行耗时 */
    queryExecutionTime: number;

    /** 总耗时 */
    totalTime: number;
  };

  /** 警告信息 */
  warnings?: string[];

  /** 优化建议 */
  suggestions?: Array<{
    type: string;
    message: string;
    impact: string;
  }>;

  /** 错误信息 */
  error?: string;
}

/**
 * 意图解释结果
 */
export interface IntentExplanation {
  /** 查询意图 */
  intent: QueryIntent;

  /** 相关的元数据上下文 */
  context: MetadataContext;

  /** 预期生成的 SQL 模式 */
  sqlPattern: string;

  /** 可能的优化建议 */
  suggestions: string[];
}

/**
 * QueryOrchestrator
 *
 * 查询编排器，协调查询生成和执行的完整流程
 */
@injectable()
export class QueryOrchestrator {
  constructor(
    @inject(DI_TOKENS.IntentRecognizer)
    private readonly intentRecognizer: IntentRecognizer,

    @inject(DI_TOKENS.EntityResolver)
    private readonly entityResolver: EntityResolver,

    @inject(DI_TOKENS.TimeParser)
    private readonly timeParser: TimeParser,

    @inject(DI_TOKENS.SQLGenerator)
    private readonly sqlGenerator: SQLGenerator,

    @inject(DI_TOKENS.CrossDatabaseHandler)
    private readonly crossDbHandler: CrossDatabaseHandler,

    @inject(DI_TOKENS.QueryExecutor)
    private readonly queryExecutor: QueryExecutor,

    @inject(DI_TOKENS.ResultFormatter)
    private readonly resultFormatter: ResultFormatter,

    @inject(DI_TOKENS.QueryCacheManager)
    private readonly cacheManager: QueryCacheManager,

    @inject(DI_TOKENS.MetadataRetriever)
    private readonly metadataRetriever: MetadataRetriever
  ) {}

  /**
   * 处理自然语言查询
   *
   * 完整流程：
   * 1. 意图识别
   * 2. 实体解析
   * 3. 元数据检索
   * 4. SQL 生成
   * 5. 查询执行
   * 6. 结果格式化
   *
   * @param query - 自然语言查询
   * @param options - 查询选项
   * @returns 查询结果
   */
  async processNaturalLanguageQuery(
    query: string,
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    try {
      console.log(`[QueryOrchestrator] Processing NL query: "${query}"`);

      // 如果启用缓存，先检查缓存
      if (options.enableCache !== false) {
        const cachedResult = await this.checkCache(query);
        if (cachedResult) {
          console.log(`[QueryOrchestrator] Cache hit for query`);
          return {
            ...cachedResult,
            performance: {
              ...cachedResult.performance!,
              totalTime: Date.now() - startTime,
            },
          };
        }
      }

      // Step 1: 意图识别
      const t1 = Date.now();
      const intent = await this.intentRecognizer.recognize(query);
      timings.intentRecognition = Date.now() - t1;
      console.log(`[QueryOrchestrator] Intent recognized: ${intent.type} (${timings.intentRecognition}ms)`);

      // Step 2: 实体解析和时间解析
      const t2 = Date.now();
      const resolvedIntent = await this.resolveEntities(intent, query);
      timings.entityResolution = Date.now() - t2;

      // Step 3: 元数据检索
      const t3 = Date.now();
      const context = await this.metadataRetriever.retrieveContext(resolvedIntent);
      timings.metadataRetrieval = Date.now() - t3;
      console.log(
        `[QueryOrchestrator] Metadata retrieved: ${context.tables.length} tables (${timings.metadataRetrieval}ms)`
      );

      // 检查是否找到相关表
      if (context.tables.length === 0) {
        return {
          success: false,
          intent: resolvedIntent,
          error: '未找到相关的数据表，请检查查询内容',
          performance: {
            intentRecognitionTime: timings.intentRecognition,
            metadataRetrievalTime: timings.metadataRetrieval,
            sqlGenerationTime: 0,
            queryExecutionTime: 0,
            totalTime: Date.now() - startTime,
          },
        };
      }

      // Step 4: SQL 生成
      const t4 = Date.now();
      const sqlResult = await this.sqlGenerator.generate(resolvedIntent, context);
      timings.sqlGeneration = Date.now() - t4;
      console.log(`[QueryOrchestrator] SQL generated (${timings.sqlGeneration}ms)`);

      // 如果只是解释查询，不执行
      if (options.explainOnly) {
        return {
          success: true,
          intent: resolvedIntent,
          metadata: {
            generatedSQL: sqlResult.sql,
            explanation: sqlResult.explanation,
            rowCount: 0,
            executionTime: 0,
            fromCache: false,
            columns: [],
            usedDatabases: Array.from(new Set(context.tables.map(t => t.databaseName))),
            usedTables: context.tables.map(t => t.tableName),
          },
          performance: {
            intentRecognitionTime: timings.intentRecognition,
            metadataRetrievalTime: timings.metadataRetrieval,
            sqlGenerationTime: timings.sqlGeneration,
            queryExecutionTime: 0,
            totalTime: Date.now() - startTime,
          },
        };
      }

      // Step 5: 执行查询
      const t5 = Date.now();
      const execResult = await this.queryExecutor.execute(
        sqlResult.sql,
        context,
        options
      );
      timings.queryExecution = Date.now() - t5;
      console.log(
        `[QueryOrchestrator] Query executed: ${execResult.success} (${timings.queryExecution}ms)`
      );

      if (!execResult.success) {
        return {
          success: false,
          intent: resolvedIntent,
          error: execResult.error || 'Query execution failed',
          metadata: {
            generatedSQL: sqlResult.sql,
            explanation: sqlResult.explanation,
            rowCount: 0,
            executionTime: timings.queryExecution,
            fromCache: false,
            columns: [],
          },
          performance: {
            intentRecognitionTime: timings.intentRecognition,
            metadataRetrievalTime: timings.metadataRetrieval,
            sqlGenerationTime: timings.sqlGeneration,
            queryExecutionTime: timings.queryExecution,
            totalTime: Date.now() - startTime,
          },
        };
      }

      // Step 6: 构建成功响应
      const result: QueryResult = {
        success: true,
        data: execResult.data,
        intent: resolvedIntent,
        metadata: {
          generatedSQL: sqlResult.sql,
          explanation: sqlResult.explanation,
          rowCount: execResult.rowCount,
          executionTime: timings.queryExecution,
          fromCache: execResult.fromCache || false,
          columns: execResult.metadata.columns,
          usedDatabases: Array.from(new Set(context.tables.map(t => t.databaseName))),
          usedTables: context.tables.map(t => t.tableName),
        },
        performance: {
          intentRecognitionTime: timings.intentRecognition,
          metadataRetrievalTime: timings.metadataRetrieval,
          sqlGenerationTime: timings.sqlGeneration,
          queryExecutionTime: timings.queryExecution,
          totalTime: Date.now() - startTime,
        },
      };

      // 缓存结果
      if (options.enableCache !== false && execResult.data) {
        await this.cacheResult(query, result);
      }

      return result;

    } catch (error) {
      console.error(`[QueryOrchestrator] Query processing failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        performance: {
          intentRecognitionTime: timings.intentRecognition || 0,
          metadataRetrievalTime: timings.metadataRetrieval || 0,
          sqlGenerationTime: timings.sqlGeneration || 0,
          queryExecutionTime: timings.queryExecution || 0,
          totalTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 直接执行 SQL 查询
   *
   * @param sql - SQL 查询语句
   * @param connectionId - 连接 ID
   * @param options - 查询选项
   * @returns 查询结果
   */
  async executeSQL(
    sql: string,
    connectionId: string,
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      console.log(`[QueryOrchestrator] Executing direct SQL on connection ${connectionId}`);

      // 检查缓存
      if (options.enableCache !== false) {
        const cacheKey = `sql:${connectionId}:${sql}`;
        const cached = await this.cacheManager.getResult(cacheKey);
        if (cached) {
          console.log(`[QueryOrchestrator] Cache hit for SQL query`);
          return {
            success: true,
            data: cached.data,
            metadata: {
              generatedSQL: sql,
              explanation: 'Direct SQL execution',
              rowCount: cached.data.length,
              executionTime: 0,
              fromCache: true,
              columns: cached.columns || [],
            },
            performance: {
              intentRecognitionTime: 0,
              metadataRetrievalTime: 0,
              sqlGenerationTime: 0,
              queryExecutionTime: 0,
              totalTime: Date.now() - startTime,
            },
          };
        }
      }

      // 构建简单的上下文
      const context: MetadataContext = {
        tables: [],
        relationships: [],
        columns: [],
      };

      // 执行查询
      const execResult = await this.queryExecutor.execute(sql, context, options);

      if (!execResult.success) {
        return {
          success: false,
          error: execResult.error || 'SQL execution failed',
          metadata: {
            generatedSQL: sql,
            explanation: 'Direct SQL execution',
            rowCount: 0,
            executionTime: Date.now() - startTime,
            fromCache: false,
            columns: [],
          },
          performance: {
            intentRecognitionTime: 0,
            metadataRetrievalTime: 0,
            sqlGenerationTime: 0,
            queryExecutionTime: Date.now() - startTime,
            totalTime: Date.now() - startTime,
          },
        };
      }

      const result: QueryResult = {
        success: true,
        data: execResult.data,
        metadata: {
          generatedSQL: sql,
          explanation: 'Direct SQL execution',
          rowCount: execResult.rowCount,
          executionTime: Date.now() - startTime,
          fromCache: false,
          columns: execResult.metadata.columns,
        },
        performance: {
          intentRecognitionTime: 0,
          metadataRetrievalTime: 0,
          sqlGenerationTime: 0,
          queryExecutionTime: Date.now() - startTime,
          totalTime: Date.now() - startTime,
        },
      };

      // 缓存结果
      if (options.enableCache !== false && execResult.data) {
        const cacheKey = `sql:${connectionId}:${sql}`;
        await this.cacheManager.setResult(cacheKey, {
          data: execResult.data,
          columns: execResult.metadata.columns,
        });
      }

      return result;

    } catch (error) {
      console.error(`[QueryOrchestrator] SQL execution failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        performance: {
          intentRecognitionTime: 0,
          metadataRetrievalTime: 0,
          sqlGenerationTime: 0,
          queryExecutionTime: 0,
          totalTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 解释查询意图（不执行）
   *
   * @param query - 自然语言查询
   * @returns 意图解释
   */
  async explainQuery(query: string): Promise<IntentExplanation> {
    try {
      console.log(`[QueryOrchestrator] Explaining query: "${query}"`);

      // 识别意图
      const intent = await this.intentRecognizer.recognize(query);

      // 解析实体
      const resolvedIntent = await this.resolveEntities(intent, query);

      // 获取元数据上下文
      const context = await this.metadataRetriever.retrieveContext(resolvedIntent);

      // 生成 SQL 模式说明
      const sqlPattern = this.generateSQLPattern(resolvedIntent, context);

      return {
        intent: resolvedIntent,
        context,
        sqlPattern,
        suggestions: this.generateSuggestions(resolvedIntent, context),
      };

    } catch (error) {
      console.error(`[QueryOrchestrator] Query explanation failed:`, error);
      throw error;
    }
  }

  /**
   * 解析实体和时间
   */
  private async resolveEntities(intent: QueryIntent, query: string): Promise<QueryIntent> {
    // 解析时间表达式
    if (intent.conditions) {
      for (const condition of intent.conditions) {
        if (condition.type === 'time') {
          const timeRange = await this.timeParser.parse(condition.value);
          if (timeRange) {
            condition.value = timeRange;
          }
        }
      }
    }

    // 解析实体
    const entities = await this.entityResolver.resolve(intent.entities, query);
    intent.entities = entities;

    return intent;
  }

  /**
   * 检查缓存
   */
  private async checkCache(query: string): Promise<QueryResult | null> {
    try {
      const cacheKey = `nlq:${query}`;
      const cached = await this.cacheManager.getResult(cacheKey);

      if (cached) {
        return {
          success: true,
          data: cached.data,
          metadata: {
            ...cached.metadata,
            fromCache: true,
          },
          performance: {
            intentRecognitionTime: 0,
            metadataRetrievalTime: 0,
            sqlGenerationTime: 0,
            queryExecutionTime: 0,
            totalTime: 0,
          },
        };
      }

      return null;
    } catch (error) {
      console.error(`[QueryOrchestrator] Cache check failed:`, error);
      return null;
    }
  }

  /**
   * 缓存查询结果
   */
  private async cacheResult(query: string, result: QueryResult): Promise<void> {
    try {
      const cacheKey = `nlq:${query}`;
      await this.cacheManager.setResult(cacheKey, {
        data: result.data,
        metadata: result.metadata,
      });
    } catch (error) {
      console.error(`[QueryOrchestrator] Cache write failed:`, error);
      // 不抛出错误，缓存失败不应影响正常流程
    }
  }

  /**
   * 生成 SQL 模式说明
   */
  private generateSQLPattern(intent: QueryIntent, context: MetadataContext): string {
    const tables = context.tables.map(t => t.tableName).join(', ');
    return `SELECT ... FROM ${tables} WHERE ... based on ${intent.type} intent`;
  }

  /**
   * 生成优化建议
   */
  private generateSuggestions(intent: QueryIntent, context: MetadataContext): string[] {
    const suggestions: string[] = [];

    if (context.tables.length > 5) {
      suggestions.push('查询涉及多个表，建议添加更具体的筛选条件');
    }

    if (context.relationships.length === 0 && context.tables.length > 1) {
      suggestions.push('表之间缺少明确的关联关系，可能需要手动指定连接条件');
    }

    return suggestions;
  }
}
