/**
 * API 测试脚本
 *
 * 用于测试 Galileo API 的各个端点
 *
 * 使用方法：
 * tsx scripts/test-api.ts
 */

const BASE_URL = 'http://localhost:3000/api';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

/**
 * 测试工具函数
 */
async function testAPI(
  name: string,
  method: string,
  url: string,
  body?: any
): Promise<TestResult> {
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${url}`, options);
    const data = await response.json();

    if (response.ok && data.status === 'success') {
      console.log(`✓ ${name}: 通过`);
      return { name, passed: true };
    } else {
      console.error(`✗ ${name}: 失败 - ${data.message || data.error}`);
      return { name, passed: false, error: data.message || data.error };
    }
  } catch (error) {
    console.error(`✗ ${name}: 异常 - ${error instanceof Error ? error.message : String(error)}`);
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║         Galileo API 测试套件          ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  const results: TestResult[] = [];

  // ==================== 数据源 API ====================
  console.log('【数据源 API】');

  // 1. 获取数据源列表
  results.push(
    await testAPI('获取数据源列表', 'GET', '/datasources')
  );

  // 2. 获取数据源详情（假设 ID=1 存在）
  results.push(
    await testAPI('获取数据源详情', 'GET', '/datasources/1')
  );

  // 3. 测试连接
  results.push(
    await testAPI('测试数据源连接', 'POST', '/datasources/1/test')
  );

  console.log('');

  // ==================== 元数据 API ====================
  console.log('【元数据查询 API】');

  // 4. 获取数据库列表
  results.push(
    await testAPI('获取数据库列表', 'GET', '/metadata/databases')
  );

  // 5. 获取表列表
  results.push(
    await testAPI('获取表列表', 'GET', '/metadata/tables')
  );

  // 6. 获取列列表（假设 tableId=1 存在）
  results.push(
    await testAPI('获取列列表', 'GET', '/metadata/columns?tableId=1')
  );

  // 7. 搜索元数据
  results.push(
    await testAPI('搜索元数据', 'GET', '/metadata/search?q=user')
  );

  console.log('');

  // ==================== 关系 API ====================
  console.log('【关系管理 API】');

  // 8. 获取关系列表
  results.push(
    await testAPI('获取关系列表', 'GET', '/relationships?type=all')
  );

  // 9. 获取关系图谱（假设 tableId=1 存在）
  results.push(
    await testAPI('获取关系图谱', 'GET', '/relationships/graph?tableId=1&depth=2')
  );

  console.log('');

  // ==================== 同步 API ====================
  console.log('【同步控制 API】');

  // 10. 触发同步（假设 ID=1 存在）
  results.push(
    await testAPI('触发数据源同步', 'POST', '/datasources/1/sync', {
      force: false,
    })
  );

  console.log('');

  // ==================== 输出结果 ====================
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║             测试结果总结              ║');
  console.log('╚═══════════════════════════════════════════╝');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  results.forEach((r) => {
    const status = r.passed ? '✓' : '✗';
    console.log(`${status} ${r.name}`);
    if (!r.passed && r.error) {
      console.log(`  错误: ${r.error}`);
    }
  });

  console.log('');
  console.log(`总计: ${passed}/${total} 通过`);
  console.log(`成功率: ${((passed / total) * 100).toFixed(1)}%`);

  if (passed === total) {
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败，请检查 API 服务和数据');
    process.exit(1);
  }
}

// 运行测试
console.log('开始测试 API...');
console.log('确保开发服务器正在运行：npm run dev');
console.log('');

runTests().catch((error) => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
