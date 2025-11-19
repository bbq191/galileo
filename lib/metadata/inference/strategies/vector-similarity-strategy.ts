/**
 * 向量相似度策略
 *
 * 职责：使用向量嵌入计算数据库与业务域的语义相似度
 */

import type { BusinessDomain } from '@/app/generated/prisma';
import type { StrategyResult, DatabaseMetadataForInference } from '../domain-inference.types';
import { EmbeddingGenerator } from '@/lib/vector/embedding-generator';
import { getService } from '@/lib/di/setup';
import { DI_TOKENS } from '@/lib/di/tokens';

/**
 * 向量相似度策略
 */
export class VectorSimilarityStrategy {
  private embeddingGenerator: EmbeddingGenerator | null = null;

  /**
   * 推断业务域
   */
  async infer(
    database: DatabaseMetadataForInference,
    domains: BusinessDomain[]
  ): Promise<StrategyResult | null> {
    try {
      // 获取向量生成器
      if (!this.embeddingGenerator) {
        try {
          this.embeddingGenerator = getService<EmbeddingGenerator>(DI_TOKENS.EmbeddingGenerator);
        } catch (error) {
          console.warn('[VectorSimilarityStrategy] EmbeddingGenerator 未配置，跳过向量相似度策略');
          return null;
        }
      }

      // 1. 为数据库生成文本描述
      const databaseDescription = this.generateDatabaseDescription(database);

      // 2. 生成数据库描述的向量
      const databaseEmbedding = await this.embeddingGenerator.generate(databaseDescription);

      // 3. 为每个业务域生成向量并计算相似度
      const similarities: Array<{
        domain: BusinessDomain;
        similarity: number;
      }> = [];

      for (const domain of domains) {
        const domainDescription = this.generateDomainDescription(domain);
        const domainEmbedding = await this.embeddingGenerator.generate(domainDescription);

        // 计算余弦相似度
        const similarity = this.cosineSimilarity(
          databaseEmbedding.vector,
          domainEmbedding.vector
        );

        similarities.push({ domain, similarity });
      }

      // 4. 找到最相似的业务域
      const bestMatch = similarities.reduce((best, current) =>
        current.similarity > best.similarity ? current : best
      );

      // 如果相似度太低，返回 null
      if (bestMatch.similarity < 0.3) {
        return null;
      }

      return {
        strategyName: 'vector_similarity',
        domainId: bestMatch.domain.id,
        score: bestMatch.similarity,
        features: [
          `语义相似度: ${(bestMatch.similarity * 100).toFixed(1)}%`,
          `数据库特征: ${this.extractKeyFeatures(database)}`,
        ],
        weight: 0.3, // 向量相似度策略权重
      };
    } catch (error) {
      console.error('[VectorSimilarityStrategy] 向量相似度计算失败:', error);
      return null;
    }
  }

  /**
   * 生成数据库文本描述（供向量化使用）
   */
  private generateDatabaseDescription(database: DatabaseMetadataForInference): string {
    const parts: string[] = [];

    // 数据库名
    parts.push(`数据库: ${database.databaseName}`);

    // 语义描述
    if (database.semanticDescription) {
      parts.push(`描述: ${database.semanticDescription}`);
    }

    // 表名及其描述（前 15 个）
    const tableDescriptions = database.tables.slice(0, 15).map(t => {
      const desc = t.semanticDescription || t.tableComment || '';
      return desc ? `${t.tableName}(${desc})` : t.tableName;
    });

    if (tableDescriptions.length > 0) {
      parts.push(`表: ${tableDescriptions.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * 生成业务域文本描述（供向量化使用）
   */
  private generateDomainDescription(domain: BusinessDomain): string {
    const parts: string[] = [];

    // 业务域名称
    parts.push(`业务域: ${domain.name}`);

    // 业务域描述
    if (domain.description) {
      parts.push(`描述: ${domain.description}`);
    }

    // 所属团队
    if (domain.ownerTeam) {
      parts.push(`团队: ${domain.ownerTeam}`);
    }

    return parts.join('\n');
  }

  /**
   * 提取数据库关键特征（用于日志）
   */
  private extractKeyFeatures(database: DatabaseMetadataForInference): string {
    const features: string[] = [];

    // 数据库名关键词
    const dbNameKeywords = database.databaseName
      .toLowerCase()
      .split(/[_\-.]/)
      .filter(k => k.length > 2);

    if (dbNameKeywords.length > 0) {
      features.push(dbNameKeywords.slice(0, 3).join(', '));
    }

    // 表数量
    features.push(`${database.tables.length}个表`);

    return features.join(', ');
  }

  /**
   * 计算余弦相似度
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
}
