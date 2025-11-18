/**
 * RelationshipOrchestrator - 关系编排器（聚合类）
 *
 * 职责：
 * - 聚合和协调各个关系服务
 * - 提供统一的关系管理接口
 * - 保持向后兼容
 *
 * 拆分结构：
 * - RelationshipInferenceService: 关系推断逻辑
 * - RelationshipVerificationService: 关系验证逻辑
 * - RelationshipGraphService: 关系图谱构建和查询
 * - RelationshipStatisticsService: 关系统计和分析
 */

import { inject, injectable } from 'tsyringe';
import { DI_TOKENS } from '../tokens';
import {
  RelationshipInferenceService,
  type RelationshipInferOptions,
  type RelationshipInferResult,
} from './relationship/relationship-inference.service';
import {
  RelationshipVerificationService,
  type RelationshipVerifyOptions,
} from './relationship/relationship-verification.service';
import {
  RelationshipGraphService,
  type RelationshipGraph,
  type RelationshipGraphNode,
} from './relationship/relationship-graph.service';
import {
  RelationshipStatisticsService,
  type RelationshipStatistics,
  type DatabaseRelationshipStats,
} from './relationship/relationship-statistics.service';

// 重新导出类型，保持向后兼容
export type {
  RelationshipInferOptions,
  RelationshipInferResult,
  RelationshipVerifyOptions,
  RelationshipStatistics,
  RelationshipGraph,
  RelationshipGraphNode,
};

// 导出额外的类型
export type { DatabaseRelationshipStats } from './relationship/relationship-statistics.service';
export type {
  RelationshipGraphEdge,
} from './relationship/relationship-graph.service';

/**
 * RelationshipOrchestrator
 *
 * 关系编排器，管理表关系的完整生命周期
 * 通过委托给子服务实现各项功能，保持接口不变
 */
@injectable()
export class RelationshipOrchestrator {
  constructor(
    @inject(DI_TOKENS.RelationshipInferenceService)
    private readonly inferenceService: RelationshipInferenceService,

    @inject(DI_TOKENS.RelationshipVerificationService)
    private readonly verificationService: RelationshipVerificationService,

    @inject(DI_TOKENS.RelationshipGraphService)
    private readonly graphService: RelationshipGraphService,

    @inject(DI_TOKENS.RelationshipStatisticsService)
    private readonly statisticsService: RelationshipStatisticsService
  ) {}

  // ==================== 关系推断 ====================

  /**
   * 推断表关系
   * 委托给 RelationshipInferenceService
   *
   * @param options - 推断选项
   * @returns 推断结果
   */
  async inferRelationships(options: RelationshipInferOptions): Promise<RelationshipInferResult> {
    return this.inferenceService.inferRelationships(options);
  }

  /**
   * 删除低置信度关系
   * 委托给 RelationshipInferenceService
   *
   * @param dataSourceId - 数据源 ID
   * @param maxConfidence - 最大置信度阈值
   * @returns 删除的关系数量
   */
  async removeLowConfidenceRelationships(
    dataSourceId: number,
    maxConfidence: number = 0.6
  ): Promise<number> {
    return this.inferenceService.removeLowConfidenceRelationships(dataSourceId, maxConfidence);
  }

  // ==================== 关系验证 ====================

  /**
   * 验证关系
   * 委托给 RelationshipVerificationService
   *
   * @param options - 验证选项
   * @returns 是否成功
   */
  async verifyRelationship(options: RelationshipVerifyOptions): Promise<boolean> {
    return this.verificationService.verifyRelationship(options);
  }

  /**
   * 批量验证关系
   * 委托给 RelationshipVerificationService
   *
   * @param relationshipIds - 关系 ID 列表
   * @param isValid - 验证结果
   * @returns 成功验证的数量
   */
  async batchVerifyRelationships(
    relationshipIds: number[],
    isValid: boolean
  ): Promise<number> {
    return this.verificationService.batchVerifyRelationships(relationshipIds, isValid);
  }

