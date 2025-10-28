/**
 * 性能分析器测试
 */

import { PerformanceAnalyzer } from '../performance-analyzer';
import { MetadataContext, TableContext } from '@/lib/metadata/retrieval/types';
import { PrismaClient } from '@prisma/client';

// 创建测试用的元数据上下文
function createTestContext(): MetadataContext {
  const usersTable: TableContext = {
    id: 1,
    databaseName: 'test_db',
    tableName: 'users',
    tableComment: '用户表',
    columns: [
      {
        id: 1,
        columnName: 'id',
        dataType: 'INT',
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        id: 2,
        columnName: 'name',
        dataType: 'VARCHAR',
        isPrimaryKey: false,
        isNullable: false,
      },
      {
        id: 3,
        columnName: 'email',
        dataType: 'VARCHAR',
        isPrimaryKey: false,
        isNullable: false,
      },
      {
        id: 4,
        columnName: 'created_at',
        dataType: 'DATETIME',
        isPrimaryKey: false,
        isNullable: false,
      },
      {
        id: 5,
        columnName: 'status',
        dataType: 'INT',
        isPrimaryKey: false,
        isNullable: false,
      },
    ],
    primaryKeys: ['id'],
    indexes: [],
    rowCount: 10000,
  };

  const ordersTable: TableContext = {
    id: 2,
    databaseName: 'test_db',
    tableName: 'orders',
    tableComment: '订单表',
    columns: [
      {
        id: 6,
        columnName: 'id',
        dataType: 'INT',
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        id: 7,
        columnName: 'user_id',
        dataType: 'INT',
        isPrimaryKey: false,
        isNullable: false,
      },
      {
        id: 8,
        columnName: 'amount',
        dataType: 'DECIMAL',
        isPrimaryKey: false,
        isNullable: false,
      },
    ],
    primaryKeys: ['id'],
    indexes: [],
    rowCount: 50000,
  };

  return {
    tables: [usersTable, ordersTable],
    relationships: [],
    columns: [...usersTable.columns, ...ordersTable.columns],
    estimatedComplexity: 'low',
  };
}

// 创建跨库上下文
function createCrossDbContext(): MetadataContext {
  const context = createTestContext();
  context.tables[0].databaseName = 'db1';
  context.tables[1].databaseName = 'db2';
  return context;
}

// 创建大表上下文
function createLargeTableContext(): MetadataContext {
  const context = createTestContext();
  context.tables[0].rowCount = 2000000;
  return context;
}

