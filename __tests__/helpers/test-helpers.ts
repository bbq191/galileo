/**
 * API 集成测试辅助工具
 * 提供通用的测试工具函数和类型定义
 */

import type { NextRequest } from 'next/server';

/**
 * 创建模拟的 NextRequest 对象
 */
export function createMockRequest(options: {
  method: string;
  url?: string;
  body?: any;
  headers?: Record<string, string>;
}): NextRequest {
  const { method, url = 'http://localhost:3000', body, headers = {} } = options;

  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  return new Request(url, requestInit) as unknown as NextRequest;
}

/**
 * 解析 NextResponse 的 JSON 内容
 */
export async function parseResponseJson(response: Response): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * 断言响应成功
 */
export function assertSuccess(data: any) {
  expect(data.status).toBe('success');
  expect(data.data).toBeDefined();
}

/**
 * 断言响应失败
 */
export function assertError(data: any, expectedMessage?: string) {
  expect(data.status).toBe('error');
  if (expectedMessage) {
    expect(data.message).toContain(expectedMessage);
  }
}

/**
 * 创建测试用的数据源配置
 */
export function createTestDataSourceConfig(overrides?: Partial<DataSourceConfig>) {
  const timestamp = Date.now();
  return {
    name: `test-ds-${timestamp}`,
    type: 'mysql' as const,
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '3306'),
    username: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD || 'password',
    databases: ['test_db'],
    description: 'Test data source',
    ...overrides,
  };
}

/**
 * 数据源配置类型
 */
export interface DataSourceConfig {
  name: string;
  type: 'mysql' | 'mariadb' | 'postgresql';
  host: string;
  port: number;
  username: string;
  password: string;
  databases?: string[];
  description?: string;
}

/**
 * 等待异步操作完成
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 清理测试数据
 */
export async function cleanupTestData(prisma: any, prefix: string = 'test-') {
  // 删除测试数据源
  await prisma.dataSource.deleteMany({
    where: {
      name: {
        startsWith: prefix,
      },
    },
  });

  // 删除测试审计日志
  await prisma.auditLog.deleteMany({
    where: {
      userId: {
        startsWith: 'test-',
      },
    },
  });
}

/**
 * 创建路由上下文
 */
export function createRouteContext(params: Record<string, string>) {
  return {
    params: Promise.resolve(params),
  };
}

/**
 * 验证分页响应格式
 */
export function assertPaginationFormat(data: any) {
  expect(data).toHaveProperty('total');
  expect(data).toHaveProperty('page');
  expect(data).toHaveProperty('limit');
  expect(data).toHaveProperty('items');
  expect(Array.isArray(data.items)).toBe(true);
}

/**
 * 验证数据源响应格式
 */
export function assertDataSourceFormat(dataSource: any) {
  expect(dataSource).toHaveProperty('id');
  expect(dataSource).toHaveProperty('name');
  expect(dataSource).toHaveProperty('type');
  expect(dataSource).toHaveProperty('status');
  expect(['mysql', 'mariadb', 'postgresql']).toContain(dataSource.type);
  expect(['active', 'inactive', 'error']).toContain(dataSource.status);
}

/**
 * 验证元数据响应格式
 */
export function assertMetadataFormat(metadata: any) {
  expect(metadata).toHaveProperty('databaseName');
  expect(metadata).toHaveProperty('tables');
  expect(Array.isArray(metadata.tables)).toBe(true);
}

/**
 * 验证关系响应格式
 */
export function assertRelationshipFormat(relationship: any) {
  expect(relationship).toHaveProperty('sourceTable');
  expect(relationship).toHaveProperty('targetTable');
  expect(relationship).toHaveProperty('sourceColumn');
  expect(relationship).toHaveProperty('targetColumn');
  expect(relationship).toHaveProperty('confidence');
  expect(relationship.confidence).toBeGreaterThanOrEqual(0);
  expect(relationship.confidence).toBeLessThanOrEqual(1);
}

/**
 * 模拟真实数据库数据
 */
export const MOCK_DATABASE_DATA = {
  // 用户表数据
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com', age: 25, city: 'Beijing' },
    { id: 2, name: 'Bob', email: 'bob@example.com', age: 30, city: 'Shanghai' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', age: 35, city: 'Guangzhou' },
  ],
  // 订单表数据
  orders: [
    { id: 1, user_id: 1, product: 'Laptop', amount: 5000, created_at: '2024-01-01' },
    { id: 2, user_id: 1, product: 'Mouse', amount: 100, created_at: '2024-01-02' },
    { id: 3, user_id: 2, product: 'Keyboard', amount: 300, created_at: '2024-01-03' },
    { id: 4, user_id: 3, product: 'Monitor', amount: 2000, created_at: '2024-01-04' },
  ],
  // 产品表数据
  products: [
    { id: 1, name: 'Laptop', price: 5000, category: 'Electronics', stock: 50 },
    { id: 2, name: 'Mouse', price: 100, category: 'Electronics', stock: 200 },
    { id: 3, name: 'Keyboard', price: 300, category: 'Electronics', stock: 150 },
    { id: 4, name: 'Monitor', price: 2000, category: 'Electronics', stock: 80 },
  ],
};

/**
 * 生成测试用的元数据
 */
export function generateTestMetadata(databaseName: string) {
  return {
    databaseName,
    tables: [
      {
        tableName: 'users',
        rowCount: 1000,
        columns: [
          { columnName: 'id', dataType: 'int', isPrimaryKey: true, isNullable: false },
          { columnName: 'name', dataType: 'varchar(100)', isPrimaryKey: false, isNullable: false },
          { columnName: 'email', dataType: 'varchar(100)', isPrimaryKey: false, isNullable: false },
          { columnName: 'age', dataType: 'int', isPrimaryKey: false, isNullable: true },
          { columnName: 'city', dataType: 'varchar(50)', isPrimaryKey: false, isNullable: true },
        ],
      },
      {
        tableName: 'orders',
        rowCount: 5000,
        columns: [
          { columnName: 'id', dataType: 'int', isPrimaryKey: true, isNullable: false },
          { columnName: 'user_id', dataType: 'int', isPrimaryKey: false, isNullable: false },
          { columnName: 'product', dataType: 'varchar(100)', isPrimaryKey: false, isNullable: false },
          { columnName: 'amount', dataType: 'decimal(10,2)', isPrimaryKey: false, isNullable: false },
          { columnName: 'created_at', dataType: 'datetime', isPrimaryKey: false, isNullable: false },
        ],
      },
      {
        tableName: 'products',
        rowCount: 500,
        columns: [
          { columnName: 'id', dataType: 'int', isPrimaryKey: true, isNullable: false },
          { columnName: 'name', dataType: 'varchar(100)', isPrimaryKey: false, isNullable: false },
          { columnName: 'price', dataType: 'decimal(10,2)', isPrimaryKey: false, isNullable: false },
          { columnName: 'category', dataType: 'varchar(50)', isPrimaryKey: false, isNullable: true },
          { columnName: 'stock', dataType: 'int', isPrimaryKey: false, isNullable: false },
        ],
      },
    ],
  };
}

/**
 * 生成测试用的关系数据
 */
export function generateTestRelationships() {
  return [
    {
      sourceTable: 'orders',
      sourceColumn: 'user_id',
      targetTable: 'users',
      targetColumn: 'id',
      confidence: 0.95,
      type: 'foreign_key',
    },
    {
      sourceTable: 'orders',
      sourceColumn: 'product',
      targetTable: 'products',
      targetColumn: 'name',
      confidence: 0.85,
      type: 'semantic',
    },
  ];
}
