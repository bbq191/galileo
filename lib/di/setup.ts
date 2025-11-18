/**
 * DI 容器初始化和服务注册
 * 在应用启动时调用此文件以设置所有依赖注入
 */

import 'reflect-metadata';
import { initializeContainer, getContainer, registerSingleton } from './container';
import { DI_TOKENS } from './tokens';

/**
 * 设置所有服务的依赖注入
 */
export function setupDependencyInjection(): void {
  // 初始化容器（包括 PrismaClient）
  const container = initializeContainer({
    debug: process.env.NODE_ENV === 'development',
  });

  // ==================== Phase 2.0: 核心服务 ====================

  // 注册 Redis 客户端
  const { createRedisClient } = require('./factories/redis.factory');
  registerSingleton(DI_TOKENS.RedisClient, undefined, () => createRedisClient());

  // 注册数据库服务
  const { DatabaseService } = require('./services/database.service');
  registerSingleton(DI_TOKENS.DatabaseService, DatabaseService);

  // 注册缓存服务
  const { CacheService } = require('./services/cache.service');
  registerSingleton(DI_TOKENS.CacheService, CacheService);

  // ==================== Phase 2.1: 扩展服务 ====================

  // 注册 ConnectionPool 工厂
  const { ConnectionPoolFactory } = require('./factories/connection-pool.factory');
  registerSingleton(DI_TOKENS.ConnectionPoolFactory, ConnectionPoolFactory);

  // 注册 CacheBreakthroughGuard（必须在 MultiLevelCache 之前）
  const { CacheBreakthroughGuard } = require('@/lib/cache/cache-breakthrough-guard');
  registerSingleton(DI_TOKENS.CacheBreakthroughGuard, CacheBreakthroughGuard);

  // 注册 MultiLevelCache
  const { MultiLevelCache } = require('@/lib/cache/multi-level-cache');
  registerSingleton(DI_TOKENS.MultiLevelCache, MultiLevelCache);

  // 启动 MultiLevelCache 清理服务
  const multiLevelCache = container.resolve<any>(DI_TOKENS.MultiLevelCache);
  multiLevelCache.startCleanup();

  // 注册 ConnectionManager
  const { ConnectionManager } = require('@/lib/database/connection-manager');
  registerSingleton(DI_TOKENS.ConnectionManager, ConnectionManager);

  // 启动 ConnectionManager 生命周期服务
  const connectionManager = container.resolve<any>(DI_TOKENS.ConnectionManager);
  connectionManager.start();

  // 注册 QueryCacheManager
  const { QueryCacheManager } = require('@/lib/cache/query-cache-manager');
  registerSingleton(DI_TOKENS.QueryCacheManager, QueryCacheManager);

  // 注册 CacheInvalidationService
  const { CacheInvalidationService } = require('@/lib/cache/cache-invalidation');
  registerSingleton(DI_TOKENS.CacheInvalidationService, CacheInvalidationService);

  // 注册 SemanticCacheStats
  const { SemanticCacheStats } = require('@/lib/cache/semantic-cache-stats');
  registerSingleton(DI_TOKENS.SemanticCacheStats, SemanticCacheStats);

  // 注意：SemanticCacheManager 依赖 EmbeddingGenerator，需要延后注册（移到 Phase 2.2）

  // 注册 AuditLogger
  const { AuditLogger } = require('@/lib/audit/audit-logger');
  registerSingleton(DI_TOKENS.AuditLogger, AuditLogger);

  // 注册 WarmupAnalyzer（依赖 AuditLogger 和 PrismaClient）
  const { WarmupAnalyzer } = require('@/lib/cache/warmup/warmup-analyzer');
  registerSingleton(DI_TOKENS.WarmupAnalyzer, WarmupAnalyzer);

  // 注意：Phase 4 统计服务依赖 QueryStatisticsTracker，需要延后注册（移到 Phase 2.3 之后）

  // ==================== Phase 2.2: AI 和元数据服务 ====================

  // 注册 DeepseekClient
  const { createDeepseekClient } = require('./factories/deepseek.factory');
  registerSingleton(DI_TOKENS.DeepseekClient, undefined, () => createDeepseekClient());

  // 注册 EmbeddingGenerator（依赖 DeepseekClient）
  const { EmbeddingGenerator } = require('@/lib/vector/embedding-generator');
  const { embeddingConfig } = require('@/lib/ai/config');
  registerSingleton(DI_TOKENS.EmbeddingGenerator, undefined, () => {
    const deepseekClient = container.resolve<any>(DI_TOKENS.DeepseekClient);
    return new EmbeddingGenerator(
      {
        model: embeddingConfig.modelType,
        batchSize: embeddingConfig.batchSize,
      },
      deepseekClient
    );
  });

  // 注册 SemanticCacheManager（依赖 EmbeddingGenerator 和 Redis）
  const { SemanticCacheManager } = require('@/lib/cache/semantic-cache-manager');
  registerSingleton(DI_TOKENS.SemanticCacheManager, SemanticCacheManager);

  // 初始化 SemanticCacheManager
  const semanticCacheManager = container.resolve<any>(DI_TOKENS.SemanticCacheManager);
  semanticCacheManager.initialize().catch((error: any) => {
    console.error('[DI] SemanticCacheManager initialization failed:', error);
  });

  // 注册 VectorSearchService（依赖 EmbeddingGenerator 和 Redis）
  const { VectorSearchService } = require('@/lib/vector/vector-search-service');
  registerSingleton(DI_TOKENS.VectorSearchService, undefined, () => {
    const redis = container.resolve<any>(DI_TOKENS.RedisClient);
    return new VectorSearchService({
      enableRedis: !!redis,
      redisConfig: redis
        ? {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
          }
        : undefined,
      dimension: embeddingConfig.dimension,
    });
  });

  // 初始化 VectorSearchService
  const vectorSearchService = container.resolve<any>(DI_TOKENS.VectorSearchService);
  vectorSearchService.initialize().catch((error: any) => {
    console.error('[DI] VectorSearchService initialization failed:', error);
  });

  // 注册 PromptCacheManager
  const { PromptCacheManager } = require('@/lib/ai/prompt-cache-manager');
  registerSingleton(DI_TOKENS.PromptCacheManager, PromptCacheManager);

  // 初始化 PromptCacheManager
  const promptCacheManager = container.resolve<any>(DI_TOKENS.PromptCacheManager);
  promptCacheManager.initialize().catch((error: any) => {
    console.error('[DI] PromptCacheManager initialization failed:', error);
  });

  // 注册 AICostTracker
  const { AICostTracker } = require('@/lib/ai/ai-cost-tracker');
  registerSingleton(DI_TOKENS.AICostTracker, AICostTracker);

  // 注册 SmartBatchProcessor
  const { SmartBatchProcessor } = require('@/lib/ai/smart-batch-processor');
  registerSingleton(DI_TOKENS.SmartBatchProcessor, SmartBatchProcessor);

  // 注册 BatchProcessor
  const { BatchProcessor } = require('@/lib/ai/batch-processor');
  registerSingleton(DI_TOKENS.BatchProcessor, BatchProcessor);

  // 注册 RuleBasedAnnotator
  const { RuleBasedAnnotator } = require('@/lib/ai/rules/naming-rules');
  registerSingleton(DI_TOKENS.RuleBasedAnnotator, RuleBasedAnnotator);

  // 注册 SemanticAnnotator
  const { SemanticAnnotator } = require('@/lib/ai/semantic-annotator');
  registerSingleton(DI_TOKENS.SemanticAnnotator, SemanticAnnotator);

  // 注册元数据仓储（拆分后的子仓储）
  const { DatabaseMetadataRepository } = require('@/lib/metadata/storage/database-metadata.repository');
  const { TableMetadataRepository } = require('@/lib/metadata/storage/table-metadata.repository');
  const { ColumnMetadataRepository } = require('@/lib/metadata/storage/column-metadata.repository');
  const { RelationshipRepository } = require('@/lib/metadata/storage/relationship.repository');
  const { MetadataSearchRepository } = require('@/lib/metadata/storage/metadata-search.repository');

  registerSingleton(DI_TOKENS.DatabaseMetadataRepository, DatabaseMetadataRepository);
  registerSingleton(DI_TOKENS.TableMetadataRepository, TableMetadataRepository);
  registerSingleton(DI_TOKENS.ColumnMetadataRepository, ColumnMetadataRepository);
  registerSingleton(DI_TOKENS.RelationshipRepository, RelationshipRepository);
  registerSingleton(DI_TOKENS.MetadataSearchRepository, MetadataSearchRepository);

  // 注册 MetadataRepository（聚合类，依赖上述子仓储）
  const { MetadataRepository } = require('@/lib/metadata/storage/metadata-repository');
  registerSingleton(DI_TOKENS.MetadataRepository, MetadataRepository);

  // 注册 MetadataRetriever
  const { MetadataRetriever } = require('@/lib/metadata/retrieval/metadata-retriever');
  registerSingleton(DI_TOKENS.MetadataRetriever, MetadataRetriever);

  // 注册 MetadataSyncService
  const { MetadataSyncService } = require('@/lib/metadata/sync/metadata-sync-service');
  registerSingleton(DI_TOKENS.MetadataSyncService, MetadataSyncService);

  // ==================== Phase 2.3: SQL 处理服务 ====================

  // 注册 ResultFormatter
  const { ResultFormatter } = require('@/lib/sql/executor/result-formatter');
  registerSingleton(DI_TOKENS.ResultFormatter, ResultFormatter);

  // 注册 TimeParser
  const { TimeParser } = require('@/lib/nlp/time-parser');
  registerSingleton(DI_TOKENS.TimeParser, TimeParser);

  // 注册 EntityResolver
  const { EntityResolver } = require('@/lib/nlp/entity-resolver');
  registerSingleton(DI_TOKENS.EntityResolver, EntityResolver);

  // 注册 CrossDatabaseHandler
  const { CrossDatabaseHandler } = require('@/lib/sql/generator/cross-db-handler');
  registerSingleton(DI_TOKENS.CrossDatabaseHandler, CrossDatabaseHandler);

  // 注册 IntentRecognizer
  const { IntentRecognizer } = require('@/lib/nlp/intent-recognizer');
  registerSingleton(DI_TOKENS.IntentRecognizer, IntentRecognizer);

  // 注册 SQLGenerator
  const { SQLGenerator } = require('@/lib/sql/generator/sql-generator');
  registerSingleton(DI_TOKENS.SQLGenerator, SQLGenerator);

  // 注册 QueryStatisticsTracker（使用工厂函数避免 config 参数注入问题）
  const { QueryStatisticsTracker } = require('@/lib/sql/executor/query-statistics-tracker');
  registerSingleton(DI_TOKENS.QueryStatisticsTracker, undefined, () => new QueryStatisticsTracker());

  // 注册 QueryExecutor
  const { QueryExecutor } = require('@/lib/sql/executor/query-executor');
  registerSingleton(DI_TOKENS.QueryExecutor, QueryExecutor);

  // 注册 SQLValidator
  const { SQLValidator } = require('@/lib/sql/validator/sql-validator');
  registerSingleton(DI_TOKENS.SQLValidator, SQLValidator);

  // 注册 SQLAutoFixer
  const { SQLAutoFixer } = require('@/lib/sql/quality/sql-auto-fixer');
  registerSingleton(DI_TOKENS.SQLAutoFixer, SQLAutoFixer);

  // ==================== Phase 4: 统计服务（依赖 QueryStatisticsTracker）====================

  // 注册 StatisticsPersistenceService（使用工厂函数避免 config 参数注入问题）
  const { StatisticsPersistenceService } = require('@/lib/statistics/statistics-persistence.service');
  registerSingleton(DI_TOKENS.StatisticsPersistenceService, undefined, () => {
    const redis = container.resolve<any>(DI_TOKENS.RedisClient);
    const queryStatsTracker = container.resolve<any>(DI_TOKENS.QueryStatisticsTracker);
    const queryCacheManager = container.resolve<any>(DI_TOKENS.QueryCacheManager);
    return new StatisticsPersistenceService(redis, queryStatsTracker, queryCacheManager);
  });

  // 启动持久化服务
  const statisticsPersistence = container.resolve<any>(DI_TOKENS.StatisticsPersistenceService);
  statisticsPersistence.start();

  // 注册 StatisticsAggregationService
  const { StatisticsAggregationService } = require('@/lib/statistics/statistics-aggregation.service');
  registerSingleton(DI_TOKENS.StatisticsAggregationService, StatisticsAggregationService);

  // ==================== Phase 2.4: SQL 生成管道 ====================

  // 注册管道阶段
  const { TemplateMatcher } = require('@/lib/sql/generator/pipeline/stages/template-matcher-stage');
  const { PromptCacheChecker } = require('@/lib/sql/generator/pipeline/stages/prompt-cache-checker-stage');
  const { SQLCacheChecker } = require('@/lib/sql/generator/pipeline/stages/sql-cache-checker-stage');
  const { AIGenerator } = require('@/lib/sql/generator/pipeline/stages/ai-generator-stage');
  const { QualityEnhancer } = require('@/lib/sql/generator/pipeline/stages/quality-enhancer-stage');
  const { Validator } = require('@/lib/sql/generator/pipeline/stages/validator-stage');

  registerSingleton(DI_TOKENS.TemplateMatcher, TemplateMatcher);
  registerSingleton(DI_TOKENS.PromptCacheChecker, PromptCacheChecker);
  registerSingleton(DI_TOKENS.SQLCacheChecker, SQLCacheChecker);
  registerSingleton(DI_TOKENS.AIGenerator, AIGenerator);
  registerSingleton(DI_TOKENS.QualityEnhancer, QualityEnhancer);
  registerSingleton(DI_TOKENS.Validator, Validator);

  // 注册主管道编排器（依赖所有阶段）
  const { SQLGenerationPipeline } = require('@/lib/sql/generator/pipeline/sql-generation-pipeline');
  registerSingleton(DI_TOKENS.SQLGenerationPipeline, SQLGenerationPipeline);

  // ==================== Phase 3: 服务编排层 ====================

  // 注册 MetadataOrchestrator
  const { MetadataOrchestrator } = require('./orchestrators/metadata.orchestrator');
  registerSingleton(DI_TOKENS.MetadataOrchestrator, MetadataOrchestrator);

  // 注册 QueryOrchestrator
  const { QueryOrchestrator } = require('./orchestrators/query.orchestrator');
  registerSingleton(DI_TOKENS.QueryOrchestrator, QueryOrchestrator);

  // 注册 AuditOrchestrator
  const { AuditOrchestrator } = require('./orchestrators/audit.orchestrator');
  registerSingleton(DI_TOKENS.AuditOrchestrator, AuditOrchestrator);

  // 注册数据源管理子服务
  const { DataSourceLifecycleService } = require('./orchestrators/datasource/datasource-lifecycle.service');
  const { DataSourceConnectionService } = require('./orchestrators/datasource/datasource-connection.service');
  const { DataSourceSyncService } = require('./orchestrators/datasource/datasource-sync.service');
  const { DataSourceQueryService } = require('./orchestrators/datasource/datasource-query.service');

  registerSingleton(DI_TOKENS.DataSourceLifecycleService, DataSourceLifecycleService);
  registerSingleton(DI_TOKENS.DataSourceConnectionService, DataSourceConnectionService);
  registerSingleton(DI_TOKENS.DataSourceSyncService, DataSourceSyncService);
  registerSingleton(DI_TOKENS.DataSourceQueryService, DataSourceQueryService);

  // 注册 DataSourceOrchestrator（聚合类，依赖上述子服务）
  const { DataSourceOrchestrator } = require('./orchestrators/datasource.orchestrator');
  registerSingleton(DI_TOKENS.DataSourceOrchestrator, DataSourceOrchestrator);

  // 注册 CacheWarmer（CacheOrchestrator 依赖）
  const { CacheWarmer } = require('@/lib/cache/cache-warmer');
  registerSingleton(DI_TOKENS.CacheWarmer, CacheWarmer);

  // 注册 CacheOrchestrator
  const { CacheOrchestrator } = require('./orchestrators/cache.orchestrator');
  registerSingleton(DI_TOKENS.CacheOrchestrator, CacheOrchestrator);

  // 注册关系管理子服务
  const { RelationshipInferenceService } = require('./orchestrators/relationship/relationship-inference.service');
  const { RelationshipVerificationService } = require('./orchestrators/relationship/relationship-verification.service');
  const { RelationshipGraphService } = require('./orchestrators/relationship/relationship-graph.service');
  const { RelationshipStatisticsService } = require('./orchestrators/relationship/relationship-statistics.service');

  registerSingleton(DI_TOKENS.RelationshipInferenceService, RelationshipInferenceService);
  registerSingleton(DI_TOKENS.RelationshipVerificationService, RelationshipVerificationService);
  registerSingleton(DI_TOKENS.RelationshipGraphService, RelationshipGraphService);
  registerSingleton(DI_TOKENS.RelationshipStatisticsService, RelationshipStatisticsService);

  // 注册 RelationshipOrchestrator（聚合类，依赖上述子服务）
  const { RelationshipOrchestrator } = require('./orchestrators/relationship.orchestrator');
  registerSingleton(DI_TOKENS.RelationshipOrchestrator, RelationshipOrchestrator);

  console.log('[DI] Dependency injection setup completed');
  console.log('[DI] Phase 2.1 services registered: ConnectionPoolFactory, CacheBreakthroughGuard, MultiLevelCache, ConnectionManager, QueryCacheManager, CacheInvalidationService, SemanticCacheManager, SemanticCacheStats');
  console.log('[DI] Phase 2.2 services registered: DeepseekClient, BatchProcessor, RuleBasedAnnotator, SemanticAnnotator, MetadataRepository, MetadataRetriever, MetadataSyncService');
  console.log('[DI] Phase 2.3 services registered: ResultFormatter, TimeParser, EntityResolver, CrossDatabaseHandler, IntentRecognizer, SQLGenerator, QueryExecutor');
  console.log('[DI] Phase 3 orchestrators registered: MetadataOrchestrator, QueryOrchestrator, AuditOrchestrator, DataSourceOrchestrator, CacheOrchestrator');
  console.log('[DI] Relationship services registered: RelationshipInferenceService, RelationshipVerificationService, RelationshipGraphService, RelationshipStatisticsService, RelationshipOrchestrator');
  console.log('[DI] DataSource services registered: DataSourceLifecycleService, DataSourceConnectionService, DataSourceSyncService, DataSourceQueryService, DataSourceOrchestrator');
}

