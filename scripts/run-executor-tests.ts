/**
 * 查询执行器测试运行脚本
 * 简单的测试验证，不依赖 Jest
 */

import {
  createTimeoutPromise,
  withTimeout,
  TimeoutController,
  AdaptiveTimeoutStrategy
} from '../lib/sql/executor/timeout-handler';
import { ResultFormatter } from '../lib/sql/executor/result-formatter';
import type { ExtendedFieldPacket } from '../lib/sql/executor/types';

console.log('========================================');
console.log('查询执行器模块测试');
console.log('========================================\n');

let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passedTests++;
    } catch (error: any) {
      console.error(`✗ ${name}`);
      console.error(`  错误: ${error.message}`);
      failedTests++;
    }
  };
}

// ==================== 超时处理器测试 ====================
(async () => {
console.log('【超时处理器测试】\n');

await test('withTimeout - 应该在超时前返回结果', async () => {
  const promise = new Promise<string>((resolve) => {
    setTimeout(() => resolve('成功'), 50);
  });

  const result = await withTimeout(promise, 200);
  if (result !== '成功') {
    throw new Error(`期望 "成功", 得到 "${result}"`);
  }
})();

await test('withTimeout - 应该在超时后抛出错误', async () => {
  const promise = new Promise<string>((resolve) => {
    setTimeout(() => resolve('成功'), 200);
  });

  try {
    await withTimeout(promise, 100);
    throw new Error('应该抛出超时错误');
  } catch (error: any) {
    if (!error.message.includes('超时')) {
      throw new Error(`期望超时错误，得到: ${error.message}`);
    }
  }
})();

await test('TimeoutController - 应该在超时时设置标志', async () => {
  let timedOut = false;
  const controller = new TimeoutController(100, () => {
    timedOut = true;
  });

  controller.start();

  await new Promise(resolve => setTimeout(resolve, 150));

  if (!controller.hasTimedOut() || !timedOut) {
    throw new Error('超时标志未设置');
  }
})();

await test('TimeoutController - 应该能够取消超时', () => {
  const controller = new TimeoutController(100);
  controller.start();
  controller.cancel();

  if (!controller.hasCancelled()) {
    throw new Error('取消标志未设置');
  }
})();

await test('AdaptiveTimeoutStrategy - 应该根据复杂度计算超时时间', () => {
  const strategy = new AdaptiveTimeoutStrategy(10000);

  const lowTimeout = strategy.calculateTimeout('low');
  const mediumTimeout = strategy.calculateTimeout('medium');
  const highTimeout = strategy.calculateTimeout('high');

  if (lowTimeout !== 10000 || mediumTimeout !== 20000 || highTimeout !== 30000) {
    throw new Error(`超时计算错误: ${lowTimeout}, ${mediumTimeout}, ${highTimeout}`);
  }
})();

await test('AdaptiveTimeoutStrategy - 应该根据表数量估算超时时间', () => {
  const strategy = new AdaptiveTimeoutStrategy(10000);

  const simpleTimeout = strategy.estimateTimeout(1, 100);
  const complexTimeout = strategy.estimateTimeout(4, 100);

  if (simpleTimeout !== 10000) {
    throw new Error(`简单查询超时错误: ${simpleTimeout}`);
  }

  if (complexTimeout <= simpleTimeout) {
    throw new Error(`复杂查询超时应该大于简单查询`);
  }
})();

// ==================== 结果格式化器测试 ====================
console.log('\n【结果格式化器测试】\n');

await test('ResultFormatter - 应该格式化列元数据', () => {
  const formatter = new ResultFormatter();

  const fields: ExtendedFieldPacket[] = [
    {
      name: 'id',
      type: 3, // LONG (INT)
      length: 11,
      table: 'users',
      db: 'test_db',
      flags: 1, // NOT NULL
    } as ExtendedFieldPacket,
  ];

  const metadata = formatter.formatColumnMetadata(fields);

  if (metadata.length !== 1) {
    throw new Error(`期望 1 列，得到 ${metadata.length}`);
  }

  if (metadata[0].name !== 'id' || metadata[0].type !== 'LONG') {
    throw new Error(`列元数据格式化错误`);
  }
})();

await test('ResultFormatter - 应该转换为 CSV 格式', () => {
  const formatter = new ResultFormatter();

  const data = [
    { id: 1, name: 'Alice', age: 30 },
    { id: 2, name: 'Bob', age: 25 },
  ];

  const columns = [
    { name: 'id', type: 'LONG' },
    { name: 'name', type: 'VAR_STRING' },
    { name: 'age', type: 'LONG' },
  ];

  const csv = formatter.toCSV(data, columns);

  if (!csv.includes('id,name,age')) {
    throw new Error('CSV 头部错误');
  }

  if (!csv.includes('1,Alice,30')) {
    throw new Error('CSV 数据行错误');
  }
})();

await test('ResultFormatter - 应该正确转义 CSV 特殊字符', () => {
  const formatter = new ResultFormatter();

  const data = [
    { id: 1, description: 'Hello, World!' },
  ];

  const columns = [
    { name: 'id', type: 'LONG' },
    { name: 'description', type: 'VAR_STRING' },
  ];

  const csv = formatter.toCSV(data, columns);

  if (!csv.includes('"Hello, World!"')) {
    throw new Error('CSV 转义错误');
  }
})();

await test('ResultFormatter - 应该转换为 JSON 字符串', () => {
  const formatter = new ResultFormatter();

  const data = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ];

  const json = formatter.toJSON(data);
  const parsed = JSON.parse(json);

  if (parsed.length !== 2 || parsed[0].name !== 'Alice') {
    throw new Error('JSON 转换错误');
  }
})();

await test('ResultFormatter - 应该格式化数据大小', () => {
  const formatter = new ResultFormatter();

  if (formatter.formatDataSize(100) !== '100.00 B') {
    throw new Error('字节格式化错误');
  }

  if (formatter.formatDataSize(1024) !== '1.00 KB') {
    throw new Error('KB 格式化错误');
  }

  if (formatter.formatDataSize(1024 * 1024) !== '1.00 MB') {
    throw new Error('MB 格式化错误');
  }
})();

// ==================== 测试总结 ====================
console.log('\n========================================');
console.log('测试总结');
console.log('========================================');
console.log(`通过: ${passedTests} 个`);
console.log(`失败: ${failedTests} 个`);
console.log(`总计: ${passedTests + failedTests} 个`);

if (failedTests > 0) {
  console.log('\n❌ 部分测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
  process.exit(0);
}
})();
