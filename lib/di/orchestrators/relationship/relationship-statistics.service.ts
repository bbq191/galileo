/**
 * RelationshipStatisticsService - 关系统计服务
 *
 * 职责：
 * - 提供关系统计信息
 * - 按不同维度分析关系分布
 * - 生成关系报告
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';

/**
 * 关系统计信息
 */
export interface RelationshipStatistics {
  /** 总关系数 */
  total: number;

  /** 显式关系数 */
  explicit: number;

  /** 推断关系数 */
  inferred: number;

  /** 已验证关系数 */
  verified: number;

  /** 按置信度分布 */
  byConfidence: {
    high: number; // >= 0.8
    medium: number; // 0.6-0.8
    low: number; // < 0.6
  };

  /** 按关系类型分布 */
  byType: {
    oneToOne: number;
    oneToMany: number;
    manyToMany: number;
  };

  /** 跨数据库关系数 */
  crossDatabase: number;

  /** 自引用关系数 */
  selfReferencing: number;
}

/**
 * 数据库关系统计
 */
export interface DatabaseRelationshipStats {
  /** 数据库名 */
  databaseName: string;

  /** 表数量 */
  tableCount: number;

  /** 关系数量 */
  relationshipCount: number;

  /** 平均每表关系数 */
  avgRelationshipsPerTable: number;

  /** 孤立表数量（无关系） */
  isolatedTableCount: number;
}

/**
 * RelationshipStatisticsService
 *
 * 关系统计服务，负责提供各类关系统计信息
 */