/**
 * 获取服务实例的辅助函数
 */
export function getService<T>(token: symbol): T {
  const container = getContainer();
  return container.resolve<T>(token);
}

/**
 * 便捷方法：获取 PrismaClient
 */
export function getPrismaClient(): import('@/app/generated/prisma').PrismaClient {
  return getService(DI_TOKENS.PrismaClient);
}

/**
 * 便捷方法：获取数据库服务
 */
export function getDatabaseService() {
  return getService(DI_TOKENS.DatabaseService);
}

/**
 * 便捷方法：获取 ConnectionManager
 */
export function getConnectionManager() {
  return getService(DI_TOKENS.ConnectionManager);
}

/**
 * 便捷方法：获取 MultiLevelCache
 */
export function getMultiLevelCache() {
  return getService(DI_TOKENS.MultiLevelCache);
}

/**
 * 便捷方法：获取 QueryCacheManager
 */
export function getQueryCacheManager() {
  return getService(DI_TOKENS.QueryCacheManager);
}

/**
 * 便捷方法：获取 CacheInvalidationService
 */
export function getCacheInvalidationService() {
  return getService(DI_TOKENS.CacheInvalidationService);
}

/**
 * 便捷方法：获取 DeepseekClient
 */
export function getDeepseekClient() {
  return getService(DI_TOKENS.DeepseekClient);
}

