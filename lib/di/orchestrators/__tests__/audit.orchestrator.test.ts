/**
 * AuditOrchestrator 单元测试
 */

import 'reflect-metadata';
import { AuditOrchestrator } from '../audit.orchestrator';
import type { DatabaseService } from '@/lib/di/services/database.service';

describe('AuditOrchestrator', () => {
  let orchestrator: AuditOrchestrator;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockPrisma: any;

  beforeEach(() => {
    // 创建 mock PrismaClient
    mockPrisma = {
      queryAuditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    // 创建 mock DatabaseService
    mockDatabaseService = {
      prisma: mockPrisma,
    } as any;

    // 创建编排器实例
    orchestrator = new AuditOrchestrator(mockDatabaseService);
  });

  describe('logQuery', () => {
    it('应该成功记录查询审计日志', async () => {
      const queryEntry = {
        sessionId: 'session-123',
        naturalLanguageQuery: '查询所有用户',
        intent: { type: 'select', entities: ['users'], conditions: [] },
        generatedSQL: 'SELECT * FROM users',
        executionResult: {
          success: true,
          rowCount: 10,
        },
        metadata: {
          usedDatabases: ['main'],
          usedTables: ['users'],
          usedColumns: ['*'],
        },
        performance: {
          intentRecognitionTime: 100,
          sqlGenerationTime: 50,
          validationTime: 20,
          executionTime: 200,
          totalTime: 370,
        },
        timestamp: new Date(),
      };

      mockPrisma.queryAuditLog.create.mockResolvedValue({});

      await orchestrator.logQuery(queryEntry);

      expect(mockPrisma.queryAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-123',
          naturalLanguageQuery: '查询所有用户',
          generatedSql: 'SELECT * FROM users',
          executionSuccess: true,
          rowCount: 10,
        }),
      });
    });

    it('应该处理记录失败而不抛出错误', async () => {
      const queryEntry = {
        sessionId: 'session-123',
        naturalLanguageQuery: '查询所有用户',
        intent: { type: 'select', entities: [], conditions: [] },
        generatedSQL: 'SELECT * FROM users',
        executionResult: { success: true },
        metadata: {
          usedDatabases: [],
          usedTables: [],
          usedColumns: [],
        },
        performance: {
          intentRecognitionTime: 0,
          sqlGenerationTime: 0,
          validationTime: 0,
          executionTime: 0,
          totalTime: 0,
        },
        timestamp: new Date(),
      };

      mockPrisma.queryAuditLog.create.mockRejectedValue(new Error('Database error'));

      // 不应该抛出错误
      await expect(orchestrator.logQuery(queryEntry)).resolves.not.toThrow();
    });
  });

  describe('getQueryHistory', () => {
    it('应该获取查询历史（带分页）', async () => {
      const mockLogs = [
        {
          id: BigInt(1),
          sessionId: 'session-1',
          naturalLanguageQuery: 'query 1',
          intent: '{"type":"select"}',
          generatedSql: 'SELECT 1',
          executionSuccess: true,
          rowCount: 1,
          usedDatabases: '["main"]',
          usedTables: '["users"]',
          intentRecognitionTime: 100,
          sqlGenerationTime: 50,
          validationTime: 20,
          executionTime: 200,
          totalTime: 370,
          timestamp: new Date(),
          userId: null,
          userName: null,
          executionError: null,
          ipAddress: null,
          userAgent: null,
        },
      ];

      mockPrisma.queryAuditLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.queryAuditLog.count.mockResolvedValue(1);

      const result = await orchestrator.getQueryHistory({
        page: 1,
        limit: 50,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.totalCount).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('应该支持按用户 ID 过滤', async () => {
      mockPrisma.queryAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.queryAuditLog.count.mockResolvedValue(0);

      await orchestrator.getQueryHistory({
        userId: 'user-123',
        page: 1,
        limit: 50,
      });

      expect(mockPrisma.queryAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-123',
          }),
        })
      );
    });

    it('应该支持按成功状态过滤', async () => {
      mockPrisma.queryAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.queryAuditLog.count.mockResolvedValue(0);

      await orchestrator.getQueryHistory({
        success: true,
        page: 1,
        limit: 50,
      });

      expect(mockPrisma.queryAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            executionSuccess: true,
          }),
        })
      );
    });

    it('应该支持按时间范围过滤', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockPrisma.queryAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.queryAuditLog.count.mockResolvedValue(0);

      await orchestrator.getQueryHistory({
        startDate,
        endDate,
        page: 1,
        limit: 50,
      });

      expect(mockPrisma.queryAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: startDate,
              lte: endDate,
            },
          }),
        })
      );
    });
  });

  describe('getStatistics', () => {
    it('应该获取审计统计信息', async () => {
      mockPrisma.queryAuditLog.count.mockResolvedValueOnce(100); // total
      mockPrisma.queryAuditLog.count.mockResolvedValueOnce(85); // success
      mockPrisma.queryAuditLog.aggregate.mockResolvedValue({
        _avg: { executionTime: 250 },
      });

      const result = await orchestrator.getStatistics();

      expect(result.totalQueries).toBe(100);
      expect(result.successQueries).toBe(85);
      expect(result.failedQueries).toBe(15);
      expect(result.successRate).toBe(0.85);
      expect(result.avgExecutionTime).toBe(250);
    });

    it('应该支持时间范围过滤', async () => {
      const startDate = new Date('2024-01-01');

      mockPrisma.queryAuditLog.count.mockResolvedValue(0);
      mockPrisma.queryAuditLog.aggregate.mockResolvedValue({
        _avg: { executionTime: 0 },
      });

      await orchestrator.getStatistics({ startDate });

      expect(mockPrisma.queryAuditLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: expect.objectContaining({
              gte: startDate,
            }),
          }),
        })
      );
    });
  });

  describe('detectAnomalies', () => {
    it('应该检测高失败率异常', async () => {
      mockPrisma.queryAuditLog.count
        .mockResolvedValueOnce(100) // total queries
        .mockResolvedValueOnce(40) // success queries
        .mockResolvedValueOnce(10); // slow queries

      mockPrisma.queryAuditLog.aggregate.mockResolvedValue({
        _avg: { executionTime: 200 },
      });

      const anomalies = await orchestrator.detectAnomalies(60);

      expect(anomalies.length).toBeGreaterThan(0);
      const highFailureAnomaly = anomalies.find(a => a.type === 'high_failure_rate');
      expect(highFailureAnomaly).toBeDefined();
      expect(highFailureAnomaly?.severity).toBe('high');
    });

    it('应该检测慢查询异常', async () => {
      mockPrisma.queryAuditLog.count
        .mockResolvedValueOnce(100) // total queries
        .mockResolvedValueOnce(90) // success queries
        .mockResolvedValueOnce(30); // slow queries (30% > 20% threshold)

      mockPrisma.queryAuditLog.aggregate.mockResolvedValue({
        _avg: { executionTime: 3000 },
      });

      const anomalies = await orchestrator.detectAnomalies(60);

      const slowQueryAnomaly = anomalies.find(a => a.type === 'slow_query');
      expect(slowQueryAnomaly).toBeDefined();
    });

    it('应该检测异常高频活动', async () => {
      mockPrisma.queryAuditLog.count
        .mockResolvedValueOnce(2000) // 1小时内2000次查询
        .mockResolvedValueOnce(1800)
        .mockResolvedValueOnce(100);

      mockPrisma.queryAuditLog.aggregate.mockResolvedValue({
        _avg: { executionTime: 200 },
      });

      const anomalies = await orchestrator.detectAnomalies(60);

      const unusualActivityAnomaly = anomalies.find(a => a.type === 'unusual_activity');
      expect(unusualActivityAnomaly).toBeDefined();
    });
  });

  describe('getSlowQueries', () => {
    it('应该获取慢查询列表', async () => {
      const mockLogs = [
        {
          id: BigInt(1),
          sessionId: 'session-1',
          naturalLanguageQuery: 'slow query',
          intent: '{"type":"select"}',
          generatedSql: 'SELECT * FROM large_table',
          executionSuccess: true,
          executionTime: 5000,
          rowCount: 1000,
          usedDatabases: '["main"]',
          usedTables: '["large_table"]',
          intentRecognitionTime: 100,
          sqlGenerationTime: 50,
          validationTime: 20,
          totalTime: 5170,
          timestamp: new Date(),
          userId: null,
          userName: null,
          executionError: null,
          ipAddress: null,
          userAgent: null,
        },
      ];

      mockPrisma.queryAuditLog.findMany.mockResolvedValue(mockLogs);

      const result = await orchestrator.getSlowQueries(1000);

      expect(result).toHaveLength(1);
      expect(mockPrisma.queryAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            executionTime: { gte: 1000 },
          }),
          orderBy: { executionTime: 'desc' },
        })
      );
    });
  });

  describe('cleanupOldLogs', () => {
    it('应该清理过期审计日志', async () => {
      mockPrisma.queryAuditLog.deleteMany.mockResolvedValue({ count: 150 });

      const result = await orchestrator.cleanupOldLogs(90);

      expect(result).toBe(150);
      expect(mockPrisma.queryAuditLog.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
        })
      );
    });
  });

  describe('getUserQueryPatterns', () => {
    it('应该分析用户查询模式', async () => {
      const mockLogs = [
        {
          id: BigInt(1),
          userId: 'user-1',
          usedTables: '["users","orders"]',
          timestamp: new Date('2024-01-01T10:00:00'),
        },
        {
          id: BigInt(2),
          userId: 'user-1',
          usedTables: '["users"]',
          timestamp: new Date('2024-01-01T14:00:00'),
        },
        {
          id: BigInt(3),
          userId: 'user-1',
          usedTables: '["orders"]',
          timestamp: new Date('2024-01-01T18:00:00'),
        },
      ];

      mockPrisma.queryAuditLog.findMany.mockResolvedValue(mockLogs as any);

      const result = await orchestrator.getUserQueryPatterns('user-1', 30);

      expect(result.totalQueries).toBe(3);
      expect(result.mostUsedTables).toContainEqual(
        expect.objectContaining({ table: expect.any(String) })
      );
      expect(result.hourDistribution).toHaveLength(24);
      expect(result.peakHours).toHaveLength(3);
    });
  });
});
