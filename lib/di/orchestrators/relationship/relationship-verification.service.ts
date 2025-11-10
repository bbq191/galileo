/**
 * RelationshipVerificationService - 关系验证服务
 *
 * 职责：
 * - 验证推断的表关系
 * - 管理关系的验证状态
 * - 处理验证后的关系更新或删除
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../../tokens';
import type { DatabaseService } from '../../services/database.service';

/**
 * 关系验证选项
 */
export interface RelationshipVerifyOptions {
  /** 关系 ID */
  relationshipId?: number;

  /** 源表 ID */
  sourceTableId?: number;

  /** 目标表 ID */
  targetTableId?: number;

  /** 验证方法 */
  method?: 'data_analysis' | 'manual' | 'ai';

  /** 验证结果 */
  isValid: boolean;

  /** 验证置信度 */
  confidence?: number;
}

/**
 * RelationshipVerificationService
 *
 * 关系验证服务，负责验证和管理推断的表关系
 */
@injectable()
export class RelationshipVerificationService {
  constructor(
    @inject(DI_TOKENS.DatabaseService)
    private readonly dbService: DatabaseService
  ) {}

  /**
   * 验证关系
   *
   * @param options - 验证选项
   * @returns 是否成功
   */
  async verifyRelationship(options: RelationshipVerifyOptions): Promise<boolean> {
    try {
      console.log(`[RelationshipVerificationService] Verifying relationship...`);

      if (options.relationshipId) {
        // 验证已存在的推断关系
        const relationship = await this.dbService.prisma.inferredRelationship.findUnique({
          where: { id: options.relationshipId },
        });

        if (!relationship) {
          return false;
        }

        if (options.isValid) {
          // 标记为已验证
          await this.dbService.prisma.inferredRelationship.update({
            where: { id: options.relationshipId },
            data: {
              isVerified: true,
              verifiedAt: new Date(),
              confidenceScore: options.confidence || relationship.confidenceScore,
            },
          });

          console.log(`[RelationshipVerificationService] Relationship ${options.relationshipId} verified`);
        } else {
          // 删除无效关系
          await this.dbService.prisma.inferredRelationship.delete({
            where: { id: options.relationshipId },
          });

          console.log(`[RelationshipVerificationService] Invalid relationship ${options.relationshipId} removed`);
        }

        return true;
      }

      return false;

    } catch (error) {
      console.error(`[RelationshipVerificationService] Verify relationship failed:`, error);
      return false;
    }
  }

  /**
   * 批量验证关系
   *
   * @param relationshipIds - 关系 ID 列表
   * @param isValid - 验证结果
   * @returns 成功验证的数量
   */
  async batchVerifyRelationships(
    relationshipIds: number[],
    isValid: boolean
  ): Promise<number> {
    try {
      console.log(`[RelationshipVerificationService] Batch verifying ${relationshipIds.length} relationships...`);

      if (isValid) {
        // 批量标记为已验证
        const result = await this.dbService.prisma.inferredRelationship.updateMany({
          where: {
            id: { in: relationshipIds },
          },
          data: {
            isVerified: true,
            verifiedAt: new Date(),
          },
        });

        console.log(`[RelationshipVerificationService] ${result.count} relationships verified`);
        return result.count;
      } else {
        // 批量删除无效关系
        const result = await this.dbService.prisma.inferredRelationship.deleteMany({
          where: {
            id: { in: relationshipIds },
          },
        });

        console.log(`[RelationshipVerificationService] ${result.count} invalid relationships removed`);
        return result.count;
      }

    } catch (error) {
      console.error(`[RelationshipVerificationService] Batch verify relationships failed:`, error);
      return 0;
    }
  }

  /**
   * 获取待验证的关系
   *
   * @param dataSourceId - 数据源 ID
   * @param minConfidence - 最小置信度
   * @param limit - 限制数量
   * @returns 待验证的关系列表
   */
  async getPendingVerificationRelationships(
    dataSourceId: number,
    minConfidence: number = 0.7,
    limit: number = 50
  ) {
    try {
      console.log(`[RelationshipVerificationService] Getting pending verification relationships...`);

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

      // 查询待验证的关系
      const relationships = await this.dbService.prisma.inferredRelationship.findMany({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
          isVerified: false,
          confidenceScore: { gte: minConfidence },
        },
        include: {
          sourceTable: {
            select: {
              tableName: true,
              database: {
                select: {
                  databaseName: true,
                },
              },
            },
          },
          targetTable: {
            select: {
              tableName: true,
              database: {
                select: {
                  databaseName: true,
                },
              },
            },
          },
        },
        orderBy: {
          confidenceScore: 'desc',
        },
        take: limit,
      });

      console.log(`[RelationshipVerificationService] Found ${relationships.length} pending verification relationships`);
      return relationships;

    } catch (error) {
      console.error(`[RelationshipVerificationService] Get pending verification relationships failed:`, error);
      return [];
    }
  }

  /**
   * 获取已验证的关系数量
   *
   * @param dataSourceId - 数据源 ID
   * @returns 已验证的关系数量
   */
  async getVerifiedCount(dataSourceId: number): Promise<number> {
    try {
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

      // 统计已验证的关系
      const count = await this.dbService.prisma.inferredRelationship.count({
        where: {
          OR: [
            { sourceTableId: { in: tableIds } },
            { targetTableId: { in: tableIds } },
          ],
          isVerified: true,
        },
      });

      return count;

    } catch (error) {
      console.error(`[RelationshipVerificationService] Get verified count failed:`, error);
      return 0;
    }
  }
}