/**
 * 便捷方法：获取 BatchProcessor
 */
export function getBatchProcessor() {
  return getService(DI_TOKENS.BatchProcessor);
}

/**
 * 便捷方法：获取 SemanticAnnotator
 */
export function getSemanticAnnotator() {
  return getService(DI_TOKENS.SemanticAnnotator);
}

/**
 * 便捷方法：获取 MetadataRepository
 */
export function getMetadataRepository() {
  return getService(DI_TOKENS.MetadataRepository);
}

/**
 * 便捷方法：获取 MetadataRetriever
 */
export function getMetadataRetriever() {
  return getService(DI_TOKENS.MetadataRetriever);
}

/**
 * 便捷方法：获取 MetadataSyncService
 */
export function getMetadataSyncService() {
  return getService(DI_TOKENS.MetadataSyncService);
}

/**
 * 便捷方法：获取 MetadataOrchestrator
 */
export function getMetadataOrchestrator(): import('./orchestrators/metadata.orchestrator').MetadataOrchestrator {
  return getService(DI_TOKENS.MetadataOrchestrator);
}

/**
 * 便捷方法：获取 QueryOrchestrator
 */
export function getQueryOrchestrator(): import('./orchestrators/query.orchestrator').QueryOrchestrator {
  return getService(DI_TOKENS.QueryOrchestrator);
}

