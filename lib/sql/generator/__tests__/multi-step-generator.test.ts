/**
 * 多步查询生成器测试
 * 仅测试不依赖 AI 的核心逻辑方法
 */

import { MultiStepSQLGenerator } from '../multi-step-generator';
import { MetadataContext } from '@/lib/metadata/retrieval/types';
import { StepGenerationResult } from '../types';

// 测试计数器
let passedTests = 0;
let failedTests = 0;

// 辅助函数：断言
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failedTests++;
    throw new Error(message);
  } else {
    console.log(`✓ PASSED: ${message}`);
    passedTests++;
  }
}

function assertEquals(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    failedTests++;
    throw new Error(message);
  } else {
    console.log(`✓ PASSED: ${message}`);
    passedTests++;
  }
}

function assertContains(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    console.error(`❌ FAILED: ${message}`);
    console.error(`  Expected to contain: ${needle}`);
    console.error(`  Actual: ${haystack}`);
    failedTests++;
    throw new Error(message);
  } else {
    console.log(`✓ PASSED: ${message}`);
    passedTests++;
  }
}

/**
 * 创建测试用的生成器实例（绕过 DeepseekClient）
 */
function createTestGenerator(): any {
  const generator: any = Object.create(MultiStepSQLGenerator.prototype);
  // 不调用构造函数，直接设置为 null 以避免初始化 DeepseekClient
  generator.aiClient = null;
  generator.simpleGenerator = null;
  return generator;
}

/**
 * 测试1: countCrossDbJoins 应该正确统计跨库 JOIN 数量
 */
async function test1_countCrossDbJoins() {
  console.log('\n=== 测试1: countCrossDbJoins ===');

  const generator = createTestGenerator();

  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'db1',
        tableName: 'table1',
        columns: [],
        primaryKeys: [],
        indexes: []
      },
      {
        id: 2,
        databaseName: 'db2',
        tableName: 'table2',
        columns: [],
        primaryKeys: [],
        indexes: []
      },
      {
        id: 3,
        databaseName: 'db1',
        tableName: 'table3',
        columns: [],
        primaryKeys: [],
        indexes: []
      }
    ],
    relationships: [
      {
        sourceTable: 'table1',
        sourceColumn: 'id',
        targetTable: 'table2',
        targetColumn: 'id',
        type: 'explicit'
      },  // 跨库
      {
        sourceTable: 'table1',
        sourceColumn: 'id',
        targetTable: 'table3',
        targetColumn: 'id',
        type: 'explicit'
      }   // 同库
    ],
    estimatedComplexity: 'medium'
  };

  const count = generator.countCrossDbJoins(context);
  assertEquals(count, 1, '应该统计出1个跨库关系');
}

/**
 * 测试2: countCrossDbJoins 应该处理没有关系的情况
 */
async function test2_countCrossDbJoinsNoRelationships() {
  console.log('\n=== 测试2: countCrossDbJoins (无关系) ===');

  const generator = createTestGenerator();

  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'db1',
        tableName: 'table1',
        columns: [],
        primaryKeys: [],
        indexes: []
      }
    ],
    relationships: [],
    estimatedComplexity: 'low'
  };

  const count = generator.countCrossDbJoins(context);
  assertEquals(count, 0, '无关系时应该返回0');
}

/**
 * 测试3: countCrossDbJoins 应该处理全部跨库的情况
 */
async function test3_countCrossDbJoinsAllCrossDb() {
  console.log('\n=== 测试3: countCrossDbJoins (全跨库) ===');

  const generator = createTestGenerator();

  const context: MetadataContext = {
    tables: [
      { id: 1, databaseName: 'db1', tableName: 'table1', columns: [], primaryKeys: [], indexes: [] },
      { id: 2, databaseName: 'db2', tableName: 'table2', columns: [], primaryKeys: [], indexes: [] },
      { id: 3, databaseName: 'db3', tableName: 'table3', columns: [], primaryKeys: [], indexes: [] }
    ],
    relationships: [
      {
        sourceTable: 'table1',
        sourceColumn: 'id',
        targetTable: 'table2',
        targetColumn: 'id',
        type: 'explicit'
      },
      {
        sourceTable: 'table2',
        sourceColumn: 'id',
        targetTable: 'table3',
        targetColumn: 'id',
        type: 'explicit'
      }
    ],
    estimatedComplexity: 'high'
  };

  const count = generator.countCrossDbJoins(context);
  assertEquals(count, 2, '应该统计出2个跨库关系');
}

