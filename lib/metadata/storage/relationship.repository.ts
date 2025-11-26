/**
 * 关系仓储
 * 负责显式关系和推断关系的 CRUD 操作
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient, ExplicitRelationship, InferredRelationship } from '@prisma/client';
import { DI_TOKENS } from '@/lib/di/tokens';
import type {
  CreateExplicitRelationshipInput,
  CreateInferredRelationshipInput,
  VerifyInferredRelationshipInput,
  BatchSaveResult,
} from './types';

/**
 * 关系仓储类
 */
@injectable()
export class RelationshipRepository {
  constructor(
    @inject(DI_TOKENS.PrismaClient) private prisma: PrismaClient
  ) {}

  // ==================== 显式关系 ====================

  /**
   * 创建显式关系
   */
  async createExplicitRelationship(
    input: CreateExplicitRelationshipInput
  ): Promise<ExplicitRelationship> {
    return await this.prisma.explicitRelationship.create({
      data: {
        sourceTableId: input.sourceTableId,
        sourceColumnId: input.sourceColumnId,
        targetTableId: input.targetTableId,
        targetColumnId: input.targetColumnId,
        constraintName: input.constraintName,
        relationshipType: input.relationshipType ?? 'ONE_TO_MANY',
      },
    });
  }

  /**
   * 获取表的所有显式关系（作为源表）
   */
  async getExplicitRelationshipsBySourceTable(
    tableId: number
  ): Promise<ExplicitRelationship[]> {
    return await this.prisma.explicitRelationship.findMany({
      where: { sourceTableId: tableId },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });
  }

  /**
   * 获取表的所有显式关系（作为目标表）
   */
  async getExplicitRelationshipsByTargetTable(
    tableId: number
  ): Promise<ExplicitRelationship[]> {
    return await this.prisma.explicitRelationship.findMany({
      where: { targetTableId: tableId },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });
  }

  /**
   * 删除显式关系
   */
  async deleteExplicitRelationship(id: number): Promise<ExplicitRelationship> {
    return await this.prisma.explicitRelationship.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新显式关系
   */
  async upsertExplicitRelationship(
    input: CreateExplicitRelationshipInput
  ): Promise<ExplicitRelationship> {
    return await this.prisma.explicitRelationship.upsert({
      where: {
        sourceTableId_sourceColumnId_targetTableId_targetColumnId: {
          sourceTableId: input.sourceTableId,
          sourceColumnId: input.sourceColumnId,
          targetTableId: input.targetTableId,
          targetColumnId: input.targetColumnId,
        },
      },
      create: {
        sourceTableId: input.sourceTableId,
        sourceColumnId: input.sourceColumnId,
        targetTableId: input.targetTableId,
        targetColumnId: input.targetColumnId,
        constraintName: input.constraintName,
        relationshipType: input.relationshipType ?? 'ONE_TO_MANY',
      },
      update: {
        constraintName: input.constraintName,
        relationshipType: input.relationshipType,
      },
    });
  }

  // ==================== 推断关系 ====================

  /**
   * 创建推断关系
   */
  async createInferredRelationship(
    input: CreateInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return await this.prisma.inferredRelationship.create({
      data: {
        sourceTableId: input.sourceTableId,
        sourceColumnId: input.sourceColumnId,
        targetTableId: input.targetTableId,
        targetColumnId: input.targetColumnId,
        confidenceScore: input.confidenceScore,
        relationshipType: input.relationshipType ?? 'ONE_TO_MANY',
        inferenceMethod: input.inferenceMethod ?? 'rule',
        reasoning: input.reasoning,
        isVerified: input.isVerified ?? false,
        verifiedBy: input.verifiedBy,
        verifiedAt: input.verifiedAt,
      },
    });
  }

  /**
   * 获取表的所有推断关系（作为源表）
   */
  async getInferredRelationshipsBySourceTable(
    tableId: number
  ): Promise<InferredRelationship[]> {
    return await this.prisma.inferredRelationship.findMany({
      where: { sourceTableId: tableId },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });
  }

  /**
   * 获取未验证的推断关系
   */
  async getUnverifiedInferredRelationships(): Promise<InferredRelationship[]> {
    return await this.prisma.inferredRelationship.findMany({
      where: { isVerified: false },
      orderBy: { confidenceScore: 'desc' },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });
  }

  /**
   * 验证推断关系
   */
  async verifyInferredRelationship(
    id: number,
    input: VerifyInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return await this.prisma.inferredRelationship.update({
      where: { id },
      data: {
        isVerified: input.isVerified,
        verifiedBy: input.verifiedBy,
        verifiedAt: input.verifiedAt ?? new Date(),
      },
    });
  }

  /**
   * 删除推断关系
   */
  async deleteInferredRelationship(id: number): Promise<InferredRelationship> {
    return await this.prisma.inferredRelationship.delete({
      where: { id },
    });
  }

  /**
   * 创建或更新推断关系
   */
  async upsertInferredRelationship(
    input: CreateInferredRelationshipInput
  ): Promise<InferredRelationship> {
    return await this.prisma.inferredRelationship.upsert({
      where: {
        sourceTableId_sourceColumnId_targetTableId_targetColumnId: {
          sourceTableId: input.sourceTableId,
          sourceColumnId: input.sourceColumnId,
          targetTableId: input.targetTableId,
          targetColumnId: input.targetColumnId,
        },
      },
      create: {
        sourceTableId: input.sourceTableId,
        sourceColumnId: input.sourceColumnId,
        targetTableId: input.targetTableId,
        targetColumnId: input.targetColumnId,
        confidenceScore: input.confidenceScore,
        relationshipType: input.relationshipType ?? 'ONE_TO_MANY',
        inferenceMethod: input.inferenceMethod ?? 'rule',
        reasoning: input.reasoning,
        isVerified: input.isVerified ?? false,
        verifiedBy: input.verifiedBy,
        verifiedAt: input.verifiedAt,
      },
      update: {
        confidenceScore: input.confidenceScore,
        relationshipType: input.relationshipType,
        inferenceMethod: input.inferenceMethod,
        reasoning: input.reasoning,
      },
    });
  }

  /**
   * 批量保存推断关系
   */
  async batchSaveInferredRelationships(
    inputs: CreateInferredRelationshipInput[]
  ): Promise<BatchSaveResult> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    const errors: Array<{ entity: string; error: string }> = [];

    console.log(`开始批量保存 ${inputs.length} 个推断关系...`);

    for (const input of inputs) {
      try {
        await this.upsertInferredRelationship(input);
        successCount++;
      } catch (error) {
        failureCount++;
        const entity = `${input.sourceTableId}.${input.sourceColumnId} -> ${input.targetTableId}.${input.targetColumnId}`;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ entity, error: errorMessage });
        console.error(`保存推断关系失败 [${entity}]:`, errorMessage);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`批量保存完成: 成功 ${successCount}, 失败 ${failureCount}, 耗时 ${duration}ms`);

    return {
      successCount,
      failureCount,
      skippedCount: 0,
      errors,
      duration,
    };
  }
}
