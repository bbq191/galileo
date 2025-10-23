/**
 * 数据源管理 API 集成测试
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// 测试配置
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

describe('数据源管理 API', () => {
  let createdDataSourceId: number;

  // 辅助函数：发送 API 请求
  async function apiRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ) {
    const url = `${API_BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    return { response, data };
  }

  describe('POST /api/datasources - 创建数据源', () => {
    it('应该成功创建数据源', async () => {
      const { response, data } = await apiRequest('/datasources', 'POST', {
        name: 'Test DataSource',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'test_user',
        password: 'test_password',
      });

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data).toHaveProperty('id');
      expect(data.data.name).toBe('Test DataSource');

      createdDataSourceId = data.data.id;
    });

    it('缺少必填字段时应该返回 400 错误', async () => {
      const { response, data } = await apiRequest('/datasources', 'POST', {
        name: 'Incomplete DataSource',
        // 缺少 type, host, port, username
      });

      expect(response.status).toBe(400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('Missing required field');
    });

    it('重复的数据源名称应该返回 409 错误', async () => {
      const { response, data } = await apiRequest('/datasources', 'POST', {
        name: 'Test DataSource', // 已存在的名称
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'test_user',
        password: 'test_password',
      });

      expect(response.status).toBe(409);
      expect(data.status).toBe('error');
      expect(data.message).toContain('already exists');
    });
  });

  describe('GET /api/datasources - 获取数据源列表', () => {
    it('应该返回数据源列表', async () => {
      const { response, data } = await apiRequest('/datasources');

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.data[0]).toHaveProperty('id');
      expect(data.data[0]).toHaveProperty('name');
      expect(data.data[0]).toHaveProperty('type');
      expect(data.data[0]).not.toHaveProperty('passwordEncrypted'); // 不应返回密码
    });

    it('应该支持按状态过滤', async () => {
      const { response, data } = await apiRequest('/datasources?status=active');

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('GET /api/datasources/:id - 获取数据源详情', () => {
    it('应该返回指定数据源的详细信息', async () => {
      const { response, data } = await apiRequest(
        `/datasources/${createdDataSourceId}`
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data.id).toBe(createdDataSourceId);
      expect(data.data).toHaveProperty('name');
      expect(data.data).toHaveProperty('host');
      expect(data.data).toHaveProperty('databases');
      expect(data.data).not.toHaveProperty('passwordEncrypted');
    });

    it('不存在的数据源应该返回 404 错误', async () => {
      const { response, data } = await apiRequest('/datasources/99999');

      expect(response.status).toBe(404);
      expect(data.status).toBe('error');
      expect(data.message).toContain('not found');
    });
  });

  describe('PUT /api/datasources/:id - 更新数据源', () => {
    it('应该成功更新数据源', async () => {
      const { response, data } = await apiRequest(
        `/datasources/${createdDataSourceId}`,
        'PUT',
        {
          name: 'Updated Test DataSource',
          host: 'updated-host',
          port: 3307,
        }
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.data.name).toBe('Updated Test DataSource');
      expect(data.data.host).toBe('updated-host');
      expect(data.data.port).toBe(3307);
    });
  });

  describe('POST /api/datasources/:id/test - 测试连接', () => {
    it('应该测试数据源连接', async () => {
      const { response, data } = await apiRequest(
        `/datasources/${createdDataSourceId}/test`,
        'POST'
      );

      expect(response.status).toBeOneOf([200, 500]); // 可能成功或失败
      expect(data).toHaveProperty('status');
      expect(data.data).toHaveProperty('healthy');
      expect(data.data).toHaveProperty('responseTime');
    });

    it('不存在的数据源应该返回 404 错误', async () => {
      const { response, data } = await apiRequest(
        '/datasources/99999/test',
        'POST'
      );

      expect(response.status).toBe(404);
      expect(data.status).toBe('error');
    });
  });

  describe('POST /api/datasources/:id/sync - 触发同步', () => {
    it('应该成功触发同步', async () => {
      const { response, data } = await apiRequest(
        `/datasources/${createdDataSourceId}/sync`,
        'POST',
        {}
      );

      expect(response.status).toBeOneOf([200, 400, 404]);
      expect(data).toHaveProperty('status');

      if (response.status === 200) {
        expect(data.status).toBe('success');
        expect(data.data).toHaveProperty('dataSourceId');
        expect(data.data).toHaveProperty('triggeredAt');
      }
    });

    it('应该支持强制同步参数', async () => {
      const { response, data } = await apiRequest(
        `/datasources/${createdDataSourceId}/sync`,
        'POST',
        { force: true }
      );

      expect(response.status).toBeOneOf([200, 400, 404]);
      expect(data).toHaveProperty('status');
    });
  });

  describe('DELETE /api/datasources/:id - 删除数据源', () => {
    it('应该成功删除数据源', async () => {
      const { response, data } = await apiRequest(
        `/datasources/${createdDataSourceId}`,
        'DELETE'
      );

      expect(response.status).toBe(200);
      expect(data.status).toBe('success');
      expect(data.message).toContain('deleted successfully');

      // 验证删除后无法访问
      const { response: getResponse } = await apiRequest(
        `/datasources/${createdDataSourceId}`
      );
      expect(getResponse.status).toBe(404);
    });
  });
});

// Jest 自定义匹配器
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be one of ${expected.join(', ')}`
          : `expected ${received} to be one of ${expected.join(', ')}`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}
