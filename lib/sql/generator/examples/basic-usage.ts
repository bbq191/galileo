/**
 * SQL 生成器基本使用示例
 */

import { SQLGenerator } from '../sql-generator';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

/**
 * 示例 1: 简单查询
 */
async function exampleSimpleQuery() {
  console.log('=== 示例 1: 简单查询 ===\n');

  const generator = new SQLGenerator();

  const intent: QueryIntent = {
    type: 'select',
    entities: {
      tables: ['users']
    },
    conditions: {
      limit: 10
    }
  };

  const context: MetadataContext = {
    tables: [{
      id: 1,
      databaseName: 'test_db',
      tableName: 'users',
      tableComment: '用户表',
      semanticDescription: '存储系统用户信息',
      columns: [
        {
          id: 1,
          columnName: 'id',
          dataType: 'INT',
          columnComment: '用户ID',
          semanticDescription: '用户唯一标识符',
          isPrimaryKey: true,
          isNullable: false,
          sampleValues: [1, 2, 3, 4, 5]
        },
        {
          id: 2,
          columnName: 'username',
          dataType: 'VARCHAR(50)',
          columnComment: '用户名',
          semanticDescription: '用户登录名',
          isPrimaryKey: false,
          isNullable: false,
          sampleValues: ['alice', 'bob', 'charlie']
        },
        {
          id: 3,
          columnName: 'email',
          dataType: 'VARCHAR(100)',
          columnComment: '邮箱',
          semanticDescription: '用户邮箱地址',
          isPrimaryKey: false,
          isNullable: false,
          sampleValues: ['alice@example.com', 'bob@example.com']
        },
        {
          id: 4,
          columnName: 'created_at',
          dataType: 'DATETIME',
          columnComment: '创建时间',
          semanticDescription: '账户创建时间',
          isPrimaryKey: false,
          isNullable: false,
          sampleValues: ['2025-01-01 10:00:00', '2025-01-02 11:30:00']
        }
      ],
      primaryKeys: ['id'],
      indexes: []
    }],
    relationships: [],
    columns: [],
    estimatedComplexity: 'low'
  };

  try {
    const result = await generator.generate(intent, context);

    console.log('生成的 SQL:');
    console.log(result.sql);
    console.log('\n说明:', result.explanation);
    console.log('置信度:', result.confidence);
    console.log('使用的表:', result.usedTables);
    console.log('使用的字段:', result.usedColumns);
    if (result.warnings && result.warnings.length > 0) {
      console.log('警告:', result.warnings);
    }
  } catch (error) {
    console.error('SQL 生成失败:', error);
  }
}

/**
 * 示例 2: 聚合查询
 */
async function exampleAggregateQuery() {
  console.log('\n=== 示例 2: 聚合查询 ===\n');

  const generator = new SQLGenerator();

  const intent: QueryIntent = {
    type: 'aggregate',
    entities: {
      tables: ['orders']
    },
    aggregations: {
      function: 'SUM',
      column: 'amount',
      groupBy: ['product_id']
    },
    conditions: {
      timeRange: {
        relative: '最近一个月'
      },
      orderBy: {
        column: 'total',
        direction: 'DESC'
      },
      limit: 10
    }
  };

  const context: MetadataContext = {
    tables: [{
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
          semanticDescription: '订单唯一标识',
          isPrimaryKey: true,
          isNullable: false,
          sampleValues: [1001, 1002, 1003]
        },
        {
          id: 2,
          columnName: 'product_id',
          dataType: 'INT',
          columnComment: '产品ID',
          semanticDescription: '关联的产品',
          isPrimaryKey: false,
          isNullable: false,
          sampleValues: [101, 102, 103]
        },
        {
          id: 3,
          columnName: 'amount',
          dataType: 'DECIMAL(10,2)',
          columnComment: '订单金额',
          semanticDescription: '订单总金额（元）',
          isPrimaryKey: false,
          isNullable: false,
          sampleValues: [299.00, 1588.00, 89.90]
        },
        {
          id: 4,
          columnName: 'order_date',
          dataType: 'DATETIME',
          columnComment: '订单日期',
          semanticDescription: '订单创建时间',
          isPrimaryKey: false,
          isNullable: false,
          sampleValues: ['2025-01-15 10:30:00', '2025-01-16 14:20:00']
        }
      ],
      primaryKeys: ['order_id'],
      indexes: ['product_id', 'order_date']
    }],
    relationships: [],
    columns: [],
    estimatedComplexity: 'medium'
  };

  try {
    const result = await generator.generate(intent, context);

    console.log('生成的 SQL:');
    console.log(result.sql);
    console.log('\n说明:', result.explanation);
    console.log('置信度:', result.confidence);
  } catch (error) {
    console.error('SQL 生成失败:', error);
  }
}

/**
 * 示例 3: 跨库 JOIN 查询
 */
async function exampleCrossDatabaseQuery() {
  console.log('\n=== 示例 3: 跨库 JOIN 查询 ===\n');

  const generator = new SQLGenerator();

  const intent: QueryIntent = {
    type: 'select',
    entities: {
      tables: ['orders', 'products']
    },
    joins: {
      type: 'inner',
      tables: ['orders', 'products']
    },
    conditions: {
      timeRange: {
        relative: '最近一周'
      },
      limit: 20
    }
  };

  const context: MetadataContext = {
    tables: [
      {
        id: 1,
        databaseName: 'sales_db',
        tableName: 'orders',
        tableComment: '订单表',
        semanticDescription: '存储订单信息',
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
            columnName: 'quantity',
            dataType: 'INT',
            columnComment: '数量',
            isPrimaryKey: false,
            isNullable: false
          },
          {
            id: 4,
            columnName: 'order_date',
            dataType: 'DATETIME',
            isPrimaryKey: false,
            isNullable: false
          }
        ],
        primaryKeys: ['order_id'],
        indexes: []
      },
      {
        id: 2,
        databaseName: 'product_db',
        tableName: 'products',
        tableComment: '产品表',
        semanticDescription: '存储产品信息',
        columns: [
          {
            id: 1,
            columnName: 'id',
            dataType: 'INT',
            isPrimaryKey: true,
            isNullable: false
          },
          {
            id: 2,
            columnName: 'product_name',
            dataType: 'VARCHAR(100)',
            columnComment: '产品名称',
            isPrimaryKey: false,
            isNullable: false
          },
          {
            id: 3,
            columnName: 'category',
            dataType: 'VARCHAR(50)',
            columnComment: '产品分类',
            isPrimaryKey: false,
            isNullable: false
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
      }
    ],
    columns: [],
    estimatedComplexity: 'high'
  };

  try {
    const result = await generator.generate(intent, context);

    console.log('生成的 SQL:');
    console.log(result.sql);
    console.log('\n说明:', result.explanation);
    console.log('置信度:', result.confidence);
    if (result.warnings && result.warnings.length > 0) {
      console.log('\n警告:');
      result.warnings.forEach(w => console.log('  -', w));
    }
  } catch (error) {
    console.error('SQL 生成失败:', error);
  }
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  await exampleSimpleQuery();
  await exampleAggregateQuery();
  await exampleCrossDatabaseQuery();
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  exampleSimpleQuery,
  exampleAggregateQuery,
  exampleCrossDatabaseQuery,
  runAllExamples
};
