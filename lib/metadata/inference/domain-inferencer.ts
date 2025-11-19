/**
 * 业务域推断器
 *
 * 职责：
 * - 基于数据库元数据自动推断业务域
 * - 整合多种推断策略并计算综合得分
 * - 提供批量推断能力
 */

import { injectable, inject } from 'tsyringe';
import type { PrismaClient, BusinessDomain } from '@/app/generated/prisma';
import { DI_TOKENS } from '@/lib/di/tokens';
import { NamingRuleStrategy } from './strategies/naming-rule-strategy';
import { VectorSimilarityStrategy } from './strategies/vector-similarity-strategy';
import { AIReasoningStrategy } from './strategies/ai-reasoning-strategy';
import { domainInferenceConfig } from './config';
import { MultiLevelCache } from '@/lib/cache/multi-level-cache';
import { globalInferenceMetrics } from './metrics';
import type {
  DomainInference,
  InferenceOptions,
  BatchInferenceResult,
  StrategyResult,
  DatabaseMetadataForInference,
} from './domain-inference.types';

/**
 * 业务域推断器
 */
@injectable()
export class DomainInferencer {
  private namingStrategy: NamingRuleStrategy;
  private vectorStrategy: VectorSimilarityStrategy;
  private aiStrategy: AIReasoningStrategy;

  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient,
    @inject(DI_TOKENS.MultiLevelCache) private cache: MultiLevelCache
  ) {
    this.namingStrategy = new NamingRuleStrategy();
    this.vectorStrategy = new VectorSimilarityStrategy();
    this.aiStrategy = new AIReasoningStrategy();
  }

  /**
   * 为单个数据库推断业务域
   */
  async inferDomain(
    databaseId: number,
    options: InferenceOptions = {}
  ): Promise<DomainInference> {
    console.log(`[DomainInferencer] 开始推断数据库 ${databaseId} 的业务域`);

    const startTime = Date.now();

    try {
      // 检查是否使用默认选项（用于缓存）
      const useCache = Object.keys(options).length === 0;

      let inference: DomainInference;
      let cacheHit = false;

      if (useCache) {
        // 尝试从缓存获取
        const cached = await this.cache.get(
          'domain_inference',
          { databaseId },
          async () => {
            // 缓存未命中，记录并执行推断
            globalInferenceMetrics.recordCacheMiss();
            return this.performInference(databaseId, options);
          }
        );

        // 检查是否是缓存命中（通过比较时间判断）
        const executionTime = Date.now() - startTime;
        cacheHit = executionTime < 50; // 如果执行时间很短，认为是缓存命中

        if (cacheHit) {
          globalInferenceMetrics.recordCacheHit();
        }

        inference = cached;
      } else {
        // 自定义选项，跳过缓存
        globalInferenceMetrics.recordCacheMiss();
        inference = await this.performInference(databaseId, options);
      }

      // 记录成功事件
      const duration = Date.now() - startTime;
      globalInferenceMetrics.recordInferenceSuccess(
        inference.confidence,
        inference.strategies,
        duration,
        inference.requiresReview
      );

      return inference;
    } catch (error) {
      // 记录失败事件
      globalInferenceMetrics.recordInferenceFailed();
      throw error;
    }
  }

  /**
   * 执行实际的业务域推断（私有方法）
   */
  private async performInference(
    databaseId: number,
    options: InferenceOptions
  ): Promise<DomainInference> {
    // 1. 获取数据库完整元数据
    const database = await this.getDatabaseWithMetadata(databaseId);
    if (!database) {
      throw new Error(`数据库不存在: ID=${databaseId}`);
    }

    // 2. 获取所有可用的业务域
    const domains = await this.prisma.businessDomain.findMany();
    if (domains.length === 0) {
      throw new Error('系统中没有可用的业务域');
    }

    // 3. 执行多策略推断
    const strategyResults: StrategyResult[] = [];

    // 3.1 命名规则策略（快速、确定性高）
    const namingResult = await this.namingStrategy.infer(database, domains);
    if (namingResult) {
      strategyResults.push({ ...namingResult, weight: domainInferenceConfig.namingWeight });
      console.log(`[DomainInferencer] 命名规则策略得分: ${namingResult.score.toFixed(2)}`);
    }

    // 3.2 向量相似度策略（语义理解）
    if (domainInferenceConfig.enableVectorStrategy) {
      const vectorResult = await this.vectorStrategy.infer(database, domains);
      if (vectorResult) {
        strategyResults.push({ ...vectorResult, weight: domainInferenceConfig.vectorWeight });
        console.log(`[DomainInferencer] 向量相似度策略得分: ${vectorResult.score.toFixed(2)}`);
      }
    }

    // 3.3 AI 推理策略（最智能但最慢）
    const enableAI = options.enableAI !== false && domainInferenceConfig.enableAI;
    if (enableAI) {
      const aiResult = await this.aiStrategy.infer(database, domains);
      if (aiResult) {
        strategyResults.push({ ...aiResult, weight: domainInferenceConfig.aiWeight });
        console.log(`[DomainInferencer] AI 推理策略得分: ${aiResult.score.toFixed(2)}`);
      }
    }

    // 4. 整合策略结果
    const inference = this.aggregateResults(
      strategyResults,
      domains,
      options
    );

    console.log(`[DomainInferencer] 推断完成: ${inference.suggestedDomain.name} (置信度: ${inference.confidence.toFixed(2)})`);

    return inference;
  }

  /**
   * 批量推断多个数据库的业务域
   */
  async batchInferDomains(
    databaseIds: number[],
    options: InferenceOptions = {}
  ): Promise<BatchInferenceResult> {
    console.log(`[DomainInferencer] 开始批量推断 ${databaseIds.length} 个数据库`);

    const results = new Map<number, DomainInference | Error>();
    let inferred = 0;
    let needsReview = 0;
    let failed = 0;

    // 控制并发数，避免过载
    const concurrency = domainInferenceConfig.concurrency;
    for (let i = 0; i < databaseIds.length; i += concurrency) {
      const batch = databaseIds.slice(i, i + concurrency);
      const promises = batch.map(async dbId => {
        try {
          const inference = await this.inferDomain(dbId, options);
          results.set(dbId, inference);

          if (inference.requiresReview) {
            needsReview++;
          } else {
            inferred++;
          }
        } catch (error) {
          results.set(dbId, error as Error);
          failed++;
        }
      });

      await Promise.allSettled(promises);
    }

    console.log(`[DomainInferencer] 批量推断完成: 成功=${inferred}, 需确认=${needsReview}, 失败=${failed}`);

    return {
      total: databaseIds.length,
      inferred,
      needsReview,
      failed,
      results,
    };
  }

  /**
   * 自动应用推断结果（置信度高的直接更新）
   */
  async applyInference(
    databaseId: number,
    inference: DomainInference,
    forceApply: boolean = false
  ): Promise<void> {
    const threshold = domainInferenceConfig.autoApplyThreshold;

    // 仅当置信度 >= 阈值 或强制应用时，才自动更新
    if (inference.confidence >= threshold || forceApply) {
      await this.prisma.databaseMeta.update({
        where: { id: databaseId },
        data: { domainId: inference.suggestedDomain.id },
      });

      // 失效缓存
      await this.invalidateCache(databaseId);

      // 记录自动应用事件
      globalInferenceMetrics.recordAutoApplied();

      console.log(`[DomainInferencer] 已自动应用业务域: ${inference.suggestedDomain.name}`);
    } else {
      console.log(`[DomainInferencer] 置信度不足 (${inference.confidence.toFixed(2)} < ${threshold})，需要人工确认`);
    }
  }

  /**
   * 失效指定数据库的推断缓存
   */
  async invalidateCache(databaseId: number): Promise<void> {
    await this.cache.delete('domain_inference', { databaseId });
    console.log(`[DomainInferencer] 已失效数据库 ${databaseId} 的推断缓存`);
  }

  /**
   * 获取推断性能指标
   */
  getMetrics() {
    return globalInferenceMetrics.getStats();
  }

  /**
   * 重置指标统计
   */
  resetMetrics(): void {
    globalInferenceMetrics.reset();
    console.log('[DomainInferencer] 指标统计已重置');
  }

  /**
   * 获取数据库及其元数据
   */
  private async getDatabaseWithMetadata(databaseId: number): Promise<DatabaseMetadataForInference | null> {
    const db = await this.prisma.databaseMeta.findUnique({
      where: { id: databaseId },
      include: {
        tables: {
          take: 50, // 限制表数量以提升性能
          include: {
            columns: {
              take: 20, // 每个表最多取 20 个字段
              select: {
                columnName: true,
                columnComment: true,
              },
            },
          },
        },
      },
    });

    if (!db) {
      return null;
    }

    // 转换为推断所需的格式
    return {
      id: db.id,
      databaseName: db.databaseName,
      semanticDescription: db.semanticDescription,
      tables: db.tables.map(t => ({
        tableName: t.tableName,
        semanticDescription: t.semanticDescription,
        tableComment: t.tableComment,
        columns: t.columns,
      })),
    };
  }

  /**
   * 整合多个策略的结果
   */
  private aggregateResults(
    strategyResults: StrategyResult[],
    domains: BusinessDomain[],
    options: InferenceOptions
  ): DomainInference {
    if (strategyResults.length === 0) {
      // 默认返回"默认域"
      const defaultDomain = domains.find(d => d.name === '默认域') || domains[0];
      return {
        suggestedDomain: defaultDomain,
        confidence: 0.1,
        reasoning: '无法推断业务域，返回默认值',
        strategies: [],
        requiresReview: true,
      };
    }

    // 按业务域分组并计算加权得分
    const domainScores = new Map<number, number>();

    for (const result of strategyResults) {
      const currentScore = domainScores.get(result.domainId) || 0;
      domainScores.set(
        result.domainId,
        currentScore + result.score * result.weight
      );
    }

    // 找到得分最高的业务域
    let maxScore = 0;
    let bestDomainId = 0;

    for (const [domainId, score] of domainScores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        bestDomainId = domainId;
      }
    }

    const suggestedDomain = domains.find(d => d.id === bestDomainId)!;

    // 生成推理依据
    const reasoning = this.generateReasoning(strategyResults, suggestedDomain);

    // 获取候选域
    const alternativeDomains = options.includeAlternatives
      ? this.getAlternatives(domainScores, domains, bestDomainId, options.maxAlternatives || 3)
      : undefined;

    const minConfidence = options.minConfidence || domainInferenceConfig.confidenceThreshold;

    return {
      suggestedDomain,
      confidence: maxScore,
      reasoning,
      strategies: strategyResults,
      requiresReview: maxScore < minConfidence,
      alternativeDomains,
    };
  }

  /**
   * 生成推理依据文本
   */
  private generateReasoning(
    strategies: StrategyResult[],
    domain: BusinessDomain
  ): string {
    const reasons: string[] = [];

    for (const strategy of strategies) {
      if (strategy.domainId === domain.id) {
        const strategyName = {
          naming_rule: '命名规则',
          vector_similarity: '语义相似度',
          ai_reasoning: 'AI 推理',
        }[strategy.strategyName];

        reasons.push(
          `${strategyName}匹配 (得分: ${strategy.score.toFixed(2)}, 权重: ${strategy.weight}): ${strategy.features.join(', ')}`
        );
      }
    }

    if (reasons.length === 0) {
      return '未找到匹配的推理依据';
    }

    return reasons.join('\n');
  }

  /**
   * 获取候选域
   */
  private getAlternatives(
    scores: Map<number, number>,
    domains: BusinessDomain[],
    excludeId: number,
    limit: number
  ) {
    return Array.from(scores.entries())
      .filter(([id]) => id !== excludeId)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({
        domain: domains.find(d => d.id === id)!,
        confidence: score,
      }));
  }
}
