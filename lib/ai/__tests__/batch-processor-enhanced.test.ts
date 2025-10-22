/**
 * 增强批量处理器测试
 *
 * 测试批量处理、错误处理和断点续传功能
 */

import { batchProcessor, BatchRequest } from '../batch-processor';
import { taskQueueManager, TaskType, TaskPriority, TaskStatus } from '../task-queue';
import { errorLogger, ErrorLevel, ErrorCategory } from '../error-logger';
import { resumeManager } from '../resume-manager';

/**
 * 测试助手：创建模拟请求
 */
function createMockRequests(count: number): BatchRequest<{ value: number }>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `request_${i}`,
    data: { value: i },
    messages: [
      {
        role: 'user' as const,
        content: `Process item ${i}`,
      },
    ],
    temperature: 0.7,
    maxTokens: 100,
  }));
}

/**
 * 测试 1: 基础批量处理
 */
async function testBasicBatchProcessing() {
  console.log('\n=== 测试 1: 基础批量处理 ===');

  try {
    const requests = createMockRequests(10);

    const results = await batchProcessor.process(requests, {
      batchSize: 5,
      maxConcurrency: 2,
      maxRetries: 2,
      onProgress: (progress) => {
        console.log(
          `进度: ${progress.completed}/${progress.total} ` +
          `(成功: ${progress.succeeded}, 失败: ${progress.failed})`
        );
      },
      onError: (error, request) => {
        console.error(`请求 ${request.id} 失败:`, error.message);
      },
    });

    console.log(`\n结果: 总计 ${results.length} 个`);
    console.log(`成功: ${results.filter(r => r.success).length}`);
    console.log(`失败: ${results.filter(r => !r.success).length}`);

    return results.length === 10;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 2: 任务持久化
 */
async function testTaskPersistence() {
  console.log('\n=== 测试 2: 任务持久化 ===');

  try {
    const requests = createMockRequests(5);

    // 创建持久化任务
    const results = await batchProcessor.process(requests, {
      batchSize: 5,
      maxConcurrency: 2,
      persistTask: true,
      taskType: TaskType.SEMANTIC_ANNOTATION,
      taskPriority: TaskPriority.NORMAL,
    });

    console.log('任务已持久化到数据库');

    // 检查任务统计
    const stats = await taskQueueManager.getStatistics();
    console.log('\n任务统计:');
    console.log(`  总任务数: ${stats.total}`);
    console.log(`  已完成: ${stats.completed}`);
    console.log(`  处理中: ${stats.processing}`);
    console.log(`  等待中: ${stats.pending}`);
    console.log(`  失败: ${stats.failed}`);

    return stats.total > 0;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 3: 断点续传
 */
async function testResumeCapability() {
  console.log('\n=== 测试 3: 断点续传 ===');

  try {
    const taskIdentifier = 'test_resume_task';
    const requests = createMockRequests(20);

    console.log('第一次处理（模拟中断）...');

    // 第一次处理部分数据（模拟中断）
    const firstBatch = requests.slice(0, 10);
    await batchProcessor.process(firstBatch, {
      batchSize: 5,
      maxConcurrency: 2,
      enableResume: true,
      taskIdentifier,
      taskType: TaskType.SEMANTIC_ANNOTATION,
    });

    console.log('\n恢复处理剩余数据...');

    // 恢复处理（应该跳过前10个）
    const results = await batchProcessor.process(requests, {
      batchSize: 5,
      maxConcurrency: 2,
      enableResume: true,
      taskIdentifier,
      taskType: TaskType.SEMANTIC_ANNOTATION,
    });

    console.log(`\n恢复处理完成: 处理了 ${results.length} 个请求`);

    // 获取进度信息
    const progress = await resumeManager.resumeProgress(
      TaskType.SEMANTIC_ANNOTATION,
      taskIdentifier
    );

    if (progress) {
      console.log(`\n进度详情:`);
      console.log(`  总项数: ${progress.totalItems}`);
      console.log(`  已处理: ${progress.processedItems}`);
      console.log(`  成功: ${progress.completedItemIds.length}`);
      console.log(`  失败: ${progress.failedItemIds.length}`);
      console.log(`  状态: ${progress.status}`);

      return progress.status === 'completed';
    }

    return false;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 4: 错误日志记录
 */
async function testErrorLogging() {
  console.log('\n=== 测试 4: 错误日志记录 ===');

  try {
    // 记录各种级别的日志
    await errorLogger.info('测试信息日志', { test: true });
    await errorLogger.warning('测试警告', ErrorCategory.TIMEOUT, { retry: 1 });
    await errorLogger.error('测试错误', ErrorCategory.API, new Error('模拟错误'));

    // 记录性能指标
    await errorLogger.recordPerformance({
      operation: 'test_operation',
      duration: 1500,
      success: true,
      timestamp: new Date(),
      metadata: { items: 100 },
    });

    console.log('错误日志已记录');

    // 获取统计信息
    const stats = await errorLogger.getErrorStatistics(24);
    console.log('\n错误统计（过去24小时）:');
    console.log(`  总错误数: ${stats.total}`);
    console.log(`  按级别:`);
    console.log(`    INFO: ${stats.byLevel.info}`);
    console.log(`    WARNING: ${stats.byLevel.warning}`);
    console.log(`    ERROR: ${stats.byLevel.error}`);
    console.log(`    CRITICAL: ${stats.byLevel.critical}`);

    // 获取性能统计
    const perfStats = await errorLogger.getPerformanceStatistics(24);
    console.log('\n性能统计:');
    perfStats.operations.forEach(op => {
      console.log(`  ${op.name}:`);
      console.log(`    调用次数: ${op.count}`);
      console.log(`    平均耗时: ${op.avgDuration.toFixed(2)}ms`);
      console.log(`    成功率: ${op.successRate.toFixed(2)}%`);
    });

    return stats.total > 0;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 5: 并发处理与速率限制
 */
async function testConcurrencyAndRateLimiting() {
  console.log('\n=== 测试 5: 并发处理与速率限制 ===');

  try {
    const requests = createMockRequests(30);
    const startTime = Date.now();

    const results = await batchProcessor.process(requests, {
      batchSize: 10,
      maxConcurrency: 3,
      delayBetweenBatches: 1000, // 批次间延迟1秒
      maxRetries: 2,
    });

    const duration = Date.now() - startTime;

    console.log(`\n处理完成:`);
    console.log(`  总耗时: ${(duration / 1000).toFixed(2)}秒`);
    console.log(`  总请求: ${requests.length}`);
    console.log(`  成功: ${results.filter(r => r.success).length}`);
    console.log(`  失败: ${results.filter(r => !r.success).length}`);
    console.log(`  平均耗时: ${(duration / requests.length).toFixed(2)}ms/请求`);

    // 验证批次间有延迟
    const expectedMinDuration = 2000; // 至少2秒（2个批次间隔）
    return duration >= expectedMinDuration;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 6: 任务恢复
 */
async function testTaskRecovery() {
  console.log('\n=== 测试 6: 任务恢复 ===');

  try {
    // 创建一些测试任务
    const task1 = await taskQueueManager.createTask({
      type: TaskType.SEMANTIC_ANNOTATION,
      name: '测试任务1',
      data: { test: 1 },
      priority: TaskPriority.HIGH,
    });

    const task2 = await taskQueueManager.createTask({
      type: TaskType.RELATIONSHIP_INFERENCE,
      name: '测试任务2',
      data: { test: 2 },
      priority: TaskPriority.NORMAL,
    });

    console.log('已创建测试任务');

    // 模拟任务被标记为处理中
    await taskQueueManager.updateTaskStatus(task1.id, TaskStatus.PROCESSING);
    await taskQueueManager.updateTaskStatus(task2.id, TaskStatus.PROCESSING);

    console.log('任务已标记为处理中');

    // 恢复中断的任务
    const recoveredCount = await taskQueueManager.recoverInterruptedTasks();
    console.log(`\n已恢复 ${recoveredCount} 个中断任务`);

    // 验证任务状态已重置
    const task1Updated = await taskQueueManager.getTask(task1.id);
    const task2Updated = await taskQueueManager.getTask(task2.id);

    console.log(`\n任务状态:`);
    console.log(`  任务1: ${task1Updated?.status}`);
    console.log(`  任务2: ${task2Updated?.status}`);

    return (
      task1Updated?.status === TaskStatus.PENDING &&
      task2Updated?.status === TaskStatus.PENDING
    );
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 7: 清理功能
 */
async function testCleanupFunctions() {
  console.log('\n=== 测试 7: 清理功能 ===');

  try {
    // 清理旧任务
    const cleanedTasks = await taskQueueManager.cleanupCompletedTasks(0);
    console.log(`已清理 ${cleanedTasks} 个已完成任务`);

    // 清理旧日志
    const cleanedLogs = await errorLogger.cleanupOldLogs(0);
    console.log(`已清理 ${cleanedLogs.errorLogs} 条错误日志`);
    console.log(`已清理 ${cleanedLogs.performanceMetrics} 条性能指标`);

    // 清理旧进度
    const cleanedProgress = await resumeManager.cleanupOldProgress(0);
    console.log(`已清理 ${cleanedProgress} 条进度记录`);

    return true;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  批量处理与错误处理 - 集成测试套件  ║');
  console.log('╚═══════════════════════════════════════════╝');

  const tests = [
    { name: '基础批量处理', fn: testBasicBatchProcessing },
    { name: '任务持久化', fn: testTaskPersistence },
    { name: '断点续传', fn: testResumeCapability },
    { name: '错误日志记录', fn: testErrorLogging },
    { name: '并发处理与速率限制', fn: testConcurrencyAndRateLimiting },
    { name: '任务恢复', fn: testTaskRecovery },
    { name: '清理功能', fn: testCleanupFunctions },
  ];

  const results: { name: string; passed: boolean }[] = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
      console.log(`\n${passed ? '✓' : '✗'} ${test.name}: ${passed ? '通过' : '失败'}`);
    } catch (error) {
      console.error(`\n✗ ${test.name}: 异常`, error);
      results.push({ name: test.name, passed: false });
    }

    // 测试间延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 输出总结
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║             测试结果总结              ║');
  console.log('╚═══════════════════════════════════════════╝');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(r => {
    console.log(`${r.passed ? '✓' : '✗'} ${r.name}`);
  });

  console.log(`\n总计: ${passed}/${total} 通过`);
  console.log(`成功率: ${((passed / total) * 100).toFixed(1)}%`);

  if (passed === total) {
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n❌ 部分测试失败');
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
