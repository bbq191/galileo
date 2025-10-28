/**
 * 跨库查询处理器使用示例
 */

import { CrossDatabaseHandler } from '../cross-db-handler';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

/**
 * 示例 1: 简单的跨库查询
 * 场景: 查询订单和产品信息（订单在 sales_db，产品在 product_db）
 */
async function example1_SimpleCrossDbQuery() {
  console.log('=== 示例 1: 简单的跨库查询 ===\n');

  const handler = new CrossDatabaseHandler();

  // 模拟用户意图
  const intent: QueryIntent = {
    type: 'select',
    entities: {
      tables: ['orders', 'products']
    },
    conditions: {
      limit: 10
    },
    joins: {
      type: 'inner',
      tables: ['orders', 'products']
    }
  };

  // 模拟元数据上下文
  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'sales_db',
        tableName: 'orders',
        tableComment: '订单表',
        columns: [
          {
            id: 1,
            columnName: 'order_id',
            dataType: 'INT',
            columnComment: '订单ID',
            isPrimaryKey: true,
            isNullable: false
          },
          {
            id: 2,
            columnName: 'product_id',
            dataType: 'INT',
            columnComment: '产品ID',
            isPrimaryKey: false,
            isNullable: false
          },
          {
            id: 3,
            columnName: 'order_date',
            dataType: 'DATETIME',
            columnComment: '订单日期',
            isPrimaryKey: false,
            isNullable: false
          },
          {
            id: 4,
            columnName: 'amount',
            dataType: 'DECIMAL(10,2)',
            columnComment: '订单金额',
            isPrimaryKey: false,
            isNullable: false
          }
        ],
        primaryKeys: ['order_id'],
        indexes: ['product_id']
      },
      {
        id: 2,
        databaseName: 'product_db',
        tableName: 'products',
        tableComment: '产品表',
        columns: [
          {
            id: 5,
            columnName: 'id',
            dataType: 'INT',
            columnComment: '产品ID',
            isPrimaryKey: true,
            isNullable: false
          },
          {
            id: 6,
            columnName: 'product_name',
            dataType: 'VARCHAR(200)',
            columnComment: '产品名称',
            isPrimaryKey: false,
            isNullable: false
          },
          {
            id: 7,
            columnName: 'category_id',
            dataType: 'INT',
            columnComment: '分类ID',
            isPrimaryKey: false,
            isNullable: false
          }
        ],
        primaryKeys: ['id'],
        indexes: ['category_id']
      }
    ],
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
    columns: [],
    estimatedComplexity: 'medium'
  };

  // 分析跨库查询
  const analysis = handler.analyzeCrossDatabaseQuery(intent, context);

  console.log('跨库查询分析结果:');
  console.log('- 是否跨库:', analysis.isCrossDatabase);
  console.log('- 涉及数据库:', analysis.databases.join(', '));
  console.log('- 跨库 JOIN 数量:', analysis.crossDbJoinCount);
  console.log('- 查询复杂度:', analysis.complexity);
  console.log('\n优化建议:');
  analysis.optimizationSuggestions.forEach((suggestion, index) => {
    console.log(`  ${index + 1}. ${suggestion}`);
  });

  // 生成执行计划
  console.log('\n' + handler.generateExecutionPlan(analysis));

  // 增强 Prompt
  const basePrompt = '请生成 SQL 查询';
  const enhancedPrompt = handler.enhancePromptForCrossDb(basePrompt, analysis);
  console.log('\n增强后的 Prompt 长度:', enhancedPrompt.length, '字符');
}

/**
 * 示例 2: 复杂的多库多表查询
 * 场景: 查询订单、产品、用户、分类信息（涉及 4 个库）
 */
async function example2_ComplexCrossDbQuery() {
  console.log('\n\n=== 示例 2: 复杂的多库多表查询 ===\n');

  const handler = new CrossDatabaseHandler();

  const intent: QueryIntent = {
    type: 'aggregate',
    entities: {
      tables: ['orders', 'products', 'users', 'categories']
    },
    conditions: {
      timeRange: {
        relative: 'last_30_days'
      },
      limit: 20
    },
    aggregations: {
      function: 'SUM',
      column: 'amount',
      groupBy: ['category_name']
    }
  };

  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'sales_db',
        tableName: 'orders',
        rowCount: 250000, // 大表
        columns: [],
        primaryKeys: ['order_id'],
        indexes: ['user_id', 'product_id']
      },
      {
        id: 2,
        databaseName: 'product_db',
        tableName: 'products',
        rowCount: 5000,
        columns: [],
        primaryKeys: ['id'],
        indexes: ['category_id']
      },
      {
        id: 3,
        databaseName: 'user_db',
        tableName: 'users',
        rowCount: 100000,
        columns: [],
        primaryKeys: ['id'],
        indexes: []
      },
      {
        id: 4,
        databaseName: 'product_db',
        tableName: 'categories',
        rowCount: 50,
        columns: [],
        primaryKeys: ['id'],
        indexes: []
      }
    ],
    relationships: [
      {
        sourceTable: 'orders',
        sourceColumn: 'product_id',
        targetTable: 'products',
        targetColumn: 'id',
        type: 'explicit'
      },
      {
        sourceTable: 'orders',
        sourceColumn: 'user_id',
        targetTable: 'users',
        targetColumn: 'id',
        type: 'explicit'
      },
      {
        sourceTable: 'products',
        sourceColumn: 'category_id',
        targetTable: 'categories',
        targetColumn: 'id',
        type: 'explicit'
      }
    ],
    columns: [],
    estimatedComplexity: 'high'
  };

  const analysis = handler.analyzeCrossDatabaseQuery(intent, context);

  console.log('复杂跨库查询分析:');
  console.log('- 涉及数据库:', analysis.databases.join(', '));
  console.log('- 跨库 JOIN 数量:', analysis.crossDbJoinCount);
  console.log('- 查询复杂度:', analysis.complexity);

  console.log('\n跨库 JOIN 详情:');
  analysis.crossDbJoins.forEach((join, index) => {
    console.log(`  ${index + 1}. ${join.sourceTable.database}.${join.sourceTable.table} → ${join.targetTable.database}.${join.targetTable.table}`);
    console.log(`     条件: ${join.joinCondition.sourceColumn} = ${join.joinCondition.targetColumn}`);
    console.log(`     类型: ${join.relationshipType}`);
  });

  console.log('\n优化建议:');
  analysis.optimizationSuggestions.forEach((suggestion, index) => {
    console.log(`  ${index + 1}. ${suggestion}`);
  });
}

