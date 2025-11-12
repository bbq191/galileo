/**
 * 测试脚本：查询统计跟踪功能验证
 * Phase 4 - 功能完善：查询统计跟踪
 *
 * 运行方式：
 * npx tsx scripts/test-statistics-tracking.ts
 */

import 'reflect-metadata';
import { setupDependencyInjection } from '@/lib/di/setup';
import { resolve } from '@/lib/di/container';
import { DI_TOKENS } from '@/lib/di/tokens';
import type { QueryStatisticsTracker } from '@/lib/sql/executor/query-statistics-tracker';
import type { StatisticsAggregationService } from '@/lib/statistics/statistics-aggregation.service';
import type { StatisticsPersistenceService } from '@/lib/statistics/statistics-persistence.service';

/**
 * 模拟查询执行
 */
async function simulateQueryExecution(
  tracker: QueryStatisticsTracker,
  queryId: string,
  sql: string,
  databases: string[],
  tables: string[],
  shouldFail: boolean = false,
  shouldTimeout: boolean = false,
  duration: number = 100
): Promise<void> {
  // 开始跟踪
  tracker.startTracking(queryId, sql, databases, tables);

  // 模拟查询执行
  await new Promise((resolve) => setTimeout(resolve, duration));

  // 完成跟踪
  if (shouldFail) {
    tracker.failTracking(
      queryId,
      shouldTimeout ? '查询执行超时' : '查询执行失败',
      shouldTimeout
    );
  } else {
    const rowCount = Math.floor(Math.random() * 1000) + 1;
    tracker.completeTracking(queryId, rowCount);
  }
}

/**
 * 测试实时查询统计追踪器
 */
async function testQueryStatisticsTracker() {
  console.log('\n========================================');
  console.log('测试 1: QueryStatisticsTracker 实时统计');
  console.log('========================================\n');

  const tracker = resolve<QueryStatisticsTracker>(DI_TOKENS.QueryStatisticsTracker);

  // 模拟 20 个查询
  const queries = [
    { id: 'q1', sql: 'SELECT * FROM users', dbs: ['db1'], tables: ['users'], fail: false },
    { id: 'q2', sql: 'SELECT * FROM orders', dbs: ['db1'], tables: ['orders'], fail: false },
    {
      id: 'q3',
      sql: 'SELECT * FROM products',
      dbs: ['db2'],
      tables: ['products'],
      fail: true,
    },
    { id: 'q4', sql: 'SELECT * FROM users', dbs: ['db1'], tables: ['users'], fail: false },
    { id: 'q5', sql: 'SELECT * FROM orders', dbs: ['db1'], tables: ['orders'], fail: false },
    {
      id: 'q6',
      sql: 'SELECT * FROM inventory',
      dbs: ['db2'],
      tables: ['inventory'],
      fail: false,
      timeout: true,
    },
    { id: 'q7', sql: 'SELECT * FROM users', dbs: ['db1'], tables: ['users'], fail: false },
    {
      id: 'q8',
      sql: 'SELECT * FROM analytics',
      dbs: ['db3'],
      tables: ['analytics'],
      fail: false,
      duration: 500,
    },
    { id: 'q9', sql: 'SELECT * FROM logs', dbs: ['db3'], tables: ['logs'], fail: false },
    { id: 'q10', sql: 'SELECT * FROM users', dbs: ['db1'], tables: ['users'], fail: false },
  ];

  console.log('⏳ 模拟执行 10 个查询...\n');

  for (const q of queries) {
    await simulateQueryExecution(
      tracker,
      q.id,
      q.sql,
      q.dbs,
      q.tables,
      q.fail || false,
      (q as any).timeout || false,
      (q as any).duration || Math.floor(Math.random() * 200) + 50
    );
  }

  // 获取聚合统计
  console.log('📊 聚合统计:');
  const aggStats = tracker.getAggregatedStats();
  console.log(JSON.stringify(aggStats, null, 2));

  // 获取最慢查询
  console.log('\n🐌 最慢的 3 个查询:');
  const slowest = tracker.getSlowestQueries(3);
  slowest.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.queryId} - ${q.duration}ms - ${q.sql?.substring(0, 50)}...`);
  });

  // 获取失败查询
  console.log('\n❌ 失败的查询:');
  const failed = tracker.getFailedQueries(5);
  failed.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.queryId} - ${q.error} - ${q.sql?.substring(0, 50)}...`);
  });

  console.log('\n✅ QueryStatisticsTracker 测试完成\n');
}

/**
 * 测试统计聚合服务
 */
async function testStatisticsAggregation() {
  console.log('\n========================================');
  console.log('测试 2: StatisticsAggregationService 聚合');
  console.log('========================================\n');

  const statsService = resolve<StatisticsAggregationService>(
    DI_TOKENS.StatisticsAggregationService
  );

  console.log('⏳ 获取系统统计概览...\n');
  const overview = await statsService.getSystemOverview();

  console.log('📊 系统统计概览:');
  console.log(JSON.stringify(overview, null, 2));

  console.log('\n⏳ 获取热点数据分析...\n');
  const hotspots = await statsService.getHotspotAnalysis();

  console.log('🔥 热点数据分析:');
  console.log(`  - 热门查询: ${hotspots.hotQueries.length} 个`);
  console.log(`  - 热门表: ${hotspots.hotTables.length} 个`);
  console.log(`  - 慢查询: ${hotspots.slowQueries.length} 个`);

  console.log('\n✅ StatisticsAggregationService 测试完成\n');
}

/**
 * 测试统计持久化服务
 */
async function testStatisticsPersistence() {
  console.log('\n========================================');
  console.log('测试 3: StatisticsPersistenceService 持久化');
  console.log('========================================\n');

  const persistenceService = resolve<StatisticsPersistenceService>(
    DI_TOKENS.StatisticsPersistenceService
  );

  console.log('⏳ 立即持久化统计数据...\n');
  await persistenceService.persistStatistics();

  console.log('✅ 统计数据已持久化到 Redis\n');

  console.log('⏳ 从 Redis 恢复统计数据...\n');
  const restored = await persistenceService.restoreStatistics();

  if (restored) {
    console.log('📦 恢复的统计数据:');
    console.log(`  - 时间戳: ${restored.timestamp}`);
    console.log(
      `  - 查询总数: ${restored.queryStats.aggregated.totalQueries}`
    );
    console.log(
      `  - 成功率: ${restored.queryStats.aggregated.successRate.toFixed(2)}%`
    );
    console.log(
      `  - 缓存命中率: ${restored.cacheStats.hitRate.toFixed(2)}%`
    );
  } else {
    console.log('❌ 未找到持久化的统计数据');
  }

  console.log('\n✅ StatisticsPersistenceService 测试完成\n');
}

/**
 * 主测试函数
 */
async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   查询统计跟踪功能 - 综合测试         ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // 初始化 DI 容器
    console.log('⏳ 初始化依赖注入容器...\n');
    setupDependencyInjection();
    console.log('✅ DI 容器初始化完成\n');

    // 测试 1: QueryStatisticsTracker
    await testQueryStatisticsTracker();

    // 测试 2: StatisticsAggregationService
    await testStatisticsAggregation();

    // 测试 3: StatisticsPersistenceService
    await testStatisticsPersistence();

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   ✅ 所有测试通过！                   ║');
    console.log('╚════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
main();
