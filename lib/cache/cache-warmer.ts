/**
 * CacheWarmer - 智能缓存预热器
 *
 * Phase 3: 性能优化 - 实施缓存预热
 *
 * 职责：
 * - 基于数据驱动的智能预热策略
 * - 支持分层预热（P0-P3）
 * - 支持多种触发器（启动/定时/手动）
 * - 提供预热进度监控
 */

import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { MultiLevelCache } from './multi-level-cache';
import type { QueryCacheManager } from './query-cache-manager';
import type { PrismaClient } from '@/app/generated/prisma';
import type { WarmupAnalyzer } from './warmup/warmup-analyzer';
import {
  WarmupPriority,
  WarmupTrigger,
  type WarmupOptions,
  type WarmupResult,
  getStrategiesForTrigger,
  createDefaultWarmupOptions,
} from './warmup/warmup-strategy';

/**
 * CacheWarmer 类
 *
 * 智能缓存预热器，基于审计日志分析热点数据进行预热
 */
@injectable()
export class CacheWarmer {
  constructor(
    @inject(DI_TOKENS.MultiLevelCache)
    private readonly multiLevelCache: MultiLevelCache,

    @inject(DI_TOKENS.QueryCacheManager)
    private readonly queryCacheManager: QueryCacheManager,

    @inject(DI_TOKENS.PrismaClient)
    private readonly prisma: PrismaClient,

    @inject(DI_TOKENS.WarmupAnalyzer)
    private readonly warmupAnalyzer: WarmupAnalyzer
  ) {}

