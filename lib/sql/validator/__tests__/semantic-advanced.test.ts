/**
 * 语义验证进阶测试 - 重点测试别名和 JOIN 处理
 */

import { SQLValidator } from '../sql-validator';
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
        columnName: 'customer_id',
        dataType: 'INT',
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
        columnName: 'price',
        dataType: 'DECIMAL',
        isPrimaryKey: false,
        isNullable: false
      }
    ],
    primaryKeys: ['id'],
    indexes: [],
    rowCount: 5000
  };

  const customersTable: TableContext = {
    id: 3,
    databaseName: 'sales_db',
    tableName: 'customers',
    tableComment: '客户表',
    columns: [
      {
        id: 8,
        columnName: 'id',
        dataType: 'INT',
        isPrimaryKey: true,
        isNullable: false
      },
      {
        id: 9,
        columnName: 'customer_name',
        dataType: 'VARCHAR',
        isPrimaryKey: false,
        isNullable: false
      },
      {
        id: 10,
        columnName: 'email',
        dataType: 'VARCHAR',
        isPrimaryKey: false,
        isNullable: false
      }
    ],
    primaryKeys: ['id'],
    indexes: [],
    rowCount: 3000
  };

  return {
    tables: [ordersTable, productsTable, customersTable],
    relationships: [],
    columns: [...ordersTable.columns, ...productsTable.columns, ...customersTable.columns],
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
  console.log('开始语义验证进阶测试...\n');

  const validator = new SQLValidator();
  const context = createTestContext();

  // 测试 1: 使用别名引用字段（应该通过）
  await runTest('测试 1: 使用别名引用字段', async () => {
    const sql = `
      SELECT o.order_id, o.amount
      FROM orders o
    `;
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - 别名引用字段验证通过`);
  });

  // 测试 2: 使用别名引用不存在的字段（应该失败）
  await runTest('测试 2: 使用别名引用不存在的字段', async () => {
    const sql = `
      SELECT o.order_id, o.non_existent_field
      FROM orders o
    `;
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该检测到字段不存在');
    }

    const semanticError = result.errors.find(e =>
      e.type === 'semantic' && e.message.includes('non_existent_field')
    );
    if (!semanticError) {
      throw new Error('应该有字段不存在的语义错误');
    }

    console.log(`  - 成功检测到: ${semanticError.message}`);
  });

  // 测试 3: 多表 JOIN 使用别名（应该通过）
  await runTest('测试 3: 多表 JOIN 使用别名', async () => {
    const sql = `
      SELECT o.order_id, p.product_name, c.customer_name
      FROM orders o
      INNER JOIN products p ON o.product_id = p.id
      INNER JOIN customers c ON o.customer_id = c.id
    `;
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - 多表 JOIN 别名验证通过`);
  });

  // 测试 4: JOIN 中使用错误的别名引用字段（应该失败）
  await runTest('测试 4: JOIN 中使用错误的别名引用字段', async () => {
    const sql = `
      SELECT o.order_id, p.wrong_field
      FROM orders o
      INNER JOIN products p ON o.product_id = p.id
    `;
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该检测到字段不存在');
    }

    const semanticError = result.errors.find(e =>
      e.type === 'semantic' && e.message.includes('wrong_field')
    );
    if (!semanticError) {
      throw new Error('应该有字段不存在的语义错误');
    }

    console.log(`  - 成功检测到: ${semanticError.message}`);
  });

  // 测试 5: 引用未定义的表别名（应该失败）
  await runTest('测试 5: 引用未定义的表别名', async () => {
    const sql = `
      SELECT o.order_id, xyz.some_field
      FROM orders o
    `;
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该检测到未知的表别名');
    }

    const semanticError = result.errors.find(e =>
      e.type === 'semantic' && e.message.includes('xyz')
    );
    if (!semanticError) {
      throw new Error('应该有未知表别名的错误');
    }

    console.log(`  - 成功检测到: ${semanticError.message}`);
  });

  // 测试 6: 不使用别名，直接使用表名（应该通过）
  await runTest('测试 6: 不使用别名，直接使用表名', async () => {
    const sql = `
      SELECT orders.order_id, products.product_name
      FROM orders
      INNER JOIN products ON orders.product_id = products.id
    `;
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - 直接使用表名验证通过`);
  });

  // 测试 7: 混合使用别名和表名（应该通过）
  await runTest('测试 7: 混合使用别名和表名', async () => {
    const sql = `
      SELECT o.order_id, products.product_name
      FROM orders o
      INNER JOIN products ON o.product_id = products.id
    `;
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - 混合使用别名和表名验证通过`);
  });

  // 测试 8: WHERE 子句中使用别名引用（应该通过）
  await runTest('测试 8: WHERE 子句中使用别名引用', async () => {
    const sql = `
      SELECT o.order_id, p.product_name
      FROM orders o
      INNER JOIN products p ON o.product_id = p.id
      WHERE o.amount > 100 AND p.price > 50
    `;
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - WHERE 子句别名引用验证通过`);
  });

  // 测试 9: WHERE 子句中引用不存在的字段（应该失败）
  await runTest('测试 9: WHERE 子句中引用不存在的字段', async () => {
    const sql = `
      SELECT o.order_id
      FROM orders o
      WHERE o.non_existent > 100
    `;
    const result = await validator.validate(sql, context);

    if (result.isValid) {
      throw new Error('应该检测到字段不存在');
    }

    const semanticError = result.errors.find(e =>
      e.type === 'semantic' && e.message.includes('non_existent')
    );
    if (!semanticError) {
      throw new Error('应该有字段不存在的语义错误');
    }

    console.log(`  - 成功检测到: ${semanticError.message}`);
  });

  // 测试 10: 自连接使用不同别名（应该通过）
  await runTest('测试 10: 自连接使用不同别名', async () => {
    const sql = `
      SELECT o1.order_id, o2.order_id
      FROM orders o1
      INNER JOIN orders o2 ON o1.customer_id = o2.customer_id
      WHERE o1.order_id < o2.order_id
    `;
    const result = await validator.validate(sql, context);

    if (!result.isValid) {
      throw new Error(`验证失败: ${result.errors.map(e => e.message).join(', ')}`);
    }

    console.log(`  - 自连接验证通过`);
  });

  console.log('\n所有进阶测试通过! ✓');
}

// 运行测试
main().catch(error => {
  console.error('\n测试失败:', error);
  process.exit(1);
});
