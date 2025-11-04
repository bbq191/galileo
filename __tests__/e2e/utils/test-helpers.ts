/**
 * 端到端测试辅助工具类
 */

import { PrismaClient } from '@prisma/client';
import { ExecuteQueryRequest, ExecuteQueryResponse } from '@/app/api/query/execute/route';

const prisma = new PrismaClient();

/**
 * 测试用例接口
 */
export interface E2ETestCase {
  id: string;
  category: 'single-table' | 'multi-table' | 'cross-database' | 'aggregation' | 'complex';
  description: string;
  naturalLanguageQuery: string;
  expectedIntent?: {
    type?: 'select' | 'aggregate' | 'statistics' | 'comparison';
    tables?: string[];
  };
  expectedSQLPatterns?: RegExp[];  // 期望的 SQL 模式
  expectedColumns?: string[];       // 期望的列名
  shouldPass: boolean;              // 是否应该执行成功
  minRows?: number;                 // 最小行数
  maxRows?: number;                 // 最大行数
  timeout?: number;                 // 超时时间(ms)
}

/**
 * 测试结果接口
 */
export interface E2ETestResult {
  testCase: E2ETestCase;
  success: boolean;
  passed: boolean;  // 测试是否通过
  response?: ExecuteQueryResponse;
  error?: string;
  performance: {
    totalTime: number;
    intentRecognitionTime?: number;
    sqlGenerationTime?: number;
    validationTime?: number;
    executionTime?: number;
  };
  validations: {
    intentCorrect?: boolean;
    sqlValid?: boolean;
    sqlPatternsMatch?: boolean;
    columnsMatch?: boolean;
    rowCountValid?: boolean;
  };
}

/**
 * 测试统计接口
 */
export interface E2ETestStats {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  successRate: number;
  avgTotalTime: number;
  avgIntentTime: number;
  avgSqlTime: number;
  avgExecutionTime: number;
  byCategory: {
    [category: string]: {
      total: number;
      passed: number;
      successRate: number;
    };
  };
}

/**
 * 执行单个测试用例
 */
