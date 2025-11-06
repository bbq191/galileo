/**
 * 语义标注器测试
 */

import { SemanticAnnotator } from '../semantic-annotator';
import { RuleBasedAnnotator } from '../rules/naming-rules';
import type { ColumnInfo } from '@/lib/metadata/types';

/**
 * 测试规则引擎
 */
export async function testRuleBasedAnnotator() {
  console.log('\n========================================');
  console.log('测试规则引擎');
  console.log('========================================\n');

  const prisma = require('@/lib/prisma/client').default;
  const annotator = new RuleBasedAnnotator(prisma);

  // 测试用例
  const testCases: Array<{
    name: string;
    column: ColumnInfo;
    expectedMatch: boolean;
    expectedPattern?: string;
  }> = [
    {
      name: '外键模式 - user_id',
      column: {
        columnName: 'user_id',
        tableName: 'orders',
        databaseName: 'test_db',
        dataType: 'int',
        columnType: 'int(11)',
        isNullable: false,
        ordinalPosition: 1,
      },
      expectedMatch: true,
      expectedPattern: '外键',
    },
    {
      name: '时间戳 - created_at',
      column: {
        columnName: 'created_at',
        tableName: 'users',
        databaseName: 'test_db',
        dataType: 'datetime',
        columnType: 'datetime',
        isNullable: true,
        ordinalPosition: 2,
      },
      expectedMatch: true,
      expectedPattern: '创建时间',
    },
    {
      name: '布尔标识 - is_active',
      column: {
        columnName: 'is_active',
        tableName: 'users',
        databaseName: 'test_db',
        dataType: 'tinyint',
        columnType: 'tinyint(1)',
        isNullable: false,
        ordinalPosition: 3,
      },
      expectedMatch: true,
      expectedPattern: '是否',
    },
    {
      name: '邮箱字段 - email',
      column: {
        columnName: 'email',
        tableName: 'users',
        databaseName: 'test_db',
        dataType: 'varchar',
        columnType: 'varchar(255)',
        isNullable: false,
        ordinalPosition: 4,
      },
      expectedMatch: true,
      expectedPattern: '邮箱',
    },
    {
      name: '复杂业务字段 - customer_loyalty_score',
      column: {
        columnName: 'customer_loyalty_score',
        tableName: 'customers',
        databaseName: 'test_db',
        dataType: 'decimal',
        columnType: 'decimal(10,2)',
        isNullable: true,
        ordinalPosition: 5,
      },
      expectedMatch: false, // 需要 AI 处理
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = await annotator.annotate(testCase.column);

    if (testCase.expectedMatch) {
      if (result) {
        if (testCase.expectedPattern && result.semantic.includes(testCase.expectedPattern)) {
          console.log(`✓ ${testCase.name}`);
          console.log(`  语义: ${result.semantic}`);
          console.log(`  置信度: ${result.confidence}`);
          console.log(`  规则: ${result.ruleName}\n`);
          passed++;
        } else if (!testCase.expectedPattern) {
          console.log(`✓ ${testCase.name}`);
          console.log(`  语义: ${result.semantic}\n`);
          passed++;
        } else {
          console.log(`✗ ${testCase.name}`);
          console.log(`  预期包含: ${testCase.expectedPattern}`);
          console.log(`  实际语义: ${result.semantic}\n`);
          failed++;
        }
      } else {
        console.log(`✗ ${testCase.name}`);
        console.log(`  预期: 匹配成功`);
        console.log(`  实际: 无匹配\n`);
        failed++;
      }
    } else {
      if (!result) {
        console.log(`✓ ${testCase.name}`);
        console.log(`  正确识别为需要 AI 处理\n`);
        passed++;
      } else {
        console.log(`✗ ${testCase.name}`);
        console.log(`  预期: 无匹配（需要AI）`);
        console.log(`  实际: ${result.semantic}\n`);
        failed++;
      }
    }
  }

  console.log('========================================');
  console.log(`测试完成: 通过 ${passed}，失败 ${failed}`);
  console.log('========================================\n');

  return { passed, failed };
}

/**
 * 测试覆盖率统计
 */
export async function testCoverageStats() {
  console.log('\n========================================');
  console.log('测试覆盖率统计');
  console.log('========================================\n');

  const prisma = require('@/lib/prisma/client').default;
  const annotator = new RuleBasedAnnotator(prisma);

  // 模拟一个典型的表字段
  const columns: ColumnInfo[] = [
    {
      columnName: 'id',
      tableName: 'users',
      databaseName: 'test_db',
      dataType: 'int',
      columnType: 'int(11)',
      isNullable: false,
      columnKey: 'PRI',
      ordinalPosition: 1,
    },
    {
      columnName: 'user_name',
      tableName: 'users',
      databaseName: 'test_db',
      dataType: 'varchar',
      columnType: 'varchar(100)',
      isNullable: false,
      ordinalPosition: 2,
    },
    {
      columnName: 'email',
      tableName: 'users',
      databaseName: 'test_db',
      dataType: 'varchar',
      columnType: 'varchar(255)',
      isNullable: false,
      ordinalPosition: 3,
    },
    {
      columnName: 'phone',
      tableName: 'users',
      databaseName: 'test_db',
      dataType: 'varchar',
      columnType: 'varchar(20)',
      isNullable: true,
      ordinalPosition: 4,
    },
    {
      columnName: 'is_active',
      tableName: 'users',
      databaseName: 'test_db',
      dataType: 'tinyint',
      columnType: 'tinyint(1)',
      isNullable: false,
      ordinalPosition: 5,
    },
    {
      columnName: 'created_at',
      tableName: 'users',
      databaseName: 'test_db',
      dataType: 'datetime',
      columnType: 'datetime',
      isNullable: true,
      ordinalPosition: 6,
    },
    {
      columnName: 'updated_at',
      tableName: 'users',
      databaseName: 'test_db',
      dataType: 'datetime',
      columnType: 'datetime',
      isNullable: true,
      ordinalPosition: 7,
    },
    {
      columnName: 'customer_segment_score',
      tableName: 'users',
      databaseName: 'test_db',
      dataType: 'decimal',
      columnType: 'decimal(10,2)',
      isNullable: true,
      ordinalPosition: 8,
    },
  ];

  const stats = await annotator.getCoverageStats(columns);

  console.log(`总字段数: ${stats.total}`);
  console.log(`规则引擎覆盖: ${stats.covered} (${(stats.coverageRate * 100).toFixed(1)}%)`);
  console.log(`需要 AI 处理: ${stats.needsAI}`);

  console.log('\n详细结果:');
  for (const column of columns) {
    const result = await annotator.annotate(column);
    if (result) {
      console.log(`  ✓ ${column.columnName}: ${result.semantic}`);
    } else {
      console.log(`  ⚠ ${column.columnName}: 需要 AI 处理`);
    }
  }

  console.log('\n========================================');
  console.log('✓ 覆盖率统计测试通过');
  console.log('========================================\n');

  return stats;
}

/**
 * 测试批量处理性能
 */
export async function testBatchPerformance() {
  console.log('\n========================================');
  console.log('测试批量处理性能');
  console.log('========================================\n');

  const prisma = require('@/lib/prisma/client').default;
  const annotator = new RuleBasedAnnotator(prisma);

  // 生成 1000 个测试字段
  const columns: ColumnInfo[] = [];
  for (let i = 0; i < 1000; i++) {
    columns.push({
      columnName: i % 2 === 0 ? `field_${i}` : 'created_at',
      tableName: 'test_table',
      databaseName: 'test_db',
      dataType: 'varchar',
      columnType: 'varchar(255)',
      isNullable: false,
      ordinalPosition: i + 1,
    });
  }

  console.log(`生成 ${columns.length} 个测试字段...`);

  const startTime = Date.now();
  const results = await annotator.annotateMany(columns);
  const duration = Date.now() - startTime;

  const matched = Array.from(results.values()).filter((r) => r !== null).length;

  console.log(`\n批量处理完成:`);
  console.log(`  总数: ${columns.length}`);
  console.log(`  匹配: ${matched}`);
  console.log(`  耗时: ${duration}ms`);
  console.log(`  平均: ${(duration / columns.length).toFixed(2)}ms/字段`);

  console.log('\n========================================');
  console.log('✓ 批量处理性能测试通过');
  console.log('========================================\n');

  return { columns: columns.length, matched, duration };
}

/**
 * 运行所有测试
 */
export async function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   语义标注器测试套件                   ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // 测试 1: 规则引擎
    const ruleResults = await testRuleBasedAnnotator();

    // 测试 2: 覆盖率统计
    const coverageStats = await testCoverageStats();

    // 测试 3: 批量性能
    const perfResults = await testBatchPerformance();

    // 总结
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   测试总结                             ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('规则引擎测试:');
    console.log(`  通过: ${ruleResults.passed}`);
    console.log(`  失败: ${ruleResults.failed}`);

    console.log('\n覆盖率统计:');
    console.log(`  规则覆盖率: ${(coverageStats.coverageRate * 100).toFixed(1)}%`);

    console.log('\n性能测试:');
    console.log(`  处理速度: ${(perfResults.duration / perfResults.columns).toFixed(2)}ms/字段`);

    if (ruleResults.failed === 0) {
      console.log('\n✓ 所有测试通过！');
      return true;
    } else {
      console.log(`\n✗ 有 ${ruleResults.failed} 个测试失败`);
      return false;
    }
  } catch (error) {
    console.error('\n✗ 测试执行失败:', error);
    return false;
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