@injectable()
export class RelationshipStatisticsService {
  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService
  ) {}

  /**
   * 获取关系统计
   *
   * @param dataSourceId - 数据源 ID
   * @param databases - 可选的数据库列表
   * @returns 关系统计
   */
  async getStatistics(
    dataSourceId: number,
    databases?: string[]
  ): Promise<RelationshipStatistics> {
    try {
      console.log(`[RelationshipStatisticsService] Getting relationship statistics for data source ${dataSourceId}...`);

      // 获取数据库 ID 列表
      const dbMetas = await this.dbService.prisma.databaseMeta.findMany({
        where: {
          sourceId: dataSourceId,
          ...(databases && { databaseName: { in: databases } }),
        },
        select: { id: true },
      });

      const databaseIds = dbMetas.map(db => db.id);

      // 获取表 ID 列表
      const tables = await this.dbService.prisma.tableMeta.findMany({
        where: { databaseId: { in: databaseIds } },
        select: { id: true },
      });

      const tableIds = tables.map(t => t.id);

      // 统计显式关系
      const explicitCount = await this.dbService.prisma.explicitRelationship.count({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
        },
      });

      // 统计推断关系
      const inferredRelationships = await this.dbService.prisma.inferredRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
        },
        select: {
          confidenceScore: true,
          isVerified: true,
          sourceTableId: true,
          targetTableId: true,
          relationshipType: true,
        },
      });

      const inferredCount = inferredRelationships.length;
      const verifiedCount = inferredRelationships.filter(r => r.isVerified).length;

      // 按置信度分类 (Decimal 转换为 number)
      const highConfidence = inferredRelationships.filter(r => r.confidenceScore.toNumber() >= 0.8).length;
      const mediumConfidence = inferredRelationships.filter(
        r => r.confidenceScore.toNumber() >= 0.6 && r.confidenceScore.toNumber() < 0.8
      ).length;
      const lowConfidence = inferredRelationships.filter(r => r.confidenceScore.toNumber() < 0.6).length;

      // 按类型分类 (使用 Prisma 枚举值)
      const oneToOne = inferredRelationships.filter(r => r.relationshipType === 'ONE_TO_ONE').length;
      const oneToMany = inferredRelationships.filter(r => r.relationshipType === 'ONE_TO_MANY').length;
      const manyToMany = inferredRelationships.filter(r => r.relationshipType === 'MANY_TO_MANY').length;

      // 跨数据库关系（源表和目标表在不同数据库）
      // 简化处理：假设 sourceTableId 和 targetTableId 不同即为跨表
      const crossDatabase = inferredRelationships.filter(r => {
        return r.sourceTableId !== r.targetTableId;
      }).length;

      // 自引用关系
      const selfReferencing = inferredRelationships.filter(
        r => r.sourceTableId === r.targetTableId
      ).length;

      const stats: RelationshipStatistics = {
        total: explicitCount + inferredCount,
        explicit: explicitCount,
        inferred: inferredCount,
        verified: verifiedCount,
        byConfidence: {
          high: highConfidence,
          medium: mediumConfidence,
          low: lowConfidence,
        },
        byType: {
          oneToOne,
          oneToMany,
          manyToMany,
        },
        crossDatabase,
        selfReferencing,
      };

      console.log(`[RelationshipStatisticsService] Statistics retrieved: ${stats.total} total relationships`);
      return stats;

    } catch (error) {
      console.error(`[RelationshipStatisticsService] Get statistics failed:`, error);

      // 返回空统计
      return {
        total: 0,
        explicit: 0,
        inferred: 0,
        verified: 0,
        byConfidence: { high: 0, medium: 0, low: 0 },
        byType: { oneToOne: 0, oneToMany: 0, manyToMany: 0 },
        crossDatabase: 0,
        selfReferencing: 0,
      };
    }
  }

  /**
   * 获取按数据库的关系统计
   *
   * @param dataSourceId - 数据源 ID
   * @returns 数据库关系统计列表
   */
  async getStatisticsByDatabase(
    dataSourceId: number
  ): Promise<DatabaseRelationshipStats[]> {
    try {
      console.log(`[RelationshipStatisticsService] Getting relationship statistics by database...`);

      const dbMetas = await this.dbService.prisma.databaseMeta.findMany({
        where: {
          sourceId: dataSourceId,
        },
        include: {
          tables: {
            include: {
              sourceRelationships: true,
              targetRelationships: true,
            },
          },
        },
      });

      const stats: DatabaseRelationshipStats[] = [];

      for (const db of dbMetas) {
        const tableCount = db.tables.length;
        let relationshipCount = 0;
        let isolatedTableCount = 0;

        for (const table of db.tables) {
          const rels = table.sourceRelationships.length + table.targetRelationships.length;
          relationshipCount += rels;

          if (rels === 0) {
            isolatedTableCount++;
          }
        }

        stats.push({
          databaseName: db.databaseName,
          tableCount,
          relationshipCount,
          avgRelationshipsPerTable: tableCount > 0 ? relationshipCount / tableCount : 0,
          isolatedTableCount,
        });
      }

      console.log(`[RelationshipStatisticsService] Statistics by database retrieved for ${stats.length} databases`);
      return stats;

    } catch (error) {
      console.error(`[RelationshipStatisticsService] Get statistics by database failed:`, error);
      return [];
    }
  }

  /**
   * 获取置信度分布详情
   *
   * @param dataSourceId - 数据源 ID
   * @returns 置信度区间及对应的关系数量
   */
  async getConfidenceDistribution(
    dataSourceId: number
  ): Promise<{ range: string; count: number }[]> {
    try {
      console.log(`[RelationshipStatisticsService] Getting confidence distribution...`);

      // 获取表 ID
      const tables = await this.dbService.prisma.tableMeta.findMany({
        where: {
          database: {
            sourceId: dataSourceId,
          },
        },
        select: { id: true },
      });

      const tableIds = tables.map(t => t.id);

      // 获取所有推断关系的置信度
      const relationships = await this.dbService.prisma.inferredRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
        },
        select: {
          confidenceScore: true,
        },
      });

      // 按区间统计
      const distribution = [
        { range: '0.0-0.5', count: 0 },
        { range: '0.5-0.6', count: 0 },
        { range: '0.6-0.7', count: 0 },
        { range: '0.7-0.8', count: 0 },
        { range: '0.8-0.9', count: 0 },
        { range: '0.9-1.0', count: 0 },
      ];

      for (const rel of relationships) {
        const score = rel.confidenceScore.toNumber(); // Decimal 转换为 number
        if (score < 0.5) distribution[0].count++;
        else if (score < 0.6) distribution[1].count++;
        else if (score < 0.7) distribution[2].count++;
        else if (score < 0.8) distribution[3].count++;
        else if (score < 0.9) distribution[4].count++;
        else distribution[5].count++;
      }

      console.log(`[RelationshipStatisticsService] Confidence distribution retrieved`);
      return distribution;

    } catch (error) {
      console.error(`[RelationshipStatisticsService] Get confidence distribution failed:`, error);
      return [];
    }
  }

  /**
   * 获取关系质量报告
   *
   * @param dataSourceId - 数据源 ID
   * @returns 关系质量指标
   */
  async getQualityReport(dataSourceId: number): Promise<{
    totalRelationships: number;
    verificationRate: number; // 已验证率
    highConfidenceRate: number; // 高置信度率
    explicitRate: number; // 显式关系率
    avgConfidence: number; // 平均置信度
    qualityScore: number; // 综合质量分数 (0-100)
  }> {
    try {
      console.log(`[RelationshipStatisticsService] Getting quality report...`);

      const stats = await this.getStatistics(dataSourceId);

      const totalRelationships = stats.total;
      const verificationRate = stats.inferred > 0 ? stats.verified / stats.inferred : 0;
      const highConfidenceRate = stats.inferred > 0 ? stats.byConfidence.high / stats.inferred : 0;
      const explicitRate = totalRelationships > 0 ? stats.explicit / totalRelationships : 0;

      // 计算平均置信度
      const tables = await this.dbService.prisma.tableMeta.findMany({
        where: {
          database: {
            sourceId: dataSourceId,
          },
        },
        select: { id: true },
      });

      const tableIds = tables.map(t => t.id);

      const relationships = await this.dbService.prisma.inferredRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
        },
        select: {
          confidenceScore: true,
        },
      });

      const avgConfidence = relationships.length > 0
        ? relationships.reduce((sum, r) => sum + r.confidenceScore.toNumber(), 0) / relationships.length
        : 0;

      // 计算综合质量分数 (加权平均)
      const qualityScore = Math.round(
        explicitRate * 40 + // 显式关系占 40%
        highConfidenceRate * 30 + // 高置信度占 30%
        verificationRate * 20 + // 验证率占 20%
        avgConfidence * 10 // 平均置信度占 10%
      );

      const report = {
        totalRelationships,
        verificationRate: Math.round(verificationRate * 100) / 100,
        highConfidenceRate: Math.round(highConfidenceRate * 100) / 100,
        explicitRate: Math.round(explicitRate * 100) / 100,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        qualityScore,
      };

      console.log(`[RelationshipStatisticsService] Quality report generated: score ${report.qualityScore}/100`);
      return report;

    } catch (error) {
      console.error(`[RelationshipStatisticsService] Get quality report failed:`, error);
      return {
        totalRelationships: 0,
        verificationRate: 0,
        highConfidenceRate: 0,
        explicitRate: 0,
        avgConfidence: 0,
        qualityScore: 0,
      };
    }
  }
}