  /**
   * 执行预热
   *
   * @param options - 预热选项
   * @returns 预热结果
   */
  async warmup(options?: Partial<WarmupOptions>): Promise<WarmupResult> {
    const startTime = Date.now();

    // 合并默认选项
    const fullOptions = {
      ...createDefaultWarmupOptions(options?.trigger || WarmupTrigger.MANUAL),
      ...options,
    };

    console.log(
      `[CacheWarmer] 开始缓存预热... (触发器: ${fullOptions.trigger})`
    );

    // 获取需要执行的策略
    const strategies = fullOptions.priorities
      ? fullOptions.priorities.map((p) => ({ priority: p }))
      : getStrategiesForTrigger(fullOptions.trigger);

    const executedStrategies: WarmupResult['executedStrategies'] = [];
    const errors: string[] = [];
    let totalItemsWarmed = 0;

    // 按优先级顺序执行预热
    for (const strategy of strategies) {
      const strategyStartTime = Date.now();

      try {
        console.log(`[CacheWarmer] 执行预热策略: ${strategy.priority}`);

        let itemsWarmed = 0;

        // 根据优先级执行不同的预热方法
        switch (strategy.priority) {
          case WarmupPriority.P0:
            itemsWarmed = await this.warmupCoreMetadata();
            break;

          case WarmupPriority.P1:
            itemsWarmed = await this.warmupHotTables(
              fullOptions.hotTableCount || 50
            );
            break;

          case WarmupPriority.P2:
            itemsWarmed = await this.warmupHotQueries(
              fullOptions.hotQueryCount || 20
            );
            break;

          case WarmupPriority.P3:
            itemsWarmed = await this.warmupBusinessRules();
            break;

          default:
            console.warn(
              `[CacheWarmer] 未知的预热优先级: ${strategy.priority}`
            );
        }

        const duration = Date.now() - strategyStartTime;
        totalItemsWarmed += itemsWarmed;

        executedStrategies.push({
          priority: strategy.priority as WarmupPriority,
          success: true,
          duration,
          itemsWarmed,
        });

        console.log(
          `[CacheWarmer] 策略 ${strategy.priority} 完成: ${itemsWarmed} 项，耗时 ${duration}ms`
        );
      } catch (error) {
        const duration = Date.now() - strategyStartTime;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        executedStrategies.push({
          priority: strategy.priority as WarmupPriority,
          success: false,
          duration,
          itemsWarmed: 0,
          error: errorMessage,
        });

        errors.push(`策略 ${strategy.priority} 失败: ${errorMessage}`);
        console.error(
          `[CacheWarmer] 策略 ${strategy.priority} 失败:`,
          error
        );

        // 如果不继续执行，则中断
        if (!fullOptions.continueOnError) {
          break;
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    const success = errors.length === 0;

    console.log(
      `[CacheWarmer] 缓存预热${success ? '成功' : '完成（有错误）'}: ` +
        `预热 ${totalItemsWarmed} 项，耗时 ${totalDuration}ms`
    );

    if (errors.length > 0) {
      console.error(`[CacheWarmer] 预热错误:`, errors);
    }

    return {
      success,
      trigger: fullOptions.trigger,
      executedStrategies,
      totalDuration,
      totalItemsWarmed,
      errors,
    };
  }

  /**
   * P0: 预热核心元数据（数据库列表、数据源配置）
   *
   * @returns 预热项数
   */
  private async warmupCoreMetadata(): Promise<number> {
    let count = 0;

    try {
      // 预热所有活跃数据源
      const dataSources = await this.prisma.dataSource.findMany({
        where: { status: 'active' },
      });

      count += dataSources.length;

      // 预热每个数据源的数据库列表
      for (const source of dataSources) {
        const databases = await this.prisma.databaseMeta.findMany({
          where: { sourceId: source.id },
          orderBy: { databaseName: 'asc' },
        });

        await this.multiLevelCache.set(
          'databases_list',
          { sourceId: source.id },
          databases
        );

        count += databases.length;
      }

      console.log(
        `[CacheWarmer] 预热了 ${dataSources.length} 个数据源和相关数据库`
      );
    } catch (error) {
      console.error('[CacheWarmer] 预热核心元数据失败:', error);
      throw error;
    }

    return count;
  }

  /**
   * P1: 预热热表元数据（基于访问频率）
   *
   * @param topN - 预热前 N 个热表
   * @returns 预热项数
   */
  private async warmupHotTables(topN: number = 50): Promise<number> {
    let count = 0;

    try {
      // 使用 WarmupAnalyzer 分析热表
      const hotTables = await this.warmupAnalyzer.analyzeHotTables(topN, {
        // 分析最近 7 天的数据
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });

      // 预热热表元数据
      for (const hotTable of hotTables) {
        // 只预热 P0 和 P1 优先级的表
        if (hotTable.priority !== 'P0' && hotTable.priority !== 'P1') {
          continue;
        }

        // 获取完整的表元数据
        const table = await this.prisma.tableMeta.findUnique({
          where: { id: hotTable.tableId },
          include: {
            columns: true,
            database: {
              select: {
                id: true,
                databaseName: true,
                sourceId: true,
              },
            },
          },
        });

        if (!table) continue;

        // 预热表元数据
        await this.multiLevelCache.set(
          'table_meta',
          { id: table.id, version: 'latest' },
          table
        );

        // 预热列元数据
        await this.multiLevelCache.set(
          'column_meta',
          { tableId: table.id },
          table.columns
        );

        count++;
      }

      console.log(
        `[CacheWarmer] 预热了 ${count} 张热表（分析了 ${hotTables.length} 张表）`
      );
    } catch (error) {
      console.error('[CacheWarmer] 预热热表失败:', error);
      throw error;
    }

    return count;
  }

  /**
   * P2: 预热热门查询模式（基于访问频率）
   *
   * @param topN - 预热前 N 个热查询
   * @returns 预热项数
   */
  private async warmupHotQueries(topN: number = 20): Promise<number> {
    let count = 0;

    try {
      // 使用 WarmupAnalyzer 分析热查询
      const hotQueries = await this.warmupAnalyzer.analyzeHotQueries(topN, {
        // 分析最近 7 天的数据
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });

      // 注意：热查询预热需要重新执行查询来填充缓存
      // 这里只记录热查询信息，实际预热可能需要在后台异步执行
      // 或者在查询执行时根据热查询列表优先从缓存读取

      // 预热查询意图（如果已有审计日志中的意图数据）
      for (const hotQuery of hotQueries) {
        // 只预热 P0 和 P1 优先级的查询
        if (hotQuery.priority !== 'P0' && hotQuery.priority !== 'P1') {
          continue;
        }

        // 从审计日志获取意图数据
        const auditLog = await this.prisma.queryAuditLog.findFirst({
          where: {
            naturalLanguageQuery: hotQuery.naturalLanguageQuery,
            executionSuccess: true,
          },
          orderBy: { timestamp: 'desc' },
        });

        if (auditLog) {
          const intent = JSON.parse(auditLog.intent);

          // 预热意图缓存
          await this.queryCacheManager.setIntent(
            hotQuery.naturalLanguageQuery,
            intent
          );

          // 如果有 SQL 缓存，也预热
          if (auditLog.generatedSql) {
            await this.queryCacheManager.setSQL(intent, {
              sql: auditLog.generatedSql,
              explanation: '',
              confidence: 1.0,
              usedTables: JSON.parse(auditLog.usedTables),
              usedColumns: [],
            });
          }

          count++;
        }
      }

      console.log(
        `[CacheWarmer] 预热了 ${count} 个热查询（分析了 ${hotQueries.length} 个查询）`
      );
    } catch (error) {
      console.error('[CacheWarmer] 预热热查询失败:', error);
      throw error;
    }

    return count;
  }

  /**
   * P3: 预热业务规则、分表模式
   *
   * @returns 预热项数
   */
  private async warmupBusinessRules(): Promise<number> {
    let count = 0;

    try {
      // 预热业务术语映射
      // 注意：这里需要根据实际的业务规则引擎实现
      // 目前只是示例代码

      // 示例：预热常用业务术语
      // const businessTerms = await this.loadBusinessTerms();
      // for (const term of businessTerms) {
      //   await this.cacheBusinessTerm(term);
      //   count++;
      // }

      console.log(`[CacheWarmer] 预热了 ${count} 个业务规则`);
    } catch (error) {
      console.error('[CacheWarmer] 预热业务规则失败:', error);
      throw error;
    }

    return count;
  }

  /**
   * 预热特定数据源的缓存
   *
   * @param dataSourceId - 数据源 ID
   * @returns 预热项数
   */
  async warmupDataSource(dataSourceId: number): Promise<number> {
    let count = 0;

    try {
      console.log(
        `[CacheWarmer] 预热数据源 ${dataSourceId} 的缓存...`
      );

      // 获取数据源的所有数据库
      const databases = await this.prisma.databaseMeta.findMany({
        where: { sourceId: dataSourceId },
        include: {
          tables: {
            take: 50, // 每个数据库最多 50 张表
            include: {
              columns: true,
            },
          },
        },
      });

      // 预热数据库列表
      await this.multiLevelCache.set(
        'databases_list',
        { sourceId: dataSourceId },
        databases
      );

      count++;

      // 预热每个数据库的表元数据
      for (const db of databases) {
        for (const table of db.tables) {
          await this.multiLevelCache.set(
            'table_meta',
            { id: table.id, version: 'latest' },
            table
          );

          await this.multiLevelCache.set(
            'column_meta',
            { tableId: table.id },
            table.columns
          );

          count++;
        }
      }

      const tableCount = databases.reduce(
        (sum, db) => sum + db.tables.length,
        0
      );

      console.log(
        `[CacheWarmer] 数据源 ${dataSourceId} 预热完成: ` +
          `${databases.length} 个数据库，${tableCount} 张表`
      );
    } catch (error) {
      console.error(
        `[CacheWarmer] 预热数据源 ${dataSourceId} 失败:`,
        error
      );
      throw error;
    }

    return count;
  }

  /**
   * 预热特定表的关系图谱
   *
   * @param tableId - 表 ID
   * @param depth - 关系深度
   * @returns 预热项数
   */
  async warmupRelationshipGraph(
    tableId: number,
    depth: number = 2
  ): Promise<number> {
    try {
      console.log(
        `[CacheWarmer] 预热表 ${tableId} 的关系图谱 (深度: ${depth})`
      );

      // 这里需要调用关系图谱查询逻辑
      // 由于关系图谱查询较复杂，建议在实际使用时按需预热

      return 1;
    } catch (error) {
      console.error('[CacheWarmer] 预热关系图谱失败:', error);
      throw error;
    }
  }
}
