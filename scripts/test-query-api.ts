/**
 * 查询 API 集成测试脚本
 * 测试所有查询相关的 API 端点
 *
 * 使用方法：
 * 1. 启动开发服务器: npm run dev
 * 2. 在另一个终端运行: npx tsx scripts/test-query-api.ts
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  message?: string;
  duration?: number;
}

const results: TestResult[] = [];

/**
 * 测试工具函数
 */
async function testAPI(
  name: string,
  method: string,
  url: string,
  body?: any
): Promise<any> {
  const startTime = Date.now();

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': `test-session-${Date.now()}`,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();
    const duration = Date.now() - startTime;

    if (response.ok && data.success !== false) {
      results.push({
        name,
        success: true,
        duration,
      });
      return data;
    } else {
      results.push({
        name,
        success: false,
        message: data.error || `HTTP ${response.status}`,
        duration,
      });
      return null;
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    results.push({
      name,
      success: false,
      message: error.message,
      duration,
    });
    return null;
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  console.log('========================================');
  console.log('查询 API 集成测试');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log('========================================\n');

  let lastQueryId: number | null = null;

  // ============================================
  // 测试 1: POST /api/query/preview
  // ============================================
  console.log('测试 1: POST /api/query/preview - 预览 SQL...');

  const previewResult = await testAPI(
    'Preview SQL',
    'POST',
    `${API_BASE_URL}/api/query/preview`,
    {
      query: '查询用户表的所有数据',
    }
  );

  if (previewResult) {
    console.log(`✓ SQL 预览成功`);
    console.log(`  - 生成的 SQL: ${previewResult.sql?.substring(0, 100)}...`);
    console.log(`  - 验证结果: ${previewResult.validation?.isValid ? '通过' : '失败'}`);
    if (previewResult.validation?.warnings?.length > 0) {
      console.log(`  - 警告数: ${previewResult.validation.warnings.length}`);
    }
  } else {
    console.log(`✗ SQL 预览失败`);
  }
  console.log();

  // ============================================
  // 测试 2: POST /api/query/execute
  // ============================================
  console.log('测试 2: POST /api/query/execute - 执行自然语言查询...');

  const executeResult = await testAPI(
    'Execute Natural Language Query',
    'POST',
    `${API_BASE_URL}/api/query/execute`,
    {
      query: '查询用户表的前10条数据',
      options: {
        enableCache: false,
        maxRows: 10,
        timeout: 30000,
      },
    }
  );

  if (executeResult) {
    console.log(`✓ 查询执行成功`);
    console.log(`  - 返回行数: ${executeResult.metadata?.rowCount || 0}`);
    console.log(`  - 执行时间: ${executeResult.metadata?.executionTime || 0}ms`);
    console.log(`  - 是否使用缓存: ${executeResult.metadata?.fromCache ? '是' : '否'}`);
    if (executeResult.warnings?.length > 0) {
      console.log(`  - 警告数: ${executeResult.warnings.length}`);
    }
  } else {
    console.log(`✗ 查询执行失败`);
  }
  console.log();

  // ============================================
  // 测试 3: POST /api/query/sql
  // ============================================
  console.log('测试 3: POST /api/query/sql - 直接执行 SQL...');

  const sqlResult = await testAPI(
    'Execute SQL Directly',
    'POST',
    `${API_BASE_URL}/api/query/sql`,
    {
      sql: 'SELECT 1 as test_value, NOW() as current_time',
      options: {
        enableCache: false,
        maxRows: 10,
      },
    }
  );

  if (sqlResult) {
    console.log(`✓ SQL 执行成功`);
    console.log(`  - 返回行数: ${sqlResult.metadata?.rowCount || 0}`);
    console.log(`  - 执行时间: ${sqlResult.metadata?.executionTime || 0}ms`);
  } else {
    console.log(`✗ SQL 执行失败`);
  }
  console.log();

  // 等待一下，确保审计日志已写入
  await new Promise(resolve => setTimeout(resolve, 1000));

  // ============================================
  // 测试 4: GET /api/query/history
  // ============================================
  console.log('测试 4: GET /api/query/history - 获取查询历史...');

  const historyResult = await testAPI(
    'Get Query History',
    'GET',
    `${API_BASE_URL}/api/query/history?page=1&limit=10`
  );

  if (historyResult) {
    console.log(`✓ 查询历史获取成功`);
    console.log(`  - 总记录数: ${historyResult.pagination?.totalCount || 0}`);
    console.log(`  - 当前页数据: ${historyResult.data?.length || 0} 条`);
    console.log(`  - 总页数: ${historyResult.pagination?.totalPages || 0}`);

    // 保存最新的查询ID用于后续测试
    if (historyResult.data && historyResult.data.length > 0) {
      lastQueryId = historyResult.data[0].id;
    }
  } else {
    console.log(`✗ 查询历史获取失败`);
  }
  console.log();

  // ============================================
  // 测试 5: GET /api/query/history/:id
  // ============================================
  if (lastQueryId) {
    console.log(`测试 5: GET /api/query/history/${lastQueryId} - 获取查询详情...`);

    const detailResult = await testAPI(
      'Get Query Detail',
      'GET',
      `${API_BASE_URL}/api/query/history/${lastQueryId}`
    );

    if (detailResult) {
      console.log(`✓ 查询详情获取成功`);
      console.log(`  - 查询ID: ${detailResult.data?.id}`);
      console.log(`  - 自然语言: ${detailResult.data?.naturalLanguageQuery}`);
      console.log(`  - 执行结果: ${detailResult.data?.executionResult?.success ? '成功' : '失败'}`);
      console.log(`  - 总耗时: ${detailResult.data?.performance?.totalTime || 0}ms`);
    } else {
      console.log(`✗ 查询详情获取失败`);
    }
    console.log();
  } else {
    console.log('测试 5: 跳过（没有可用的查询ID）\n');
  }

  // ============================================
  // 测试 6: GET /api/audit/logs
  // ============================================
  console.log('测试 6: GET /api/audit/logs - 获取审计日志...');

  const auditLogsResult = await testAPI(
    'Get Audit Logs',
    'GET',
    `${API_BASE_URL}/api/audit/logs?page=1&limit=20`
  );

  if (auditLogsResult) {
    console.log(`✓ 审计日志获取成功`);
    console.log(`  - 总记录数: ${auditLogsResult.pagination?.totalCount || 0}`);
    console.log(`  - 当前页数据: ${auditLogsResult.data?.length || 0} 条`);

    if (auditLogsResult.data && auditLogsResult.data.length > 0) {
      const successCount = auditLogsResult.data.filter((log: any) => log.executionSuccess).length;
      console.log(`  - 成功查询: ${successCount} 条`);
      console.log(`  - 失败查询: ${auditLogsResult.data.length - successCount} 条`);
    }
  } else {
    console.log(`✗ 审计日志获取失败`);
  }
  console.log();

  // ============================================
  // 测试 7: GET /api/audit/stats
  // ============================================
  console.log('测试 7: GET /api/audit/stats - 获取统计数据（基本）...');

  const statsResult = await testAPI(
    'Get Audit Stats (Basic)',
    'GET',
    `${API_BASE_URL}/api/audit/stats`
  );

  if (statsResult) {
    console.log(`✓ 统计数据获取成功`);
    console.log(`  - 总查询数: ${statsResult.data?.overview?.totalQueries || 0}`);
    console.log(`  - 成功查询: ${statsResult.data?.overview?.successQueries || 0}`);
    console.log(`  - 失败查询: ${statsResult.data?.overview?.failedQueries || 0}`);
    console.log(`  - 成功率: ${((statsResult.data?.overview?.successRate || 0) * 100).toFixed(2)}%`);
    console.log(`  - 平均执行时间: ${(statsResult.data?.overview?.avgExecutionTime || 0).toFixed(2)}ms`);
  } else {
    console.log(`✗ 统计数据获取失败`);
  }
  console.log();

  // ============================================
  // 测试 8: GET /api/audit/stats (with details)
  // ============================================
  console.log('测试 8: GET /api/audit/stats?includeDetails=true - 获取详细统计...');

  const detailedStatsResult = await testAPI(
    'Get Audit Stats (Detailed)',
    'GET',
    `${API_BASE_URL}/api/audit/stats?includeDetails=true`
  );

  if (detailedStatsResult) {
    console.log(`✓ 详细统计数据获取成功`);
    console.log(`  - 热门查询数: ${detailedStatsResult.data?.popularQueries?.length || 0}`);
    console.log(`  - 活跃用户数: ${detailedStatsResult.data?.userActivity?.length || 0}`);
    console.log(`  - 数据库使用统计: ${detailedStatsResult.data?.databaseUsage?.length || 0} 个数据库`);
    console.log(`  - 表使用统计: ${detailedStatsResult.data?.tableUsage?.length || 0} 个表`);
    console.log(`  - 时间范围统计: ${detailedStatsResult.data?.timeRangeStats?.length || 0} 个数据点`);
  } else {
    console.log(`✗ 详细统计数据获取失败`);
  }
  console.log();

  // ============================================
  // 测试总结
  // ============================================
  console.log('========================================');
  console.log('测试总结');
  console.log('========================================\n');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  console.log(`总测试数: ${results.length}`);
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${failCount}`);
  console.log(`总耗时: ${totalDuration}ms`);
  console.log();

  if (failCount > 0) {
    console.log('失败的测试:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  ✗ ${r.name}: ${r.message}`);
      });
    console.log();
  }

  console.log('详细结果:');
  results.forEach(r => {
    const status = r.success ? '✓' : '✗';
    const time = r.duration ? ` (${r.duration}ms)` : '';
    console.log(`  ${status} ${r.name}${time}`);
  });

  console.log();

  if (failCount === 0) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('❌ 部分测试失败');
    process.exit(1);
  }
}

// 运行测试
runTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