/**
 * 示例 3: SQL 验证
 * 场景: 验证生成的跨库 SQL 是否符合规范
 */
async function example3_ValidateCrossDbSQL() {
  console.log('\n\n=== 示例 3: SQL 验证 ===\n');

  const handler = new CrossDatabaseHandler();

  const analysis = {
    isCrossDatabase: true,
    databases: ['sales_db', 'product_db'],
    crossDbJoinCount: 1,
    crossDbJoins: [],
    complexity: 'medium' as const,
    optimizationSuggestions: ['使用索引优化查询']
  };

  // 测试正确的跨库 SQL
  const validSQL = `
    SELECT
      o.order_id,
      o.order_date,
      p.product_name,
      o.amount
    FROM \`sales_db\`.\`orders\` o
    INNER JOIN \`product_db\`.\`products\` p
      ON o.product_id = p.id
    WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    ORDER BY o.order_date DESC
    LIMIT 100
  `;

  console.log('验证正确的跨库 SQL:');
  const result1 = handler.validateCrossDbSQL(validSQL, analysis);
  console.log('- 是否有效:', result1.isValid);
  console.log('- 错误数量:', result1.errors.length);
  console.log('- 警告数量:', result1.warnings.length);

  // 测试错误的跨库 SQL（缺少数据库前缀）
  const invalidSQL = `
    SELECT
      o.order_id,
      p.product_name
    FROM orders o
    INNER JOIN products p
      ON o.product_id = p.id
  `;

  console.log('\n验证错误的跨库 SQL（缺少数据库前缀）:');
  const result2 = handler.validateCrossDbSQL(invalidSQL, analysis);
  console.log('- 是否有效:', result2.isValid);
  console.log('- 错误:');
  result2.errors.forEach((error, index) => {
    console.log(`  ${index + 1}. ${error}`);
  });
}

/**
 * 示例 4: 包含推断关系的跨库查询
 * 场景: 处理基于 AI 推断的表关系
 */
async function example4_InferredRelationships() {
  console.log('\n\n=== 示例 4: 包含推断关系的跨库查询 ===\n');

  const handler = new CrossDatabaseHandler();

  const intent: QueryIntent = {
    type: 'select',
    entities: {
      tables: ['orders', 'inventory']
    },
    conditions: {}
  };

  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'sales_db',
        tableName: 'orders',
        columns: [],
        primaryKeys: ['order_id'],
        indexes: []
      },
      {
        id: 2,
        databaseName: 'inventory_db',
        tableName: 'inventory',
        columns: [],
        primaryKeys: ['id'],
        indexes: []
      }
    ],
    relationships: [
      {
        sourceTable: 'orders',
        sourceColumn: 'product_id',
        targetTable: 'inventory',
        targetColumn: 'product_id',
        type: 'inferred',
        confidence: 0.78 // AI 推断的关系
      }
    ],
    columns: [],
    estimatedComplexity: 'medium'
  };

  const analysis = handler.analyzeCrossDatabaseQuery(intent, context);

  console.log('推断关系分析:');
  console.log('- 跨库 JOIN 数量:', analysis.crossDbJoinCount);

  analysis.crossDbJoins.forEach((join, index) => {
    console.log(`\n跨库 JOIN ${index + 1}:`);
    console.log('  关系类型:', join.relationshipType);
    console.log('  置信度:', join.confidence);
    console.log('  建议: 请验证此关系的准确性');
  });

  console.log('\n优化建议:');
  analysis.optimizationSuggestions.forEach((suggestion, index) => {
    console.log(`  ${index + 1}. ${suggestion}`);
  });
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  try {
    await example1_SimpleCrossDbQuery();
    await example2_ComplexCrossDbQuery();
    await example3_ValidateCrossDbSQL();
    await example4_InferredRelationships();

    console.log('\n\n=== 所有示例执行完成 ===');
  } catch (error) {
    console.error('示例执行失败:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples();
}

export {
  example1_SimpleCrossDbQuery,
  example2_ComplexCrossDbQuery,
  example3_ValidateCrossDbSQL,
  example4_InferredRelationships
};
