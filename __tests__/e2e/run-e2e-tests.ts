/**
 * 运行端到端测试
 *
 * 使用方法:
 * - 运行所有测试: npm run test:e2e
 * - 运行特定类别: npm run test:e2e -- --category=single-table
 * - 并行执行: npm run test:e2e -- --parallel
 * - 生成报告: npm run test:e2e -- --report
 */

import fs from 'fs';
import path from 'path';
import {
  executeBatchTests,
  calculateTestStats,
  printTestResults,
  generateTestReport,
  cleanupTestData,
  E2ETestResult,
  E2ETestStats,
} from './utils/test-helpers';
import {
  allTestCases,
  getTestCasesByCategory,
  getTestCasesStats,
  singleTableTests,
  multiTableTests,
  crossDatabaseTests,
  aggregationTests,
  complexTests,
} from './test-cases';

interface TestOptions {
  category?: string;
  parallel?: boolean;
  maxConcurrency?: number;
  generateReport?: boolean;
  baseUrl?: string;
  outputDir?: string;
}

/**
 * 解析命令行参数
 */
function parseArgs(): TestOptions {
  const args = process.argv.slice(2);
  const options: TestOptions = {
    parallel: false,
    maxConcurrency: 5,
    generateReport: false,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    outputDir: path.join(__dirname, '../../reports/e2e'),
  };

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1];
    } else if (arg === '--parallel') {
      options.parallel = true;
    } else if (arg.startsWith('--concurrency=')) {
      options.maxConcurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--report') {
      options.generateReport = true;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.split('=')[1];
    }
  }

  return options;
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('开始端到端测试');
  console.log('='.repeat(80) + '\n');

  const options = parseArgs();

  console.log('测试配置:');
  console.log(`  - Base URL: ${options.baseUrl}`);
  console.log(`  - 类别: ${options.category || '所有'}`);
  console.log(`  - 并行执行: ${options.parallel ? '是' : '否'}`);
  if (options.parallel) {
    console.log(`  - 最大并发数: ${options.maxConcurrency}`);
  }
  console.log(`  - 生成报告: ${options.generateReport ? '是' : '否'}`);
  console.log('');

  // 选择要运行的测试用例
  let testCases = allTestCases;
  if (options.category) {
    testCases = getTestCasesByCategory(options.category);
    if (testCases.length === 0) {
      console.error(`❌ 错误: 未找到类别 "${options.category}" 的测试用例`);
      console.log('\n可用类别:');
      const stats = getTestCasesStats();
      for (const [category, count] of Object.entries(stats.byCategory)) {
        console.log(`  - ${category}: ${count} 个测试`);
      }
      process.exit(1);
    }
  }

  console.log(`准备运行 ${testCases.length} 个测试用例...\n`);

  // 检查服务器是否可用
  const serverAvailable = await checkServerAvailability(options.baseUrl!);
  if (!serverAvailable) {
    console.error(`❌ 错误: 无法连接到服务器 ${options.baseUrl}`);
    console.log('请确保 Next.js 服务器正在运行 (npm run dev)');
    process.exit(1);
  }

  console.log('✓ 服务器连接正常\n');
  console.log('开始执行测试...\n');

  const startTime = Date.now();

  // 执行测试
  let results: E2ETestResult[];
  try {
    results = await executeBatchTests(testCases, options.baseUrl, {
      parallel: options.parallel,
      maxConcurrency: options.maxConcurrency,
    });
  } catch (error: any) {
    console.error('❌ 测试执行失败:', error.message);
    process.exit(1);
  }

  const totalTime = Date.now() - startTime;

  // 计算统计
  const stats = calculateTestStats(results);

  // 打印结果
  printTestResults(results, stats);

  console.log(`\n总耗时: ${(totalTime / 1000).toFixed(2)}秒\n`);

  // 生成报告
  if (options.generateReport) {
    await saveTestReport(results, stats, options.outputDir!);
  }

  // 清理测试数据
  console.log('清理测试审计日志...');
  await cleanupTestData();

  // 退出码
  const exitCode = stats.failedTests > 0 ? 1 : 0;
  process.exit(exitCode);
}

/**
 * 检查服务器可用性
 */
async function checkServerAvailability(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    // 如果没有 health 端点,尝试主页
    try {
      const response = await fetch(baseUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.status < 500;
    } catch {
      return false;
    }
  }
}

/**
 * 保存测试报告
 */
