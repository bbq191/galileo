/**
 * 元数据查询 API 集成测试
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

describe('元数据查询 API', () => {
  let testSourceId: number;
  let testDatabaseId: number;
  let testTableId: number;

  // 辅助函数
  async function apiRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ) {
    const url = `${API_BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();
    return { response, data };
  }

  beforeAll(async () => {
    // 准备测试数据：创建测试数据源
    const { data } = await apiRequest('/datasources', 'POST', {
      name: 'Metadata Test DataSource',
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'test_user',
      password: 'test_password',
    });

    if (data.status === 'success' && data.data.id) {
      testSourceId = data.data.id;
    }
  });

  describe('GET /api/metadata/databases - 获取数据库列表', () => {
    it('缺少 sourceId 参数应该返回 400 错误', async () => {
      const { response, data } = await apiRequest('/metadata/databases');

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('sourceId is required');
    });

    it('应该返回指定数据源的数据库列表', async () => {
      if (!testSourceId) {
        console.log('跳过测试：testSourceId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/metadata/databases?sourceId=${testSourceId}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(Array.isArray(data.data)).toBe(true);

      if (data.data.length > 0) {
        testDatabaseId = data.data[0].id;
        expect(data.data[0]).toHaveProperty('id');
        expect(data.data[0]).toHaveProperty('databaseName');
        expect(data.data[0]).toHaveProperty('sourceId');
      }
    });
  });

  describe('GET /api/metadata/tables - 获取表列表', () => {
    it('缺少 databaseId 参数应该返回 400 错误', async () => {
      const { response, data } = await apiRequest('/metadata/tables');

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('databaseId is required');
    });

    it('应该返回分页的表列表', async () => {
      if (!testDatabaseId) {
        console.log('跳过测试：testDatabaseId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/metadata/tables?databaseId=${testDatabaseId}&page=1&limit=10`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('pagination');
      expect(data.pagination).toHaveProperty('total');
      expect(data.pagination).toHaveProperty('page');
      expect(data.pagination).toHaveProperty('limit');
      expect(data.pagination).toHaveProperty('totalPages');

      if (data.data.length > 0) {
        testTableId = data.data[0].id;
        expect(data.data[0]).toHaveProperty('tableName');
        expect(data.data[0]).toHaveProperty('databaseId');
      }
    });

    it('应该支持搜索功能', async () => {
      if (!testDatabaseId) {
        console.log('跳过测试：testDatabaseId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/metadata/tables?databaseId=${testDatabaseId}&search=test`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
    });

    it('应该支持排序功能', async () => {
      if (!testDatabaseId) {
        console.log('跳过测试：testDatabaseId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/metadata/tables?databaseId=${testDatabaseId}&orderBy=tableName&orderDirection=desc`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
    });
  });

  describe('GET /api/metadata/columns - 获取字段列表', () => {
    it('缺少 tableId 参数应该返回 400 错误', async () => {
      const { response, data } = await apiRequest('/metadata/columns');

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('tableId is required');
    });

    it('应该返回指定表的字段列表', async () => {
      if (!testTableId) {
        console.log('跳过测试：testTableId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/metadata/columns?tableId=${testTableId}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('total');

      if (data.data.length > 0) {
        const column = data.data[0];
        expect(column).toHaveProperty('columnName');
        expect(column).toHaveProperty('dataType');
        expect(column).toHaveProperty('columnType');
        expect(column).toHaveProperty('isNullable');
        expect(column).toHaveProperty('isPrimaryKey');
        expect(column).toHaveProperty('tableId');
      }
    });
  });

  describe('GET /api/metadata/search - 搜索元数据', () => {
    it('缺少查询参数应该返回 400 错误', async () => {
      const { response, data } = await apiRequest('/metadata/search');

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('Search query is required');
    });

    it('应该搜索所有类型的元数据（type=all）', async () => {
      const { response, data } = await apiRequest(
        '/metadata/search?q=test&type=all'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty('summary');
      expect(data.summary).toHaveProperty('databases');
      expect(data.summary).toHaveProperty('tables');
      expect(data.summary).toHaveProperty('columns');
      expect(data).toHaveProperty('pagination');
    });

    it('应该只搜索数据库（type=database）', async () => {
      const { response, data } = await apiRequest(
        '/metadata/search?q=test&type=database'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data).toHaveProperty('databases');
      expect(data.data).toHaveProperty('tables');
      expect(data.data).toHaveProperty('columns');
    });

    it('应该只搜索表（type=table）', async () => {
      const { response, data } = await apiRequest(
        '/metadata/search?q=user&type=table'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
    });

    it('应该只搜索字段（type=column）', async () => {
      const { response, data } = await apiRequest(
        '/metadata/search?q=id&type=column'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
    });

    it('应该支持按数据源过滤', async () => {
      if (!testSourceId) {
        console.log('跳过测试：testSourceId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/metadata/search?q=test&sourceId=${testSourceId}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
    });

    it('应该支持按数据库过滤', async () => {
      if (!testDatabaseId) {
        console.log('跳过测试：testDatabaseId 未设置');
        return;
      }

      const { response, data } = await apiRequest(
        `/metadata/search?q=test&databaseId=${testDatabaseId}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
    });

    it('应该支持分页', async () => {
      const { response, data } = await apiRequest(
        '/metadata/search?q=test&page=1&limit=5'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(5);
    });
  });
});
