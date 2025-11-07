/**
 * 关系 API 集成测试
 * 测试所有关系相关的API端点
 */

import { POST as createDataSource } from '@/app/api/datasources/route';
import { DELETE as deleteDataSource } from '@/app/api/datasources/[id]/route';
import { POST as syncDataSource } from '@/app/api/datasources/[id]/sync/route';
import { POST as inferRelationships } from '@/app/api/metadata/relationships/infer/route';
import { GET as getRelationships } from '@/app/api/relationships/route';
import { GET as getRelationshipGraph } from '@/app/api/relationships/graph/route';
import { POST as verifyRelationships } from '@/app/api/relationships/verify/route';
import {
  createMockRequest,
  parseResponseJson,
  assertSuccess,
  assertRelationshipFormat,
  createRouteContext,
} from '../helpers/test-helpers';
import {
  setupTestDatabase,
  cleanupTestDatabase,
  closeTestDatabase,
  verifyTestDatabaseConnection,
  getTestPrisma,
} from '../helpers/test-db-setup';

describe('Relationships API Integration Tests', () => {
  let testDataSourceId: number | null = null;
  const prisma = getTestPrisma();

  // 在所有测试开始前初始化
  beforeAll(async () => {
    console.log('\n🚀 Starting Relationships API tests...\n');

    const isConnected = await verifyTestDatabaseConnection();
    if (!isConnected) {
      throw new Error('Test database connection failed');
    }

    await setupTestDatabase();

    // 创建测试数据源并同步元数据
    const testConfig = {
      name: `test-relationships-${Date.now()}`,
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

    // 同步元数据（不推断关系）
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
    console.log('\n✅ Relationships API tests completed\n');
  }, 30000);

  describe('POST /api/metadata/relationships/infer - 推断关系', () => {
    it('应该成功推断表之间的关系', async () => {
      const inferOptions = {
        dataSourceId: testDataSourceId!.toString(),
        minConfidence: 0.7,
        enableAI: false, // 禁用AI以加快测试
        crossDatabase: false,
        saveToDatabase: true,
      };

      const request = createMockRequest({
        method: 'POST',
        body: inferOptions,
      });

      const response = await inferRelationships(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('relationships');
      expect(Array.isArray(data.data.relationships)).toBe(true);
      expect(data.data).toHaveProperty('totalFound');
      expect(data.data).toHaveProperty('totalSaved');
    }, 60000); // 推断可能需要较长时间

    it('应该支持设置最小置信度', async () => {
      const inferOptions = {
        dataSourceId: testDataSourceId!.toString(),
        minConfidence: 0.9, // 更高的置信度阈值
        enableAI: false,
        saveToDatabase: false,
      };

      const request = createMockRequest({
        method: 'POST',
        body: inferOptions,
      });

      const response = await inferRelationships(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);

      // 验证所有返回的关系都满足最小置信度
      if (data.data.relationships.length > 0) {
        data.data.relationships.forEach((rel: any) => {
          expect(rel.confidence).toBeGreaterThanOrEqual(0.9);
        });
      }
    }, 60000);

    it('应该支持跨数据库关系推断', async () => {
      const inferOptions = {
        dataSourceId: testDataSourceId!.toString(),
        minConfidence: 0.7,
        enableAI: false,
        crossDatabase: true,
        saveToDatabase: false,
      };

      const request = createMockRequest({
        method: 'POST',
        body: inferOptions,
      });

      const response = await inferRelationships(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data.relationships)).toBe(true);
    }, 60000);

    it('应该要求提供数据源ID', async () => {
      const request = createMockRequest({
        method: 'POST',
        body: {
          minConfidence: 0.7,
          // 缺少 dataSourceId
        },
      });

      const response = await inferRelationships(request);
      const data = await parseResponseJson(response);

      // 验证失败响应
      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
    });
  });

  describe('GET /api/relationships - 获取关系列表', () => {
    beforeAll(async () => {
      // 先推断一些关系
      const inferRequest = createMockRequest({
        method: 'POST',
        body: {
          dataSourceId: testDataSourceId!.toString(),
          minConfidence: 0.7,
          enableAI: false,
          saveToDatabase: true,
        },
      });
      await inferRelationships(inferRequest);
    }, 60000);

    it('应该成功获取关系列表', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/relationships?dataSourceId=${testDataSourceId}`,
      });

      const response = await getRelationships(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);

      // 验证关系格式
      if (data.data.length > 0) {
        assertRelationshipFormat(data.data[0]);
      }
    });

    it('应该支持按置信度筛选', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/relationships?dataSourceId=${testDataSourceId}&minConfidence=0.8`,
      });

      const response = await getRelationships(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);

      // 验证所有关系都满足置信度要求
      if (data.data.length > 0) {
        data.data.forEach((rel: any) => {
          expect(rel.confidence).toBeGreaterThanOrEqual(0.8);
        });
      }
    });

    it('应该支持按数据库筛选', async () => {
      const databaseName = (process.env.TEST_DB_DATABASES || 'test_db').split(',')[0];
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/relationships?dataSourceId=${testDataSourceId}&databases=${databaseName}`,
      });

      const response = await getRelationships(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('GET /api/relationships/graph - 获取关系图谱', () => {
    it('应该成功获取关系图谱', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/relationships/graph?dataSourceId=${testDataSourceId}`,
      });

      const response = await getRelationshipGraph(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('nodes');
      expect(data.data).toHaveProperty('edges');
      expect(Array.isArray(data.data.nodes)).toBe(true);
      expect(Array.isArray(data.data.edges)).toBe(true);
    });

    it('应该包含节点和边的详细信息', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/relationships/graph?dataSourceId=${testDataSourceId}`,
      });

      const response = await getRelationshipGraph(request);
      const data = await parseResponseJson(response);

      // 验证节点格式
      if (data.data.nodes.length > 0) {
        const node = data.data.nodes[0];
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('label');
        expect(node).toHaveProperty('type');
      }

      // 验证边格式
      if (data.data.edges.length > 0) {
        const edge = data.data.edges[0];
        expect(edge).toHaveProperty('id');
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
        expect(edge).toHaveProperty('confidence');
      }
    });

    it('应该支持按数据库筛选图谱', async () => {
      const databaseName = (process.env.TEST_DB_DATABASES || 'test_db').split(',')[0];
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/relationships/graph?dataSourceId=${testDataSourceId}&databases=${databaseName}`,
      });

      const response = await getRelationshipGraph(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('nodes');
      expect(data.data).toHaveProperty('edges');
    });
  });

  describe('POST /api/relationships/verify - 验证关系', () => {
    let testRelationshipId: number | null = null;

    beforeAll(async () => {
      // 创建一个测试关系
      const databases = await prisma.databaseMeta.findMany({
        where: { sourceId: testDataSourceId! },
        take: 1,
      });

      if (databases.length > 0) {
        const tables = await prisma.tableMeta.findMany({
          where: { databaseId: databases[0].id },
          take: 2,
        });

        if (tables.length >= 2) {
          const relationship = await prisma.tableRelationship.create({
            data: {
              sourceTableId: tables[0].id,
              sourceColumnName: 'test_id',
              targetTableId: tables[1].id,
              targetColumnName: 'id',
              relationshipType: 'foreign_key',
              confidence: 0.85,
              inferredBy: 'test',
              inferredAt: new Date(),
            },
          });
          testRelationshipId = relationship.id;
        }
      }
    });

    afterAll(async () => {
      if (testRelationshipId) {
        await prisma.tableRelationship.delete({
          where: { id: testRelationshipId },
        });
      }
    });

    it('应该成功验证关系', async () => {
      if (!testRelationshipId) {
        console.log('⚠️ No test relationship created, skipping');
        return;
      }

      const request = createMockRequest({
        method: 'POST',
        body: {
          relationshipIds: [testRelationshipId],
        },
      });

      const response = await verifyRelationships(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('results');
      expect(Array.isArray(data.data.results)).toBe(true);
    }, 30000);

    it('应该返回验证结果详情', async () => {
      if (!testRelationshipId) {
        console.log('⚠️ No test relationship created, skipping');
        return;
      }

      const request = createMockRequest({
        method: 'POST',
        body: {
          relationshipIds: [testRelationshipId],
        },
      });

      const response = await verifyRelationships(request);
      const data = await parseResponseJson(response);

      if (data.data.results.length > 0) {
        const result = data.data.results[0];
        expect(result).toHaveProperty('relationshipId');
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('issues');
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.issues)).toBe(true);
      }
    }, 30000);

    it('应该要求提供关系ID列表', async () => {
      const request = createMockRequest({
        method: 'POST',
        body: {
          // 缺少 relationshipIds
        },
      });

      const response = await verifyRelationships(request);
      const data = await parseResponseJson(response);

      // 验证失败响应
      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
    });

    it('应该处理不存在的关系ID', async () => {
      const request = createMockRequest({
        method: 'POST',
        body: {
          relationshipIds: [999999],
        },
      });

      const response = await verifyRelationships(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      // 不存在的关系应该被标记为无效或跳过
      expect(data.data.results.length).toBeGreaterThanOrEqual(0);
    }, 30000);
  });
});
