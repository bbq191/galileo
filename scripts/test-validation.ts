// scripts/test-validation.ts
import { schemas } from '../lib/validation/schemas';
import { validateRequest } from '../lib/validation/validator';

console.log('========================================');
console.log('开始测试输入验证功能');
console.log('========================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(description: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`✅ ${description}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   错误: ${error instanceof Error ? error.message : String(error)}\n`);
    failedTests++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`期望 ${expected} 但得到 ${actual}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`期望 ${JSON.stringify(expected)} 但得到 ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected: any) {
      if (!actual || !actual.includes(expected)) {
        throw new Error(`期望包含 "${expected}" 但实际为 ${JSON.stringify(actual)}`);
      }
    },
  };
}

// ========================================
// QueryExecuteSchema 测试
// ========================================
console.log('【测试 QueryExecuteSchema】\n');

test('应接受有效的查询输入', () => {
  const input = { query: '查询所有用户' };
  const result = validateRequest(schemas.queryExecute, input);
  expect(result.success).toBe(true);
});

test('应拒绝空查询', () => {
  const input = { query: '' };
  const result = validateRequest(schemas.queryExecute, input);
  expect(result.success).toBe(false);
  expect(result.errors?.query).toContain('查询内容不能为空');
});

test('应拒绝超长查询', () => {
  const input = { query: 'a'.repeat(5001) };
  const result = validateRequest(schemas.queryExecute, input);
  expect(result.success).toBe(false);
  expect(result.errors?.query).toContain('查询内容不能超过 5000 字符');
});

test('应拒绝包含危险字符的查询', () => {
  const input = { query: '<script>alert("xss")</script>' };
  const result = validateRequest(schemas.queryExecute, input);
  expect(result.success).toBe(false);
  expect(result.errors?.query).toContain('查询包含非法字符');
});

// ========================================
// MetadataSyncSchema 测试
// ========================================
console.log('\n【测试 MetadataSyncSchema】\n');

test('应接受有效的同步请求', () => {
  const input = { dataSourceId: 1 };
  const result = validateRequest(schemas.metadataSync, input);
  expect(result.success).toBe(true);
});

test('应拒绝无效的数据源 ID', () => {
  const input = { dataSourceId: -1 };
  const result = validateRequest(schemas.metadataSync, input);
  expect(result.success).toBe(false);
  expect(result.errors?.dataSourceId).toContain('数据源 ID 必须是正整数');
});

test('应拒绝超过数量限制的数据库列表', () => {
  const input = { dataSourceId: 1, databases: Array(51).fill('db') };
  const result = validateRequest(schemas.metadataSync, input);
  expect(result.success).toBe(false);
  expect(result.errors?.databases).toContain('最多同时同步 50 个数据库');
});

test('应拒绝无效的置信度', () => {
  const input = { dataSourceId: 1, minConfidence: 1.5 };
  const result = validateRequest(schemas.metadataSync, input);
  expect(result.success).toBe(false);
  expect(result.errors?.minConfidence).toContain('置信度必须在 0-1 之间');
});

// ========================================
// DatasourceCreateSchema 测试
// ========================================
console.log('\n【测试 DatasourceCreateSchema】\n');

test('应接受有效的数据源创建请求', () => {
  const input = {
    name: 'test_db',
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
  };
  const result = validateRequest(schemas.datasourceCreate, input);
  expect(result.success).toBe(true);
});

test('应接受字符串形式的端口号', () => {
  const input = {
    name: 'test_db',
    type: 'mysql',
    host: 'localhost',
    port: '3306',
    username: 'root',
  };
  const result = validateRequest(schemas.datasourceCreate, input);
  expect(result.success).toBe(true);
  expect(result.data?.port).toBe(3306);
});

test('应拒绝空名称', () => {
  const input = {
    name: '',
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
  };
  const result = validateRequest(schemas.datasourceCreate, input);
  expect(result.success).toBe(false);
  expect(result.errors?.name).toContain('名称不能为空');
});

test('应拒绝包含非法字符的名称', () => {
  const input = {
    name: 'test@db!',
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
  };
  const result = validateRequest(schemas.datasourceCreate, input);
  expect(result.success).toBe(false);
  expect(result.errors?.name).toContain('名称只能包含字母、数字、下划线、中划线和中文');
});

test('应拒绝不支持的数据库类型', () => {
  const input = {
    name: 'test_db',
    type: 'oracle' as any,
    host: 'localhost',
    port: 3306,
    username: 'root',
  };
  const result = validateRequest(schemas.datasourceCreate, input);
  expect(result.success).toBe(false);
  // Zod 4 的默认消息格式
  expect(result.errors?.type?.[0]).toContain('expected one of');
});

// ========================================
// AuditLogQuerySchema 测试
// ========================================
console.log('\n【测试 AuditLogQuerySchema】\n');

test('应接受有效的审计日志查询参数', () => {
  const input = { page: '1', limit: '50' };
  const result = validateRequest(schemas.auditLogQuery, input);
  expect(result.success).toBe(true);
  expect(result.data?.page).toBe(1);
  expect(result.data?.limit).toBe(50);
});

test('应接受数字形式的分页参数', () => {
  const input = { page: 2, limit: 20 };
  const result = validateRequest(schemas.auditLogQuery, input);
  expect(result.success).toBe(true);
  expect(result.data?.page).toBe(2);
  expect(result.data?.limit).toBe(20);
});

test('应限制 limit 最大值为 100', () => {
  const input = { limit: 200 };
  const result = validateRequest(schemas.auditLogQuery, input);
  expect(result.success).toBe(true);
  expect(result.data?.limit).toBe(100);
});

test('应接受可选的筛选参数', () => {
  const input = {
    userId: 'user123',
    success: 'true' as const,
    startDate: '2025-01-01',
    endDate: '2025-01-31',
  };
  const result = validateRequest(schemas.auditLogQuery, input);
  expect(result.success).toBe(true);
  expect(result.data?.userId).toBe('user123');
  expect(result.data?.success).toBe('true');
});

// ========================================
// 测试总结
// ========================================
console.log('\n========================================');
console.log('测试总结');
console.log('========================================');
console.log(`总测试数: ${totalTests}`);
console.log(`通过: ${passedTests} ✅`);
console.log(`失败: ${failedTests} ❌`);
console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(2)}%`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
}
