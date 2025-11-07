/**
 * 元数据 API 集成测试
 * 测试所有元数据相关的API端点
 */

import { POST as createDataSource } from '@/app/api/datasources/route';
import { DELETE as deleteDataSource } from '@/app/api/datasources/[id]/route';
import { POST as syncDataSource } from '@/app/api/datasources/[id]/sync/route';
import { GET as getDatabases } from '@/app/api/metadata/databases/route';
import { GET as getTables } from '@/app/api/metadata/tables/route';
import { GET as getColumns } from '@/app/api/metadata/columns/route';
import { GET as searchMetadata } from '@/app/api/metadata/search/route';
import {
  createMockRequest,
  parseResponseJson,
  assertSuccess,
  createRouteContext,
} from '../helpers/test-helpers';
import {
  setupTestDatabase,
  cleanupTestDatabase,
  closeTestDatabase,
  verifyTestDatabaseConnection,
} from '../helpers/test-db-setup';

describe('Metadata API Integration Tests', () => {
  let testDataSourceId: number | null = null;

  // 在所有测试开始前初始化
  beforeAll(async () => {
    console.log('\n🚀 Starting Metadata API tests...\n');

    const isConnected = await verifyTestDatabaseConnection();
    if (!isConnected) {
      throw new Error('Test database connection failed');
    }

    await setupTestDatabase();

    // 创建测试数据源并同步元数据
    const testConfig = {
      name: `test-metadata-${Date.now()}`,
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
    console.log('\n✅ Metadata API tests completed\n');
  }, 30000);

  describe('GET /api/metadata/databases - 获取数据库列表', () => {
    it('应该成功获取数据库列表', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/databases?dataSourceId=${testDataSourceId}`,
      });

      const response = await getDatabases(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);

      // 验证数据库格式
      const database = data.data[0];
      expect(database).toHaveProperty('id');
      expect(database).toHaveProperty('databaseName');
      expect(database).toHaveProperty('sourceId');
      expect(database.sourceId).toBe(testDataSourceId);
    });

    it('应该支持不指定数据源ID获取所有数据库', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/metadata/databases',
      });

      const response = await getDatabases(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('应该返回空数组当数据源不存在', async () => {
      const nonExistentId = 999999;
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/databases?dataSourceId=${nonExistentId}`,
      });

      const response = await getDatabases(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toEqual([]);
    });
  });

  describe('GET /api/metadata/tables - 获取表列表', () => {
    it('应该成功获取表列表', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/tables?dataSourceId=${testDataSourceId}`,
      });

      const response = await getTables(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);

      // 如果有表，验证表格式
      if (data.data.length > 0) {
        const table = data.data[0];
        expect(table).toHaveProperty('id');
        expect(table).toHaveProperty('tableName');
        expect(table).toHaveProperty('databaseId');
        expect(table).toHaveProperty('rowCount');
      }
    });

    it('应该支持按数据库名称筛选表', async () => {
      const databaseName = (process.env.TEST_DB_DATABASES || 'test_db').split(',')[0];
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/tables?dataSourceId=${testDataSourceId}&databaseName=${databaseName}`,
      });

      const response = await getTables(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('应该支持模糊搜索表名', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/tables?dataSourceId=${testDataSourceId}&search=user`,
      });

      const response = await getTables(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);

      // 如果找到结果，验证包含搜索词
      if (data.data.length > 0) {
        const table = data.data[0];
        expect(table.tableName.toLowerCase()).toContain('user');
      }
    });
  });

  describe('GET /api/metadata/columns - 获取列列表', () => {
    it('应该成功获取列列表', async () => {
      // 先获取一个表
      const tablesRequest = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/tables?dataSourceId=${testDataSourceId}`,
      });
      const tablesResponse = await getTables(tablesRequest);
      const tablesData = await parseResponseJson(tablesResponse);

      if (tablesData.data.length === 0) {
        console.log('⚠️ No tables found, skipping column test');
        return;
      }

      const tableId = tablesData.data[0].id;

      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/columns?tableId=${tableId}`,
      });

      const response = await getColumns(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);

      // 验证列格式
      if (data.data.length > 0) {
        const column = data.data[0];
        expect(column).toHaveProperty('id');
        expect(column).toHaveProperty('columnName');
        expect(column).toHaveProperty('dataType');
        expect(column).toHaveProperty('tableId');
        expect(column.tableId).toBe(tableId);
      }
    });

    it('应该支持按数据源ID获取所有列', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/columns?dataSourceId=${testDataSourceId}`,
      });

      const response = await getColumns(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('应该返回列的详细信息', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/columns?dataSourceId=${testDataSourceId}`,
      });

      const response = await getColumns(request);
      const data = await parseResponseJson(response);

      if (data.data.length > 0) {
        const column = data.data[0];
        expect(column).toHaveProperty('isPrimaryKey');
        expect(column).toHaveProperty('isNullable');
        expect(typeof column.isPrimaryKey).toBe('boolean');
        expect(typeof column.isNullable).toBe('boolean');
      }
    });
  });

  describe('GET /api/metadata/search - 搜索元数据', () => {
    it('应该成功搜索表名', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/search?query=user&dataSourceId=${testDataSourceId}`,
      });

      const response = await searchMetadata(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('tables');
      expect(Array.isArray(data.data.tables)).toBe(true);
    });

    it('应该同时搜索表名和列名', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/search?query=id&dataSourceId=${testDataSourceId}`,
      });

      const response = await searchMetadata(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data).toHaveProperty('tables');
      expect(data.data).toHaveProperty('columns');
      expect(Array.isArray(data.data.tables)).toBe(true);
      expect(Array.isArray(data.data.columns)).toBe(true);
    });

    it('应该支持不区分大小写的搜索', async () => {
      const request1 = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/search?query=USER&dataSourceId=${testDataSourceId}`,
      });

      const response1 = await searchMetadata(request1);
      const data1 = await parseResponseJson(response1);

      const request2 = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/search?query=user&dataSourceId=${testDataSourceId}`,
      });

      const response2 = await searchMetadata(request2);
      const data2 = await parseResponseJson(response2);

      // 验证两次搜索结果应该相同
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(data1.data.tables.length).toBe(data2.data.tables.length);
    });

    it('应该返回空结果当没有匹配', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/search?query=nonexistent_xyz_123&dataSourceId=${testDataSourceId}`,
      });

      const response = await searchMetadata(request);
      const data = await parseResponseJson(response);

      // 验证响应
      expect(response.status).toBe(200);
      assertSuccess(data);
      expect(data.data.tables).toEqual([]);
      expect(data.data.columns).toEqual([]);
    });

    it('应该要求提供查询参数', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost:3000/api/metadata/search?dataSourceId=${testDataSourceId}`,
      });

      const response = await searchMetadata(request);
      const data = await parseResponseJson(response);

      // 验证失败响应
      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
    });
  });
});
