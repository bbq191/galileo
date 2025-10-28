/**
 * 跨库查询处理器单元测试
 */

import { CrossDatabaseHandler } from '../cross-db-handler';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext, TableContext, RelationshipContext } from '@/lib/metadata/retrieval/types';

describe('CrossDatabaseHandler', () => {
  let handler: CrossDatabaseHandler;

  beforeEach(() => {
    handler = new CrossDatabaseHandler();
  });

  describe('analyzeCrossDatabaseQuery', () => {
    it('应该识别单库查询', () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: { tables: ['users'] },
        conditions: {}
      };

      const context: MetadataContext = {
        tables: [
          {
            id: 1,
            databaseName: 'app_db',
            tableName: 'users',
            columns: [],
            primaryKeys: [],
            indexes: []
          }
        ],
        relationships: [],
        columns: [],
        estimatedComplexity: 'low'
      };

      const analysis = handler.analyzeCrossDatabaseQuery(intent, context);

      expect(analysis.isCrossDatabase).toBe(false);
      expect(analysis.databases).toEqual(['app_db']);
      expect(analysis.crossDbJoinCount).toBe(0);
      expect(analysis.complexity).toBe('low');
    });

    it('应该识别跨库查询', () => {
      const intent: QueryIntent = {
        type: 'aggregate',
        entities: { tables: ['orders', 'products'] },
        conditions: {},
        joins: {
          type: 'inner',
          tables: ['orders', 'products']
        }
      };

      const context: MetadataContext = {
        tables: [
          {
            id: 1,
            databaseName: 'sales_db',
            tableName: 'orders',
            columns: [
              {
                id: 1,
                columnName: 'product_id',
                dataType: 'INT',
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
            columns: [
              {
                id: 2,
                columnName: 'id',
                dataType: 'INT',
                isPrimaryKey: true,
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
        estimatedComplexity: 'medium'
      };

      const analysis = handler.analyzeCrossDatabaseQuery(intent, context);

      expect(analysis.isCrossDatabase).toBe(true);
      expect(analysis.databases).toEqual(['sales_db', 'product_db']);
      expect(analysis.crossDbJoinCount).toBe(1);
      expect(analysis.crossDbJoins).toHaveLength(1);
      expect(analysis.crossDbJoins[0]).toMatchObject({
        sourceTable: {
          database: 'sales_db',
          table: 'orders'
        },
        targetTable: {
          database: 'product_db',
          table: 'products'
        },
        relationshipType: 'explicit'
      });
    });

    it('应该正确评估复杂度 - 简单跨库查询', () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: { tables: ['orders', 'products'] },
        conditions: {}
      };

      const context: MetadataContext = {
        tables: [
          {
            id: 1,
            databaseName: 'sales_db',
            tableName: 'orders',
            columns: [],
            primaryKeys: [],
            indexes: []
          },
          {
            id: 2,
            databaseName: 'product_db',
            tableName: 'products',
            columns: [],
            primaryKeys: [],
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
          }
        ],
        columns: [],
        estimatedComplexity: 'medium'
      };

      const analysis = handler.analyzeCrossDatabaseQuery(intent, context);

      expect(analysis.complexity).toBe('medium');
    });

    it('应该正确评估复杂度 - 复杂跨库查询', () => {
      const intent: QueryIntent = {
        type: 'aggregate',
        entities: { tables: ['orders', 'products', 'users', 'categories', 'inventory'] },
        conditions: {}
      };

      const context: MetadataContext = {
        tables: [
          { id: 1, databaseName: 'sales_db', tableName: 'orders', columns: [], primaryKeys: [], indexes: [] },
          { id: 2, databaseName: 'product_db', tableName: 'products', columns: [], primaryKeys: [], indexes: [] },
          { id: 3, databaseName: 'user_db', tableName: 'users', columns: [], primaryKeys: [], indexes: [] },
          { id: 4, databaseName: 'product_db', tableName: 'categories', columns: [], primaryKeys: [], indexes: [] },
          { id: 5, databaseName: 'inventory_db', tableName: 'inventory', columns: [], primaryKeys: [], indexes: [] }
        ],
        relationships: [
          { sourceTable: 'orders', sourceColumn: 'product_id', targetTable: 'products', targetColumn: 'id', type: 'explicit' },
          { sourceTable: 'orders', sourceColumn: 'user_id', targetTable: 'users', targetColumn: 'id', type: 'explicit' },
          { sourceTable: 'products', sourceColumn: 'id', targetTable: 'inventory', targetColumn: 'product_id', type: 'inferred', confidence: 0.85 }
        ],
        columns: [],
        estimatedComplexity: 'high'
      };

      const analysis = handler.analyzeCrossDatabaseQuery(intent, context);

      expect(analysis.complexity).toBe('high');
      expect(analysis.crossDbJoinCount).toBeGreaterThan(0);
    });

    it('应该生成优化建议', () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: { tables: ['orders', 'products'] },
        conditions: {}
      };

      const context: MetadataContext = {
        tables: [
          {
            id: 1,
            databaseName: 'sales_db',
            tableName: 'orders',
            rowCount: 150000, // 大表
            columns: [],
            primaryKeys: [],
            indexes: []
          },
          {
            id: 2,
            databaseName: 'product_db',
            tableName: 'products',
            columns: [],
            primaryKeys: [],
            indexes: []
          }
        ],
        relationships: [
          {
            sourceTable: 'orders',
            sourceColumn: 'product_id',
            targetTable: 'products',
            targetColumn: 'id',
            type: 'inferred',
            confidence: 0.75
          }
        ],
        columns: [],
        estimatedComplexity: 'medium'
      };

      const analysis = handler.analyzeCrossDatabaseQuery(intent, context);

      expect(analysis.optimizationSuggestions.length).toBeGreaterThan(0);
      expect(analysis.optimizationSuggestions.some(s => s.includes('推断关系'))).toBe(true);
      expect(analysis.optimizationSuggestions.some(s => s.includes('大表'))).toBe(true);
    });
  });

  describe('enhancePromptForCrossDb', () => {
    it('对于单库查询不应修改 Prompt', () => {
      const basePrompt = '## 基础 Prompt';
      const analysis = {
        isCrossDatabase: false,
        databases: ['app_db'],
        crossDbJoinCount: 0,
        crossDbJoins: [],
        complexity: 'low' as const,
        optimizationSuggestions: []
      };

      const enhanced = handler.enhancePromptForCrossDb(basePrompt, analysis);

      expect(enhanced).toBe(basePrompt);
    });

    it('对于跨库查询应增强 Prompt', () => {
      const basePrompt = '## 基础 Prompt';
      const analysis = {
        isCrossDatabase: true,
        databases: ['sales_db', 'product_db'],
        crossDbJoinCount: 1,
        crossDbJoins: [
          {
            sourceTable: { database: 'sales_db', table: 'orders' },
            targetTable: { database: 'product_db', table: 'products' },
            joinType: 'inner' as const,
            joinCondition: { sourceColumn: 'product_id', targetColumn: 'id' },
            relationshipType: 'explicit' as const
          }
        ],
        complexity: 'medium' as const,
        optimizationSuggestions: ['跨库查询建议使用索引']
      };

      const enhanced = handler.enhancePromptForCrossDb(basePrompt, analysis);

      expect(enhanced).toContain('跨库查询特别注意事项');
      expect(enhanced).toContain('sales_db');
      expect(enhanced).toContain('product_db');
      expect(enhanced).toContain('示例（跨库查询）');
      expect(enhanced).toContain('跨库查询建议使用索引');
    });
  });

  describe('validateCrossDbSQL', () => {
    it('应该验证跨库 SQL 使用完整表名', () => {
      const sql = 'SELECT * FROM `sales_db`.`orders` o INNER JOIN `product_db`.`products` p ON o.product_id = p.id';
      const analysis = {
        isCrossDatabase: true,
        databases: ['sales_db', 'product_db'],
        crossDbJoinCount: 1,
        crossDbJoins: [],
        complexity: 'medium' as const,
        optimizationSuggestions: []
      };

      const result = handler.validateCrossDbSQL(sql, analysis);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少数据库前缀的错误', () => {
      const sql = 'SELECT * FROM orders o INNER JOIN products p ON o.product_id = p.id';
      const analysis = {
        isCrossDatabase: true,
        databases: ['sales_db', 'product_db'],
        crossDbJoinCount: 1,
        crossDbJoins: [],
        complexity: 'medium' as const,
        optimizationSuggestions: []
      };

      const result = handler.validateCrossDbSQL(sql, analysis);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('完整的表限定名');
    });

    it('应该为高复杂度查询生成警告', () => {
      const sql = 'SELECT * FROM `db1`.`t1` JOIN `db2`.`t2` ON t1.id = t2.id';
      const analysis = {
        isCrossDatabase: true,
        databases: ['db1', 'db2'],
        crossDbJoinCount: 1,
        crossDbJoins: [],
        complexity: 'high' as const,
        optimizationSuggestions: ['性能可能较差']
      };

      const result = handler.validateCrossDbSQL(sql, analysis);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('复杂度较高'))).toBe(true);
    });
  });

  describe('generateExecutionPlan', () => {
    it('应该生成详细的执行计划说明', () => {
      const analysis = {
        isCrossDatabase: true,
        databases: ['sales_db', 'product_db'],
        crossDbJoinCount: 1,
        crossDbJoins: [
          {
            sourceTable: { database: 'sales_db', table: 'orders' },
            targetTable: { database: 'product_db', table: 'products' },
            joinType: 'inner' as const,
            joinCondition: { sourceColumn: 'product_id', targetColumn: 'id' },
            relationshipType: 'explicit' as const
          }
        ],
        complexity: 'medium' as const,
        optimizationSuggestions: ['建议添加索引', '注意查询性能']
      };

      const plan = handler.generateExecutionPlan(analysis);

      expect(plan).toContain('跨库查询执行计划');
      expect(plan).toContain('涉及数据库: 2 个');
      expect(plan).toContain('sales_db');
      expect(plan).toContain('product_db');
      expect(plan).toContain('跨库 JOIN: 1 个');
      expect(plan).toContain('复杂度: MEDIUM');
      expect(plan).toContain('优化建议');
      expect(plan).toContain('建议添加索引');
    });
  });
});
