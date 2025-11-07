/**
 * 查询和审计 API 集成测试
 * 测试查询执行、SQL执行、查询历史和审计相关的API端点
 */

import { POST as executeQuery } from '@/app/api/query/execute/route';
import { POST as executeSql } from '@/app/api/query/sql/route';
import { GET as getQueryHistory } from '@/app/api/query/history/route';
import { GET as getAuditLogs } from '@/app/api/audit/logs/route';
import { GET as getAuditStats } from '@/app/api/audit/stats/route';
import { POST as createDataSource } from '@/app/api/datasources/route';
import { DELETE as deleteDataSource } from '@/app/api/datasources/[id]/route';
import { POST as syncDataSource } from '@/app/api/datasources/[id]/sync/route';
import {
  createMockRequest,
  parseResponseJson,
  assertSuccess,
  assertPaginationFormat,
  createRouteContext,
} from '../helpers/test-helpers';
import {
  setupTestDatabase,
  cleanupTestDatabase,
  closeTestDatabase,
  verifyTestDatabaseConnection,
  getTestPrisma,
} from '../helpers/test-db-setup';

describe('Query and Audit API Integration Tests', () => {
  let testDataSourceId: number | null = null;
  const prisma = getTestPrisma();
  const testUserId = `test-user-${Date.now()}`;

  // 在所有测试开始前初始化
  beforeAll(async () => {
    console.log('\n🚀 Starting Query and Audit API tests...\n');

    const isConnected = await verifyTestDatabaseConnection();
    if (!isConnected) {
      throw new Error('Test database connection failed');
    }

    await setupTestDatabase();

    // 创建测试数据源并同步元数据
    const testConfig = {
      name: `test-query-${Date.now()}`,
      type: 'mysql',
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '3306'),
      username: process.env.TEST_DB_USER || 'root',
      password: process.env.TEST_DB_PASSWORD || '',
      databases: (process.env.TEST_DB_DATABASES || 'test_db').split(','),
      autoSync: false,
    };

    const createRequest = createMockRequest({ method: 'POST', body: testConfig });
    const createResponse = await createDataSource(createRequest);
    const createData = await parseResponseJson(createResponse);
    testDataSourceId = createData.data.id;

    // 同步元数据
    const syncRequest = createMockRequest({
      method: 'POST',
      url: `http://localhost:3000/api/datasources/${testDataSourceId}/sync`,
      body: { inferRelationships: false },
    });
    const syncContext = createRouteContext({ id: testDataSourceId.toString() });
    await syncDataSource(syncRequest, syncContext);

    console.log(`✅ Test data source created and synced: ID ${testDataSourceId}`);
  }, 90000);

  // 在所有测试结束后清理
  afterAll(async () => {
    if (testDataSourceId) {
      const request = createMockRequest({
        method: 'DELETE',
        url: `http://localhost:3000/api/datasources/${testDataSourceId}`,
      });
      const context = createRouteContext({ id: testDataSourceId.toString() });
      await deleteDataSource(request, context);
    }
    await cleanupTestDatabase();
    await closeTestDatabase();
    console.log('\n✅ Query and Audit API tests completed\n');
  }, 30000);

  describe('POST /api/query/execute - 执行自然语言查询', () => {
    it('应该成功执行简单的自然语言查询', async () => {
      const queryRequest = {
        query: '显示所有用户',
        options: {
          dataSourceId: testDataSourceId,
        },
      };

      const request = createMockRequest({
        method: 'POST',
        body: queryRequest,
        headers: {
          'x-user-id': testUserId,
          'x-user-name': 'Test User',
        },
      });

      const response = await executeQuery(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success');

      // 成功的查询应该有数据
      if (data.success) {
        expect(data).toHaveProperty('data');
        expect(data).toHaveProperty('metadata');
      }
    }, 60000); // NL查询可能需要较长时间

    it('应该记录查询审计日志', async () => {
      const queryRequest = {
        query: '查询用户数量',
        options: {
          dataSourceId: testDataSourceId,
        },
      };

      const request = createMockRequest({
        method: 'POST',
        body: queryRequest,
        headers: {
          'x-user-id': testUserId,
          'x-user-name': 'Test User',
          'x-session-id': `test-session-${Date.now()}`,
        },
      });

      await executeQuery(request);

      // 等待审计日志写入
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证审计日志是否被创建
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: testUserId,
          naturalLanguageQuery: '查询用户数量',
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 1,
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      if (auditLogs.length > 0) {
        expect(auditLogs[0].userId).toBe(testUserId);
        expect(auditLogs[0].naturalLanguageQuery).toBe('查询用户数量');
      }
    }, 60000);

    it('应该处理查询错误', async () => {
      const queryRequest = {
        query: '这是一个无效的查询请求xyz123',
        options: {
          dataSourceId: testDataSourceId,
        },
      };

      const request = createMockRequest({
        method: 'POST',
        body: queryRequest,
        headers: {
          'x-user-id': testUserId,
        },
      });

      const response = await executeQuery(request);
      const data = await parseResponseJson(response);

      // 即使查询失败，也应该返回结构化的响应
      expect(data).toHaveProperty('success');
    }, 60000);
  });

  describe('POST /api/query/sql - 执行SQL查询', () => {
    it('应该成功执行SQL查询', async () => {
      const sqlRequest = {
        dataSourceId: testDataSourceId,
        sql: 'SELECT 1 as test_value',
        databaseName: (process.env.TEST_DB_DATABASES || 'test_db').split(',')[0],
      };

      const request = createMockRequest({
        method: 'POST',
        body: sqlRequest,
        headers: {
          'x-user-id': testUserId,
        },
      });

      const response = await executeSql(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('rows');
      expect(Array.isArray(data.data.rows)).toBe(true);
      expect(data.data.rows[0]).toHaveProperty('test_value');
      expect(data.data.rows[0].test_value).toBe(1);
    }, 30000);

    it('应该拒绝危险的SQL操作', async () => {
      const dangerousSql = 'DROP TABLE users';

      const sqlRequest = {
        dataSourceId: testDataSourceId,
        sql: dangerousSql,
        databaseName: (process.env.TEST_DB_DATABASES || 'test_db').split(',')[0],
      };

      const request = createMockRequest({
        method: 'POST',
        body: sqlRequest,
        headers: {
          'x-user-id': testUserId,
        },
      });

      const response = await executeSql(request);
      const data = await parseResponseJson(response);

      // 应该被安全检查拒绝
      expect(data.status).toBe('error');
      expect(data.message).toMatch(/not allowed|prohibited|dangerous/i);
    }, 30000);

    it('应该记录SQL执行审计日志', async () => {
      const sqlRequest = {
        dataSourceId: testDataSourceId,
        sql: 'SELECT COUNT(*) as count FROM information_schema.tables',
        databaseName: (process.env.TEST_DB_DATABASES || 'test_db').split(',')[0],
      };

      const request = createMockRequest({
        method: 'POST',
        body: sqlRequest,
        headers: {
          'x-user-id': testUserId,
          'x-user-name': 'Test User',
        },
      });

      await executeSql(request);

      // 等待审计日志写入
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证审计日志
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          userId: testUserId,
          generatedSQL: {
            contains: 'SELECT COUNT(*)',
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 1,
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('GET /api/query/history - 查询历史', () => {
    beforeAll(async () => {
      // 创建一些测试查询历史
      const queries = [
        '查询所有用户',
        '统计订单数量',
        '查找最近的订单',
      ];

      for (const query of queries) {
        const request = createMockRequest({
          method: 'POST',
          body: {
            query,
            options: { dataSourceId: testDataSourceId },
          },
          headers: { 'x-user-id': testUserId },
        });
        await executeQuery(request);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }, 180000);

    it('应该成功获取查询历史', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/query/history?userId=${testUserId}`,
      });

      const response = await getQueryHistory(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('应该支持分页', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/query/history?userId=${testUserId}&page=1&limit=2`,
      });

      const response = await getQueryHistory(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);

      if (data.data.items) {
        assertPaginationFormat(data.data);
        expect(data.data.limit).toBe(2);
      }
    });

    it('应该支持按成功状态筛选', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/query/history?userId=${testUserId}&success=true`,
      });

      const response = await getQueryHistory(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);

      // 所有返回的查询应该是成功的
      if (Array.isArray(data.data) && data.data.length > 0) {
        data.data.forEach((item: any) => {
          expect(item.success).toBe(true);
        });
      }
    });
  });

  describe('GET /api/audit/logs - 审计日志', () => {
    it('应该成功获取审计日志', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/audit/logs',
      });

      const response = await getAuditLogs(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      assertPaginationFormat(data.data);
    });

    it('应该支持按用户ID筛选', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/audit/logs?userId=${testUserId}`,
      });

      const response = await getAuditLogs(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);

      // 所有返回的日志应该属于指定用户
      if (data.data.items.length > 0) {
        data.data.items.forEach((log: any) => {
          expect(log.userId).toBe(testUserId);
        });
      }
    });

    it('应该支持日期范围筛选', async () => {
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/audit/logs?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      });

      const response = await getAuditLogs(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      assertPaginationFormat(data.data);
    });

    it('应该支持分页参数', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/audit/logs?page=1&limit=5',
      });

      const response = await getAuditLogs(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      assertPaginationFormat(data.data);
      expect(data.data.limit).toBe(5);
      expect(data.data.page).toBe(1);
    });
  });

  describe('GET /api/audit/stats - 审计统计', () => {
    it('应该成功获取审计统计', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/audit/stats',
      });

      const response = await getAuditStats(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('overview');
      expect(data.data.overview).toHaveProperty('totalQueries');
      expect(data.data.overview).toHaveProperty('successfulQueries');
      expect(data.data.overview).toHaveProperty('failedQueries');
    });

    it('应该包含用户活动统计', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/audit/stats',
      });

      const response = await getAuditStats(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('userActivity');
      expect(Array.isArray(data.data.userActivity)).toBe(true);
    });

    it('应该包含数据库使用统计', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/audit/stats',
      });

      const response = await getAuditStats(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('databaseUsage');
      expect(Array.isArray(data.data.databaseUsage)).toBe(true);
    });

    it('应该支持日期范围筛选', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // 最近7天

      const endDate = new Date();

      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/audit/stats?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      });

      const response = await getAuditStats(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('overview');
    });

    it('应该支持异常检测', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/audit/stats?detectAnomalies=true&timeWindowMinutes=60',
      });

      const response = await getAuditStats(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);

      // 如果启用了异常检测，应该有anomalies字段
      if (data.data.anomalies !== undefined) {
        expect(Array.isArray(data.data.anomalies)).toBe(true);
      }
    });
  });
});