async function runTest(testName: string, testFn: () => Promise<void>) {
  try {
    await testFn();
    console.log(`✓ ${testName}`);
  } catch (error) {
    console.error(`✗ ${testName}`);
    console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function main() {
  console.log('开始性能分析器测试...\n');

  // 注意：这里使用真实的 PrismaClient，因为性能分析器需要查询索引信息
  const prisma = new PrismaClient();
  const analyzer = new PerformanceAnalyzer(prisma);
  const context = createTestContext();

  try {
    // 测试 1: 检测 SELECT *
    await runTest('测试 1: 检测 SELECT * 并给出建议', async () => {
      const sql = 'SELECT * FROM users';
      const result = await analyzer.analyze(sql, context);

      const selectStarSuggestion = result.suggestions.find((s) => s.type === 'select_star');
      if (!selectStarSuggestion) {
        throw new Error('应该检测到 SELECT *');
      }

      console.log(`  - 成功检测到 SELECT *`);
      console.log(`  - 建议: ${selectStarSuggestion.message}`);
    });

    // 测试 2: 检测缺少 LIMIT
    await runTest('测试 2: 检测缺少 LIMIT', async () => {
      const sql = 'SELECT id, name FROM users';
      const result = await analyzer.analyze(sql, context);

      const limitWarning = result.warnings.find((w) => w.type === 'missing_limit');
      if (!limitWarning) {
        throw new Error('应该检测到缺少 LIMIT');
      }

      console.log(`  - 成功检测到缺少 LIMIT`);
      console.log(`  - 警告: ${limitWarning.message}`);
    });

    // 测试 3: 估算查询复杂度
    await runTest('测试 3: 估算查询复杂度', async () => {
      const sql = 'SELECT id FROM users LIMIT 10';
      const result = await analyzer.analyze(sql, context);

      if (!result.estimatedCost) {
        throw new Error('应该有成本估算');
      }

      if (result.estimatedCost.complexity !== 'low') {
        throw new Error(`复杂度应该是 'low'，实际是 '${result.estimatedCost.complexity}'`);
      }

      console.log(`  - 复杂度: ${result.estimatedCost.complexity}`);
      console.log(`  - 估算扫描行数: ${result.estimatedCost.rowsScanned}`);
      console.log(`  - 估算执行时间: ${result.estimatedCost.executionTimeMs}ms`);
    });

    // 测试 4: 检测跨库 JOIN
    await runTest('测试 4: 检测跨库 JOIN', async () => {
      const crossDbContext = createCrossDbContext();
      const sql = `
        SELECT u.name, o.amount
        FROM db1.users u
        INNER JOIN db2.orders o ON u.id = o.user_id
      `;

      const result = await analyzer.analyze(sql, crossDbContext);

      const crossDbWarning = result.warnings.find((w) => w.type === 'cross_database_join');
      if (!crossDbWarning) {
        throw new Error('应该检测到跨库 JOIN');
      }

      const crossDbSuggestion = result.suggestions.find((s) => s.type === 'cross_db_optimization');
      if (!crossDbSuggestion) {
        throw new Error('应该有跨库优化建议');
      }

      console.log(`  - 成功检测到跨库 JOIN`);
      console.log(`  - 警告: ${crossDbWarning.message}`);
      console.log(`  - 优化建议: ${crossDbSuggestion.message}`);
    });

    // 测试 5: 检测 WHERE 子句中对列使用函数
    await runTest('测试 5: 检测 WHERE 子句中对列使用函数', async () => {
      const sql = 'SELECT * FROM users WHERE YEAR(created_at) = 2024';
      const result = await analyzer.analyze(sql, context);

      const funcSuggestion = result.suggestions.find((s) => s.type === 'function_on_column');
      if (!funcSuggestion) {
        throw new Error('应该检测到函数使用');
      }

      console.log(`  - 成功检测到函数使用`);
      console.log(`  - 建议: ${funcSuggestion.message}`);
    });

    // 测试 6: 检测子查询
    await runTest('测试 6: 检测过多的子查询', async () => {
      const sql = `
        SELECT *
        FROM users
        WHERE id IN (
          SELECT user_id FROM orders WHERE amount > (
            SELECT AVG(amount) FROM orders WHERE status = (
              SELECT id FROM order_status WHERE is_default = 1
            )
          )
        )
      `;

      const result = await analyzer.analyze(sql, context);

      const subqueryWarning = result.warnings.find((w) => w.type === 'excessive_subqueries');
      if (!subqueryWarning) {
        throw new Error('应该检测到过多的子查询');
      }

      console.log(`  - 成功检测到过多的子查询`);
      console.log(`  - 警告: ${subqueryWarning.message}`);
    });

    // 测试 7: 检测 UNION 并建议使用 UNION ALL
    await runTest('测试 7: 检测 UNION 并建议使用 UNION ALL', async () => {
      const sql = `
        SELECT id, name FROM users WHERE status = 1
        UNION
        SELECT id, name FROM users WHERE status = 2
      `;

      const result = await analyzer.analyze(sql, context);

      const unionSuggestion = result.suggestions.find((s) => s.type === 'union_all');
      if (!unionSuggestion) {
        throw new Error('应该建议使用 UNION ALL');
      }

      console.log(`  - 成功建议使用 UNION ALL`);
      console.log(`  - 建议: ${unionSuggestion.message}`);
    });

    // 测试 8: 检测 DISTINCT
    await runTest('测试 8: 检测 DISTINCT 使用', async () => {
      const sql = 'SELECT DISTINCT name FROM users';
      const result = await analyzer.analyze(sql, context);

      const distinctSuggestion = result.suggestions.find((s) => s.type === 'distinct_usage');
      if (!distinctSuggestion) {
        throw new Error('应该检测到 DISTINCT 使用');
      }

      console.log(`  - 成功检测到 DISTINCT`);
      console.log(`  - 建议: ${distinctSuggestion.message}`);
    });

    // 测试 9: 检测 OR 条件
    await runTest('测试 9: 检测 OR 条件', async () => {
      const sql = 'SELECT * FROM users WHERE status = 1 OR status = 2 OR status = 3';
      const result = await analyzer.analyze(sql, context);

      const orSuggestion = result.suggestions.find((s) => s.type === 'or_condition');
      if (!orSuggestion) {
        throw new Error('应该检测到 OR 条件');
      }

      console.log(`  - 成功检测到 OR 条件`);
      console.log(`  - 建议: ${orSuggestion.message}`);
    });

    // 测试 10: 检测 NOT IN
    await runTest('测试 10: 检测 NOT IN', async () => {
      const sql = 'SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM banned_users)';
      const result = await analyzer.analyze(sql, context);

      const notInWarning = result.warnings.find((w) => w.type === 'not_in_usage');
      if (!notInWarning) {
        throw new Error('应该检测到 NOT IN 使用');
      }

      const notInSuggestion = result.suggestions.find((s) => s.type === 'not_in_optimization');
      if (!notInSuggestion) {
        throw new Error('应该有 NOT IN 优化建议');
      }

      console.log(`  - 成功检测到 NOT IN`);
      console.log(`  - 警告: ${notInWarning.message}`);
      console.log(`  - 建议: ${notInSuggestion.message}`);
    });

    // 测试 11: 大表查询复杂度
    await runTest('测试 11: 大表查询复杂度评估', async () => {
      const largeContext = createLargeTableContext();
      const sql = 'SELECT * FROM users';
      const result = await analyzer.analyze(sql, largeContext);

      if (result.estimatedCost.complexity !== 'high') {
        throw new Error(`大表查询复杂度应该是 'high'，实际是 '${result.estimatedCost.complexity}'`);
      }

      console.log(`  - 成功识别高复杂度查询`);
      console.log(`  - 复杂度: ${result.estimatedCost.complexity}`);
    });

    // 测试 12: 跨库 JOIN 增加复杂度
    await runTest('测试 12: 跨库 JOIN 增加复杂度', async () => {
      const crossDbContext = createCrossDbContext();
      // 设置较小的行数
      crossDbContext.tables[0].rowCount = 5000;
      crossDbContext.tables[1].rowCount = 5000;

      const sql = `
        SELECT u.name, o.amount
        FROM db1.users u
        INNER JOIN db2.orders o ON u.id = o.user_id
      `;

      const result = await analyzer.analyze(sql, crossDbContext);

      // 即使单表行数不多，跨库 JOIN 也应该提升复杂度到至少 medium
      if (result.estimatedCost.complexity === 'low') {
        throw new Error('跨库 JOIN 应该提升复杂度');
      }

      console.log(`  - 成功识别跨库 JOIN 提升复杂度`);
      console.log(`  - 复杂度: ${result.estimatedCost.complexity}`);
    });

    // 测试 13: 无效 SQL 的错误处理
    await runTest('测试 13: 无效 SQL 的错误处理', async () => {
      const sql = 'INVALID SQL STATEMENT';
      const result = await analyzer.analyze(sql, context);

      const analysisFailedWarning = result.warnings.find((w) => w.type === 'analysis_failed');
      if (!analysisFailedWarning) {
        throw new Error('应该检测到分析失败');
      }

      console.log(`  - 成功处理无效 SQL`);
      console.log(`  - 警告: ${analysisFailedWarning.message}`);
    });

    console.log('\n所有测试通过！✨');
  } catch (error) {
    console.error('\n测试失败 ❌');
    throw error;
  } finally {
    await prisma.$disconnect();
    analyzer.clearCache();
  }
}

// 运行测试
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
