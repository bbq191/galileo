/**
 * RelationshipOrchestrator 单元测试
 */

import { RelationshipOrchestrator } from '../relationship.orchestrator';
import type { DatabaseService } from '../../services/database.service';
import type { MetadataRepository } from '@/lib/metadata/storage/metadata-repository';
import type { CacheInvalidationService } from '@/lib/cache/cache-invalidation';

// Mock 依赖服务
const mockDbService = {
  prisma: {
    databaseMeta: {
      findMany: jest.fn(),
    },
    tableMeta: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    explicitRelationship: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    inferredRelationship: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
} as unknown as DatabaseService;

const mockMetadataRepository = {} as MetadataRepository;

const mockCacheInvalidation = {
  invalidateMetadata: jest.fn(),
} as unknown as CacheInvalidationService;

describe('RelationshipOrchestrator', () => {
  let orchestrator: RelationshipOrchestrator;

  beforeEach(() => {
    orchestrator = new RelationshipOrchestrator(
      mockDbService,
      mockMetadataRepository,
      mockCacheInvalidation
    );
    jest.clearAllMocks();
  });

  describe('推断关系', () => {
    it('应该处理无数据库的情况', async () => {
      // 准备
      (mockDbService.prisma.databaseMeta.findMany as jest.Mock).mockResolvedValue([]);

      // 执行
      const result = await orchestrator.inferRelationships({
        dataSourceId: 1,
      });

      // 断言
      expect(result.success).toBe(false);
      expect(result.error).toContain('No databases found');
    });
  });

  describe('获取关系统计', () => {
    it('应该返回关系统计信息', async () => {
      // 准备
      (mockDbService.prisma.databaseMeta.findMany as jest.Mock).mockResolvedValue([
        { id: 1, databaseName: 'test_db' },
      ]);
      (mockDbService.prisma.tableMeta.findMany as jest.Mock).mockResolvedValue([
        { id: 1, tableName: 'users' },
        { id: 2, tableName: 'orders' },
      ]);
      (mockDbService.prisma.explicitRelationship.count as jest.Mock).mockResolvedValue(5);
      (mockDbService.prisma.inferredRelationship.findMany as jest.Mock).mockResolvedValue([
        {
          sourceTableId: 1,
          targetTableId: 2,
          confidenceScore: 0.85,
          isVerified: false,
          relationshipType: 'one-to-many',
        },
        {
          sourceTableId: 2,
          targetTableId: 1,
          confidenceScore: 0.65,
          isVerified: true,
          relationshipType: 'many-to-one',
        },
      ]);

      // 执行
      const result = await orchestrator.getStatistics(1);

      // 断言
      expect(result.total).toBe(7); // 5 explicit + 2 inferred
      expect(result.explicit).toBe(5);
      expect(result.inferred).toBe(2);
      expect(result.verified).toBe(1);
      expect(result.byConfidence.high).toBe(1); // >= 0.8
      expect(result.byConfidence.medium).toBe(1); // 0.6-0.8
    });
  });

  describe('构建关系图谱', () => {
    it('应该构建空图谱', async () => {
      // 准备
      (mockDbService.prisma.databaseMeta.findMany as jest.Mock).mockResolvedValue([]);
      (mockDbService.prisma.inferredRelationship.findMany as jest.Mock).mockResolvedValue([]);

      // 执行
      const result = await orchestrator.buildRelationshipGraph(1);

      // 断言
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
      expect(result.stats.nodeCount).toBe(0);
      expect(result.stats.edgeCount).toBe(0);
    });
  });

  describe('删除低置信度关系', () => {
    it('应该删除低置信度关系', async () => {
      // 准备
      (mockDbService.prisma.tableMeta.findMany as jest.Mock).mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ]);
      (mockDbService.prisma.inferredRelationship.deleteMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      // 执行
      const result = await orchestrator.removeLowConfidenceRelationships(1, 0.6);

      // 断言
      expect(result).toBe(3);
      expect(mockDbService.prisma.inferredRelationship.deleteMany).toHaveBeenCalled();
    });
  });

  describe('验证关系', () => {
    it('应该验证并更新关系', async () => {
      // 准备
      const mockRelationship = {
        id: 1,
        confidenceScore: 0.75,
      };

      (mockDbService.prisma.inferredRelationship.findUnique as jest.Mock).mockResolvedValue(
        mockRelationship
      );
      (mockDbService.prisma.inferredRelationship.update as jest.Mock).mockResolvedValue({
        ...mockRelationship,
        isVerified: true,
      });

      // 执行
      const result = await orchestrator.verifyRelationship({
        relationshipId: 1,
        isValid: true,
        confidence: 0.90,
      });

      // 断言
      expect(result).toBe(true);
      expect(mockDbService.prisma.inferredRelationship.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          isVerified: true,
          verifiedAt: expect.any(Date),
          confidenceScore: 0.90,
        },
      });
    });

    it('应该删除无效关系', async () => {
      // 准备
      (mockDbService.prisma.inferredRelationship.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
      });
      (mockDbService.prisma.inferredRelationship.delete as jest.Mock).mockResolvedValue({
        id: 1,
      });

      // 执行
      const result = await orchestrator.verifyRelationship({
        relationshipId: 1,
        isValid: false,
      });

      // 断言
      expect(result).toBe(true);
      expect(mockDbService.prisma.inferredRelationship.delete).toHaveBeenCalled();
    });
  });
});