/**
 * 测试4: combineSteps 应该正确合并多个步骤为 CTE
 */
async function test4_combineStepsMultiple() {
  console.log('\n=== 测试4: combineSteps (多步) ===');

  const generator = createTestGenerator();

  const steps: StepGenerationResult[] = [
    {
      step: {
        stepName: '步骤1',
        description: '第一步',
        tables: ['table1'],
        outputColumns: ['col1']
      },
      sql: 'SELECT col1 FROM table1',
      confidence: 0.9,
      usedTables: ['table1'],
      usedColumns: ['col1']
    },
    {
      step: {
        stepName: '步骤2',
        description: '第二步',
        tables: ['table2'],
        outputColumns: ['col2']
      },
      sql: 'SELECT col2 FROM step1 JOIN table2',
      confidence: 0.85,
      usedTables: ['table2'],
      usedColumns: ['col2']
    }
  ];

  const result = generator.combineSteps(steps);

  assertContains(result.sql, 'WITH', '应该包含 WITH 关键字');
  assertContains(result.sql, 'step1 AS', '应该包含 step1 CTE');
  assertContains(result.sql, 'step2 AS', '应该包含 step2 CTE');
  assertContains(result.sql, 'SELECT * FROM step2', '应该从最后一步选择');
  assertEquals(result.confidence, 0.85, '置信度应该是最小值');
  assert(
    result.warnings && result.warnings.some(w => w.includes('2 步')),
    '警告应该包含步骤数量'
  );
}

/**
 * 测试5: combineSteps 应该处理单个步骤
 */
async function test5_combineStepsSingle() {
  console.log('\n=== 测试5: combineSteps (单步) ===');

  const generator = createTestGenerator();

  const steps: StepGenerationResult[] = [
    {
      step: {
        stepName: '单步查询',
        description: '简单查询',
        tables: ['table1'],
        outputColumns: ['col1']
      },
      sql: 'SELECT col1 FROM table1',
      confidence: 0.95,
      usedTables: ['table1'],
      usedColumns: ['col1']
    }
  ];

  const result = generator.combineSteps(steps);

  assert(!result.sql.includes('WITH'), '单步查询不应该包含 WITH');
  assertEquals(result.sql, 'SELECT col1 FROM table1', 'SQL 应该直接返回');
  assertEquals(result.confidence, 0.95, '置信度应该保持不变');
}

/**
 * 测试6: combineSteps 应该抛出错误当步骤为空
 */
async function test6_combineStepsEmpty() {
  console.log('\n=== 测试6: combineSteps (空步骤) ===');

  const generator = createTestGenerator();

  try {
    generator.combineSteps([]);
    console.error('❌ FAILED: 应该抛出错误');
    failedTests++;
  } catch (error) {
    assert(
      (error as Error).message.includes('没有步骤可以合并'),
      '错误消息应该正确'
    );
  }
}

/**
 * 测试7: combineSteps 应该移除末尾分号
 */
async function test7_combineStepsRemoveSemicolon() {
  console.log('\n=== 测试7: combineSteps (移除分号) ===');

  const generator = createTestGenerator();

  const steps: StepGenerationResult[] = [
    {
      step: {
        stepName: '步骤1',
        description: '第一步',
        tables: ['table1'],
        outputColumns: ['col1']
      },
      sql: 'SELECT col1 FROM table1;',  // 带分号
      confidence: 0.9,
      usedTables: ['table1'],
      usedColumns: ['col1']
    },
    {
      step: {
        stepName: '步骤2',
        description: '第二步',
        tables: ['table2'],
        outputColumns: ['col2']
      },
      sql: 'SELECT col2 FROM step1;',  // 带分号
      confidence: 0.85,
      usedTables: ['table2'],
      usedColumns: ['col2']
    }
  ];

  const result = generator.combineSteps(steps);

  // CTE 内部不应该有分号
  assertContains(result.sql, 'step1 AS (\n  SELECT col1 FROM table1\n)', '步骤1的分号应该被移除');
  assertContains(result.sql, 'step2 AS (\n  SELECT col2 FROM step1\n)', '步骤2的分号应该被移除');
}

/**
 * 测试8: mapStepTypeToIntentType 应该正确映射
 */