async function saveTestReport(
  results: E2ETestResult[],
  stats: E2ETestStats,
  outputDir: string
) {
  try {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 生成 Markdown 报告
    const mdReport = generateTestReport(results, stats);
    const mdPath = path.join(outputDir, `e2e-test-report-${timestamp}.md`);
    fs.writeFileSync(mdPath, mdReport, 'utf-8');
    console.log(`\n✓ Markdown 报告已保存: ${mdPath}`);

    // 生成 JSON 报告
    const jsonReport = {
      timestamp: new Date().toISOString(),
      stats,
      results: results.map(r => ({
        testCase: r.testCase,
        success: r.success,
        passed: r.passed,
        error: r.error,
        performance: r.performance,
        validations: r.validations,
        response: r.response
          ? {
              success: r.response.success,
              error: r.response.error,
              metadata: r.response.metadata,
              warnings: r.response.warnings,
            }
          : undefined,
      })),
    };
    const jsonPath = path.join(outputDir, `e2e-test-report-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
    console.log(`✓ JSON 报告已保存: ${jsonPath}`);

    // 生成 HTML 报告
    const htmlReport = generateHTMLReport(results, stats);
    const htmlPath = path.join(outputDir, `e2e-test-report-${timestamp}.html`);
    fs.writeFileSync(htmlPath, htmlReport, 'utf-8');
    console.log(`✓ HTML 报告已保存: ${htmlPath}`);
  } catch (error: any) {
    console.error('保存测试报告失败:', error.message);
  }
}

/**
 * 生成 HTML 报告
 */
function generateHTMLReport(results: E2ETestResult[], stats: E2ETestStats): string {
  const passedTests = results.filter(r => r.passed);
  const failedTests = results.filter(r => !r.passed);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>端到端测试报告</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      border-bottom: 3px solid #4CAF50;
      padding-bottom: 10px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    .stat-card {
      padding: 20px;
      border-radius: 8px;
      color: white;
    }
    .stat-card.total { background-color: #2196F3; }
    .stat-card.passed { background-color: #4CAF50; }
    .stat-card.failed { background-color: #f44336; }
    .stat-card.rate { background-color: #FF9800; }
    .stat-card h3 { margin: 0 0 10px 0; font-size: 14px; opacity: 0.9; }
    .stat-card .value { font-size: 32px; font-weight: bold; }
    .category-stats {
      margin: 30px 0;
    }
    .category-stats table {
      width: 100%;
      border-collapse: collapse;
    }
    .category-stats th,
    .category-stats td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    .category-stats th {
      background-color: #f5f5f5;
      font-weight: 600;
    }
    .test-list {
      margin-top: 30px;
    }
    .test-item {
      margin-bottom: 20px;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid;
    }
    .test-item.passed {
      background-color: #f1f8f4;
      border-left-color: #4CAF50;
    }
    .test-item.failed {
      background-color: #ffebee;
      border-left-color: #f44336;
    }
    .test-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .test-title {
      font-weight: 600;
      font-size: 16px;
    }
    .test-badge {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: white;
    }
    .test-badge.passed { background-color: #4CAF50; }
    .test-badge.failed { background-color: #f44336; }
    .test-query {
      color: #666;
      font-style: italic;
      margin: 10px 0;
    }
    .test-sql {
      background-color: #f5f5f5;
      padding: 10px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
      margin: 10px 0;
    }
    .test-metrics {
      display: flex;
      gap: 20px;
      margin: 10px 0;
      font-size: 14px;
      color: #666;
    }
    .test-error {
      background-color: #ffcdd2;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
      color: #c62828;
    }
    .timestamp {
      color: #999;
      font-size: 14px;
      margin-top: 30px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧪 端到端测试报告</h1>

    <div class="stats">
      <div class="stat-card total">
        <h3>总测试数</h3>
        <div class="value">${stats.totalTests}</div>
      </div>
      <div class="stat-card passed">
        <h3>通过</h3>
        <div class="value">${stats.passedTests}</div>
      </div>
      <div class="stat-card failed">
        <h3>失败</h3>
        <div class="value">${stats.failedTests}</div>
      </div>
      <div class="stat-card rate">
        <h3>成功率</h3>
        <div class="value">${(stats.successRate * 100).toFixed(1)}%</div>
      </div>
    </div>

    <div class="category-stats">
      <h2>按类别统计</h2>
      <table>
        <thead>
          <tr>
            <th>类别</th>
            <th>通过/总数</th>
            <th>成功率</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(stats.byCategory)
            .map(
              ([category, catStats]) => `
            <tr>
              <td>${category}</td>
              <td>${catStats.passed}/${catStats.total}</td>
              <td>${(catStats.successRate * 100).toFixed(1)}%</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    ${
      failedTests.length > 0
        ? `
    <div class="test-list">
      <h2>❌ 失败的测试 (${failedTests.length})</h2>
      ${failedTests
        .map(
          result => `
        <div class="test-item failed">
          <div class="test-header">
            <div class="test-title">${result.testCase.description}</div>
            <div class="test-badge failed">FAIL</div>
          </div>
          <div class="test-query">"${result.testCase.naturalLanguageQuery}"</div>
          ${
            result.response?.metadata?.generatedSQL
              ? `<div class="test-sql">${result.response.metadata.generatedSQL}</div>`
              : ''
          }
          ${result.error || result.response?.error ? `<div class="test-error">${result.error || result.response?.error}</div>` : ''}
          <div class="test-metrics">
            <span>⏱ ${result.performance.totalTime}ms</span>
            <span>🏷 ${result.testCase.category}</span>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
    `
        : ''
    }

    <div class="test-list">
      <h2>✅ 通过的测试 (${passedTests.length})</h2>
      ${passedTests
        .map(
          result => `
        <div class="test-item passed">
          <div class="test-header">
            <div class="test-title">${result.testCase.description}</div>
            <div class="test-badge passed">PASS</div>
          </div>
          <div class="test-query">"${result.testCase.naturalLanguageQuery}"</div>
          ${
            result.response?.metadata?.generatedSQL
              ? `<div class="test-sql">${result.response.metadata.generatedSQL}</div>`
              : ''
          }
          <div class="test-metrics">
            <span>⏱ ${result.performance.totalTime}ms</span>
            <span>📊 ${result.response?.metadata?.rowCount || 0} 行</span>
            <span>🏷 ${result.testCase.category}</span>
          </div>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="timestamp">
      报告生成时间: ${new Date().toLocaleString('zh-CN')}
    </div>
  </div>
</body>
</html>`;
}

// 运行测试
runTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
