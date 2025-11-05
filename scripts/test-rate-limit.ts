/**
 * 速率限制测试脚本
 *
 * 测试不同端点的速率限制是否正常工作
 *
 * 运行方式：
 * npm run dev  # 在另一个终端启动服务器
 * tsx scripts/test-rate-limit.ts
 */

interface TestResult {
  endpoint: string;
  limit: number;
  expectedLimit: number;
  requestsSucceeded: number;
  requestsFailed: number;
  passed: boolean;
  details: string;
}

/**
 * 发送 HTTP 请求并检查速率限制
 */
async function testEndpoint(
  endpoint: string,
  expectedLimit: number,
  totalRequests: number,
  method: string = 'GET',
  body?: any
): Promise<TestResult> {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  let succeeded = 0;
  let failed = 0;
  let actualLimit = 0;

  console.log(`\n🧪 Testing ${endpoint} (expected limit: ${expectedLimit} req)`);
  console.log('─'.repeat(60));

  for (let i = 1; i <= totalRequests; i++) {
    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${baseUrl}${endpoint}`, options);

      const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');

      if (rateLimitLimit) {
        actualLimit = parseInt(rateLimitLimit);
      }

      if (response.status === 429) {
        failed++;
        if (failed === 1) {
          console.log(`  ⛔ Request ${i}: 429 Too Many Requests (limit reached)`);
          console.log(`     Remaining: ${rateLimitRemaining}, Limit: ${rateLimitLimit}`);
        }
      } else if (response.ok) {
        succeeded++;
        if (i <= 3 || i === expectedLimit) {
          console.log(`  ✅ Request ${i}: ${response.status} OK`);
          console.log(`     Remaining: ${rateLimitRemaining}, Limit: ${rateLimitLimit}`);
        } else if (i === 4) {
          console.log(`  ... (skipping output for requests 4-${expectedLimit - 1})`);
        }
      } else {
        console.log(`  ⚠️  Request ${i}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`  ❌ Request ${i}: Error -`, error);
    }

    // 短暂延迟，避免请求过快
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const passed = succeeded === expectedLimit && failed === totalRequests - expectedLimit;

  return {
    endpoint,
    limit: actualLimit,
    expectedLimit,
    requestsSucceeded: succeeded,
    requestsFailed: failed,
    passed,
    details: passed
      ? '✅ 测试通过'
      : `❌ 测试失败 (期望 ${expectedLimit} 成功, 实际 ${succeeded} 成功)`,
  };
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🚀 开始速率限制测试');
  console.log('═'.repeat(60));
  console.log('确保开发服务器正在运行: npm run dev');
  console.log('═'.repeat(60));

  // 等待用户确认
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const results: TestResult[] = [];

  // 测试 1: 一般 API 端点 (30 req/min)
  try {
    const result = await testEndpoint('/api/health', 30, 35, 'GET');
    results.push(result);
  } catch (error) {
    console.error('测试失败:', error);
  }

  // 等待一段时间，避免不同测试之间相互影响
  console.log('\n⏳ 等待 5 秒后进行下一个测试...\n');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 测试 2: 查询执行端点 (10 req/min)
  try {
    const result = await testEndpoint(
      '/api/query/execute',
      10,
      15,
      'POST',
      {
        query: '测试查询',
        databaseId: '123e4567-e89b-12d3-a456-426614174000',
      }
    );
    results.push(result);
  } catch (error) {
    console.error('测试失败:', error);
  }

  // 输出测试总结
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 测试总结');
  console.log('═'.repeat(60));

  results.forEach((result) => {
    console.log(`\n端点: ${result.endpoint}`);
    console.log(`  配额限制: ${result.limit} (期望: ${result.expectedLimit})`);
    console.log(`  成功请求: ${result.requestsSucceeded}`);
    console.log(`  失败请求: ${result.requestsFailed}`);
    console.log(`  测试结果: ${result.details}`);
  });

  const allPassed = results.every((r) => r.passed);

  console.log('\n' + '═'.repeat(60));
  if (allPassed) {
    console.log('🎉 所有测试通过！速率限制正常工作。');
  } else {
    console.log('⚠️  部分测试失败，请检查速率限制配置。');
  }
  console.log('═'.repeat(60) + '\n');

  // 返回退出码
  process.exit(allPassed ? 0 : 1);
}

// 运行测试
runTests().catch((error) => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