export async function executeTestCase(
  testCase: E2ETestCase,
  baseUrl: string = 'http://localhost:3000'
): Promise<E2ETestResult> {
  const startTime = Date.now();

  try {
    // 调用查询 API
    const response = await fetch(`${baseUrl}/api/query/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': `e2e-test-${testCase.id}`,
      },
      body: JSON.stringify({
        query: testCase.naturalLanguageQuery,
        options: {
          timeout: testCase.timeout || 30000,
          enableCache: false,  // 测试时禁用缓存
        },
      } as ExecuteQueryRequest),
    });

    const totalTime = Date.now() - startTime;
    const data: ExecuteQueryResponse = await response.json();

    // 验证结果
    const validations = validateTestResult(testCase, data);

    return {
      testCase,
      success: data.success,
      passed: validations.overall,
      response: data,
      performance: {
        totalTime,
        executionTime: data.metadata?.executionTime,
      },
      validations: validations.details,
    };
  } catch (error: any) {
    const totalTime = Date.now() - startTime;

    return {
      testCase,
      success: false,
      passed: false,
      error: error.message,
      performance: {
        totalTime,
      },
      validations: {},
    };
  }
}

/**
 * 验证测试结果
 */
function validateTestResult(
  testCase: E2ETestCase,
  response: ExecuteQueryResponse
): {
  overall: boolean;
  details: {
    intentCorrect?: boolean;
    sqlValid?: boolean;
    sqlPatternsMatch?: boolean;
    columnsMatch?: boolean;
    rowCountValid?: boolean;
  };
} {
  const details: any = {};
  let allPassed = true;

  // 1. 检查执行结果是否符合预期
  if (testCase.shouldPass && !response.success) {
    allPassed = false;
  } else if (!testCase.shouldPass && response.success) {
    allPassed = false;
  }

  // 2. 检查 SQL 模式
  if (testCase.expectedSQLPatterns && response.metadata?.generatedSQL) {
    const sql = response.metadata.generatedSQL;
    const allPatternsMatch = testCase.expectedSQLPatterns.every(pattern =>
      pattern.test(sql)
    );
    details.sqlPatternsMatch = allPatternsMatch;
    if (!allPatternsMatch) {
      allPassed = false;
    }
  }

  // 3. 检查返回列
  if (testCase.expectedColumns && response.metadata?.columns) {
    const returnedColumns = response.metadata.columns.map(c => c.name.toLowerCase());
    const expectedColumns = testCase.expectedColumns.map(c => c.toLowerCase());

    const allColumnsPresent = expectedColumns.every(col =>
      returnedColumns.includes(col)
    );
    details.columnsMatch = allColumnsPresent;
    if (!allColumnsPresent) {
      allPassed = false;
    }
  }

  // 4. 检查行数
  if (testCase.shouldPass && response.metadata?.rowCount !== undefined) {
    const rowCount = response.metadata.rowCount;

    if (testCase.minRows !== undefined && rowCount < testCase.minRows) {
      details.rowCountValid = false;
      allPassed = false;
    } else if (testCase.maxRows !== undefined && rowCount > testCase.maxRows) {
      details.rowCountValid = false;
      allPassed = false;
    } else {
      details.rowCountValid = true;
    }
  }

  return {
    overall: allPassed,
    details,
  };
}

/**
 * 批量执行测试用例
 */
export async function executeBatchTests(
  testCases: E2ETestCase[],
  baseUrl: string = 'http://localhost:3000',
  options: {
    parallel?: boolean;
    maxConcurrency?: number;
  } = {}
): Promise<E2ETestResult[]> {
  const parallel = options.parallel ?? false;
  const maxConcurrency = options.maxConcurrency ?? 5;

  if (parallel) {
    // 并行执行，限制并发数
    const results: E2ETestResult[] = [];
    const chunks = chunkArray(testCases, maxConcurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(testCase => executeTestCase(testCase, baseUrl))
      );
      results.push(...chunkResults);
    }

    return results;
  } else {
    // 串行执行
    const results: E2ETestResult[] = [];

    for (const testCase of testCases) {
      const result = await executeTestCase(testCase, baseUrl);
      results.push(result);

      // 给服务器一点喘息时间
      await sleep(100);
    }

    return results;
  }
}

/**
 * 计算测试统计
 */
export function calculateTestStats(results: E2ETestResult[]): E2ETestStats {
  const stats: E2ETestStats = {
    totalTests: results.length,
    passedTests: results.filter(r => r.passed).length,
    failedTests: results.filter(r => !r.passed).length,
    successRate: 0,
    avgTotalTime: 0,
    avgIntentTime: 0,
    avgSqlTime: 0,
    avgExecutionTime: 0,
    byCategory: {},
  };

  stats.successRate = stats.totalTests > 0 ? stats.passedTests / stats.totalTests : 0;

  // 计算平均时间
  const totalTimes = results.map(r => r.performance.totalTime);
  const executionTimes = results
    .filter(r => r.performance.executionTime !== undefined)
    .map(r => r.performance.executionTime!);

  stats.avgTotalTime = average(totalTimes);
  stats.avgExecutionTime = average(executionTimes);

  // 按类别统计
  const categories = [...new Set(results.map(r => r.testCase.category))];
  for (const category of categories) {
    const categoryResults = results.filter(r => r.testCase.category === category);
    stats.byCategory[category] = {
      total: categoryResults.length,
      passed: categoryResults.filter(r => r.passed).length,
      successRate:
        categoryResults.length > 0
          ? categoryResults.filter(r => r.passed).length / categoryResults.length
          : 0,
    };
  }

  return stats;
}

/**
 * 打印测试结果
 */
export function printTestResults(results: E2ETestResult[], stats: E2ETestStats) {
  console.log('\n' + '='.repeat(80));
  console.log('端到端测试结果');
  console.log('='.repeat(80) + '\n');

  console.log(`总测试数: ${stats.totalTests}`);
  console.log(`通过: ${stats.passedTests} ✓`);
  console.log(`失败: ${stats.failedTests} ✗`);
  console.log(`成功率: ${(stats.successRate * 100).toFixed(2)}%`);
  console.log(`平均总耗时: ${stats.avgTotalTime.toFixed(0)}ms`);
  console.log(`平均执行耗时: ${stats.avgExecutionTime.toFixed(0)}ms\n`);

  console.log('按类别统计:');
  for (const [category, catStats] of Object.entries(stats.byCategory)) {
    console.log(
      `  ${category}: ${catStats.passed}/${catStats.total} (${(catStats.successRate * 100).toFixed(2)}%)`
    );
  }

  console.log('\n详细测试用例结果:\n');

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const statusColor = result.passed ? '\x1b[32m' : '\x1b[31m';
    const resetColor = '\x1b[0m';

    console.log(`${statusColor}${status}${resetColor} [${result.testCase.category}] ${result.testCase.description}`);
    console.log(`  查询: "${result.testCase.naturalLanguageQuery}"`);

    if (result.response?.metadata?.generatedSQL) {
      console.log(`  SQL: ${result.response.metadata.generatedSQL.substring(0, 100)}...`);
    }

    if (result.response?.success) {
      console.log(`  返回行数: ${result.response.metadata?.rowCount || 0}`);
      console.log(`  执行时间: ${result.performance.totalTime}ms`);
    }

    if (!result.passed) {
      if (result.error) {
        console.log(`  错误: ${result.error}`);
      } else if (result.response?.error) {
        console.log(`  错误: ${result.response.error}`);
      }

      // 打印验证失败的详情
      const failedValidations = Object.entries(result.validations)
        .filter(([_, value]) => value === false)
        .map(([key, _]) => key);

      if (failedValidations.length > 0) {
        console.log(`  验证失败: ${failedValidations.join(', ')}`);
      }
    }

    console.log('');
  }

  console.log('='.repeat(80));
}

/**
 * 生成测试报告（Markdown 格式）
 */
export function generateTestReport(
  results: E2ETestResult[],
  stats: E2ETestStats
): string {
  const timestamp = new Date().toISOString();

  let report = `# 端到端测试报告\n\n`;
  report += `生成时间: ${timestamp}\n\n`;

  report += `## 测试概览\n\n`;
  report += `| 指标 | 值 |\n`;
  report += `|------|----|\n`;
  report += `| 总测试数 | ${stats.totalTests} |\n`;
  report += `| 通过数 | ${stats.passedTests} |\n`;
  report += `| 失败数 | ${stats.failedTests} |\n`;
  report += `| 成功率 | ${(stats.successRate * 100).toFixed(2)}% |\n`;
  report += `| 平均总耗时 | ${stats.avgTotalTime.toFixed(0)}ms |\n`;
  report += `| 平均执行耗时 | ${stats.avgExecutionTime.toFixed(0)}ms |\n\n`;

  report += `## 按类别统计\n\n`;
  report += `| 类别 | 通过/总数 | 成功率 |\n`;
  report += `|------|----------|--------|\n`;
  for (const [category, catStats] of Object.entries(stats.byCategory)) {
    report += `| ${category} | ${catStats.passed}/${catStats.total} | ${(catStats.successRate * 100).toFixed(2)}% |\n`;
  }
  report += `\n`;

  report += `## 详细测试结果\n\n`;

  for (const result of results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';

    report += `### ${status} ${result.testCase.description}\n\n`;
    report += `**类别**: ${result.testCase.category}\n\n`;
    report += `**查询**: "${result.testCase.naturalLanguageQuery}"\n\n`;

    if (result.response?.metadata?.generatedSQL) {
      report += `**生成的 SQL**:\n\`\`\`sql\n${result.response.metadata.generatedSQL}\n\`\`\`\n\n`;
    }

    if (result.response?.metadata?.explanation) {
      report += `**SQL 说明**: ${result.response.metadata.explanation}\n\n`;
    }

    report += `**性能指标**:\n`;
    report += `- 总耗时: ${result.performance.totalTime}ms\n`;
    if (result.performance.executionTime) {
      report += `- 执行耗时: ${result.performance.executionTime}ms\n`;
    }
    report += `\n`;

    if (result.response?.success) {
      report += `**结果**:\n`;
      report += `- 返回行数: ${result.response.metadata?.rowCount || 0}\n`;
      report += `- 使用缓存: ${result.response.metadata?.fromCache ? '是' : '否'}\n`;
      report += `\n`;
    }

    if (!result.passed) {
      report += `**失败原因**:\n`;
      if (result.error) {
        report += `- 错误: ${result.error}\n`;
      } else if (result.response?.error) {
        report += `- 错误: ${result.response.error}\n`;
      }

      const failedValidations = Object.entries(result.validations)
        .filter(([_, value]) => value === false)
        .map(([key, _]) => key);

      if (failedValidations.length > 0) {
        report += `- 验证失败: ${failedValidations.join(', ')}\n`;
      }
      report += `\n`;
    }

    if (result.response?.warnings && result.response.warnings.length > 0) {
      report += `**警告**:\n`;
      for (const warning of result.response.warnings) {
        report += `- ${warning}\n`;
      }
      report += `\n`;
    }

    report += `---\n\n`;
  }

  return report;
}

// ============= 辅助函数 =============

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function cleanupTestData() {
  // 清理测试期间产生的审计日志等数据
  try {
    await prisma.queryAuditLog.deleteMany({
      where: {
        sessionId: {
          startsWith: 'e2e-test-',
        },
      },
    });
    console.log('测试数据清理完成');
  } catch (error) {
    console.error('清理测试数据失败:', error);
  }
}
