/**
 * 依赖注入 Token 定义
 * 用于在 DI 容器中唯一标识服务
 */

export const DI_TOKENS = {
  // 数据库层
  PrismaClient: Symbol.for('PrismaClient'),
  DatabaseService: Symbol.for('DatabaseService'),
  ConnectionManager: Symbol.for('ConnectionManager'),
  ConnectionPool: Symbol.for('ConnectionPool'),
  ConnectionPoolFactory: Symbol.for('ConnectionPoolFactory'),

  // 缓存层
  RedisClient: Symbol.for('RedisClient'),
  CacheService: Symbol.for('CacheService'),
  MultiLevelCache: Symbol.for('MultiLevelCache'),
  QueryCacheManager: Symbol.for('QueryCacheManager'),
  CacheInvalidationService: Symbol.for('CacheInvalidationService'),
  CacheWarmer: Symbol.for('CacheWarmer'),
  CacheStats: Symbol.for('CacheStats'),

  // AI 服务
  DeepseekClient: Symbol.for('DeepseekClient'),
  SemanticAnnotator: Symbol.for('SemanticAnnotator'),
  BatchProcessor: Symbol.for('BatchProcessor'),
  PriorityProcessor: Symbol.for('PriorityProcessor'),
  RuleBasedAnnotator: Symbol.for('RuleBasedAnnotator'),
  ErrorLogger: Symbol.for('ErrorLogger'),

  // 元数据管理
  MetadataRepository: Symbol.for('MetadataRepository'),
  CachedMetadataRepository: Symbol.for('CachedMetadataRepository'),
  MetadataSyncService: Symbol.for('MetadataSyncService'),
  MetadataRetriever: Symbol.for('MetadataRetriever'),
  MetadataCollector: Symbol.for('MetadataCollector'),

  // SQL 处理
  IntentRecognizer: Symbol.for('IntentRecognizer'),
  EntityResolver: Symbol.for('EntityResolver'),
  TimeParser: Symbol.for('TimeParser'),
  SQLGenerator: Symbol.for('SQLGenerator'),
  CrossDatabaseHandler: Symbol.for('CrossDatabaseHandler'),
  SQLValidator: Symbol.for('SQLValidator'),
  QueryExecutor: Symbol.for('QueryExecutor'),
  ResultFormatter: Symbol.for('ResultFormatter'),
  SQLParser: Symbol.for('SQLParser'),

  // 审计和安全
  AuditLogger: Symbol.for('AuditLogger'),
  AuditAnalyzer: Symbol.for('AuditAnalyzer'),
  RateLimiter: Symbol.for('RateLimiter'),
  ErrorSanitizer: Symbol.for('ErrorSanitizer'),

  // 向量搜索
  EmbeddingGenerator: Symbol.for('EmbeddingGenerator'),
  VectorStore: Symbol.for('VectorStore'),
  VectorSearchService: Symbol.for('VectorSearchService'),

  // 配置
  Config: Symbol.for('Config'),
  Logger: Symbol.for('Logger'),

  // 编排器
  MetadataOrchestrator: Symbol.for('MetadataOrchestrator'),
  QueryOrchestrator: Symbol.for('QueryOrchestrator'),
  AuditOrchestrator: Symbol.for('AuditOrchestrator'),
} as const;

export type DIToken = (typeof DI_TOKENS)[keyof typeof DI_TOKENS];
