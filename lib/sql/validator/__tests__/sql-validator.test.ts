/**
 * SQL 验证器测试
 */

import { SQLValidator } from '../sql-validator';
import { DefaultUserPermissions } from '../permission-checker';
import { MetadataContext, TableContext } from '@/lib/metadata/retrieval/types';

// 创建测试用的元数据上下文
function createTestContext(): MetadataContext {
  const ordersTable: TableContext = {
    id: 1,
    databaseName: 'sales_db',
    tableName: 'orders',
    tableComment: '订单表',
    columns: [
      {
        id: 1,
        columnName: 'order_id',
        dataType: 'INT',
        isPrimaryKey: true,
        isNullable: false
      },
      {
        id: 2,
        columnName: 'product_id',
        dataType: 'INT',
        isPrimaryKey: false,
        isNullable: false
      },
      {
        id: 3,
        columnName: 'order_date',
        dataType: 'DATETIME',
        isPrimaryKey: false,
        isNullable: false
      },
      {
        id: 4,
        columnName: 'amount',
        dataType: 'DECIMAL',
        isPrimaryKey: false,
        isNullable: false
      }
    ],
    primaryKeys: ['order_id'],
    indexes: [],
    rowCount: 10000
  };

  const productsTable: TableContext = {
    id: 2,
    databaseName: 'product_db',
    tableName: 'products',
    tableComment: '产品表',
    columns: [
      {
        id: 5,
        columnName: 'id',
        dataType: 'INT',
        isPrimaryKey: true,
        isNullable: false
      },
      {
        id: 6,
        columnName: 'product_name',
        dataType: 'VARCHAR',
        isPrimaryKey: false,
        isNullable: false
      },
      {
        id: 7,
        columnName: 'category_id',
        dataType: 'INT',
        isPrimaryKey: false,
        isNullable: false
      }
    ],
    primaryKeys: ['id'],
    indexes: [],
    rowCount: 5000
  };

  return {
    tables: [ordersTable, productsTable],
    relationships: [
      {
        sourceTable: 'orders',
        sourceColumn: 'product_id',
        targetTable: 'products',
        targetColumn: 'id',
        type: 'explicit',
        confidence: 1.0
      }
    ],
    columns: [...ordersTable.columns, ...productsTable.columns],
    estimatedComplexity: 'medium'
  };
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
  console.log('开始 SQL 验证器测试...\n');

  const validator = new SQLValidator();
  const context = createTestContext();

  // 测试 1: 简单 SELECT 查询（应该通过）
  await runTest('测试 1: 简单 SELECT 查询', async () => {
    const sql = 'SELECT * FROM orders';
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    if (result.errors.length > 0) {
      throw new Error(`不应该有错误: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - SQL 通过验证`);
    console.log(`  - 警告数: ${result.warnings.length}`);
    console.log(`  - 优化建议数: ${result.optimizationSuggestions.length}`);
  });

  // 测试 2: 语法错误（应该失败）
  await runTest('测试 2: 语法错误检测', async () => {
    const sql = 'SELECT * FORM orders';  // FORM 拼写错误
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该检测到语法错误');
    }

    if (result.errors.length === 0) {
      throw new Error('应该有语法错误');
    }

    if (result.errors[0].type !== 'syntax') {
      throw new Error(`错误类型应该是 'syntax'，实际是 '${result.errors[0].type}'`);
    }

    console.log(`  - 成功检测到语法错误: ${result.errors[0].message}`);
  });

  // 测试 3: DROP TABLE（应该被安全检查拒绝）
  await runTest('测试 3: 危险操作检测 (DROP)', async () => {
    const sql = 'DROP TABLE orders';
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该拒绝 DROP 操作');
    }

    if (result.securityIssues.length === 0) {
      throw new Error('应该检测到安全问题');
    }

    const dropIssue = result.securityIssues.find(issue => issue.type === 'dangerous_operation');
    if (!dropIssue) {
      throw new Error('应该检测到危险操作');
    }

    console.log(`  - 成功拒绝危险操作: ${dropIssue.message}`);
  });

  // 测试 4: SQL 注入检测
  await runTest('测试 4: SQL 注入检测', async () => {
    const sql = "SELECT * FROM orders WHERE id = 1 OR 1=1";
    const result = await validator.validate(sql, context);

    if (result.securityIssues.length === 0) {
      throw new Error('应该检测到潜在的 SQL 注入');
    }

    const injectionIssue = result.securityIssues.find(issue => issue.type === 'sql_injection');
    if (!injectionIssue) {
      throw new Error('应该检测到 SQL 注入模式');
    }

    console.log(`  - 成功检测到 SQL 注入: ${injectionIssue.message}`);
  });

  // 测试 5: 表不存在（语义错误）
  await runTest('测试 5: 表不存在检测', async () => {
    const sql = 'SELECT * FROM non_existent_table';
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该检测到表不存在');
    }

    const semanticError = result.errors.find(e => e.type === 'semantic');
    if (!semanticError) {
      throw new Error('应该有语义错误');
    }

    console.log(`  - 成功检测到表不存在: ${semanticError.message}`);
  });

  // 测试 6: 字段不存在（语义错误）
  await runTest('测试 6: 字段不存在检测', async () => {
    const sql = 'SELECT non_existent_column FROM orders';
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该检测到字段不存在');
    }

    const semanticError = result.errors.find(e => e.type === 'semantic');
    if (!semanticError) {
      throw new Error('应该有语义错误');
    }

    console.log(`  - 成功检测到字段不存在: ${semanticError.message}`);
  });

  // 测试 7: 跨库 JOIN（应该通过但有警告）
  await runTest('测试 7: 跨库 JOIN 检测', async () => {
    const sql = `
      SELECT o.order_id, p.product_name
      FROM sales_db.orders o
      INNER JOIN product_db.products p ON o.product_id = p.id
    `;
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    const crossDbWarning = result.warnings.find(w => w.type === 'cross_database_join');
    if (!crossDbWarning) {
      throw new Error('应该有跨库 JOIN 警告');
    }

    console.log(`  - SQL 通过验证，但有跨库警告: ${crossDbWarning.message}`);
  });

  // 测试 8: SELECT * 优化建议
  await runTest('测试 8: SELECT * 优化建议', async () => {
    const sql = 'SELECT * FROM orders';
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error('验证应该通过');
    }

    const selectStarSuggestion = result.optimizationSuggestions.find(s => s.type === 'select_star');
    if (!selectStarSuggestion) {
      throw new Error('应该有 SELECT * 优化建议');
    }

    console.log(`  - 成功提供优化建议: ${selectStarSuggestion.message}`);
  });

  // 测试 9: 权限检查
  await runTest('测试 9: 权限检查', async () => {
    const sql = 'SELECT * FROM orders';
    const permissions = new DefaultUserPermissions('user1', ['sales_db'], undefined, ['SELECT']);

    const result = await validator.validate(sql, context, permissions);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - 权限检查通过`);
  });

  // 测试 10: 权限不足
  await runTest('测试 10: 权限不足检测', async () => {
    const sql = 'SELECT * FROM products';
    const permissions = new DefaultUserPermissions('user1', ['sales_db'], undefined, ['SELECT']);

    const result = await validator.validate(sql, context, permissions);

    if (result.isValid) {
      throw new Error('应该拒绝访问未授权的数据库');
    }

    const permissionError = result.errors.find(e => e.type === 'permission');
    if (!permissionError) {
      throw new Error('应该有权限错误');
    }

    console.log(`  - 成功检测到权限不足: ${permissionError.message}`);
  });

  // 测试 11: 复杂查询性能分析
  await runTest('测试 11: 复杂查询性能分析', async () => {
    const sql = `
      SELECT o.order_id, p.product_name, SUM(o.amount) as total
      FROM sales_db.orders o
      INNER JOIN product_db.products p ON o.product_id = p.id
      WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY o.order_id, p.product_name
      ORDER BY total DESC
    `;
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - 查询复杂度: ${result.estimatedCost.complexity}`);
    console.log(`  - 预估扫描行数: ${result.estimatedCost.rowsScanned}`);
    console.log(`  - 预估执行时间: ${result.estimatedCost.executionTimeMs}ms`);
  });

  // 测试 12: 多语句检测
  await runTest('测试 12: 多语句执行检测', async () => {
    const sql = 'SELECT * FROM orders; DROP TABLE orders;';
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该拒绝多语句执行');
    }

    const multiStatementIssue = result.securityIssues.find(issue =>
      issue.type === 'multiple_statements' || issue.type === 'dangerous_operation'
    );
    if (!multiStatementIssue) {
      throw new Error('应该检测到多语句或危险操作');
    }

    console.log(`  - 成功检测到多语句/危险操作: ${multiStatementIssue.message}`);
  });

  console.log('\n所有测试通过! ✓');
}

// 运行测试
main().catch(error => {
  console.error('\n测试失败:', error);
  process.exit(1);
});
