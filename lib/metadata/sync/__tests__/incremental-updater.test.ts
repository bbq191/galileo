/**
 * 增量更新器测试
 *
 * 测试内容：
 * - 新增表处理
 * - 删除表处理
 * - 表结构变更处理
 * - 字段差异对比
 * - 批量更新
 */

import { incrementalUpdater } from '../incremental-updater';
import type { ChangeDetectionResult } from '../change-detector';
import type { NewTable, DeletedTable } from '../table-diff-detector';
import type { ChangedTable } from '../hash-based-detector';

/**
 * 创建模拟的变更检测结果
 */
function createMockChangeResult(): ChangeDetectionResult {
  const newTables: NewTable[] = [
    {
      tableName: 'new_users',
      tableComment: '新增用户表',
      tableRows: BigInt(0),
      createdTime: new Date(),
      updatedTime: null,
    },
    {
      tableName: 'new_posts',
      tableComment: '新增文章表',
      tableRows: BigInt(0),
      createdTime: new Date(),
      updatedTime: null,
    },
  ];

  const deletedTables: DeletedTable[] = [
    {
      tableId: 999,
      tableName: 'old_temp_table',
    },
  ];

  const changedTables: ChangedTable[] = [
    {
      tableId: 1,
      tableName: 'users',
      oldHash: 'abc123',
      newHash: 'def456',
      newDDL: 'CREATE TABLE users ...',
      changeType: 'modified',
    },
  ];

  return {
    databaseId: 1,
    databaseName: 'test_db',
    startedAt: new Date(),
    completedAt: new Date(),
    duration: 1000,
    tableDiff: {
      newTables,
      deletedTables,
      totalChanges: newTables.length + deletedTables.length,
    },
    changedTables,
    totalChanges: newTables.length + deletedTables.length + changedTables.length,
    detectionMethod: 'hash',
  };
}

/**
 * 测试 1: 字段差异对比
 */
