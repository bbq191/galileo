/**
 * 自动业务域发现器
 *
 * 职责：
 * - 分析数据源中的所有数据库
 * - 基于语义相似度自动聚类
 * - 为每个聚类生成业务域名称
 * - 自动创建业务域并分配数据库
 *
 * @author xusy
 */

import { injectable, inject } from 'tsyringe';
import type { PrismaClient } from '@/app/generated/prisma';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { DeepseekClient } from '@/lib/ai/deepseek-client';
import type { EmbeddingGenerator } from '@/lib/vector/embedding-generator';

/**
 * 发现的业务域信息
 */
export interface DiscoveredDomain {
  /** 建议的业务域名称 */
  suggestedName: string;
  /** 业务域描述 */
  description: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 包含的数据库 ID */
  databaseIds: number[];
  /** 是否建议自动创建 */
  autoCreateRecommended: boolean;
}

/**
 * 数据库向量化结果
 */
interface DatabaseVector {
  databaseId: number;
  databaseName: string;
  vector: number[];
}

/**
 * 聚类结果
 */
interface Cluster {
  databaseIds: number[];
}

/**
 * 业务域发现选项
 */
export interface DomainDiscoveryOptions {
  /** 最小聚类大小 */
  minClusterSize?: number;
  /** 自动创建的置信度阈值 */
  autoCreateThreshold?: number;
  /** 是否立即创建高置信度的域 */
  autoCreate?: boolean;
}

/**
 * 自动业务域发现器
 */
