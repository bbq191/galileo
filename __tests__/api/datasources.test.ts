/**
 * 数据源 API 集成测试
 * 测试所有数据源相关的API端点
 */

import { POST as createDataSource } from '@/app/api/datasources/route';
import { GET as getDataSource, PUT as updateDataSource, DELETE as deleteDataSource } from '@/app/api/datasources/[id]/route';
import { POST as syncDataSource } from '@/app/api/datasources/[id]/sync/route';
import {
  createMockRequest,
  parseResponseJson,
  assertSuccess,
  assertError,
  assertDataSourceFormat,
  createRouteContext,
} from '../helpers/test-helpers';
import {
  setupTestDatabase,
  cleanupTestDatabase,
  closeTestDatabase,
  verifyTestDatabaseConnection,
} from '../helpers/test-db-setup';

describe('DataSource API Integration Tests', () => {
  let createdDataSourceId: number | null = null;

  // 在所有测试开始前初始化
  beforeAll(async () => {
    console.log('\n🚀 Starting DataSource API tests...\n');

    // 验证数据库连接
    const isConnected = await verifyTestDatabaseConnection();
    if (!isConnected) {
      throw new Error('Test database connection failed');
    }

    await setupTestDatabase();
  });

  // 在所有测试结束后清理
  afterAll(async () => {
    await cleanupTestDatabase();
    await closeTestDatabase();
    console.log('\n✅ DataSource API tests completed\n');
  });

  // 每个测试后清理创建的数据源
  afterEach(async () => {
    if (createdDataSourceId) {
      try {
        const request = createMockRequest({
          method: 'DELETE',
          url: `http://localhost:3000/api/datasources/${createdDataSourceId}`,
        });
        const context = createRouteContext({ id: createdDataSourceId.toString() });
        await deleteDataSource(request, context);
      } catch (error) {
        console.log('Clean up error (expected):', error);
      }
      createdDataSourceId = null;
    }
  });

  describe('POST /api/datasources - 创建数据源', () => {
    it('应该成功创建一个新的数据源', async () => {
      // 准备测试数据
      const testConfig = {
        name: `test-datasource-${Date.now()}`,
        type: 'mysql',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '3306'),
        username: process.env.TEST_DB_USER || 'root',
        password: process.env.TEST_DB_PASSWORD || '',
        databases: (process.env.TEST_DB_DATABASES || 'test_db').split(','),
        description: 'Integration test data source',
        autoSync: false, // 不自动同步以加快测试速度
      };

      // 创建请求
      const request = createMockRequest({
        method: 'POST',
        body: testConfig,
      });

      // 执行
      const response = await createDataSource(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('id');
      expect(data.data.name).toBe(testConfig.name);
      expect(data.data.type).toBe(testConfig.type);
      expect(['active', 'inactive']).toContain(data.data.status);

      // 保存ID用于清理
      createdDataSourceId = data.data.id;
    }, 30000); // 增加超时时间到30秒

    it('应该拒绝创建重名的数据源', async () => {
      // 先创建一个数据源
      const testConfig = {
        name: `test-duplicate-${Date.now()}`,
        type: 'mysql',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '3306'),
        username: process.env.TEST_DB_USER || 'root',
        password: process.env.TEST_DB_PASSWORD || '',
        databases: ['test_db'],
        autoSync: false,
      };

      const request1 = createMockRequest({ method: 'POST', body: testConfig });
      const response1 = await createDataSource(request1);
      const data1 = await parseResponseJson(response1);
      createdDataSourceId = data1.data?.id;

      // 尝试创建同名数据源
      const request2 = createMockRequest({ method: 'POST', body: testConfig });
      const response2 = await createDataSource(request2);
      const data2 = await parseResponseJson(response2);

      // 验证失败响应
      assertError(data2, 'already exists');
    }, 30000);

    it('应该验证必填字段', async () => {
      const invalidConfig = {
        name: 'test-invalid',
        // 缺少 type, host, port 等必填字段
      };

      const request = createMockRequest({
        method: 'POST',
        body: invalidConfig,
      });

      const response = await createDataSource(request);
      const data = await parseResponseJson(response);

      // 验证失败响应
      expect(response.status).toBe(400);
      assertError(data);
    });
  });

  describe('GET /api/datasources/:id - 获取数据源详情', () => {
    beforeEach(async () => {
      // 创建测试数据源
      const testConfig = {
        name: `test-get-${Date.now()}`,
        type: 'mysql',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '3306'),
        username: process.env.TEST_DB_USER || 'root',
        password: process.env.TEST_DB_PASSWORD || '',
        databases: ['test_db'],
        autoSync: false,
      };

      const request = createMockRequest({ method: 'POST', body: testConfig });
      const response = await createDataSource(request);
      const data = await parseResponseJson(response);
      createdDataSourceId = data.data.id;
    }, 30000);

    it('应该成功获取数据源详情', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/datasources/${createdDataSourceId}`,
      });
      const context = createRouteContext({ id: createdDataSourceId!.toString() });

      const response = await getDataSource(request, context);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      assertDataSourceFormat(data.data);
      expect(data.data.id).toBe(createdDataSourceId);
    });

    it('应该返回404当数据源不存在', async () => {
      const nonExistentId = 999999;
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/datasources/${nonExistentId}`,
      });
      const context = createRouteContext({ id: nonExistentId.toString() });

      const response = await getDataSource(request, context);
      const data = await parseResponseJson(response);

      // 验证失败响应
      expect(response.status).toBe(404);
      assertError(data, 'not found');
    });
  });

  describe('PUT /api/datasources/:id - 更新数据源', () => {
    beforeEach(async () => {
      // 创建测试数据源
      const testConfig = {
        name: `test-update-${Date.now()}`,
        type: 'mysql',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '3306'),
        username: process.env.TEST_DB_USER || 'root',
        password: process.env.TEST_DB_PASSWORD || '',
        databases: ['test_db'],
        autoSync: false,
      };

      const request = createMockRequest({ method: 'POST', body: testConfig });
      const response = await createDataSource(request);
      const data = await parseResponseJson(response);
      createdDataSourceId = data.data.id;
    }, 30000);

    it('应该成功更新数据源配置', async () => {
      const updateData = {
        name: `test-updated-${Date.now()}`,
        description: 'Updated description',
        databases: ['test_db', 'another_db'],
        reconnect: false, // 不重新连接以加快测试
      };

      const request = createMockRequest({
        method: 'PUT',
        url: `http://localhost:3000/api/datasources/${createdDataSourceId}`,
        body: updateData,
      });
      const context = createRouteContext({ id: createdDataSourceId!.toString() });

      const response = await updateDataSource(request, context);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data.name).toBe(updateData.name);
    }, 30000);

    it('应该拒绝更新到已存在的名称', async () => {
      // 创建另一个数据源
      const anotherConfig = {
        name: `test-another-${Date.now()}`,
        type: 'mysql',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '3306'),
        username: process.env.TEST_DB_USER || 'root',
        password: process.env.TEST_DB_PASSWORD || '',
        databases: ['test_db'],
        autoSync: false,
      };

      const createRequest = createMockRequest({ method: 'POST', body: anotherConfig });
      const createResponse = await createDataSource(createRequest);
      const createData = await parseResponseJson(createResponse);
      const anotherId = createData.data.id;

      // 尝试将第一个数据源更新为第二个的名称
      const updateRequest = createMockRequest({
        method: 'PUT',
        url: `http://localhost:3000/api/datasources/${createdDataSourceId}`,
        body: { name: anotherConfig.name, reconnect: false },
      });
      const context = createRouteContext({ id: createdDataSourceId!.toString() });

      const response = await updateDataSource(updateRequest, context);
      const data = await parseResponseJson(response);

      // 验证失败响应
      assertError(data, 'already exists');

      // 清理另一个数据源
      const deleteRequest = createMockRequest({
        method: 'DELETE',
        url: `http://localhost:3000/api/datasources/${anotherId}`,
      });
      const deleteContext = createRouteContext({ id: anotherId.toString() });
      await deleteDataSource(deleteRequest, deleteContext);
    }, 30000);
  });

  describe('DELETE /api/datasources/:id - 删除数据源', () => {
    beforeEach(async () => {
      // 创建测试数据源
      const testConfig = {
        name: `test-delete-${Date.now()}`,
        type: 'mysql',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '3306'),
        username: process.env.TEST_DB_USER || 'root',
        password: process.env.TEST_DB_PASSWORD || '',
        databases: ['test_db'],
        autoSync: false,
      };

      const request = createMockRequest({ method: 'POST', body: testConfig });
      const response = await createDataSource(request);
      const data = await parseResponseJson(response);
      createdDataSourceId = data.data.id;
    }, 30000);

    it('应该成功删除数据源', async () => {
      const request = createMockRequest({
        method: 'DELETE',
        url: `http://localhost:3000/api/datasources/${createdDataSourceId}`,
      });
      const context = createRouteContext({ id: createdDataSourceId!.toString() });

      const response = await deleteDataSource(request, context);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);

      // 验证数据源确实被删除
      const getRequest = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/datasources/${createdDataSourceId}`,
      });
      const getResponse = await getDataSource(getRequest, context);
      expect(getResponse.status).toBe(404);

      createdDataSourceId = null; // 已删除，不需要再清理
    }, 30000);

    it('应该返回404当删除不存在的数据源', async () => {
      const nonExistentId = 999999;
      const request = createMockRequest({
        method: 'DELETE',
        url: `http://localhost:3000/api/datasources/${nonExistentId}`,
      });
      const context = createRouteContext({ id: nonExistentId.toString() });

      const response = await deleteDataSource(request, context);
      const data = await parseResponseJson(response);

      // 验证失败响应
      expect(response.status).toBe(404);
      assertError(data, 'not found');
    });
  });

  describe('POST /api/datasources/:id/sync - 同步元数据', () => {
    beforeEach(async () => {
      // 创建测试数据源
      const testConfig = {
        name: `test-sync-${Date.now()}`,
        type: 'mysql',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '3306'),
        username: process.env.TEST_DB_USER || 'root',
        password: process.env.TEST_DB_PASSWORD || '',
        databases: (process.env.TEST_DB_DATABASES || 'test_db').split(','),
        autoSync: false,
      };

      const request = createMockRequest({ method: 'POST', body: testConfig });
      const response = await createDataSource(request);
      const data = await parseResponseJson(response);
      createdDataSourceId = data.data.id;
    }, 30000);

    it('应该成功同步元数据', async () => {
      const syncOptions = {
        databases: (process.env.TEST_DB_DATABASES || 'test_db').split(','),
        inferRelationships: false, // 不推断关系以加快测试
        trackChanges: true,
      };

      const request = createMockRequest({
        method: 'POST',
        url: `http://localhost:3000/api/datasources/${createdDataSourceId}/sync`,
        body: syncOptions,
      });
      const context = createRouteContext({ id: createdDataSourceId!.toString() });

      const response = await syncDataSource(request, context);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('databaseCount');
      expect(data.data).toHaveProperty('tableCount');
      expect(data.data).toHaveProperty('columnCount');
      expect(data.data.databaseCount).toBeGreaterThanOrEqual(1);
    }, 60000); // 同步可能需要更长时间

    it('应该支持推断关系选项', async () => {
      const syncOptions = {
        inferRelationships: true,
        minConfidence: 0.7,
        trackChanges: true,
      };

      const request = createMockRequest({
        method: 'POST',
        url: `http://localhost:3000/api/datasources/${createdDataSourceId}/sync`,
        body: syncOptions,
      });
      const context = createRouteContext({ id: createdDataSourceId!.toString() });

      const response = await syncDataSource(request, context);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);

      // 如果有关系被推断，应该在响应中
      if (data.data.relationshipCount !== undefined) {
        expect(data.data.relationshipCount).toBeGreaterThanOrEqual(0);
      }
    }, 90000); // 推断关系需要更长时间
  });
});
