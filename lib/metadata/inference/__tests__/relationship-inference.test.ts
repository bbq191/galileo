/**
 * 关系推断模块测试
 *
 * 运行测试:
 * tsx lib/metadata/inference/__tests__/relationship-inference.test.ts
 */

import { NamingAnalyzer, BUILTIN_NAMING_PATTERNS } from '../naming-analyzer';
import { RulesEngine, BUILTIN_INFERENCE_RULES } from '../rules-engine';
import { RelationshipInferencer } from '../relationship-inferencer';
import { AIInferencer } from '../ai-inferencer';
import type { ColumnInfo } from '../../types';

/**
 * 创建测试字段
 */
function createTestColumn(
  tableName: string,
  columnName: string,
  dataType: string = 'int',
  columnKey: '' | 'PRI' | 'UNI' | 'MUL' = ''
): ColumnInfo {
  return {
    columnName,
    tableName,
    databaseName: 'test_db',
    dataType,
    columnType: dataType === 'int' ? 'int(11)' : 'varchar(255)',
    isNullable: true,
    columnKey,
    ordinalPosition: 1,
  };
}

/**
 * 测试命名分析器
 */
async function testNamingAnalyzer() {
  console.log('\n========================================');
  console.log('测试 1: 命名模式分析器');
  console.log('========================================\n');

  const analyzer = new NamingAnalyzer();

  const testCases = [
    { columnName: 'user_id', expectedTable: 'users', expectedColumn: 'id' },
    { columnName: 'product_id', expectedTable: 'products', expectedColumn: 'id' },
    { columnName: 'userId', expectedTable: 'users', expectedColumn: 'id' },
    { columnName: 'created_by', expectedTable: 'users', expectedColumn: 'id' },
    { columnName: 'author_id', expectedTable: 'users', expectedColumn: 'id' },
    { columnName: 'parent_id', expectedTable: null, expectedColumn: 'id' },
    { columnName: 'category_code', expectedTable: 'categorys', expectedColumn: 'code' },
    { columnName: 'order_uuid', expectedTable: 'orders', expectedColumn: 'uuid' },
    { columnName: 'name', expectedTable: null, expectedColumn: 'id' },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = analyzer.analyze(testCase.columnName);

    const isMatch =
      result.targetTable === testCase.expectedTable &&
      result.targetColumn === testCase.expectedColumn;

    if (isMatch) {
      console.log(`✓ ${testCase.columnName} -> ${result.targetTable}.${result.targetColumn} (置信度: ${result.confidence})`);
      passed++;
    } else {
      console.log(
        `✗ ${testCase.columnName} -> 期望: ${testCase.expectedTable}.${testCase.expectedColumn}, 实际: ${result.targetTable}.${result.targetColumn}`
      );
      failed++;
    }
  }

  console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
}

/**
 * 测试规则引擎
 */
