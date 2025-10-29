/**
 * 查询缓存管理器
 * 实现三级查询缓存：意图缓存、SQL缓存、结果缓存
 */

import crypto from 'crypto';
import { multiLevelCache } from './multi-level-cache';
import type { QueryIntent } from '@/lib/nlp/types';
import type { SQLGenerationResult } from '@/lib/sql/generator/types';
import type { ExecutionResult } from '@/lib/sql/executor/types';

/**
 * 缓存统计
 */
export interface QueryCacheStatistics {
  intentCacheHits: number;
  intentCacheMisses: number;
  sqlCacheHits: number;
  sqlCacheMisses: number;
  resultCacheHits: number;
  resultCacheMisses: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
}

/**
 * 查询缓存管理器类
 */
export class QueryCacheManager {
  private stats: QueryCacheStatistics = {
    intentCacheHits: 0,
    intentCacheMisses: 0,
    sqlCacheHits: 0,
    sqlCacheMisses: 0,
    resultCacheHits: 0,
    resultCacheMisses: 0,
    totalHits: 0,
    totalMisses: 0,
    hitRate: 0,
  };

  /**
   * 生成查询哈希（用于缓存键）
   */
  private generateHash(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex');
  }

  /**
   * 标准化自然语言查询（去除空格、标点，转小写）
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/\s+/g, ' ') // 多个空格替换为单个空格
      .replace(/[，。！？；：、]/g, '') // 移除中文标点
      .replace(/[,.\!\?;:]/g, '') // 移除英文标点
      .trim();
  }

  /**
   * 标准化意图对象（用于生成一致的哈希）
   */
  private normalizeIntent(intent: QueryIntent): string {
    // 排序和标准化意图对象
    const normalized = {
      type: intent.type,
      entities: {
        databases: intent.entities.databases?.sort() || [],
        tables: intent.entities.tables?.sort() || [],
        columns: intent.entities.columns?.sort() || [],
      },
      conditions: intent.conditions,
      aggregations: intent.aggregations,
    };

    return JSON.stringify(normalized);
  }

  // ==================== 意图缓存 ====================

