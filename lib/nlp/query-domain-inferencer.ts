/**
 * 查询业务域推断器
 *
 * 职责：
 * - 分析自然语言查询
 * - 推断查询所属的业务域
 * - 提供置信度评分
 *
 * @author xusy
 */

import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@/app/generated/prisma';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { MultiLevelCache } from '@/lib/cache/multi-level-cache';
import type { EmbeddingGenerator } from '@/lib/vector/embedding-generator';

/**
 * 查询业务域推断结果
 */
export interface QueryDomainInference {
  /** 推断的业务域 ID */
  domainId: number;
  /** 业务域名称 */
  domainName: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 推断依据 */
  reasoning: string;
  /** 匹配的关键词 */
  matchedKeywords: string[];
}

/**
 * 业务域关键词配置
 */
interface DomainKeywords {
  [domainName: string]: string[];
}

/**
 * 查询业务域推断器
 */
@injectable()
export class QueryDomainInferencer {
  // 业务域关键词库 (从数据库加载，支持动态更新)
  private domainKeywords: DomainKeywords = {};

  // 关键词权重映射
  private keywordWeights: Map<string, Map<string, number>> = new Map();

  // 关键词加载状态
  private keywordsLoaded = false;

  // 默认关键词（作为后备方案）
  private readonly defaultKeywords: DomainKeywords = {
    直播业务: ['直播', '主播', '观看', '礼物', '打赏', '直播间', '开播', '粉丝'],
    订单业务: ['订单', '下单', '支付', '购买', '商品', '配送', '发货'],
    用户业务: ['用户', '注册', '登录', '会员', '积分', '等级'],
    财务业务: ['财务', '收入', '支出', '账单', '发票', '结算'],
    营销业务: ['优惠券', '活动', '推广', '广告', '转化'],
  };

  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient,
    @inject(DI_TOKENS.MultiLevelCache) private cache: MultiLevelCache,
    @inject(DI_TOKENS.EmbeddingGenerator) private embeddingGenerator: EmbeddingGenerator
  ) {
    // 初始化时异步加载关键词
    this.loadDomainKeywords().catch((error) => {
      console.error('[QueryDomainInferencer] 关键词加载失败，使用默认关键词:', error);
      this.domainKeywords = this.defaultKeywords;
      this.keywordsLoaded = true;
    });
  }

  /**
   * 推断查询所属的业务域
   */
  async inferDomain(query: string): Promise<QueryDomainInference | null> {
    // 1️⃣ 缓存检查并执行推断
    return await this.cache.get<QueryDomainInference | null>(
      'query_domain',
      { query },
      async () => this.performInference(query)
    );
  }

  /**
   * 执行实际的业务域推断（私有方法）
   */
  private async performInference(query: string): Promise<QueryDomainInference | null> {
    // 1️⃣ 确保关键词已加载
    if (!this.keywordsLoaded) {
      await this.loadDomainKeywords();
    }

    // 2️⃣ 获取所有业务域
    const domains = await this.prisma.businessDomain.findMany();
    if (domains.length === 0) {
      console.log('[QueryDomainInferencer] 系统中没有可用的业务域');
      return null;
    }

    // 3️⃣ 策略 1: 关键词匹配 (快速，权重 0.5)
    const keywordScores = this.keywordStrategy(query, domains);

    // 4️⃣ 策略 2: 向量相似度 (精确，权重 0.5)
    const vectorScores = await this.vectorStrategy(query, domains);

    // 5️⃣ 整合得分
    const finalScores = new Map<number, number>();

    for (const domain of domains) {
      const keywordScore = keywordScores.get(domain.id) || 0;
      const vectorScore = vectorScores.get(domain.id) || 0;

      const finalScore = keywordScore * 0.5 + vectorScore * 0.5;
      finalScores.set(domain.id, finalScore);
    }

    // 6️⃣ 选择最高分业务域
    let maxScore = 0;
    let bestDomainId = 0;

    for (const [domainId, score] of finalScores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        bestDomainId = domainId;
      }
    }

    // 如果得分太低，返回 null (无法确定业务域)
    if (maxScore < 0.3) {
      console.log(`[QueryDomainInferencer] 置信度过低 (${maxScore.toFixed(2)})，无法确定业务域`);
      return null;
    }

    const bestDomain = domains.find((d) => d.id === bestDomainId)!;

    const result: QueryDomainInference = {
      domainId: bestDomain.id,
      domainName: bestDomain.name,
      confidence: maxScore,
      reasoning: this.buildReasoning(query, bestDomain, keywordScores, vectorScores),
      matchedKeywords: this.extractMatchedKeywords(query, bestDomain.name),
    };

    console.log(`[QueryDomainInferencer] 推断完成: ${result.domainName} (置信度: ${result.confidence.toFixed(2)})`);

    return result;
  }

  /**
   * 策略 1: 关键词匹配（支持权重）
   *
   * @author xusy
   */
  private keywordStrategy(
    query: string,
    domains: any[]
  ): Map<number, number> {
    const scores = new Map<number, number>();

    for (const domain of domains) {
      const keywords = this.domainKeywords[domain.name] || [];
      if (keywords.length === 0) {
        scores.set(domain.id, 0);
        continue;
      }

      const weightMap = this.keywordWeights.get(domain.name);
      let totalWeight = 0;
      let matchedWeight = 0;

      for (const kw of keywords) {
        const weight = weightMap?.get(kw) || 1.0;
        totalWeight += weight;

        if (query.includes(kw)) {
          matchedWeight += weight;
        }
      }

      const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
      scores.set(domain.id, score);

      if (matchedWeight > 0) {
        const matches = keywords.filter((kw) => query.includes(kw));
        console.log(`[QueryDomainInferencer] 关键词匹配 ${domain.name}: ${matches.join(', ')} (加权得分: ${score.toFixed(2)})`);
      }
    }

    return scores;
  }

  /**
   * 策略 2: 向量相似度
   */
  private async vectorStrategy(
    query: string,
    domains: any[]
  ): Promise<Map<number, number>> {
    const scores = new Map<number, number>();

    try {
      const queryEmbedding = await this.embeddingGenerator.generate(query);
      const queryVector = queryEmbedding.vector;

      for (const domain of domains) {
        const domainText = `${domain.name} ${domain.description || ''}`;
        const domainEmbedding = await this.embeddingGenerator.generate(domainText);
        const domainVector = domainEmbedding.vector;

        const similarity = this.cosineSimilarity(queryVector, domainVector);
        scores.set(domain.id, similarity);

        console.log(`[QueryDomainInferencer] 向量相似度 ${domain.name}: ${similarity.toFixed(2)}`);
      }
    } catch (error) {
      console.error('[QueryDomainInferencer] 向量相似度计算失败:', error);
      // 降级：如果向量计算失败，所有域得分为 0
      for (const domain of domains) {
        scores.set(domain.id, 0);
      }
    }

    return scores;
  }

  /**
   * 构建推理依据
   */
  private buildReasoning(
    query: string,
    domain: any,
    keywordScores: Map<number, number>,
    vectorScores: Map<number, number>
  ): string {
    const kwScore = keywordScores.get(domain.id) || 0;
    const vecScore = vectorScores.get(domain.id) || 0;

    return `关键词匹配: ${(kwScore * 100).toFixed(0)}%, 向量相似度: ${(vecScore * 100).toFixed(0)}%`;
  }

  /**
   * 提取匹配的关键词
   */
  private extractMatchedKeywords(query: string, domainName: string): string[] {
    const keywords = this.domainKeywords[domainName] || [];
    return keywords.filter((kw) => query.includes(kw));
  }

  /**
   * 余弦相似度计算
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * 🆕 加载业务域关键词配置（从数据库）
   *
   * @author xusy
   */
  async loadDomainKeywords(): Promise<void> {
    if (this.keywordsLoaded) {
      return;
    }

    try {
      console.log('[QueryDomainInferencer] 开始从数据库加载业务域关键词...');

      // 从数据库加载所有业务域及其关键词
      const domains = await this.prisma.businessDomain.findMany({
        include: {
          keywords: true,
        },
      });

      // 重置关键词库
      this.domainKeywords = {};
      this.keywordWeights.clear();

      let totalKeywords = 0;

      for (const domain of domains) {
        if (domain.keywords.length > 0) {
          // 从数据库加载的关键词
          this.domainKeywords[domain.name] = domain.keywords.map((k) => k.keyword);

          // 构建权重映射
          const weightMap = new Map<string, number>();
          for (const kw of domain.keywords) {
            weightMap.set(kw.keyword, kw.weight);
          }
          this.keywordWeights.set(domain.name, weightMap);

          totalKeywords += domain.keywords.length;
        } else if (this.defaultKeywords[domain.name]) {
          // 如果数据库中没有配置，使用默认关键词
          this.domainKeywords[domain.name] = this.defaultKeywords[domain.name];
          console.log(`[QueryDomainInferencer] 业务域 "${domain.name}" 未配置关键词，使用默认值`);
        }
      }

      this.keywordsLoaded = true;

      console.log(`[QueryDomainInferencer] 关键词加载完成: ${domains.length} 个业务域, ${totalKeywords} 个关键词`);
    } catch (error) {
      console.error('[QueryDomainInferencer] 关键词加载失败:', error);
      // 降级：使用默认关键词
      this.domainKeywords = this.defaultKeywords;
      this.keywordsLoaded = true;
    }
  }

  /**
   * 🆕 批量设置业务域关键词（保存到数据库）
   *
   * @author xusy
   */
  async setDomainKeywords(
    domainId: number,
    keywords: Array<{ keyword: string; weight?: number }>
  ): Promise<void> {
    try {
      // 删除旧关键词
      await this.prisma.businessDomainKeyword.deleteMany({
        where: { domainId },
      });

      // 插入新关键词
      if (keywords.length > 0) {
        await this.prisma.businessDomainKeyword.createMany({
          data: keywords.map((kw) => ({
            domainId,
            keyword: kw.keyword,
            weight: kw.weight || 1.0,
          })),
        });
      }

      // 重新加载关键词
      this.keywordsLoaded = false;
      await this.loadDomainKeywords();

      console.log(`[QueryDomainInferencer] 已更新业务域 ${domainId} 的关键词: ${keywords.length} 个`);
    } catch (error) {
      console.error('[QueryDomainInferencer] 设置关键词失败:', error);
      throw error;
    }
  }

  /**
   * 🆕 添加单个关键词
   *
   * @author xusy
   */
  async addKeyword(
    domainId: number,
    keyword: string,
    weight: number = 1.0
  ): Promise<void> {
    try {
      await this.prisma.businessDomainKeyword.create({
        data: {
          domainId,
          keyword,
          weight,
        },
      });

      // 重新加载关键词
      this.keywordsLoaded = false;
      await this.loadDomainKeywords();

      console.log(`[QueryDomainInferencer] 已添加关键词: ${keyword} (权重: ${weight})`);
    } catch (error) {
      console.error('[QueryDomainInferencer] 添加关键词失败:', error);
      throw error;
    }
  }

  /**
   * 🆕 删除关键词
   *
   * @author xusy
   */
  async removeKeyword(domainId: number, keyword: string): Promise<void> {
    try {
      await this.prisma.businessDomainKeyword.delete({
        where: {
          domainId_keyword: {
            domainId,
            keyword,
          },
        },
      });

      // 重新加载关键词
      this.keywordsLoaded = false;
      await this.loadDomainKeywords();

      console.log(`[QueryDomainInferencer] 已删除关键词: ${keyword}`);
    } catch (error) {
      console.error('[QueryDomainInferencer] 删除关键词失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有业务域关键词配置
   */
  getDomainKeywords(): DomainKeywords {
    return { ...this.domainKeywords };
  }

  /**
   * 🆕 获取指定业务域的关键词（从数据库）
   *
   * @author xusy
   */
  async getDomainKeywordsFromDB(domainId: number): Promise<Array<{ keyword: string; weight: number }>> {
    const keywords = await this.prisma.businessDomainKeyword.findMany({
      where: { domainId },
      orderBy: { weight: 'desc' },
    });

    return keywords.map((kw) => ({
      keyword: kw.keyword,
      weight: kw.weight,
    }));
  }
}
