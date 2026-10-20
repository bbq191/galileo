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
import type { QueryDomainInferencer, QueryDomainInference } from '@/lib/nlp/query-domain-inferencer';
import type { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import type { CrossDatabaseHandler } from '@/lib/sql/generator/cross-db-handler';
import type { QueryExecutor } from '@/lib/sql/executor/query-executor';
import type { ResultFormatter } from '@/lib/sql/executor/result-formatter';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import type { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import type { MetadataContext } from '@/lib/metadata/types';
import type { SQLGenerationResult } from '@/lib/sql/generator/types';
import type { SQLGenerationPipeline } from '@/lib/sql/generator/pipeline/sql-generation-pipeline';
import type { SQLValidator } from '@/lib/sql/validator/sql-validator';
import type { UserPermissions } from '@/lib/sql/validator/types';
import { ExecutorError, ExecutorErrorType, type ExecutionResult } from '@/lib/sql/executor/types';
import { getContainer } from '../container';
import { isFeatureEnabled, getSqlValidatorMode } from '@/lib/feature-flags';
import { getDataPermissions, getDataScopeKey, type QueryUser } from '@/lib/auth/data-permissions';
import { buildBusinessRulesContext, type BusinessRulesContext } from '@/lib/business-rules/rules-context';
import { VerifiedQueryStore, renderVerifiedExamples, type VerifiedExamplesSection } from '@/lib/feedback/verified-queries';
import type { BusinessRulesEngine } from '@/lib/business-rules/business-rules-engine';

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

  /** 当前用户（决定数据访问权限与缓存隔离范围） */
  user?: QueryUser;

  /** 只在指定数据源中检索表 */
  dataSourceId?: number;
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

    /** 涉及的数据源 ID */
    dataSourceIds?: number[];

    /** 注入 Prompt 的业务规则（ENABLE_BUSINESS_RULES=true 时） */
    appliedBusinessRules?: BusinessRulesContext['applied'];

    /** 使用的列 */
    usedColumns?: string[];

    /** 直接执行的已验证查询 ID（ENABLE_VERIFIED_QUERIES=true 且问题完全相同时） */
    verifiedQueryId?: number;

    /** 作为示例注入 Prompt 的已验证查询 ID */
    verifiedExampleIds?: number[];
  };

  /** 性能指标 */
  performance?: {
    /** 意图识别耗时 */
    intentRecognitionTime: number;

    /** 业务域推断耗时 */
    domainInferenceTime?: number;

    /** 元数据检索耗时 */
    metadataRetrievalTime: number;

    /** SQL 生成耗时 */
    sqlGenerationTime: number;

    /** 验证耗时 */
    validationTime?: number;

    /** 查询执行耗时 */
    queryExecutionTime: number;

    /** 总耗时 */
    totalTime: number;
  };

  /** 业务域推断结果 */
  domainInference?: QueryDomainInference;

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

  /**
   * 错误类型
   * - validation_failed：SQL 未通过校验（SQL_VALIDATOR_MODE=enforce）
   * - cross_source_unsupported：查询涉及位于不同实例的多个数据源
   */
  errorCode?: 'validation_failed' | 'cross_source_unsupported';
}

/**
 * SQL 校验结论
 */
interface SQLValidationOutcome {
  /** 是否拒绝执行（仅 enforce 模式） */
  blocked: boolean;
  /** 校验是否通过（off 模式视为通过；校验器异常视为未通过） */
  passed: boolean;
  errors: string[];
  warnings: string[];
  suggestions: NonNullable<QueryResult['suggestions']>;
}

/**
 * 自然语言查询的结果缓存条目
 * 除执行结果外保存生成的 SQL 与意图，缓存命中时可如实展示 SQL 并记录审计日志
 */