/**
 * 便捷方法：获取 AuditOrchestrator
 */
export function getAuditOrchestrator(): import('./orchestrators/audit.orchestrator').AuditOrchestrator {
  return getService(DI_TOKENS.AuditOrchestrator);
}

/**
 * 便捷方法：获取 DataSourceOrchestrator
 */
export function getDataSourceOrchestrator(): import('./orchestrators/datasource.orchestrator').DataSourceOrchestrator {
  return getService(DI_TOKENS.DataSourceOrchestrator);
}

/**
 * 便捷方法：获取 CacheOrchestrator
 */
export function getCacheOrchestrator(): import('./orchestrators/cache.orchestrator').CacheOrchestrator {
  return getService(DI_TOKENS.CacheOrchestrator);
}

/**
 * 便捷方法：获取 RelationshipOrchestrator
 */
export function getRelationshipOrchestrator(): import('./orchestrators/relationship.orchestrator').RelationshipOrchestrator {
  return getService(DI_TOKENS.RelationshipOrchestrator);
}

/**
 * 便捷方法：获取 QueryExecutor
 */
export function getQueryExecutor() {
  return getService(DI_TOKENS.QueryExecutor);
}

/**
 * 便捷方法：获取 IntentRecognizer
 */
export function getIntentRecognizer() {
  return getService(DI_TOKENS.IntentRecognizer);
}

/**
 * 便捷方法：获取 SQLGenerator
 */
export function getSQLGenerator() {
  return getService(DI_TOKENS.SQLGenerator);
}

/**
 * 便捷方法：获取 SemanticCacheManager
 */
export function getSemanticCacheManager() {
  return getService(DI_TOKENS.SemanticCacheManager);
}

/**
 * 便捷方法：获取 SemanticCacheStats
 */
export function getSemanticCacheStats() {
  return getService(DI_TOKENS.SemanticCacheStats);
}

// 自动初始化（仅在服务器端）
if (typeof window === 'undefined') {
  setupDependencyInjection();
}