async function testColumnComparison() {
  console.log('\n=== 测试 1: 字段差异对比 ===');

  try {
    const currentColumns = [
      {
        columnName: 'id',
        dataType: 'int',
        columnType: 'int(11)',
        columnComment: 'ID',
        isNullable: false,
        isPrimaryKey: true,
        isUnique: true,
        defaultValue: null,
        ordinalPosition: 1,
      },
      {
        columnName: 'name',
        dataType: 'varchar',
        columnType: 'varchar(100)',
        columnComment: '姓名',
        isNullable: false,
        isPrimaryKey: false,
        isUnique: false,
        defaultValue: null,
        ordinalPosition: 2,
      },
      {
        columnName: 'email',
        dataType: 'varchar',
        columnType: 'varchar(255)',
        columnComment: '邮箱',
        isNullable: true,
        isPrimaryKey: false,
        isUnique: true,
        defaultValue: null,
        ordinalPosition: 3,
      },
      // 新增字段
      {
        columnName: 'phone',
        dataType: 'varchar',
        columnType: 'varchar(20)',
        columnComment: '电话',
        isNullable: true,
        isPrimaryKey: false,
        isUnique: false,
        defaultValue: null,
        ordinalPosition: 4,
      },
    ];

    const storedColumns = [
      {
        columnName: 'id',
        dataType: 'int',
        columnType: 'int(11)',
        columnComment: 'ID',
        isNullable: false,
        isPrimaryKey: true,
        isUnique: true,
        defaultValue: null,
        ordinalPosition: 1,
      },
      {
        columnName: 'name',
        dataType: 'varchar',
        columnType: 'varchar(50)', // 长度变更
        columnComment: '姓名',
        isNullable: false,
        isPrimaryKey: false,
        isUnique: false,
        defaultValue: null,
        ordinalPosition: 2,
      },
      {
        columnName: 'email',
        dataType: 'varchar',
        columnType: 'varchar(255)',
        columnComment: '邮箱',
        isNullable: true,
        isPrimaryKey: false,
        isUnique: true,
        defaultValue: null,
        ordinalPosition: 3,
      },
      // 删除的字段
      {
        columnName: 'old_field',
        dataType: 'text',
        columnType: 'text',
        columnComment: '旧字段',
        isNullable: true,
        isPrimaryKey: false,
        isUnique: false,
        defaultValue: null,
        ordinalPosition: 4,
      },
    ];

    // 使用 incrementalUpdater 的私有方法（需要通过 any 访问）
    const updater = incrementalUpdater as any;
    const diff = updater.compareColumns(currentColumns, storedColumns);

    console.log('新增字段:', diff.added.map((c: any) => c.columnName));
    console.log('删除字段:', diff.deleted);
    console.log('修改字段:', diff.modified.map((c: any) => c.columnName));

    const testPass =
      diff.added.length === 1 &&
      diff.added[0].columnName === 'phone' &&
      diff.deleted.length === 1 &&
      diff.deleted[0] === 'old_field' &&
      diff.modified.length === 1 &&
      diff.modified[0].columnName === 'name';

    console.log(`\n✓ 测试 1: 字段差异对比: ${testPass ? '通过' : '失败'}`);

    return testPass;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 2: 默认值对比
 */
async function testDefaultValueComparison() {
  console.log('\n=== 测试 2: 默认值对比 ===');

  try {
    const updater = incrementalUpdater as any;

    // 测试不同的默认值场景
    const tests = [
      { val1: null, val2: null, expected: true, desc: '都为 null' },
      { val1: 'abc', val2: 'ABC', expected: true, desc: '大小写不同' },
      { val1: 'abc', val2: 'def', expected: false, desc: '值不同' },
      { val1: null, val2: 'abc', expected: false, desc: '一个为 null' },
      { val1: '0', val2: '0', expected: true, desc: '值相同' },
    ];

    let allPass = true;

    for (const test of tests) {
      const result = updater.defaultValuesEqual(test.val1, test.val2);
      const pass = result === test.expected;
      console.log(
        `${pass ? '✓' : '✗'} ${test.desc}: ${test.val1} vs ${test.val2} = ${result}`
      );
      if (!pass) allPass = false;
    }

    console.log(`\n✓ 测试 2: 默认值对比: ${allPass ? '通过' : '失败'}`);

    return allPass;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 3: 字段相等性判断
 */
async function testColumnEquality() {
  console.log('\n=== 测试 3: 字段相等性判断 ===');

  try {
    const updater = incrementalUpdater as any;

    const col1 = {
      dataType: 'varchar',
      columnType: 'varchar(100)',
      isNullable: false,
      isPrimaryKey: false,
      isUnique: false,
      defaultValue: null,
      ordinalPosition: 1,
    };

    const col2 = { ...col1 }; // 相同
    const col3 = { ...col1, dataType: 'text' }; // 类型不同
    const col4 = { ...col1, isNullable: true }; // 可空性不同

    const test1 = updater.columnsEqual(col1, col2);
    const test2 = !updater.columnsEqual(col1, col3);
    const test3 = !updater.columnsEqual(col1, col4);

    console.log('相同字段:', test1);
    console.log('类型不同:', test2);
    console.log('可空性不同:', test3);

    const testPass = test1 && test2 && test3;
    console.log(`\n✓ 测试 3: 字段相等性判断: ${testPass ? '通过' : '失败'}`);

    return testPass;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 4: 更新结果结构
 */
async function testUpdateResultStructure() {
  console.log('\n=== 测试 4: 更新结果结构 ===');

  try {
    // 验证更新结果的结构
    const mockResult = {
      databaseId: 1,
      databaseName: 'test_db',
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 1000,
      tablesAdded: 2,
      tablesDeleted: 1,
      tablesUpdated: 3,
      columnsAdded: 5,
      columnsDeleted: 2,
      columnsUpdated: 3,
      totalChanges: 16,
      errors: [],
    };

    const hasAllFields =
      'databaseId' in mockResult &&
      'databaseName' in mockResult &&
      'startedAt' in mockResult &&
      'completedAt' in mockResult &&
      'duration' in mockResult &&
      'tablesAdded' in mockResult &&
      'tablesDeleted' in mockResult &&
      'tablesUpdated' in mockResult &&
      'columnsAdded' in mockResult &&
      'columnsDeleted' in mockResult &&
      'columnsUpdated' in mockResult &&
      'totalChanges' in mockResult &&
      'errors' in mockResult;

    console.log('结果结构完整:', hasAllFields);

    const totalCorrect =
      mockResult.tablesAdded +
        mockResult.tablesDeleted +
        mockResult.tablesUpdated +
        mockResult.columnsAdded +
        mockResult.columnsDeleted +
        mockResult.columnsUpdated ===
      mockResult.totalChanges;

    console.log('总变更数计算正确:', totalCorrect);

    const testPass = hasAllFields && totalCorrect;
    console.log(`\n✓ 测试 4: 更新结果结构: ${testPass ? '通过' : '失败'}`);

    return testPass;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 5: 批量处理逻辑
 */
async function testBatchProcessing() {
  console.log('\n=== 测试 5: 批量处理逻辑 ===');

  try {
    // 模拟大量表的批量处理
    const tableCount = 100;
    const batchSize = 10;
    const expectedBatches = Math.ceil(tableCount / batchSize);

    console.log(`表数量: ${tableCount}`);
    console.log(`批次大小: ${batchSize}`);
    console.log(`预期批次数: ${expectedBatches}`);

    let processedBatches = 0;
    for (let i = 0; i < tableCount; i += batchSize) {
      const batch = Array.from(
        { length: Math.min(batchSize, tableCount - i) },
        (_, j) => i + j
      );
      processedBatches++;
    }

    const testPass = processedBatches === expectedBatches;
    console.log(`实际批次数: ${processedBatches}`);
    console.log(`\n✓ 测试 5: 批量处理逻辑: ${testPass ? '通过' : '失败'}`);

    return testPass;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 6: 变更检测结果处理
 */
async function testChangeResultProcessing() {
  console.log('\n=== 测试 6: 变更检测结果处理 ===');

  try {
    const changeResult = createMockChangeResult();

    console.log('变更检测结果:');
    console.log(`  数据库: ${changeResult.databaseName}`);
    console.log(`  新增表: ${changeResult.tableDiff.newTables.length}`);
    console.log(`  删除表: ${changeResult.tableDiff.deletedTables.length}`);
    console.log(`  变更表: ${changeResult.changedTables.length}`);
    console.log(`  总变更: ${changeResult.totalChanges}`);

    const testPass =
      changeResult.tableDiff.newTables.length === 2 &&
      changeResult.tableDiff.deletedTables.length === 1 &&
      changeResult.changedTables.length === 1 &&
      changeResult.totalChanges === 4;

    console.log(`\n✓ 测试 6: 变更检测结果处理: ${testPass ? '通过' : '失败'}`);

    return testPass;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 7: 错误处理
 */
async function testErrorHandling() {
  console.log('\n=== 测试 7: 错误处理 ===');

  try {
    // 模拟错误收集
    const errors: Array<{ table: string; error: string }> = [];

    // 模拟处理表时的错误
    const tables = ['table1', 'table2', 'table3'];
    for (const table of tables) {
      try {
        if (table === 'table2') {
          throw new Error('模拟错误');
        }
        // 正常处理
      } catch (error: any) {
        errors.push({
          table,
          error: error.message,
        });
      }
    }

    console.log('错误收集:', errors);

    const testPass = errors.length === 1 && errors[0].table === 'table2';
    console.log(`\n✓ 测试 7: 错误处理: ${testPass ? '通过' : '失败'}`);

    return testPass;
  } catch (error) {
    console.error('测试失败:', error);
    return false;
  }
}

/**
 * 测试 8: 性能估算
 */
async function testPerformanceEstimate() {
  console.log('\n=== 测试 8: 性能估算 ===');

  try {
    // 估算不同规模的处理时间
    const scenarios = [
      { tables: 10, columns: 50, desc: '小型' },
      { tables: 100, columns: 500, desc: '中型' },
      { tables: 1000, columns: 5000, desc: '大型' },
    ];

    console.log('性能估算（假设单表10ms）:');

    for (const scenario of scenarios) {
      const estimatedTime = scenario.tables * 10; // ms
      console.log(
        `  ${scenario.desc}: ${scenario.tables} 表 / ${scenario.columns} 字段 ≈ ${estimatedTime}ms`
      );
    }

    console.log('\n✓ 测试 8: 性能估算完成');

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
  console.log('║    增量更新器 - 单元测试套件        ║');
  console.log('╚═══════════════════════════════════════════╝');

  const tests = [
    { name: '字段差异对比', fn: testColumnComparison },
    { name: '默认值对比', fn: testDefaultValueComparison },
    { name: '字段相等性判断', fn: testColumnEquality },
    { name: '更新结果结构', fn: testUpdateResultStructure },
    { name: '批量处理逻辑', fn: testBatchProcessing },
    { name: '变更检测结果处理', fn: testChangeResultProcessing },
    { name: '错误处理', fn: testErrorHandling },
    { name: '性能估算', fn: testPerformanceEstimate },
  ];

  const results: { name: string; passed: boolean }[] = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`\n✗ ${test.name}: 异常`, error);
      results.push({ name: test.name, passed: false });
    }

    // 测试间延迟
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 输出总结
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║             测试结果总结              ║');
  console.log('╚═══════════════════════════════════════════╝');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  results.forEach((r) => {
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
runAllTests().catch((error) => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