  /**
   * 获取缓存的意图
   * @param naturalLanguageQuery 自然语言查询
   * @returns 缓存的意图或 null
   */
  async getIntent(naturalLanguageQuery: string): Promise<QueryIntent | null> {
    try {
      const normalizedQuery = this.normalizeQuery(naturalLanguageQuery);
      const queryHash = this.generateHash(normalizedQuery);

      const cached = await multiLevelCache.get<QueryIntent>(
        'query_intent',
        { query_hash: queryHash },
        async () => {
          throw new Error('Cache miss');
        }
      );

      this.stats.intentCacheHits++;
      this.stats.totalHits++;
      this.updateHitRate();

      console.log(`[QueryCache] 意图缓存命中: ${queryHash}`);
      return cached;
    } catch {
      this.stats.intentCacheMisses++;
      this.stats.totalMisses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * 设置意图缓存
   * @param naturalLanguageQuery 自然语言查询
   * @param intent 意图对象
   */
  async setIntent(
    naturalLanguageQuery: string,
    intent: QueryIntent
  ): Promise<void> {
    try {
      const normalizedQuery = this.normalizeQuery(naturalLanguageQuery);
      const queryHash = this.generateHash(normalizedQuery);

      await multiLevelCache.set('query_intent', { query_hash: queryHash }, intent);

      console.log(`[QueryCache] 意图已缓存: ${queryHash}`);
    } catch (error) {
      console.error('[QueryCache] 缓存意图失败:', error);
    }
  }

  /**
   * 删除意图缓存
   */
  async deleteIntent(naturalLanguageQuery: string): Promise<void> {
    try {
      const normalizedQuery = this.normalizeQuery(naturalLanguageQuery);
      const queryHash = this.generateHash(normalizedQuery);

      await multiLevelCache.delete('query_intent', { query_hash: queryHash });

      console.log(`[QueryCache] 意图缓存已删除: ${queryHash}`);
    } catch (error) {
      console.error('[QueryCache] 删除意图缓存失败:', error);
    }
  }

  // ==================== SQL 缓存 ====================

  /**
   * 获取缓存的 SQL
   * @param intent 意图对象
   * @returns 缓存的 SQL 生成结果或 null
   */
  async getSQL(intent: QueryIntent): Promise<SQLGenerationResult | null> {
    try {
      const normalizedIntent = this.normalizeIntent(intent);
      const intentHash = this.generateHash(normalizedIntent);

      const cached = await multiLevelCache.get<SQLGenerationResult>(
        'query_sql',
        { intent_hash: intentHash },
        async () => {
          throw new Error('Cache miss');
        }
      );

      this.stats.sqlCacheHits++;
      this.stats.totalHits++;
      this.updateHitRate();

      console.log(`[QueryCache] SQL缓存命中: ${intentHash}`);
      return cached;
    } catch {
      this.stats.sqlCacheMisses++;
      this.stats.totalMisses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * 设置 SQL 缓存
   * @param intent 意图对象
   * @param sqlResult SQL 生成结果
   */
  async setSQL(
    intent: QueryIntent,
    sqlResult: SQLGenerationResult
  ): Promise<void> {
    try {
      const normalizedIntent = this.normalizeIntent(intent);
      const intentHash = this.generateHash(normalizedIntent);

      await multiLevelCache.set('query_sql', { intent_hash: intentHash }, sqlResult);

      console.log(`[QueryCache] SQL已缓存: ${intentHash}`);
    } catch (error) {
      console.error('[QueryCache] 缓存SQL失败:', error);
    }
  }

  /**
   * 删除 SQL 缓存
   */
  async deleteSQL(intent: QueryIntent): Promise<void> {
    try {
      const normalizedIntent = this.normalizeIntent(intent);
      const intentHash = this.generateHash(normalizedIntent);

      await multiLevelCache.delete('query_sql', { intent_hash: intentHash });

      console.log(`[QueryCache] SQL缓存已删除: ${intentHash}`);
    } catch (error) {
      console.error('[QueryCache] 删除SQL缓存失败:', error);
    }
  }

  // ==================== 结果缓存 ====================

  /**
   * 获取缓存的查询结果
   * @param sql SQL 语句
   * @returns 缓存的查询结果或 null
   */
  async getResult<T = any>(sql: string): Promise<ExecutionResult<T> | null> {
    try {
      // 标准化 SQL（去除多余空格和分号）
      const normalizedSQL = sql
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/;$/, '');
      const sqlHash = this.generateHash(normalizedSQL);

      const cached = await multiLevelCache.get<ExecutionResult<T>>(
        'query_result',
        { sql_hash: sqlHash },
        async () => {
          throw new Error('Cache miss');
        }
      );

      this.stats.resultCacheHits++;
      this.stats.totalHits++;
      this.updateHitRate();

      console.log(`[QueryCache] 结果缓存命中: ${sqlHash}`);
      return cached;
    } catch {
      this.stats.resultCacheMisses++;
      this.stats.totalMisses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * 设置结果缓存
   * @param sql SQL 语句
   * @param result 查询结果
   */
  async setResult<T = any>(
    sql: string,
    result: ExecutionResult<T>
  ): Promise<void> {
    try {
      // 只缓存成功且小于 1000 行的结果
      if (!result.success || (result.rowCount && result.rowCount >= 1000)) {
        return;
      }

      // 标准化 SQL
      const normalizedSQL = sql
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/;$/, '');
      const sqlHash = this.generateHash(normalizedSQL);

      await multiLevelCache.set('query_result', { sql_hash: sqlHash }, result);

      console.log(
        `[QueryCache] 结果已缓存: ${sqlHash}, 行数: ${result.rowCount}`
      );
    } catch (error) {
      console.error('[QueryCache] 缓存结果失败:', error);
    }
  }

  /**
   * 删除结果缓存
   */
  async deleteResult(sql: string): Promise<void> {
    try {
      const normalizedSQL = sql
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/;$/, '');
      const sqlHash = this.generateHash(normalizedSQL);

      await multiLevelCache.delete('query_result', { sql_hash: sqlHash });

      console.log(`[QueryCache] 结果缓存已删除: ${sqlHash}`);
    } catch (error) {
      console.error('[QueryCache] 删除结果缓存失败:', error);
    }
  }

  // ==================== 缓存失效 ====================

  /**
   * 当元数据变更时，失效所有查询缓存
   */
  async invalidateAll(): Promise<void> {
    try {
      console.log('[QueryCache] 失效所有查询缓存...');

      // 失效三级缓存
      await Promise.all([
        multiLevelCache.invalidate('metadata_synced', 'query:intent:*'),
        multiLevelCache.invalidate('metadata_synced', 'query:sql:*'),
        multiLevelCache.invalidate('data_updated', 'query:result:*'),
      ]);

      console.log('[QueryCache] 所有查询缓存已失效');
    } catch (error) {
      console.error('[QueryCache] 失效缓存失败:', error);
    }
  }

  /**
   * 失效意图缓存
   */
  async invalidateIntents(): Promise<void> {
    try {
      await multiLevelCache.invalidate('metadata_synced', 'query:intent:*');
      console.log('[QueryCache] 意图缓存已失效');
    } catch (error) {
      console.error('[QueryCache] 失效意图缓存失败:', error);
    }
  }

  /**
   * 失效 SQL 缓存
   */
  async invalidateSQL(): Promise<void> {
    try {
      await multiLevelCache.invalidate('metadata_synced', 'query:sql:*');
      console.log('[QueryCache] SQL缓存已失效');
    } catch (error) {
      console.error('[QueryCache] 失效SQL缓存失败:', error);
    }
  }

  /**
   * 失效结果缓存
   */
  async invalidateResults(): Promise<void> {
    try {
      await multiLevelCache.invalidate('data_updated', 'query:result:*');
      console.log('[QueryCache] 结果缓存已失效');
    } catch (error) {
      console.error('[QueryCache] 失效结果缓存失败:', error);
    }
  }

  // ==================== 统计信息 ====================

  /**
   * 更新命中率
   */
  private updateHitRate(): void {
    const total = this.stats.totalHits + this.stats.totalMisses;
    this.stats.hitRate = total > 0 ? this.stats.totalHits / total : 0;
  }

  /**
   * 获取缓存统计信息
   */
  getStatistics(): QueryCacheStatistics {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStatistics(): void {
    this.stats = {
      intentCacheHits: 0,
      intentCacheMisses: 0,
      sqlCacheHits: 0,
      sqlCacheMisses: 0,
      resultCacheHits: 0,
      resultCacheMisses: 0,
      totalHits: 0,
      totalMisses: 0,
      hitRate: 0,
    };
  }

  /**
   * 获取缓存状态报告
   */
  getCacheReport(): {
    statistics: QueryCacheStatistics;
    cacheStatus: any;
  } {
    return {
      statistics: this.getStatistics(),
      cacheStatus: multiLevelCache.getStats(),
    };
  }
}

// 导出单例
export const queryCacheManager = new QueryCacheManager();