async function test8_mapStepTypeToIntentType() {
  console.log('\n=== 测试8: mapStepTypeToIntentType ===');

  const generator = createTestGenerator();

  const testCases = [
    { stepType: 'aggregate', expected: 'aggregate' },
    { stepType: 'filter', expected: 'select' },
    { stepType: 'join', expected: 'select' },
    { stepType: 'sort', expected: 'select' },
    { stepType: 'limit', expected: 'select' },
    { stepType: undefined, expected: 'select' }
  ];

  testCases.forEach(({ stepType, expected }) => {
    const result = generator.mapStepTypeToIntentType(stepType);
    assertEquals(result, expected, `${stepType} 应该映射到 ${expected}`);
  });
}

/**
 * 测试9: buildStepPrompt 应该生成有效的 Prompt
 */
async function test9_buildStepPrompt() {
  console.log('\n=== 测试9: buildStepPrompt ===');

  const generator = createTestGenerator();

  const step = {
    stepName: '测试步骤',
    description: '这是一个测试步骤',
    tables: ['db1.table1'],
    outputColumns: ['col1', 'col2'],
    stepType: 'filter' as const
  };

  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'db1',
        tableName: 'table1',
        columns: [
          { id: 1, columnName: 'col1', dataType: 'INT', isPrimaryKey: true, isNullable: false },
          { id: 2, columnName: 'col2', dataType: 'VARCHAR', isPrimaryKey: false, isNullable: false }
        ],
        primaryKeys: ['col1'],
        indexes: []
      }
    ],
    relationships: [],
    estimatedComplexity: 'low'
  };

  const previousSteps: StepGenerationResult[] = [];

  const prompt = generator.buildStepPrompt(step, context, previousSteps);

  assertContains(prompt, '测试步骤', 'Prompt 应该包含步骤名称');
  assertContains(prompt, 'col1', 'Prompt 应该包含输出列');
  assertContains(prompt, 'col2', 'Prompt 应该包含输出列');
  assertContains(prompt, 'db1.table1', 'Prompt 应该包含表名');
  assertContains(prompt, 'filter', 'Prompt 应该包含步骤类型');
}

/**
 * 测试10: buildStepPrompt 应该包含前序步骤信息
 */
async function test10_buildStepPromptWithPreviousSteps() {
  console.log('\n=== 测试10: buildStepPrompt (含前序步骤) ===');

  const generator = createTestGenerator();

  const step = {
    stepName: '步骤2',
    description: '第二步',
    tables: ['db1.table2'],
    outputColumns: ['col3'],
    stepType: 'join' as const
  };

  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'db1',
        tableName: 'table2',
        columns: [
          { id: 3, columnName: 'col3', dataType: 'INT', isPrimaryKey: false, isNullable: false }
        ],
        primaryKeys: [],
        indexes: []
      }
    ],
    relationships: [],
    estimatedComplexity: 'medium'
  };

  const previousSteps: StepGenerationResult[] = [
    {
      step: {
        stepName: '步骤1',
        description: '第一步',
        tables: ['db1.table1'],
        outputColumns: ['col1', 'col2']
      },
      sql: 'SELECT col1, col2 FROM table1',
      confidence: 0.9,
      usedTables: ['db1.table1'],
      usedColumns: ['col1', 'col2']
    }
  ];

  const prompt = generator.buildStepPrompt(step, context, previousSteps);

  assertContains(prompt, '前序步骤', 'Prompt 应该包含前序步骤信息');
  assertContains(prompt, '步骤1', 'Prompt 应该包含前一步骤名称');
  assertContains(prompt, 'step1', 'Prompt 应该包含 CTE 引用');
  assertContains(prompt, 'col1, col2', 'Prompt 应该包含前一步骤的输出列');
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('🚀 开始运行多步查询生成器测试\n');
  console.log('='.repeat(60));

  try {
    await test1_countCrossDbJoins();
    await test2_countCrossDbJoinsNoRelationships();
    await test3_countCrossDbJoinsAllCrossDb();
    await test4_combineStepsMultiple();
    await test5_combineStepsSingle();
    await test6_combineStepsEmpty();
    await test7_combineStepsRemoveSemicolon();
    await test8_mapStepTypeToIntentType();
    await test9_buildStepPrompt();
    await test10_buildStepPromptWithPreviousSteps();

    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ 测试完成！`);
    console.log(`通过: ${passedTests}`);
    console.log(`失败: ${failedTests}`);
    console.log(`总计: ${passedTests + failedTests}`);

    if (failedTests > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ 测试运行出错:', error);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// 运行测试
runAllTests();
