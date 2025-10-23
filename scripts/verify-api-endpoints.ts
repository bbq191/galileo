/**
 * API 端点验证脚本
 *
 * 用于快速验证所有 API 端点是否可以正常访问
 *
 * 使用方法：
 * npx ts-node scripts/verify-api-endpoints.ts
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

interface EndpointTest {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  body?: any;
  skipIfNoData?: boolean;
  expectedStatus?: number[];
}

const endpoints: EndpointTest[] = [
  // 数据源管理 API
  {
    name: '获取数据源列表',
    method: 'GET',
    endpoint: '/datasources',
  },
  {
    name: '创建数据源',
    method: 'POST',
    endpoint: '/datasources',
    body: {
      name: `Test Source ${Date.now()}`,
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'test',
      password: 'test',
    },
    expectedStatus: [200, 500], // 可能连接失败
  },

  // 元数据查询 API
  {
    name: '获取数据库列表（缺少参数）',
    method: 'GET',
    endpoint: '/metadata/databases',
    expectedStatus: [400],
  },
  {
    name: '获取表列表（缺少参数）',
    method: 'GET',
    endpoint: '/metadata/tables',
    expectedStatus: [400],
  },
  {
    name: '获取字段列表（缺少参数）',
    method: 'GET',
    endpoint: '/metadata/columns',
    expectedStatus: [400],
  },
  {
    name: '搜索元数据（缺少参数）',
    method: 'GET',
    endpoint: '/metadata/search',
    expectedStatus: [400],
  },
  {
    name: '搜索元数据',
    method: 'GET',
    endpoint: '/metadata/search?q=test',
  },

  // 关系查询 API
  {
    name: '获取关系列表',
    method: 'GET',
    endpoint: '/relationships',
  },
  {
    name: '获取关系图谱（缺少参数）',
    method: 'GET',
    endpoint: '/relationships/graph',
    expectedStatus: [400],
  },
  {
    name: '验证关系（缺少参数）',
    method: 'POST',
    endpoint: '/relationships/verify',
    body: {},
    expectedStatus: [400],
  },
];

async function testEndpoint(test: EndpointTest): Promise<boolean> {
  const url = `${API_BASE_URL}${test.endpoint}`;
  const options: RequestInit = {
    method: test.method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (test.body) {
    options.body = JSON.stringify(test.body);
  }

  try {
    const response = await fetch(url, options);
    const expectedStatuses = test.expectedStatus || [200];

    if (expectedStatuses.includes(response.status)) {
      console.log(`✅ ${test.name}`);
      console.log(`   ${test.method} ${test.endpoint}`);
      console.log(`   状态码: ${response.status}`);
      return true;
    } else {
      console.error(`❌ ${test.name}`);
      console.error(`   ${test.method} ${test.endpoint}`);
      console.error(`   期望状态码: ${expectedStatuses.join(', ')}`);
      console.error(`   实际状态码: ${response.status}`);

      const data = await response.json().catch(() => null);
      if (data) {
        console.error(`   响应:`, JSON.stringify(data, null, 2));
      }

      return false;
    }
  } catch (error) {
    console.error(`❌ ${test.name}`);
    console.error(`   ${test.method} ${test.endpoint}`);
    console.error(`   错误:`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  console.log('🚀 开始验证 API 端点...\n');
  console.log(`API 基础 URL: ${API_BASE_URL}\n`);

  // 检查服务器是否运行
  try {
    await fetch(API_BASE_URL.replace('/api', ''));
  } catch (error) {
    console.error('❌ 无法连接到服务器');
    console.error('   请确保开发服务器正在运行: npm run dev');
    process.exit(1);
  }

  const results = await Promise.all(
    endpoints.map(endpoint => testEndpoint(endpoint))
  );

  const successCount = results.filter(r => r).length;
  const totalCount = results.length;

  console.log('\n' + '='.repeat(60));
  console.log(`\n测试结果: ${successCount}/${totalCount} 通过\n`);

  if (successCount === totalCount) {
    console.log('✅ 所有 API 端点验证通过！');
    process.exit(0);
  } else {
    console.log(`❌ ${totalCount - successCount} 个端点验证失败`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
