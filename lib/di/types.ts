/**
 * 依赖注入类型定义
 */

import { PrismaClient } from '@/app/generated/prisma';
import type { Redis } from 'ioredis';

/**
 * 服务生命周期
 */
export enum ServiceLifetime {
  /** 单例：整个应用程序生命周期中只有一个实例 */
  Singleton = 'singleton',
  /** 瞬态：每次请求都创建新实例 */
  Transient = 'transient',
  /** 作用域：在同一个请求/作用域中是单例 */
  Scoped = 'scoped',
}

/**
 * 服务注册描述符
 */
export interface ServiceDescriptor {
  token: symbol;
  useClass?: new (...args: any[]) => any;
  useFactory?: () => any;
  useValue?: any;
  lifetime: ServiceLifetime;
}

/**
 * DI 容器配置
 */
export interface ContainerConfig {
  /** 是否启用严格模式（未注册的服务会抛出错误） */
  strict?: boolean;
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 核心服务类型定义
 */
export interface IDatabaseService {
  prisma: PrismaClient;
  disconnect(): Promise<void>;
}

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ILoggerService {
  info(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

/**
 * ConnectionPool 工厂接口
 */
export interface IConnectionPoolFactory {
  create(config: any, poolConfig: any): any;
}

/**
 * ConnectionManager 接口
 */
export interface IConnectionManager {
  start(): void;
  createConnection(config: any, poolConfig?: any): Promise<void>;
  getConnection(id: string): Promise<any>;
  closeConnection(id: string): Promise<void>;
  getAllConnections(): Map<string, any>;
  closeAll(): Promise<void>;
}

/**
 * MultiLevelCache 接口
 */
export interface IMultiLevelCache {
  get<T>(configKey: string, params: Record<string, any>, fetchFn: () => Promise<T>): Promise<T>;
  set(configKey: string, params: Record<string, any>, value: any): Promise<void>;
  delete(configKey: string, params: Record<string, any>): Promise<void>;
  invalidate(event: string, pattern?: string): Promise<void>;
  clear(): Promise<void>;
  startCleanup(): void;
  stopCleanup(): void;
  getStats(): any;
}

/**
 * QueryCacheManager 接口
 */
export interface IQueryCacheManager {
  getIntent(naturalLanguageQuery: string): Promise<any | null>;
  setIntent(naturalLanguageQuery: string, intent: any): Promise<void>;
  getSQL(intent: any): Promise<any | null>;
  setSQL(intent: any, sqlResult: any): Promise<void>;
  getResult<T = any>(sql: string): Promise<any | null>;
  setResult<T = any>(sql: string, result: any): Promise<void>;
  invalidateAll(): Promise<void>;
  getStatistics(): any;
}

/**
 * CacheInvalidationService 接口
 */
export interface ICacheInvalidationService {
  invalidate(event: any, options?: any): Promise<void>;
  invalidateTableCache(tableId: number, tableName: string): Promise<void>;
  invalidateDatabaseCache(databaseId: number, databaseName: string): Promise<void>;
  invalidateRelationshipCache(): Promise<void>;
  clearAllCaches(): Promise<void>;
  getCacheStatus(): any;
}

/**
 * Redis 配置
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

/**
 * 应用配置
 */
export interface AppConfig {
  redis?: RedisConfig;
  cache?: {
    enabled: boolean;
    ttl: number;
  };
  ai?: {
    provider: 'api' | 'ollama';
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
}