async function testRulesEngine() {
  console.log('\n========================================');
  console.log('测试 2: 规则引擎');
  console.log('========================================\n');

  const engine = new RulesEngine();

  const testCases = [
    {
      name: '标准外键模式 + 类型一致',
      source: createTestColumn('orders', 'user_id', 'int'),
      target: createTestColumn('users', 'id', 'int', 'PRI'),
      expectedRelated: true,
      minConfidence: 0.8,
    },
    {
      name: '类型不一致',
      source: createTestColumn('orders', 'user_id', 'varchar'),
      target: createTestColumn('users', 'id', 'int', 'PRI'),
      expectedRelated: false,
      minConfidence: 0.6,
    },
    {
      name: '目标不是主键',
      source: createTestColumn('orders', 'user_id', 'int'),
      target: createTestColumn('users', 'id', 'int'),
      expectedRelated: true,
      minConfidence: 0.5,
    },
    {
      name: '驼峰命名',
      source: createTestColumn('orders', 'userId', 'int'),
      target: createTestColumn('users', 'id', 'int', 'PRI'),
      expectedRelated: true,
      minConfidence: 0.75,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = engine.evaluate(testCase.source, testCase.target);

    const isMatch =
      result.isRelated === testCase.expectedRelated &&
      result.confidence >= testCase.minConfidence;

    if (isMatch) {
      console.log(`✓ ${testCase.name}`);
      console.log(`  置信度: ${result.confidence}`);
      console.log(`  匹配规则: ${result.matchedRules.join(', ')}`);
      passed++;
    } else {
      console.log(`✗ ${testCase.name}`);
      console.log(
        `  期望: ${testCase.expectedRelated ? '相关' : '不相关'} (≥${testCase.minConfidence}), 实际: ${result.isRelated ? '相关' : '不相关'} (${result.confidence})`
      );
      failed++;
    }
  }

  console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
}

/**
 * 测试完整推断流程
 */
async function testRelationshipInferencer() {
  console.log('\n========================================');
  console.log('测试 3: 完整关系推断');
  console.log('========================================\n');

  const inferencer = new RelationshipInferencer({
    minConfidence: 0.7,
  });

  // 模拟数据库字段
  const columns: ColumnInfo[] = [
    // users 表
    createTestColumn('users', 'id', 'int', 'PRI'),
    createTestColumn('users', 'name', 'varchar'),
    createTestColumn('users', 'email', 'varchar'),
    createTestColumn('users', 'created_at', 'datetime'),

    // orders 表
    createTestColumn('orders', 'id', 'int', 'PRI'),
    createTestColumn('orders', 'user_id', 'int'),
    createTestColumn('orders', 'total_amount', 'decimal'),
    createTestColumn('orders', 'created_at', 'datetime'),
    createTestColumn('orders', 'created_by', 'int'),

    // products 表
    createTestColumn('products', 'id', 'int', 'PRI'),
    createTestColumn('products', 'name', 'varchar'),
    createTestColumn('products', 'category_id', 'int'),
    createTestColumn('products', 'created_by', 'int'),

    // categories 表
    createTestColumn('categories', 'id', 'int', 'PRI'),
    createTestColumn('categories', 'name', 'varchar'),
    createTestColumn('categories', 'parent_id', 'int'),

    // order_items 表
    createTestColumn('order_items', 'id', 'int', 'PRI'),
    createTestColumn('order_items', 'order_id', 'int'),
    createTestColumn('order_items', 'product_id', 'int'),
    createTestColumn('order_items', 'quantity', 'int'),
  ];

  const result = await inferencer.inferRelationships('test_db', columns);

  console.log('\n推断结果:');
  console.log(`总字段数: ${result.stats.totalColumns}`);
  console.log(`检查字段对: ${result.stats.checkedPairs}`);
  console.log(`推断出关系: ${result.stats.inferredCount}`);
  console.log(`  - 高置信度 (≥0.8): ${result.stats.highConfidenceCount}`);
  console.log(`  - 中置信度 (0.6-0.8): ${result.stats.mediumConfidenceCount}`);
  console.log(`  - 低置信度 (<0.6): ${result.stats.lowConfidenceCount}`);
  console.log(`耗时: ${result.stats.duration}ms`);

  console.log('\n推断的关系:');
  for (const rel of result.relationships) {
    console.log(
      `  ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn} (置信度: ${rel.confidenceScore})`
    );
  }

  console.log('\n使用的规则统计:');
  for (const rule of result.rulesUsed) {
    console.log(`  ${rule.ruleName}: ${rule.matchCount} 次`);
  }

  // 验证推断结果
  const expectedRelationships = [
    { source: 'orders.user_id', target: 'users.id' },
    { source: 'orders.created_by', target: 'users.id' },
    { source: 'products.category_id', target: 'categories.id' },
    { source: 'products.created_by', target: 'users.id' },
    { source: 'categories.parent_id', target: 'categories.id' },
    { source: 'order_items.order_id', target: 'orders.id' },
    { source: 'order_items.product_id', target: 'products.id' },
  ];

  let foundCount = 0;
  for (const expected of expectedRelationships) {
    const found = result.relationships.some(
      (rel) =>
        `${rel.sourceTable}.${rel.sourceColumn}` === expected.source &&
        `${rel.targetTable}.${rel.targetColumn}` === expected.target
    );
    if (found) {
      foundCount++;
    } else {
      console.log(`\n⚠️  未找到期望的关系: ${expected.source} → ${expected.target}`);
    }
  }

  console.log(`\n验证: 找到 ${foundCount}/${expectedRelationships.length} 个期望的关系`);

  if (foundCount === expectedRelationships.length) {
    console.log('✓ 完整推断测试通过');
  } else {
    console.log('✗ 完整推断测试失败');
  }
}

/**
 * 测试表名匹配
 */
async function testTableMatching() {
  console.log('\n========================================');
  console.log('测试 4: 智能表名匹配');
  console.log('========================================\n');

  const analyzer = new NamingAnalyzer();

  const availableTables = [
    'users',
    'products',
    'Categories',
    'order_item',
    'UserProfile',
  ];

  const testCases = [
    { targetTable: 'user', expected: 'users' },
    { targetTable: 'users', expected: 'users' },
    { targetTable: 'product', expected: 'products' },
    { targetTable: 'products', expected: 'products' },
    { targetTable: 'category', expected: 'Categories' },
    { targetTable: 'categories', expected: 'Categories' },
    { targetTable: 'order_items', expected: 'order_item' },
    { targetTable: 'userprofile', expected: 'UserProfile' },
    { targetTable: 'nonexistent', expected: null },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = analyzer.findMatchingTable(testCase.targetTable, availableTables);

    if (result === testCase.expected) {
      console.log(`✓ ${testCase.targetTable} -> ${result}`);
      passed++;
    } else {
      console.log(`✗ ${testCase.targetTable} -> 期望: ${testCase.expected}, 实际: ${result}`);
      failed++;
    }
  }

  console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
}

/**
 * 测试 AI 推断器
 */
async function testAIInferencer() {
  console.log('\n========================================');
  console.log('测试 5: AI 推断器');
  console.log('========================================\n');

  const inferencer = new AIInferencer();

  // 测试外键候选检测
  console.log('外键候选检测:');
  const fkCandidates = [
    createTestColumn('orders', 'user_id', 'int'),
    createTestColumn('orders', 'customer_uuid', 'varchar'),
    createTestColumn('orders', 'created_by', 'int'),
    createTestColumn('orders', 'name', 'varchar'), // 不是外键
    createTestColumn('orders', 'created_at', 'datetime'), // 不是外键
  ];

  for (const col of fkCandidates) {
    const isFk = inferencer.isForeignKeyCandidate(col);
    console.log(`  ${col.columnName}: ${isFk ? '✓ 是外键候选' : '✗ 不是外键候选'}`);
  }

  // 测试主键候选检测
  console.log('\n主键候选检测:');
  const pkCandidates = [
    createTestColumn('users', 'id', 'int', 'PRI'),
    createTestColumn('users', 'user_id', 'int'),
    createTestColumn('users', 'name', 'varchar'),
  ];

  for (const col of pkCandidates) {
    const isPk = inferencer.isPrimaryKeyCandidate(col);
    console.log(`  ${col.columnName}: ${isPk ? '✓ 是主键候选' : '✗ 不是主键候选'}`);
  }

  console.log('\n注意: AI 推断需要 Ollama 服务运行，此测试仅检查基本逻辑');
  console.log('完整 AI 推断测试需要在集成测试中验证');
}

/**
 * 测试混合推断（规则 + AI）
 */
async function testHybridInference() {
  console.log('\n========================================');
  console.log('测试 6: 混合推断（规则 + AI）');
  console.log('========================================\n');

  const inferencer = new RelationshipInferencer({
    minConfidence: 0.7,
    enableAIInference: true,
    aiMinConfidence: 0.75,
    aiBatchSize: 3,
  });

  console.log('配置:');
  const config = inferencer.getConfig();
  console.log(`  规则引擎: ${config.enableRulesEngine ? '✓ 启用' : '✗ 禁用'}`);
  console.log(`  命名分析: ${config.enableNamingAnalysis ? '✓ 启用' : '✗ 禁用'}`);
  console.log(`  AI 推断: ${config.enableAIInference ? '✓ 启用' : '✗ 禁用'}`);
  console.log(`  最小置信度: ${config.minConfidence}`);
  console.log(`  AI 最小置信度: ${config.aiMinConfidence}`);
  console.log(`  AI 批次大小: ${config.aiBatchSize}`);

  // 模拟数据库字段（包含一些非标准命名）
  const columns: ColumnInfo[] = [
    // users 表
    createTestColumn('users', 'id', 'int', 'PRI'),
    createTestColumn('users', 'name', 'varchar'),
    createTestColumn('users', 'email', 'varchar'),

    // orders 表
    createTestColumn('orders', 'id', 'int', 'PRI'),
    createTestColumn('orders', 'user_id', 'int'), // 标准外键 - 规则引擎
    createTestColumn('orders', 'buyer', 'int'), // 非标准命名 - AI 推断
    createTestColumn('orders', 'total_amount', 'decimal'),
  ];

  console.log('\n开始推断...');
  console.log('注意: AI 推断部分需要 Ollama 服务');

  try {
    const result = await inferencer.inferRelationships('test_db', columns);

    console.log('\n推断结果:');
    console.log(`总字段数: ${result.stats.totalColumns}`);
    console.log(`推断出关系: ${result.stats.inferredCount}`);

    console.log('\n推断的关系:');
    for (const rel of result.relationships) {
      console.log(
        `  ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn} (${rel.inferenceMethod}, 置信度: ${rel.confidenceScore.toFixed(2)})`
      );
    }
  } catch (error) {
    console.log('\n⚠️  混合推断测试需要 Ollama 服务运行');
    console.log('跳过 AI 推断部分的测试');
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('========================================');
  console.log('关系推断模块测试');
  console.log('========================================');

  console.log(`\n内置命名模式: ${BUILTIN_NAMING_PATTERNS.length} 个`);
  console.log(`内置推断规则: ${BUILTIN_INFERENCE_RULES.length} 个`);

  await testNamingAnalyzer();
  await testRulesEngine();
  await testTableMatching();
  await testRelationshipInferencer();
  await testAIInferencer();
  await testHybridInference();

  console.log('\n========================================');
  console.log('所有测试完成');
  console.log('========================================\n');
}

// 运行测试
runAllTests().catch((error) => {
  console.error('测试失败:', error);
  process.exit(1);
});