  /**
   * 获取待验证的关系
   * 委托给 RelationshipVerificationService
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
    return this.verificationService.getPendingVerificationRelationships(
      dataSourceId,
      minConfidence,
      limit
    );
  }

  /**
   * 获取已验证的关系数量
   * 委托给 RelationshipVerificationService
   *
   * @param dataSourceId - 数据源 ID
   * @returns 已验证的关系数量
   */
  async getVerifiedCount(dataSourceId: number): Promise<number> {
    return this.verificationService.getVerifiedCount(dataSourceId);
  }

  // ==================== 关系图谱 ====================

  /**
   * 构建关系图谱
   * 委托给 RelationshipGraphService
   *
   * @param dataSourceId - 数据源 ID
   * @param databases - 可选的数据库列表
   * @param minConfidence - 最小置信度
   * @param tableId - 可选的中心表 ID
   * @param depth - 关系深度
   * @param databaseId - 可选的数据库 ID
   * @returns 关系图谱
   */
  async buildRelationshipGraph(
    dataSourceId: number,
    databases?: string[],
    minConfidence: number = 0.70,
    tableId?: number,
    depth: number = 2,
    databaseId?: number
  ): Promise<RelationshipGraph> {
    return this.graphService.buildRelationshipGraph(
      dataSourceId,
      databases,
      minConfidence,
      tableId,
      depth,
      databaseId
    );
  }

  /**
   * 查找表的直接关系
   * 委托给 RelationshipGraphService
   *
   * @param tableId - 表 ID
   * @returns 直接关系的表 ID 列表
   */
  async findDirectRelationships(tableId: number): Promise<{
    outgoing: number[];
    incoming: number[];
  }> {
    return this.graphService.findDirectRelationships(tableId);
  }

  /**
   * 查找两个表之间的路径
   * 委托给 RelationshipGraphService
   *
   * @param sourceTableId - 源表 ID
   * @param targetTableId - 目标表 ID
   * @param maxDepth - 最大深度
   * @returns 路径列表（每个路径是表 ID 数组）
   */
  async findPaths(
    sourceTableId: number,
    targetTableId: number,
    maxDepth: number = 3
  ): Promise<number[][]> {
    return this.graphService.findPaths(sourceTableId, targetTableId, maxDepth);
  }

  /**
   * 获取图谱中心节点
   * 委托给 RelationshipGraphService
   *
   * @param dataSourceId - 数据源 ID
   * @param limit - 限制数量
   * @returns 中心节点列表
   */
  async getCentralNodes(
    dataSourceId: number,
    limit: number = 10
  ): Promise<RelationshipGraphNode[]> {
    return this.graphService.getCentralNodes(dataSourceId, limit);
  }

  // ==================== 关系统计 ====================

  /**
   * 获取关系统计
   * 委托给 RelationshipStatisticsService
   *
   * @param dataSourceId - 数据源 ID
   * @param databases - 可选的数据库列表
   * @returns 关系统计
   */
  async getStatistics(
    dataSourceId: number,
    databases?: string[]
  ): Promise<RelationshipStatistics> {
    return this.statisticsService.getStatistics(dataSourceId, databases);
  }

  /**
   * 获取按数据库的关系统计
   * 委托给 RelationshipStatisticsService
   *
   * @param dataSourceId - 数据源 ID
   * @returns 数据库关系统计列表
   */
  async getStatisticsByDatabase(
    dataSourceId: number
  ): Promise<DatabaseRelationshipStats[]> {
    return this.statisticsService.getStatisticsByDatabase(dataSourceId);
  }

  /**
   * 获取置信度分布详情
   * 委托给 RelationshipStatisticsService
   *
   * @param dataSourceId - 数据源 ID
   * @returns 置信度区间及对应的关系数量
   */
  async getConfidenceDistribution(
    dataSourceId: number
  ): Promise<{ range: string; count: number }[]> {
    return this.statisticsService.getConfidenceDistribution(dataSourceId);
  }

  /**
   * 获取关系质量报告
   * 委托给 RelationshipStatisticsService
   *
   * @param dataSourceId - 数据源 ID
   * @returns 关系质量指标
   */
  async getQualityReport(dataSourceId: number): Promise<{
    totalRelationships: number;
    verificationRate: number;
    highConfidenceRate: number;
    explicitRate: number;
    avgConfidence: number;
    qualityScore: number;
  }> {
    return this.statisticsService.getQualityReport(dataSourceId);
  }
}