@injectable()
export class DomainDiscoverer {
  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient,
    @inject(DI_TOKENS.DeepseekClient) private aiClient: DeepseekClient,
    @inject(DI_TOKENS.EmbeddingGenerator) private embeddingGenerator: EmbeddingGenerator
  ) {}

  /**
   * 自动发现并创建业务域
   */
  async discoverAndCreateDomains(
    dataSourceId: number,
    options: DomainDiscoveryOptions = {}
  ): Promise<DiscoveredDomain[]> {
    const {
      minClusterSize = 2,
      autoCreateThreshold = 0.8,
      autoCreate = true,
    } = options;

    console.log(`[DomainDiscoverer] 开始为数据源 ${dataSourceId} 发现业务域`);

    // 1️⃣ 获取所有数据库及其元数据
    const databases = await this.prisma.databaseMeta.findMany({
      where: { sourceId: dataSourceId },
      include: {
        tables: {
          take: 30, // 每个数据库最多取 30 个表
          select: {
            tableName: true,
            semanticDescription: true,
            tableComment: true,
          },
        },
      },
    });

    if (databases.length < minClusterSize) {
      console.log(`[DomainDiscoverer] 数据库数量不足 (${databases.length} < ${minClusterSize})，跳过聚类`);
      return [];
    }

    // 2️⃣ 向量化所有数据库
    const databaseVectors = await this.vectorizeDatabases(databases);

    // 3️⃣ 基于相似度聚类 (简化版聚类算法)
    const clusters = this.simpleCluster(databaseVectors, {
      similarityThreshold: 0.65,
      minClusterSize,
    });

    console.log(`[DomainDiscoverer] 发现 ${clusters.length} 个数据库聚类`);

    // 4️⃣ 为每个聚类生成业务域名称
    const discoveredDomains: DiscoveredDomain[] = [];

    for (const cluster of clusters) {
      const clusterDatabases = databases.filter((db) =>
        cluster.databaseIds.includes(db.id)
      );

      const domainInfo = await this.generateDomainName(clusterDatabases);

      discoveredDomains.push({
        ...domainInfo,
        databaseIds: cluster.databaseIds,
        autoCreateRecommended: domainInfo.confidence >= autoCreateThreshold,
      });
    }

    // 5️⃣ 自动创建高置信度的业务域
    if (autoCreate) {
      for (const discovered of discoveredDomains) {
        if (discovered.autoCreateRecommended) {
          await this.createDomain(discovered);
        }
      }
    }

    return discoveredDomains;
  }

  /**
   * 向量化所有数据库
   */
  private async vectorizeDatabases(databases: any[]): Promise<DatabaseVector[]> {
    const databaseVectors: DatabaseVector[] = [];

    for (const db of databases) {
      const semanticText = this.buildDatabaseSemanticText(db);
      const embeddingResult = await this.embeddingGenerator.generate(semanticText);

      databaseVectors.push({
        databaseId: db.id,
        databaseName: db.databaseName,
        vector: embeddingResult.vector,
      });
    }

    return databaseVectors;
  }

  /**
   * 构建数据库的语义表示
   */
  private buildDatabaseSemanticText(db: any): string {
    const parts = [
      `数据库: ${db.databaseName}`,
      db.semanticDescription ? `描述: ${db.semanticDescription}` : '',
    ];

    if (db.tables && db.tables.length > 0) {
      const tableNames = db.tables.map((t: any) => t.tableName).join(', ');
      parts.push(`表: ${tableNames}`);

      const tableDescs = db.tables
        .filter((t: any) => t.semanticDescription)
        .map((t: any) => t.semanticDescription)
        .join('; ');
      if (tableDescs) {
        parts.push(`表描述: ${tableDescs}`);
      }
    }

    return parts.filter(Boolean).join('\n');
  }

  /**
   * 简化的聚类算法 (基于余弦相似度)
   */
  private simpleCluster(
    databaseVectors: DatabaseVector[],
    options: {
      similarityThreshold: number;
      minClusterSize: number;
    }
  ): Cluster[] {
    const clusters: Cluster[] = [];
    const visited = new Set<number>();

    for (const db of databaseVectors) {
      if (visited.has(db.databaseId)) continue;

      // 找到相似的数据库
      const similarDatabases = [db];
      visited.add(db.databaseId);

      for (const other of databaseVectors) {
        if (visited.has(other.databaseId)) continue;

        const similarity = this.cosineSimilarity(db.vector, other.vector);
        if (similarity >= options.similarityThreshold) {
          similarDatabases.push(other);
          visited.add(other.databaseId);
        }
      }

      // 如果聚类大小满足要求，添加到结果
      if (similarDatabases.length >= options.minClusterSize) {
        clusters.push({
          databaseIds: similarDatabases.map((d) => d.databaseId),
        });
      }
    }

    return clusters;
  }

  /**
   * 为聚类生成业务域名称
   */
  private async generateDomainName(
    databases: any[]
  ): Promise<{
    suggestedName: string;
    description: string;
    confidence: number;
  }> {
    const prompt = this.buildDomainNamingPrompt(databases);

    try {
      const response = await this.aiClient.chat(
        [
          {
            role: 'system',
            content: '你是数据库架构专家，擅长识别业务领域。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          temperature: 0.7,
          max_tokens: 500,
        }
      );

      // 解析 JSON 响应
      const result = this.parseAIResponse(response);
      return {
        suggestedName: result.domainName,
        description: result.description,
        confidence: result.confidence,
      };
    } catch (error) {
      console.error('[DomainDiscoverer] AI 响应解析失败', error);
      return {
        suggestedName: '未知业务域',
        description: '无法自动识别',
        confidence: 0.1,
      };
    }
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(response: string): {
    domainName: string;
    description: string;
    confidence: number;
  } {
    try {
      // 提取 JSON 代码块
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;

      const result = JSON.parse(jsonString);
      return {
        domainName: result.domainName || '未知业务域',
        description: result.description || '无法自动识别',
        confidence: result.confidence || 0.1,
      };
    } catch {
      // 如果解析失败，尝试直接解析
      try {
        const result = JSON.parse(response);
        return {
          domainName: result.domainName || '未知业务域',
          description: result.description || '无法自动识别',
          confidence: result.confidence || 0.1,
        };
      } catch {
        throw new Error('无法解析 AI 响应');
      }
    }
  }

  /**
   * 构建业务域命名 Prompt
   */
  private buildDomainNamingPrompt(databases: any[]): string {
    const databaseInfos = databases
      .map((db) => {
        const tables =
          db.tables
            ?.slice(0, 15)
            .map(
              (t: any) =>
                `  - ${t.tableName}${t.semanticDescription ? ` (${t.semanticDescription})` : ''}`
            )
            .join('\n') || '';

        return `
### 数据库: ${db.databaseName}
${db.semanticDescription ? `描述: ${db.semanticDescription}` : ''}

主要表:
${tables}
      `.trim();
      })
      .join('\n\n');

    return `
以下是一组相关的数据库及其表结构:

${databaseInfos}

---

请分析这些数据库的业务特征，推断它们所属的业务领域。

要求:
1. 业务域名称: 简洁明了，2-4 个字 (例如: "账户管理", "交易处理", "风险控制")
2. 业务域描述: 详细说明该领域的职责，1-2 句话
3. 置信度: 0-1 之间，表示推断的可靠程度

输出 JSON 格式:
\`\`\`json
{
  "domainName": "业务域名称",
  "description": "业务域描述",
  "confidence": 0.92
}
\`\`\`
`.trim();
  }

  /**
   * 创建业务域并分配数据库
   */
  private async createDomain(discovered: DiscoveredDomain): Promise<void> {
    console.log(
      `[DomainDiscoverer] 创建业务域: ${discovered.suggestedName} (置信度: ${discovered.confidence})`
    );

    // 检查是否已存在同名业务域
    const existing = await this.prisma.businessDomain.findUnique({
      where: { name: discovered.suggestedName },
    });

    let domainId: number;

    if (existing) {
      console.log(`[DomainDiscoverer] 业务域已存在，使用现有域: ${existing.name}`);
      domainId = existing.id;
    } else {
      const domain = await this.prisma.businessDomain.create({
        data: {
          name: discovered.suggestedName,
          description: discovered.description,
        },
      });
      domainId = domain.id;
    }

    // 分配数据库到业务域
    await this.prisma.databaseMeta.updateMany({
      where: {
        id: {
          in: discovered.databaseIds,
        },
      },
      data: {
        domainId,
      },
    });

    console.log(
      `[DomainDiscoverer] 已将 ${discovered.databaseIds.length} 个数据库分配到业务域`
    );
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
}