interface CachedQueryEntry extends ExecutionResult {
  nlq: {
    generatedSQL: string;
    explanation: string;
    intent?: QueryIntent;
    usedDatabases?: string[];
    usedTables?: string[];
    dataSourceIds?: number[];
    appliedBusinessRules?: BusinessRulesContext['applied'];
    verifiedExampleIds?: number[];
    warnings?: string[];
    suggestions?: QueryResult['suggestions'];
  };
}

/** 追加到 SQL 生成 Prompt 的内容（业务规则、已验证示例），digest 参与 SQL 缓存 key */
interface PromptAppendix {
  promptSection: string;
  digest: string;
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

    @inject(DI_TOKENS.QueryDomainInferencer)
    private readonly queryDomainInferencer: QueryDomainInferencer,

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
    private readonly metadataRetriever: MetadataRetriever,

    @inject(DI_TOKENS.SQLValidator)
    private readonly sqlValidator: SQLValidator
  ) {}

  /** 6 阶段生成管道，仅在 ENABLE_SQL_PIPELINE=true 时按需解析，避免关闭时也构造全部阶段 */
  private pipeline?: SQLGenerationPipeline;

  /** 业务规则引擎，仅在 ENABLE_BUSINESS_RULES=true 时按需创建 */
  private businessRulesEngine?: BusinessRulesEngine;

  /** 已验证查询，仅在 ENABLE_VERIFIED_QUERIES=true 时按需创建 */
  private verifiedQueryStore?: VerifiedQueryStore;

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

    // 数据访问权限决定 SQL 校验范围，也决定能共享哪些缓存
    const permissions = getDataPermissions(options.user);
    const dataScope = getDataScopeKey(permissions);

    try {
      console.log(`[QueryOrchestrator] Processing NL query: "${query}"`);

      // 完全相同的问题已有管理员验证过的 SQL：直接使用，不调用 AI（优先于缓存，避免返回采纳前的结果）
      const verifiedResult = await this.tryVerifiedQuery(query, options, startTime);
      if (verifiedResult) {
        return verifiedResult;
      }

      // 如果启用缓存，先检查缓存
      if (options.enableCache !== false) {
        const cachedResult = await this.checkCache(query, dataScope, options.dataSourceId);
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

      // Step 1.5: 🆕 查询业务域推断
      const t1_5 = Date.now();
      const domainInference = await this.queryDomainInferencer.inferDomain(query);
      timings.domainInference = Date.now() - t1_5;

      if (domainInference) {
        console.log(
          `[QueryOrchestrator] Domain inferred: ${domainInference.domainName} (confidence: ${domainInference.confidence.toFixed(2)}, ${timings.domainInference}ms)`
        );
      } else {
        console.log(`[QueryOrchestrator] No domain could be inferred (${timings.domainInference}ms)`);
      }

      // Step 2: 实体解析和时间解析
      const t2 = Date.now();
      const resolvedIntent = await this.resolveEntities(intent, query);
      timings.entityResolution = Date.now() - t2;

      // Step 3: 🆕 元数据检索（传递业务域推断结果）
      const t3 = Date.now();
      const context = await this.metadataRetriever.retrieveContext(resolvedIntent, {
        domainInference: domainInference || undefined,
        dataSourceId: options.dataSourceId,
      });
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
            domainInferenceTime: timings.domainInference,
            metadataRetrievalTime: timings.metadataRetrieval,
            sqlGenerationTime: 0,
            queryExecutionTime: 0,
            totalTime: Date.now() - startTime,
          },
          domainInference: domainInference || undefined,
        };
      }

      const dataSourceIds = Array.from(
        new Set(context.tables.map(t => t.database?.sourceId).filter((id): id is number => id !== undefined))
      );

      // Step 3.5: 多数据源检查（在调用 AI 生成 SQL 之前拒绝无法执行的跨实例查询）
      try {
        await this.queryExecutor.resolveSource(context);
      } catch (error) {
        if (error instanceof ExecutorError && error.type === ExecutorErrorType.CROSS_SOURCE_UNSUPPORTED) {
          return {
            success: false,
            errorCode: 'cross_source_unsupported',
            intent: resolvedIntent,
            error: error.message,
            performance: {
              intentRecognitionTime: timings.intentRecognition,
              domainInferenceTime: timings.domainInference,
              metadataRetrievalTime: timings.metadataRetrieval,
              sqlGenerationTime: 0,
              queryExecutionTime: 0,
              totalTime: Date.now() - startTime,
            },
            domainInference: domainInference || undefined,
          };
        }
        throw error;
      }

      // Step 4: SQL 生成（可选注入业务规则）
      const t4 = Date.now();
      const businessRules = await this.buildBusinessRules(query, context);
      const verifiedExamples = await this.buildVerifiedExamples(query, context);
      const sqlResult = await this.generateSQL(
        resolvedIntent,
        context,
        mergePromptAppendix(businessRules, verifiedExamples)
      );
      timings.sqlGeneration = Date.now() - t4;
      console.log(`[QueryOrchestrator] SQL generated (${timings.sqlGeneration}ms)`);

      // Step 4.5: SQL 校验（按 SQL_VALIDATOR_MODE 记录或拦截）
      const t4_5 = Date.now();
      const validation = await this.validateSQL(sqlResult.sql, context, permissions, query);
      timings.validation = Date.now() - t4_5;

      if (validation.blocked) {
        return {
          success: false,
          errorCode: 'validation_failed',
          intent: resolvedIntent,
          error: `查询未通过安全校验：${validation.errors.join('；')}`,
          metadata: {
            generatedSQL: sqlResult.sql,
            explanation: sqlResult.explanation,
            rowCount: 0,
            executionTime: 0,
            fromCache: false,
            columns: [],
          },
          performance: {
            intentRecognitionTime: timings.intentRecognition,
            domainInferenceTime: timings.domainInference,
            metadataRetrievalTime: timings.metadataRetrieval,
            sqlGenerationTime: timings.sqlGeneration,
            validationTime: timings.validation,
            queryExecutionTime: 0,
            totalTime: Date.now() - startTime,
          },
          domainInference: domainInference || undefined,
        };
      }

      // 上下文提示（如分表数量超过展开上限）+ SQL 生成警告 + 校验警告
      const warnings = [...(context.warnings ?? []), ...(sqlResult.warnings ?? []), ...validation.warnings];

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
            dataSourceIds,
            appliedBusinessRules: businessRules?.applied,
            verifiedExampleIds: verifiedExamples?.ids,
          },
          performance: {
            intentRecognitionTime: timings.intentRecognition,
            domainInferenceTime: timings.domainInference,
            metadataRetrievalTime: timings.metadataRetrieval,
            sqlGenerationTime: timings.sqlGeneration,
            validationTime: timings.validation,
            queryExecutionTime: 0,
            totalTime: Date.now() - startTime,
          },
          domainInference: domainInference || undefined,
          warnings,
          suggestions: validation.suggestions,
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
          errorCode: execResult.errorType === ExecutorErrorType.CROSS_SOURCE_UNSUPPORTED
            ? 'cross_source_unsupported'
            : undefined,
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
            domainInferenceTime: timings.domainInference,
            metadataRetrievalTime: timings.metadataRetrieval,
            sqlGenerationTime: timings.sqlGeneration,
            queryExecutionTime: timings.queryExecution,
            totalTime: Date.now() - startTime,
          },
          domainInference: domainInference || undefined,
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
          dataSourceIds,
          appliedBusinessRules: businessRules?.applied,
          verifiedExampleIds: verifiedExamples?.ids,
        },
        performance: {
          intentRecognitionTime: timings.intentRecognition,
          domainInferenceTime: timings.domainInference,
          metadataRetrievalTime: timings.metadataRetrieval,
          sqlGenerationTime: timings.sqlGeneration,
          validationTime: timings.validation,
          queryExecutionTime: timings.queryExecution,
          totalTime: Date.now() - startTime,
        },
        domainInference: domainInference || undefined,
        warnings,
        suggestions: validation.suggestions,
      };

      // 缓存结果（未通过校验的结果不缓存，避免切换到 enforce 后仍从缓存返回）
      if (options.enableCache !== false && execResult.data && validation.passed) {
        await this.cacheResult(query, dataScope, options.dataSourceId, result);
      }

      return result;

    } catch (error) {
      console.error(`[QueryOrchestrator] Query processing failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        performance: {
          intentRecognitionTime: timings.intentRecognition || 0,
          domainInferenceTime: timings.domainInference || 0,
          metadataRetrievalTime: timings.metadataRetrieval || 0,
          sqlGenerationTime: timings.sqlGeneration || 0,
          queryExecutionTime: timings.queryExecution || 0,
          totalTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 执行用户编辑后的 SQL
   *
   * 与自然语言查询的区别：
   * - 元数据上下文按 SQL 中引用的表精确加载（MetadataRetriever.retrieveContextForSQL）
   * - SQL 校验始终使用 enforce 模式：这是用户直接输入的 SQL，不受 SQL_VALIDATOR_MODE 影响
   * - 不读写自然语言结果缓存
   */
  async executeUserSQL(
    sql: string,
    options: QueryOptions & { dataSourceIds?: number[] } = {}
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const permissions = getDataPermissions(options.user);
    const performance = (extra: Partial<NonNullable<QueryResult['performance']>> = {}) => ({
      intentRecognitionTime: 0,
      metadataRetrievalTime: 0,
      sqlGenerationTime: 0,
      queryExecutionTime: 0,
      ...extra,
      totalTime: Date.now() - startTime,
    });
    const baseMetadata = {
      generatedSQL: sql,
      explanation: '用户编辑的 SQL',
      rowCount: 0,
      executionTime: 0,
      fromCache: false,
      columns: [],
    };

    let context: MetadataContext;
    try {
      context = await this.metadataRetriever.retrieveContextForSQL(sql, options.dataSourceIds);
    } catch (error) {
      return {
        success: false,
        errorCode: 'validation_failed',
        error: error instanceof Error ? error.message : '无法加载 SQL 涉及的元数据',
        metadata: baseMetadata,
        performance: performance(),
      };
    }

    const intent: QueryIntent = {
      type: 'select',
      entities: {
        databases: Array.from(new Set(context.tables.map(t => t.databaseName))),
        tables: context.tables.map(t => t.tableName),
      },
      conditions: {},
    };
    const dataSourceIds = Array.from(
      new Set(context.tables.map(t => t.database?.sourceId).filter((id): id is number => id !== undefined))
    );
    const metadata = {
      ...baseMetadata,
      usedDatabases: intent.entities.databases,
      usedTables: intent.entities.tables,
      dataSourceIds,
    };

    const tValidation = Date.now();
    const validation = await this.validateSQL(sql, context, permissions, sql, 'enforce');
    const validationTime = Date.now() - tValidation;
    if (validation.blocked) {
      return {
        success: false,
        errorCode: 'validation_failed',
        intent,
        error: `查询未通过安全校验：${validation.errors.join('；')}`,
        metadata,
        performance: performance({ validationTime }),
      };
    }

    const tExecution = Date.now();
    const execResult = await this.queryExecutor.execute(sql, context, options);
    const queryExecutionTime = Date.now() - tExecution;

    if (!execResult.success) {
      return {
        success: false,
        errorCode: execResult.errorType === ExecutorErrorType.CROSS_SOURCE_UNSUPPORTED
          ? 'cross_source_unsupported'
          : undefined,
        intent,
        error: execResult.error || 'SQL execution failed',
        metadata,
        performance: performance({ validationTime, queryExecutionTime }),
      };
    }

    return {
      success: true,
      data: execResult.data,
      intent,
      metadata: {
        ...metadata,
        rowCount: execResult.rowCount,
        executionTime: queryExecutionTime,
        fromCache: execResult.fromCache || false,
        columns: execResult.metadata.columns,
      },
      warnings: validation.warnings,
      suggestions: validation.suggestions,
      performance: performance({ validationTime, queryExecutionTime }),
    };
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
   * 生成 SQL：ENABLE_SQL_PIPELINE=true 时使用 6 阶段管道，否则使用 SQLGenerator
   */
  private async generateSQL(
    intent: QueryIntent,
    context: MetadataContext,
    appendix: PromptAppendix | null
  ): Promise<SQLGenerationResult> {
    if (!isFeatureEnabled('sqlPipeline')) {
      return this.sqlGenerator.generate(intent, context, {
        promptAppendix: appendix?.promptSection,
        promptAppendixDigest: appendix?.digest,
      });
    }

    this.pipeline ??= getContainer().resolve<SQLGenerationPipeline>(DI_TOKENS.SQLGenerationPipeline);
    // 管道内置的 Validator 阶段会无条件拦截且不了解用户权限，校验统一交给 validateSQL
    const { result } = await this.pipeline.generate(intent, context, {}, { disabledStages: ['Validator'] });
    return result;
  }

  /**
   * 挑选可应用的业务规则（ENABLE_BUSINESS_RULES=true 时）
   *
   * 日志前缀 [BusinessRules]，记录每次实际注入的规则，便于评估对生成质量的影响。
   * 任何异常都按「无规则」继续生成，不影响查询。
   */
  private async buildBusinessRules(
    query: string,
    context: MetadataContext
  ): Promise<BusinessRulesContext | null> {
    if (!isFeatureEnabled('businessRules')) {
      return null;
    }
    if (isFeatureEnabled('sqlPipeline')) {
      console.warn('[BusinessRules] ENABLE_SQL_PIPELINE 已开启，业务规则仅作用于 SQLGenerator，本次未注入');
      return null;
    }

    try {
      if (!this.businessRulesEngine) {
        // 按需加载：该模块导入时会初始化 Prisma 与 Redis 客户端
        const { BusinessRulesEngine } = require('@/lib/business-rules/business-rules-engine');
        this.businessRulesEngine = new BusinessRulesEngine() as BusinessRulesEngine;
      }

      const rules = await buildBusinessRulesContext(this.businessRulesEngine, query, context);
      if (rules) {
        console.info('[BusinessRules]', JSON.stringify({ query, applied: rules.applied }));
        this.businessRulesEngine.recordUsage(rules.appliedIds);
      }
      return rules;
    } catch (error) {
      console.error('[BusinessRules] 构建业务规则失败，按无规则生成:', error);
      return null;
    }
  }

  private getVerifiedQueryStore(): VerifiedQueryStore {
    this.verifiedQueryStore ??= new VerifiedQueryStore(getContainer().resolve(DI_TOKENS.PrismaClient));
    return this.verifiedQueryStore;
  }

  /**
   * 完全相同的问题直接执行已验证的 SQL（ENABLE_VERIFIED_QUERIES=true 时）
   *
   * SQL 按编辑 SQL 的方式执行（enforce 校验）；执行失败或出现异常时返回 null，按正常流程生成。
   * 只预览时返回已验证的 SQL，不执行。日志前缀 [VerifiedQuery]。
   */
  private async tryVerifiedQuery(
    query: string,
    options: QueryOptions,
    startTime: number
  ): Promise<QueryResult | null> {
    if (!isFeatureEnabled('verifiedQueries')) {
      return null;
    }

    try {
      const store = this.getVerifiedQueryStore();
      const verified = await store.findExact(query, options.dataSourceId);
      if (!verified) {
        return null;
      }
      const explanation = `已验证的查询：「${verified.question}」的 SQL 已由管理员确认`;

      if (options.explainOnly) {
        return {
          success: true,
          intent: { type: 'select', entities: {}, conditions: {} },
          metadata: {
            generatedSQL: verified.sql,
            explanation,
            rowCount: 0,
            executionTime: 0,
            fromCache: false,
            columns: [],
            dataSourceIds: verified.dataSourceIds,
            verifiedQueryId: verified.id,
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

      const result = await this.executeUserSQL(verified.sql, { ...options, dataSourceIds: verified.dataSourceIds });
      if (!result.success || !result.metadata) {
        console.warn(`[VerifiedQuery] #${verified.id} 执行失败，按正常流程生成：${result.error}`);
        return null;
      }

      console.info('[VerifiedQuery]', JSON.stringify({ query, verifiedQueryId: verified.id }));
      await store.recordHit([verified.id]);
      return {
        ...result,
        metadata: { ...result.metadata, explanation, verifiedQueryId: verified.id },
      };
    } catch (error) {
      console.error('[VerifiedQuery] 查找已验证查询失败，按正常流程生成:', error);
      return null;
    }
  }

  /**
   * 相似的已验证查询作为 few-shot 示例（ENABLE_VERIFIED_QUERIES=true 时，仅作用于 SQLGenerator）
   */
  private async buildVerifiedExamples(
    query: string,
    context: MetadataContext
  ): Promise<VerifiedExamplesSection | null> {
    if (!isFeatureEnabled('verifiedQueries') || isFeatureEnabled('sqlPipeline')) {
      return null;
    }

    try {
      const store = this.getVerifiedQueryStore();
      const section = renderVerifiedExamples(await store.findSimilar(query, context));
      if (section) {
        console.info('[VerifiedQuery]', JSON.stringify({ query, examples: section.ids }));
        await store.recordHit(section.ids);
      }
      return section;
    } catch (error) {
      console.error('[VerifiedQuery] 查找相似示例失败，按无示例生成:', error);
      return null;
    }
  }

  /**
   * 执行 SQLValidator（安全、权限、语义、性能分析）
   *
   * shadow 模式只记录日志，日志前缀 [SQLValidator]，wouldBlock=true 表示 enforce 模式下会被拦截
   */
  private async validateSQL(
    sql: string,
    context: MetadataContext,
    permissions: UserPermissions,
    query: string,
    mode = getSqlValidatorMode()
  ): Promise<SQLValidationOutcome> {
    if (mode === 'off') {
      return { blocked: false, passed: true, errors: [], warnings: [], suggestions: [] };
    }

    try {
      const result = await this.sqlValidator.validate(sql, context, permissions);
      const errors = result.errors.map((e) => e.message);
      const wouldBlock = !result.isValid;

      console.info('[SQLValidator]', JSON.stringify({
        mode,
        wouldBlock,
        errors,
        userId: permissions.userId,
        query,
        sql: sql.substring(0, 500),
      }));

      return {
        blocked: mode === 'enforce' && wouldBlock,
        passed: !wouldBlock,
        errors,
        warnings: result.warnings.map((w) => w.message),
        suggestions: result.optimizationSuggestions.map(({ type, message, impact }) => ({ type, message, impact })),
      };
    } catch (error) {
      console.error('[SQLValidator] 校验异常:', error);
      // enforce 模式下无法确认安全性时拒绝执行
      return {
        blocked: mode === 'enforce',
        passed: false,
        errors: ['SQL 校验异常，请稍后重试'],
        warnings: [],
        suggestions: [],
      };
    }
  }

  /**
   * 解析实体和时间
   */
  private async resolveEntities(intent: QueryIntent, query: string): Promise<QueryIntent> {
    // 解析时间表达式
    if (intent.conditions?.filters) {
      for (const filter of intent.conditions.filters) {
        if ((filter as any).type === 'time') {
          const timeRange = await this.timeParser.parse(filter.value);
          if (timeRange) {
            filter.value = timeRange;
          }
        }
      }
    }

    // 解析实体 - EntityResolver.resolve 方法可能不存在,暂时跳过
    // const entities = await this.entityResolver.resolve(intent.entities, query);
    // intent.entities = entities;

    return intent;
  }

  /**
   * 结果缓存 key：数据可见范围不同的用户不共享缓存
   */
  private resultCacheKey(query: string, dataScope: string, dataSourceId?: number): string {
    // 开关切换后不复用另一种模式下生成的结果
    const rules = isFeatureEnabled('businessRules') ? 'on' : 'off';
    const verified = isFeatureEnabled('verifiedQueries') ? 'on' : 'off';
    return `nlq:${dataScope}:src=${dataSourceId ?? 'any'}:br=${rules}:vq=${verified}:${query}`;
  }

  /**
   * 检查缓存
   */
  private async checkCache(
    query: string,
    dataScope: string,
    dataSourceId?: number
  ): Promise<QueryResult | null> {
    try {
      const cached = (await this.cacheManager.getResult(
        this.resultCacheKey(query, dataScope, dataSourceId)
      )) as CachedQueryEntry | null;

      // 缺少 nlq 字段的条目无法还原 SQL 与意图，按未命中处理
      if (!cached?.nlq) {
        return null;
      }

      return {
        success: true,
        data: cached.data,
        intent: cached.nlq.intent,
        metadata: {
          generatedSQL: cached.nlq.generatedSQL,
          explanation: cached.nlq.explanation,
          rowCount: cached.rowCount,
          executionTime: cached.executionTime,
          fromCache: true,
          columns: cached.metadata?.columns.map(c => ({ name: c.name, type: c.type })) || [],
          usedDatabases: cached.nlq.usedDatabases,
          usedTables: cached.nlq.usedTables,
          dataSourceIds: cached.nlq.dataSourceIds,
          appliedBusinessRules: cached.nlq.appliedBusinessRules,
          verifiedExampleIds: cached.nlq.verifiedExampleIds,
        },
        warnings: cached.nlq.warnings,
        suggestions: cached.nlq.suggestions,
        performance: {
          intentRecognitionTime: 0,
          metadataRetrievalTime: 0,
          sqlGenerationTime: 0,
          queryExecutionTime: 0,
          totalTime: 0,
        },
      };
    } catch (error) {
      console.error(`[QueryOrchestrator] Cache check failed:`, error);
      return null;
    }
  }

  /**
   * 缓存查询结果
   */
  private async cacheResult(
    query: string,
    dataScope: string,
    dataSourceId: number | undefined,
    result: QueryResult
  ): Promise<void> {
    try {
      if (!result.metadata || !result.data) {
        return; // 没有元数据或数据时不缓存
      }
      const entry: CachedQueryEntry = {
        success: result.success,
        data: result.data,
        executionTime: result.metadata.executionTime,
        rowCount: result.metadata.rowCount,
        fromCache: false,
        metadata: {
          columns: result.metadata.columns.map(c => ({
            name: c.name,
            type: c.type,
          })),
        },
        nlq: {
          generatedSQL: result.metadata.generatedSQL,
          explanation: result.metadata.explanation,
          intent: result.intent,
          usedDatabases: result.metadata.usedDatabases,
          usedTables: result.metadata.usedTables,
          dataSourceIds: result.metadata.dataSourceIds,
          appliedBusinessRules: result.metadata.appliedBusinessRules,
          verifiedExampleIds: result.metadata.verifiedExampleIds,
          warnings: result.warnings,
          suggestions: result.suggestions,
        },
      };
      await this.cacheManager.setResult(this.resultCacheKey(query, dataScope, dataSourceId), entry);
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

function mergePromptAppendix(...parts: Array<PromptAppendix | null>): PromptAppendix | null {
  const present = parts.filter((p): p is PromptAppendix => !!p);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];
  return {
    promptSection: present.map((p) => p.promptSection).join('\n'),
    digest: present.map((p) => p.digest).join(':'),
  };
}
