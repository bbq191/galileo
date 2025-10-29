/**
 * 查询缓存集成测试脚本
 */

import { queryCacheManager } from '../lib/cache/query-cache-manager';
import { cacheInvalidationService, InvalidationEvent } from '../lib/cache/cache-invalidation';
import type { QueryIntent } from '../lib/nlp/types';
import type { SQLGenerationResult } from '../lib/sql/generator/types';
import type { ExecutionResult } from '../lib/sql/executor/types';

// 测试数据
const testQuery = '查询最近一个月的销售数据';

const testIntent: QueryIntent = {
  type: 'select',
  entities: {
    databases: ['sales_db'],
    tables: ['orders'],
    columns: ['order_date', 'amount'],
  },
  conditions: {
    timeRange: {
      relative: 'last_30_days',
    },
    filters: [],
  },
  confidence: 0.9,
  ambiguities: [],
};

const testSQLResult: SQLGenerationResult = {
  sql: 'SELECT order_date, amount FROM sales_db.orders WHERE order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
  explanation: '查询最近30天的订单数据',
  confidence: 0.95,
  usedTables: ['sales_db.orders'],
  usedColumns: ['order_date', 'amount'],
  warnings: [],
};

const testExecutionResult: ExecutionResult<any> = {
  success: true,
  data: [
    { order_date: '2025-01-01', amount: 100 },
    { order_date: '2025-01-02', amount: 200 },
  ],
  executionTime: 150,
  rowCount: 2,
  fromCache: false,
  metadata: {
    columns: [
      { name: 'order_date', type: 'DATE' },
      { name: 'amount', type: 'DECIMAL' },
    ],
  },
};

async function testQueryCache() {
  console.log('='.repeat(60));
  console.log('查询缓存集成测试');
  console.log('='.repeat(60));
  console.log();

  try {
    // 测试 1: 意图缓存
    console.log('【测试 1】意图缓存');
    console.log('-'.repeat(60));

    // 设置意图缓存
    console.log('设置意图缓存...');
    await queryCacheManager.setIntent(testQuery, testIntent);
    console.log('✓ 意图缓存已设置');

    // 获取意图缓存
    console.log('获取意图缓存...');
    const cachedIntent = await queryCacheManager.getIntent(testQuery);
    if (cachedIntent && cachedIntent.type === testIntent.type) {
      console.log('✓ 意图缓存命中');
    } else {
      console.log('✗ 意图缓存未命中或数据不匹配');
      return;
    }

    console.log();

    // 测试 2: SQL 缓存
    console.log('【测试 2】SQL 缓存');
    console.log('-'.repeat(60));

    // 设置 SQL 缓存
    console.log('设置 SQL 缓存...');
    await queryCacheManager.setSQL(testIntent, testSQLResult);
    console.log('✓ SQL 缓存已设置');

    // 获取 SQL 缓存
    console.log('获取 SQL 缓存...');
    const cachedSQL = await queryCacheManager.getSQL(testIntent);
    if (cachedSQL && cachedSQL.sql === testSQLResult.sql) {
      console.log('✓ SQL 缓存命中');
    } else {
      console.log('✗ SQL 缓存未命中或数据不匹配');
      return;
    }

    console.log();

    // 测试 3: 结果缓存
    console.log('【测试 3】结果缓存');
    console.log('-'.repeat(60));

    // 设置结果缓存
    console.log('设置结果缓存...');
    await queryCacheManager.setResult(testSQLResult.sql, testExecutionResult);
    console.log('✓ 结果缓存已设置');

    // 获取结果缓存
    console.log('获取结果缓存...');
    const cachedResult = await queryCacheManager.getResult(testSQLResult.sql);
    if (cachedResult && cachedResult.success) {
      console.log('✓ 结果缓存命中');
    } else {
      console.log('✗ 结果缓存未命中');
      return;
    }

    console.log();

    // 测试 4: 缓存统计
    console.log('【测试 4】缓存统计');
    console.log('-'.repeat(60));

    const stats = queryCacheManager.getStatistics();
    console.log('缓存统计信息:');
    console.log(`  意图缓存命中: ${stats.intentCacheHits}`);
    console.log(`  意图缓存未命中: ${stats.intentCacheMisses}`);
    console.log(`  SQL 缓存命中: ${stats.sqlCacheHits}`);
    console.log(`  SQL 缓存未命中: ${stats.sqlCacheMisses}`);
    console.log(`  结果缓存命中: ${stats.resultCacheHits}`);
    console.log(`  结果缓存未命中: ${stats.resultCacheMisses}`);
    console.log(`  总命中率: ${(stats.hitRate * 100).toFixed(2)}%`);

    console.log();

    // 测试 5: 缓存失效
    console.log('【测试 5】缓存失效');
    console.log('-'.repeat(60));

    // 失效所有查询缓存
    console.log('失效所有查询缓存...');
    await cacheInvalidationService.invalidate(InvalidationEvent.METADATA_SYNCED, {
      reason: '测试缓存失效',
    });
    console.log('✓ 缓存失效完成');

    // 验证缓存已失效
    console.log('验证缓存是否失效...');
    const intentAfterInvalidation = await queryCacheManager.getIntent(testQuery);
    if (intentAfterInvalidation === null) {
      console.log('✓ 意图缓存已失效');
    } else {
      console.log('✗ 意图缓存仍然存在');
    }

    console.log();

    // 测试 6: 查询标准化
    console.log('【测试 6】查询标准化');
    console.log('-'.repeat(60));

    const query1 = '查询最近一个月的销售数据';
    const query2 = '查询  最近   一个月的销售数据'; // 多余空格
    const query3 = '查询最近一个月的销售数据。'; // 带标点

    console.log('设置原始查询缓存...');
    await queryCacheManager.setIntent(query1, testIntent);

    console.log('测试不同格式的查询...');
    const result2 = await queryCacheManager.getIntent(query2);
    const result3 = await queryCacheManager.getIntent(query3);

    if (result2 && result3) {
      console.log('✓ 查询标准化正常工作');
    } else {
      console.log('✗ 查询标准化未生效');
    }

    console.log();

    // 测试 7: 大结果集不缓存
    console.log('【测试 7】大结果集不缓存');
    console.log('-'.repeat(60));

    const largeResult: ExecutionResult<any> = {
      ...testExecutionResult,
      rowCount: 1500, // 超过 1000 行
      data: Array(1500).fill({ order_id: 1, amount: 100 }),
    };

    console.log('尝试缓存大结果集 (1500行)...');
    await queryCacheManager.setResult(testSQLResult.sql, largeResult);

    console.log('尝试获取大结果集缓存...');
    const cachedLargeResult = await queryCacheManager.getResult(testSQLResult.sql);

    if (cachedLargeResult === null) {
      console.log('✓ 大结果集正确地未被缓存');
    } else {
      console.log('✗ 大结果集被缓存了（不应该）');
    }

    console.log();

    // 测试完成
    console.log('='.repeat(60));
    console.log('✓ 所有测试通过！');
    console.log('='.repeat(60));

    // 最终统计
    const finalStats = queryCacheManager.getStatistics();
    const report = queryCacheManager.getCacheReport();

    console.log('\n最终统计报告:');
    console.log(JSON.stringify(report, null, 2));

  } catch (error) {
    console.error('\n✗ 测试失败:', error);
    throw error;
  }
}

// 运行测试
testQueryCache()
  .then(() => {
    console.log('\n测试完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n测试失败:', error);
    process.exit(1);
  });
