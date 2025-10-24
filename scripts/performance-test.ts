/**
 * 性能测试脚本
 * 用于验证系统性能是否达到 SLA 指标
 */

import { performance } from 'perf_hooks';
import prisma from '../lib/prisma/client';
import { multiLevelCache } from '../lib/cache';
import { relationshipGraphBuilder } from '../lib/metadata/graph';
import { cachedMetadataRepository } from '../lib/metadata/storage/cached-metadata-repository';

/**
 * 性能测试结果
 */
interface TestResult {
  name: string;
  duration: number;
  passed: boolean;
  threshold: number;
  notes?: string;
}

/**
 * 性能测试器
 */
class PerformanceTest {
  private results: TestResult[] = [];

  /**
   * 运行所有测试
   */
  async runAll(): Promise<void> {
    console.log('========================================');
    console.log('开始性能测试...');
    console.log('========================================\n');

    try {
      // 准备测试数据
      await this.prepareTestData();

      // 1. 元数据查询性能测试
      await this.testMetadataQuery();

      // 2. 关系图谱查询性能测试
      await this.testRelationshipGraph();

      // 3. 缓存性能测试
      await this.testCachePerformance();

      // 4. 批量查询性能测试
      await this.testBatchQuery();

      // 5. 输出结果
      this.printResults();
    } catch (error) {
      console.error('性能测试失败:', error);
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * 准备测试数据
   */
  private async prepareTestData(): Promise<void> {
    console.log('[准备] 检查测试数据...\n');

    const tableCount = await prisma.tableMeta.count();
    console.log(`  - 表数量: ${tableCount}`);

    if (tableCount === 0) {
      console.warn('  警告: 没有测试数据，某些测试可能无法执行\n');
    }

    // 预热缓存
    console.log('[准备] 预热缓存...');
    await multiLevelCache.clear();
    console.log('  - 缓存已清空\n');
  }

  /**
   * 测试元数据查询性能
   */
  private async testMetadataQuery(): Promise<void> {
    console.log('[测试 1] 元数据查询性能');

    // 获取第一张表用于测试
    const firstTable = await prisma.tableMeta.findFirst({
      include: { database: true },
    });

    if (!firstTable) {
      console.log('  跳过: 没有测试数据\n');
      return;
    }

    // 测试 1.1: 单表查询（冷查询）
    const start1 = performance.now();
    await cachedMetadataRepository.getTableById(firstTable.id);
    const duration1 = performance.now() - start1;

    this.results.push({
      name: '单表查询 (冷查询)',
      duration: Math.round(duration1),
      passed: duration1 < 200, // 小型系统阈值: 200ms
      threshold: 200,
    });

    console.log(`  ✓ 单表查询 (冷): ${Math.round(duration1)}ms`);

    // 测试 1.2: 单表查询（热查询）
    const start2 = performance.now();
    await cachedMetadataRepository.getTableById(firstTable.id);
    const duration2 = performance.now() - start2;

    this.results.push({
      name: '单表查询 (热查询/L1缓存)',
      duration: Math.round(duration2),
      passed: duration2 < 10, // 应该在 10ms 以内
      threshold: 10,
    });

    console.log(`  ✓ 单表查询 (热): ${Math.round(duration2)}ms`);

    // 测试 1.3: 列查询
    const start3 = performance.now();
    await cachedMetadataRepository.getTableColumns(firstTable.id);
    const duration3 = performance.now() - start3;

    this.results.push({
      name: '列查询',
      duration: Math.round(duration3),
      passed: duration3 < 200,
      threshold: 200,
    });

    console.log(`  ✓ 列查询: ${Math.round(duration3)}ms`);

    // 测试 1.4: 数据库列表查询
    const start4 = performance.now();
    await cachedMetadataRepository.getDatabasesBySource(firstTable.database.sourceId);
    const duration4 = performance.now() - start4;

    this.results.push({
      name: '数据库列表查询',
      duration: Math.round(duration4),
      passed: duration4 < 200,
      threshold: 200,
    });

    console.log(`  ✓ 数据库列表: ${Math.round(duration4)}ms\n`);
  }

  /**
   * 测试关系图谱查询性能
   */
  private async testRelationshipGraph(): Promise<void> {
    console.log('[测试 2] 关系图谱查询性能');

    const firstTable = await prisma.tableMeta.findFirst();

    if (!firstTable) {
      console.log('  跳过: 没有测试数据\n');
      return;
    }

    // 测试 2.1: 深度 1 图谱查询
    const start1 = performance.now();
    await relationshipGraphBuilder.buildGraph(firstTable.id, null, 1, true, 0.7);
    const duration1 = performance.now() - start1;

    this.results.push({
      name: '关系图谱 (深度1)',
      duration: Math.round(duration1),
      passed: duration1 < 300,
      threshold: 300,
    });

    console.log(`  ✓ 深度 1: ${Math.round(duration1)}ms`);

    // 测试 2.2: 深度 2 图谱查询
    const start2 = performance.now();
    await relationshipGraphBuilder.buildGraph(firstTable.id, null, 2, true, 0.7);
    const duration2 = performance.now() - start2;

    this.results.push({
      name: '关系图谱 (深度2)',
      duration: Math.round(duration2),
      passed: duration2 < 500,
      threshold: 500,
    });

    console.log(`  ✓ 深度 2: ${Math.round(duration2)}ms`);

    // 测试 2.3: 缓存命中
    const start3 = performance.now();
    await relationshipGraphBuilder.buildGraph(firstTable.id, null, 2, true, 0.7);
    const duration3 = performance.now() - start3;

    this.results.push({
      name: '关系图谱 (缓存命中)',
      duration: Math.round(duration3),
      passed: duration3 < 50,
      threshold: 50,
    });

    console.log(`  ✓ 缓存命中: ${Math.round(duration3)}ms\n`);
  }

  /**
   * 测试缓存性能
   */
  private async testCachePerformance(): Promise<void> {
    console.log('[测试 3] 缓存性能');

    const firstTable = await prisma.tableMeta.findFirst();
    if (!firstTable) {
      console.log('  跳过: 没有测试数据\n');
      return;
    }

    // 清空缓存
    await multiLevelCache.clear();

    // 测试 3.1: 写入性能
    const writeStart = performance.now();
    for (let i = 0; i < 100; i++) {
      await multiLevelCache.set('table_meta', { id: i, version: 'latest' }, { id: i });
    }
    const writeDuration = (performance.now() - writeStart) / 100;

    this.results.push({
      name: '缓存写入 (平均)',
      duration: Math.round(writeDuration * 100) / 100,
      passed: writeDuration < 10,
      threshold: 10,
      notes: '每次写入',
    });

    console.log(`  ✓ 写入性能: ${Math.round(writeDuration * 100) / 100}ms/次`);

    // 测试 3.2: L1 读取性能
    const l1Start = performance.now();
    for (let i = 0; i < 100; i++) {
      await multiLevelCache.get('table_meta', { id: 50, version: 'latest' }, async () => ({
        id: 50,
      }));
    }
    const l1Duration = (performance.now() - l1Start) / 100;

    this.results.push({
      name: '缓存读取 (L1)',
      duration: Math.round(l1Duration * 100) / 100,
      passed: l1Duration < 1,
      threshold: 1,
      notes: '每次读取',
    });

    console.log(`  ✓ L1 读取: ${Math.round(l1Duration * 100) / 100}ms/次`);

    // 获取缓存统计
    const stats = multiLevelCache.getStats();
    console.log(`  ℹ 缓存统计: L1大小=${stats.l1Size}, 命中率=${Math.round(stats.hitRate * 100)}%\n`);
  }

  /**
   * 测试批量查询性能
   */
  private async testBatchQuery(): Promise<void> {
    console.log('[测试 4] 批量查询性能');

    // 测试 4.1: 批量获取表
    const tables = await prisma.tableMeta.findMany({ take: 10 });

    if (tables.length === 0) {
      console.log('  跳过: 没有测试数据\n');
      return;
    }

    const start1 = performance.now();
    const tableIds = tables.map((t) => t.id);

    // 使用 Promise.all 并行查询
    await Promise.all(tableIds.map((id) => cachedMetadataRepository.getTableById(id)));

    const duration1 = performance.now() - start1;

    this.results.push({
      name: `批量查询 (${tables.length}张表)`,
      duration: Math.round(duration1),
      passed: duration1 < 500,
      threshold: 500,
    });

    console.log(`  ✓ 批量查询 ${tables.length} 张表: ${Math.round(duration1)}ms`);
    console.log(`  ℹ 平均每张表: ${Math.round(duration1 / tables.length)}ms\n`);
  }

  /**
   * 打印测试结果
   */
  private printResults(): void {
    console.log('========================================');
    console.log('性能测试结果汇总');
    console.log('========================================\n');

    const passed = this.results.filter((r) => r.passed).length;
    const total = this.results.length;

    console.log('测试项目详情:\n');

    this.results.forEach((result, index) => {
      const status = result.passed ? '✅ 通过' : '❌ 未通过';
      const notes = result.notes ? ` (${result.notes})` : '';

      console.log(
        `${index + 1}. ${result.name}${notes}\n` +
          `   ${status} | 实际: ${result.duration}ms | 阈值: ${result.threshold}ms`
      );
    });

    console.log(`\n总计: ${passed}/${total} 通过 (${Math.round((passed / total) * 100)}%)\n`);

    if (passed === total) {
      console.log('🎉 所有性能测试通过！系统性能达到 SLA 指标。\n');
    } else {
      console.log('⚠️  部分性能测试未通过，建议进一步优化。\n');
    }

    console.log('========================================');
  }
}

// 运行测试
const test = new PerformanceTest();
test.runAll();
