/**
 * SQL 质量优化功能测试脚本
 * 演示如何使用质量增强的 SQL 生成器
 */

import { PrismaClient } from '@prisma/client';
import { QualityEnhancedSQLGenerator } from '@/lib/sql/generator/quality-enhanced-generator';
import { SQLQualityTestRunner, SQL_QUALITY_TEST_CASES } from '@/lib/sql/quality/test-cases';
import { IntentRecognizer } from '@/lib/nlp/intent-recognizer';
import { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';

const prisma = new PrismaClient();

async function main() {
  console.log('========================================');
  console.log('SQL 质量优化功能测试');
  console.log('========================================\n');

  // 1. 测试查询模板匹配
  await testTemplateMatching();

  // 2. 测试 SQL 质量评估
  await testQualityAssessment();

  // 3. 测试 SQL 自动修正
  await testAutoFixer();

  // 4. 测试质量增强的 SQL 生成
  await testQualityEnhancedGeneration();

  // 5. 运行完整的质量测试集
  await runQualityTestSuite();

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

/**
 * 测试 1: 查询模板匹配
 */
async function testTemplateMatching() {
  console.log('\n--- 测试 1: 查询模板匹配 ---\n');

  const { QueryTemplateMatcher } = await import('@/lib/sql/templates/query-templates');
  const matcher = new QueryTemplateMatcher();

  const testQueries = [
    '查询最近一个月销售额TOP10的产品',
    '统计用户表的数据',
    '查询销售额最高的10个产品'
  ];

  for (const query of testQueries) {
    console.log(`查询: "${query}"`);
    const matches = matcher.match(query);

    if (matches.length > 0) {
      const bestMatch = matches[0];
      console.log(`✓ 匹配到模板: ${bestMatch.template.name}`);
      console.log(`  置信度: ${(bestMatch.confidence * 100).toFixed(1)}%`);
      console.log(`  分类: ${bestMatch.template.category}`);
      console.log(`  复杂度: ${bestMatch.template.complexity}`);
    } else {
      console.log('✗ 未找到匹配的模板');
    }
    console.log('');
  }
}

/**
 * 测试 2: SQL 质量评估
 */
async function testQualityAssessment() {
  console.log('\n--- 测试 2: SQL 质量评估 ---\n');

  const { SQLQualityAssessor } = await import('@/lib/sql/quality/sql-quality-assessor');
  const assessor = new SQLQualityAssessor();

  const testSQLs = [
    {
      name: '良好的 SQL',
      sql: 'SELECT id, name, email FROM `users` WHERE status = "active" ORDER BY created_at DESC LIMIT 100'
    },
    {
      name: '有问题的 SQL (SELECT *)',
      sql: 'SELECT * FROM users'
    },
    {
      name: '有问题的 SQL (缺少 LIMIT)',
      sql: 'SELECT id, name FROM users WHERE status = "active"'
    },
    {
      name: '跨库 JOIN',
      sql: 'SELECT o.id, p.name FROM `sales_db`.`orders` o INNER JOIN `product_db`.`products` p ON o.product_id = p.id LIMIT 10'
    }
  ];

  for (const test of testSQLs) {
    console.log(`SQL: ${test.name}`);
    const assessment = assessor.assess(test.sql);

    console.log(`总体评分: ${assessment.overallScore}/100`);
    console.log('维度评分:');
    console.log(`  - 正确性: ${assessment.dimensions.correctness.score}/100`);
    console.log(`  - 性能: ${assessment.dimensions.performance.score}/100`);
    console.log(`  - 可读性: ${assessment.dimensions.readability.score}/100`);
    console.log(`  - 安全性: ${assessment.dimensions.security.score}/100`);

    if (assessment.warnings.length > 0) {
      console.log('警告:');
      assessment.warnings.forEach(w => console.log(`  ⚠ ${w}`));
    }

    if (assessment.suggestions.length > 0) {
      console.log('建议:');
      assessment.suggestions.slice(0, 3).forEach(s => console.log(`  💡 ${s.message}`));
    }

    console.log('');
  }
}

/**
 * 测试 3: SQL 自动修正
 */
async function testAutoFixer() {
  console.log('\n--- 测试 3: SQL 自动修正 ---\n');

  const { SQLAutoFixer } = await import('@/lib/sql/quality/sql-auto-fixer');
  const fixer = new SQLAutoFixer();

  const problematicSQLs = [
    {
      name: 'SQL Server TOP 语法',
      sql: 'SELECT TOP 10 id, name FROM users'
    },
    {
      name: '错误的反引号格式',
      sql: 'SELECT * FROM `db_sales.orders`'
    },
    {
      name: '缺少 LIMIT',
      sql: 'SELECT * FROM users WHERE status = "active"'
    }
  ];

  for (const test of problematicSQLs) {
    console.log(`问题 SQL: ${test.name}`);
    console.log(`原始: ${test.sql}`);

    const fixResult = fixer.fix(test.sql);

    if (fixResult.fixed) {
      console.log(`✓ 已修正: ${fixResult.fixedSQL}`);
      console.log('应用的修正:');
      fixResult.appliedFixes.forEach(fix => {
        console.log(`  - ${fix.description}`);
        console.log(`    Before: ${fix.beforeSnippet}`);
        console.log(`    After: ${fix.afterSnippet}`);
      });
    } else {
      console.log('✗ 未发现需要修正的问题');
    }

    console.log('');
  }
}

/**
 * 测试 4: 质量增强的 SQL 生成
 */
async function testQualityEnhancedGeneration() {
  console.log('\n--- 测试 4: 质量增强的 SQL 生成 ---\n');

  const generator = new QualityEnhancedSQLGenerator();
  const intentRecognizer = new IntentRecognizer();
  const metadataRetriever = new MetadataRetriever(prisma);

  const testQuery = '统计数据库中所有表的记录数';

  try {
    console.log(`自然语言查询: "${testQuery}"`);
    console.log('');

    // 1. 识别意图
    console.log('步骤 1: 识别意图...');
    const intent = await intentRecognizer.recognize(testQuery);
    console.log(`✓ 意图类型: ${intent.type}`);

    // 2. 检索元数据（使用第一个可用的表）
    console.log('\n步骤 2: 检索元数据...');

    // 获取第一个数据源
    const dataSources = await prisma.dataSource.findMany({
      take: 1,
      include: {
        databases: {
          take: 1,
          include: {
            tables: {
              take: 1,
              include: {
                columns: true
              }
            }
          }
        }
      }
    });

    if (dataSources.length === 0 || !dataSources[0].databases[0]?.tables[0]) {
      console.log('⚠ 未找到可用的元数据，跳过此测试');
      return;
    }

    const table = dataSources[0].databases[0].tables[0];

    // 构建最小化的元数据上下文
    const context = {
      tables: [{
        id: table.id,
        databaseName: dataSources[0].databases[0].databaseName,
        tableName: table.tableName,
        tableComment: table.tableComment,
        semanticDescription: table.semanticDescription,
        columns: table.columns.map(col => ({
          id: col.id,
          columnName: col.columnName,
          dataType: col.dataType,
          columnComment: col.columnComment,
          semanticDescription: col.semanticDescription,
          isPrimaryKey: col.isPrimaryKey,
          isNullable: col.isNullable,
          sampleValues: []
        })),
        primaryKeys: table.columns.filter(c => c.isPrimaryKey).map(c => c.columnName),
        indexes: []
      }],
      relationships: [],
      estimatedComplexity: 'low' as const
    };

    console.log(`✓ 使用表: ${context.tables[0].databaseName}.${context.tables[0].tableName}`);

    // 3. 生成 SQL
    console.log('\n步骤 3: 生成 SQL (启用质量增强)...');
    const result = await generator.generate(intent, context, {
      enableQualityAssessment: true,
      enableAutoFix: true,
      enableTemplateMatching: true,
      minQualityScore: 70
    });

    console.log(`✓ SQL 生成成功`);
    console.log(`\nSQL:\n${result.sql}\n`);
    console.log(`说明: ${result.explanation}`);
    console.log(`置信度: ${(result.confidence * 100).toFixed(1)}%`);

    if (result.qualityAssessment) {
      console.log(`质量评分: ${result.qualityAssessment.overallScore}/100`);
    }

    if (result.appliedFixes && result.appliedFixes.length > 0) {
      console.log(`应用的修正: ${result.appliedFixes.length} 个`);
    }

    if (result.matchedTemplate) {
      console.log(`使用模板: ${result.matchedTemplate.name}`);
    }

    if (result.attemptedRetries && result.attemptedRetries > 0) {
      console.log(`重试次数: ${result.attemptedRetries}`);
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log('\n警告:');
      result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
    }

  } catch (error) {
    console.error('✗ 生成失败:', error);
  }
}

/**
 * 测试 5: 运行完整的质量测试集
 */
async function runQualityTestSuite() {
  console.log('\n--- 测试 5: 运行质量测试集 (前 10 个用例) ---\n');

  const testRunner = new SQLQualityTestRunner();

  // 选择前 10 个测试用例
  const selectedTests = SQL_QUALITY_TEST_CASES.slice(0, 10);
  let passedCount = 0;
  let failedCount = 0;

  for (const testCase of selectedTests) {
    console.log(`测试用例: ${testCase.id} - ${testCase.description}`);
    console.log(`查询: "${testCase.naturalLanguageQuery}"`);

    // 模拟生成 SQL（这里使用简单的模拟，实际应该调用生成器）
    const mockSQL = generateMockSQL(testCase);

    const result = await testRunner.runTestCase(testCase, mockSQL);

    if (result.passed) {
      console.log(`✓ 通过 (评分: ${result.score}/100)`);
      passedCount++;
    } else {
      console.log(`✗ 失败 (评分: ${result.score}/100)`);
      console.log('失败原因:');
      result.failedRules.forEach(r => console.log(`  - ${r.rule}: ${r.reason}`));
      failedCount++;
    }

    console.log('');
  }

  console.log(`\n测试汇总:`);
  console.log(`  通过: ${passedCount}/${selectedTests.length}`);
  console.log(`  失败: ${failedCount}/${selectedTests.length}`);
  console.log(`  通过率: ${((passedCount / selectedTests.length) * 100).toFixed(1)}%`);
}

/**
 * 生成模拟 SQL（用于演示）
 */
function generateMockSQL(testCase: any): string {
  // 这是一个简化的模拟实现
  // 实际应该使用真实的 SQL 生成器

  switch (testCase.category) {
    case 'simple_select':
      return 'SELECT * FROM `users` LIMIT 100';

    case 'aggregate':
      return 'SELECT COUNT(*) as total FROM `users`';

    case 'time_range':
      return 'SELECT * FROM `orders` WHERE order_date >= DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 100';

    case 'ranking':
      return 'SELECT product_name, sales FROM `products` ORDER BY sales DESC LIMIT 10';

    default:
      return 'SELECT * FROM `table` LIMIT 100';
  }
}

// 运行测试
main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
