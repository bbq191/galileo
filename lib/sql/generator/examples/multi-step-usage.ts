/**
 * 多步查询生成器使用示例
 */

import { MultiStepSQLGenerator } from '../multi-step-generator';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

/**
 * 示例1: 复杂的跨库聚合查询
 * 场景: 查询最近一个月销售额TOP10的产品，需要关联3个不同数据库的表
 */
async function example1_ComplexCrossDatabaseQuery() {
  console.log('=== 示例1: 复杂跨库聚合查询 ===\n');

  const generator = new MultiStepSQLGenerator();

  // 用户意图：查询最近一个月销售额TOP10的产品
  const intent: QueryIntent = {
    type: 'aggregate',
    entities: {
      databases: ['sales_db', 'product_db', 'category_db'],
      tables: ['orders', 'products', 'categories'],
      columns: ['product_name', 'category_name', 'total_amount']
    },
    conditions: {
      timeRange: {
        relative: 'last_30_days'
      },
      orderBy: {
        column: 'total_amount',
        direction: 'DESC'
      },
      limit: 10
    },
    aggregations: {
      function: 'SUM',
      column: 'amount',
      groupBy: ['product_name', 'category_name']
    }
  };

  // 元数据上下文
  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'sales_db',
        tableName: 'orders',
        tableComment: '订单表',
        semanticDescription: '存储所有订单信息',
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
            columnName: 'amount',
            dataType: 'DECIMAL(10,2)',
            columnComment: '订单金额',
            isPrimaryKey: false,
            isNullable: false,
            sampleValues: [299.00, 1588.00, 89.90]
          },
          {
            id: 4,
            columnName: 'order_date',
            dataType: 'DATETIME',
            columnComment: '订单日期',
            isPrimaryKey: false,
            isNullable: false,
            sampleValues: ['2025-01-15 10:30:00', '2025-01-16 14:20:00']
          }
        ],
        primaryKeys: ['order_id'],
        indexes: ['product_id', 'order_date']
      },
      {
        id: 2,
        databaseName: 'product_db',
        tableName: 'products',
        tableComment: '产品表',
        semanticDescription: '存储产品信息',
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
            isNullable: false,
            sampleValues: ['iPhone 15', '小米电视', '戴森吸尘器']
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
      },
      {
        id: 3,
        databaseName: 'category_db',
        tableName: 'categories',
        tableComment: '分类表',
        semanticDescription: '产品分类信息',
        columns: [
          {
            id: 8,
            columnName: 'id',
            dataType: 'INT',
            columnComment: '分类ID',
            isPrimaryKey: true,
            isNullable: false
          },
          {
            id: 9,
            columnName: 'category_name',
            dataType: 'VARCHAR(100)',
            columnComment: '分类名称',
            isPrimaryKey: false,
            isNullable: false,
            sampleValues: ['手机', '家电', '数码']
          }
        ],
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
        type: 'explicit',
        confidence: 1.0
      },
      {
        sourceTable: 'products',
        sourceColumn: 'category_id',
        targetTable: 'categories',
        targetColumn: 'id',
        type: 'explicit',
        confidence: 1.0
      }
    ],
    estimatedComplexity: 'high'  // 高复杂度：3个表，2个跨库JOIN
  };

  try {
    const result = await generator.generateComplex(intent, context);

    console.log('生成的 SQL:');
    console.log(result.sql);
    console.log('\n解释:', result.explanation);
    console.log('置信度:', result.confidence);
    console.log('使用的表:', result.usedTables.join(', '));
    console.log('使用的列:', result.usedColumns.join(', '));

    if (result.warnings && result.warnings.length > 0) {
      console.log('\n警告:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }

  } catch (error) {
    console.error('生成失败:', error);
  }
}

/**
 * 示例2: 多表关联统计查询
 * 场景: 统计每个用户在不同产品类别的消费情况
 */
async function example2_MultiTableStatistics() {
  console.log('\n=== 示例2: 多表关联统计查询 ===\n');

  const generator = new MultiStepSQLGenerator();

  const intent: QueryIntent = {
    type: 'statistics',
    entities: {
      tables: ['user_db.users', 'sales_db.orders', 'product_db.products', 'category_db.categories'],
      columns: ['user_name', 'category_name', 'order_count', 'total_spent']
    },
    conditions: {
      timeRange: {
        relative: 'last_90_days'
      }
    },
    aggregations: {
      function: 'COUNT',
      column: 'order_id',
      groupBy: ['user_name', 'category_name']
    }
  };

  const context: MetadataContext = {
    tables: [
      // ... 省略表定义（与示例1类似）
    ],
    relationships: [
      // ... 省略关系定义
    ],
    estimatedComplexity: 'high'
  };

  try {
    const result = await generator.generateComplex(intent, context);

    console.log('生成的多步 CTE SQL:');
    console.log(result.sql);
    console.log('\n步骤说明:');
    console.log(result.explanation);

  } catch (error) {
    console.error('生成失败:', error);
  }
}

/**
 * 示例3: 使用简单生成器处理低复杂度查询
 * 场景: 单表查询，不需要多步分解
 */
async function example3_SimpleQuery() {
  console.log('\n=== 示例3: 简单查询（自动降级） ===\n');

  const generator = new MultiStepSQLGenerator();

  const intent: QueryIntent = {
    type: 'select',
    entities: {
      tables: ['users'],
      columns: ['id', 'name', 'email']
    },
    conditions: {
      filters: [
        {
          column: 'status',
          operator: '=',
          value: 'active'
        }
      ],
      limit: 100
    }
  };

  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'user_db',
        tableName: 'users',
        tableComment: '用户表',
        columns: [
          { id: 1, columnName: 'id', dataType: 'INT', isPrimaryKey: true, isNullable: false },
          { id: 2, columnName: 'name', dataType: 'VARCHAR(100)', isPrimaryKey: false, isNullable: false },
          { id: 3, columnName: 'email', dataType: 'VARCHAR(255)', isPrimaryKey: false, isNullable: false },
          { id: 4, columnName: 'status', dataType: 'VARCHAR(20)', isPrimaryKey: false, isNullable: false }
        ],
        primaryKeys: ['id'],
        indexes: []
      }
    ],
    relationships: [],
    estimatedComplexity: 'low'  // 低复杂度：单表查询
  };

  try {
    const result = await generator.generateComplex(intent, context);

    console.log('自动使用简单生成器生成的 SQL:');
    console.log(result.sql);
    console.log('\n说明: 复杂度较低，自动使用简单生成器，无需多步分解');

  } catch (error) {
    console.error('生成失败:', error);
  }
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  await example1_ComplexCrossDatabaseQuery();
  await example2_MultiTableStatistics();
  await example3_SimpleQuery();
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}
