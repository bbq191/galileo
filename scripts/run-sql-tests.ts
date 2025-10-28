#!/usr/bin/env ts-node

/**
 * SQL 生成测试运行脚本
 *
 * 用法:
 *   npm run test:sql                    # 运行所有测试
 *   npm run test:sql -- --category single_table   # 运行指定分类
 *   npm run test:sql -- --id simple-001            # 运行指定测试用例
 */

import { SQLGenerationTestRunner } from '../lib/sql/generator/test/test-runner';
import { ReportGenerator } from '../lib/sql/generator/test/report-generator';
import { SQL_GENERATION_TEST_CASES, TEST_STATS } from '../lib/sql/generator/test/test-cases';

async function main() {
  const args = process.argv.slice(2);

  console.log('========================================');
  console.log('SQL 生成测试套件');
  console.log('========================================\n');

  // 解析命令行参数
  const categoryFlag = args.indexOf('--category');
  const idFlag = args.indexOf('--id');
  const helpFlag = args.includes('--help') || args.includes('-h');

  if (helpFlag) {
    printHelp();
    return;
  }

  const runner = new SQLGenerationTestRunner();

  try {
    let result;

    if (idFlag !== -1 && args[idFlag + 1]) {
      // 运行指定测试用例
      const testId = args[idFlag + 1];
      const testCase = SQL_GENERATION_TEST_CASES.find(tc => tc.id === testId);

      if (!testCase) {
        console.error(`错误: 找不到测试用例 "${testId}"`);
        process.exit(1);
      }

      console.log(`运行测试用例: ${testId}\n`);
      const testResult = await runner.runTestCase(testCase);

      // 打印单个测试结果
      printTestResult(testResult);

      // 创建简单的测试套件结果
      result = {
        totalTests: 1,
        passedTests: testResult.passed ? 1 : 0,
        failedTests: testResult.passed ? 0 : 1,
        successRate: testResult.passed ? 1 : 0,
        byCategory: {},
        byComplexity: {},
        performance: {
          avgGenerationTimeMs: testResult.execution.generationTimeMs || 0,
          p95GenerationTimeMs: testResult.execution.generationTimeMs || 0,
          p99GenerationTimeMs: testResult.execution.generationTimeMs || 0,
        },
        results: [testResult],
        executionTimeMs: testResult.execution.generationTimeMs || 0,
        timestamp: new Date(),
      };

    } else if (categoryFlag !== -1 && args[categoryFlag + 1]) {
      // 运行指定分类
      const category = args[categoryFlag + 1];
      result = await runner.runByCategory(category);

    } else {
      // 运行所有测试
      console.log(`测试用例总数: ${TEST_STATS.total}`);
      console.log('按分类:');
      for (const [category, count] of Object.entries(TEST_STATS.byCategory)) {
        console.log(`  - ${category}: ${count}`);
      }
      console.log('按复杂度:');
      for (const [complexity, count] of Object.entries(TEST_STATS.byComplexity)) {
        console.log(`  - ${complexity}: ${count}`);
      }
      console.log('');

      result = await runner.runAll();
    }

    // 打印测试摘要
    console.log('\n========================================');
    console.log('测试摘要');
    console.log('========================================\n');
    printSummary(result);

    // 生成并保存报告
    await ReportGenerator.saveReport(result, './test-reports');

    // 根据测试结果设置退出码
    process.exit(result.failedTests > 0 ? 1 : 0);

  } catch (error: any) {
    console.error('测试执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);

  } finally {
    await runner.cleanup();
  }
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log('SQL 生成测试套件\n');
  console.log('用法:');
  console.log('  npm run test:sql                              # 运行所有测试');
  console.log('  npm run test:sql -- --category <category>     # 运行指定分类');
  console.log('  npm run test:sql -- --id <test-id>            # 运行指定测试用例');
  console.log('  npm run test:sql -- --help                    # 显示帮助\n');
  console.log('可用分类:');
  console.log('  - single_table           单表查询');
  console.log('  - two_table_join         两表 JOIN');
  console.log('  - multi_table_join       多表 JOIN');
  console.log('  - cross_database_join    跨库 JOIN');
  console.log('  - aggregation            聚合查询');
  console.log('  - time_range             时间范围查询');
  console.log('  - groupby                分组查询');
  console.log('  - subquery               子查询');
  console.log('  - complex_condition      复杂条件');
  console.log('  - security_test          安全测试\n');
  console.log('示例:');
  console.log('  npm run test:sql -- --category aggregation');
  console.log('  npm run test:sql -- --id simple-001');
}

/**
 * 打印单个测试结果
 */
function printTestResult(result: any) {
  const status = result.passed ? '✓ 通过' : '✗ 失败';
  const color = result.passed ? '\x1b[32m' : '\x1b[31m';

  console.log(`\n${color}${status}\x1b[0m ${result.testCaseId}: ${result.testCaseName}`);
  console.log(`查询: ${result.execution.naturalLanguageQuery}`);

  if (result.execution.generatedSQL) {
    console.log(`\n生成的 SQL:`);
    console.log('```sql');
    console.log(result.execution.generatedSQL);
    console.log('```');
  }

  if (result.execution.generationTimeMs) {
    console.log(`\n生成时间: ${result.execution.generationTimeMs.toFixed(0)}ms`);
  }

  if (!result.passed) {
    console.log(`\n失败原因:`);
    for (const reason of result.failureReasons) {
      console.log(`  - ${reason}`);
    }
  }

  if (result.execution.warnings && result.execution.warnings.length > 0) {
    console.log(`\n警告:`);
    for (const warning of result.execution.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

/**
 * 打印测试摘要
 */
function printSummary(result: any) {
  const successRate = (result.successRate * 100).toFixed(2);
  const statusIcon = result.successRate >= 0.9 ? '✓' : result.successRate >= 0.7 ? '⚠' : '✗';
  const statusColor = result.successRate >= 0.9 ? '\x1b[32m' : result.successRate >= 0.7 ? '\x1b[33m' : '\x1b[31m';

  console.log(`${statusColor}${statusIcon}\x1b[0m 总测试: ${result.totalTests}`);
  console.log(`  通过: ${result.passedTests}`);
  console.log(`  失败: ${result.failedTests}`);
  console.log(`  成功率: ${successRate}%`);
  console.log('');

  console.log('性能指标:');
  console.log(`  平均生成时间: ${result.performance.avgGenerationTimeMs.toFixed(0)}ms`);
  console.log(`  P95 生成时间: ${result.performance.p95GenerationTimeMs.toFixed(0)}ms`);
  console.log(`  P99 生成时间: ${result.performance.p99GenerationTimeMs.toFixed(0)}ms`);
  console.log('');

  console.log('按分类统计:');
  for (const [category, stats] of Object.entries(result.byCategory)) {
    const rate = (stats as any).total > 0 ? ((stats as any).passed / (stats as any).total * 100).toFixed(1) : '0';
    console.log(`  ${category}: ${(stats as any).passed}/${(stats as any).total} (${rate}%)`);
  }
  console.log('');

  console.log('按复杂度统计:');
  for (const [complexity, stats] of Object.entries(result.byComplexity)) {
    const rate = (stats as any).total > 0 ? ((stats as any).passed / (stats as any).total * 100).toFixed(1) : '0';
    console.log(`  ${complexity}: ${(stats as any).passed}/${(stats as any).total} (${rate}%)`);
  }
}

// 运行主函数
main().catch(console.error);
