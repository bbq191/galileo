/**
 * SQL 生成器单元测试
 */

import { SQLGenerator } from '../sql-generator';
import { QueryIntent } from '@/lib/nlp/types';
import { MetadataContext } from '@/lib/metadata/retrieval/types';

// Mock DeepseekClient
jest.mock('@/lib/ai/deepseek-client', () => {
  return {
    DeepseekClient: jest.fn().mockImplementation(() => {
      return {
        chat: jest.fn().mockResolvedValue(JSON.stringify({
          sql: 'SELECT * FROM `test_db`.`users` LIMIT 10',
          explanation: '查询用户表的前10条记录',
          confidence: 0.95,
          usedTables: ['test_db.users'],
          usedColumns: ['*'],
          warnings: []
        }))
      };
    })
  };
});

describe('SQLGenerator', () => {
  let generator: SQLGenerator;

  beforeEach(() => {
    generator = new SQLGenerator();
  });

  describe('generate', () => {
    it('应该成功生成简单的 SELECT 查询', async () => {
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
          semanticDescription: '存储用户信息',
          columns: [
            {
              id: 1,
              columnName: 'id',
              dataType: 'INT',
              columnComment: '用户ID',
              semanticDescription: '用户唯一标识',
              isPrimaryKey: true,
              isNullable: false,
              sampleValues: [1, 2, 3]
            },
            {
              id: 2,
              columnName: 'name',
              dataType: 'VARCHAR',
              columnComment: '用户名',
              semanticDescription: '用户姓名',
              isPrimaryKey: false,
              isNullable: false,
              sampleValues: ['张三', '李四', '王五']
            }
          ],
          primaryKeys: ['id'],
          indexes: []
        }],
        relationships: [],
        columns: [],
        estimatedComplexity: 'low'
      };

      const result = await generator.generate(intent, context);

      expect(result).toBeDefined();
      expect(result.sql).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.usedTables).toContain('test_db.users');
    });

    it('应该处理聚合查询', async () => {
      const intent: QueryIntent = {
        type: 'aggregate',
        entities: {
          tables: ['orders']
        },
        conditions: {
          limit: 10
        },
        aggregations: {
          function: 'SUM',
          column: 'amount',
          groupBy: ['product_id']
        }
      };

      const context: MetadataContext = {
        tables: [{
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
              columnComment: '订单ID',
              semanticDescription: '订单唯一标识',
              isPrimaryKey: true,
              isNullable: false,
              sampleValues: [1, 2, 3]
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
              dataType: 'DECIMAL',
              columnComment: '订单金额',
              semanticDescription: '订单总金额',
              isPrimaryKey: false,
              isNullable: false,
              sampleValues: [299.00, 1588.00, 89.90]
            }
          ],
          primaryKeys: ['order_id'],
          indexes: []
        }],
        relationships: [],
        columns: [],
        estimatedComplexity: 'low'
      };

      // Mock AI 返回聚合查询
      const mockChat = jest.fn().mockResolvedValue(JSON.stringify({
        sql: 'SELECT product_id, SUM(amount) as total FROM `sales_db`.`orders` GROUP BY product_id LIMIT 10',
        explanation: '统计每个产品的销售总额',
        confidence: 0.92,
        usedTables: ['sales_db.orders'],
        usedColumns: ['product_id', 'amount'],
        warnings: []
      }));
      (generator as any).aiClient.chat = mockChat;

      const result = await generator.generate(intent, context);

      expect(result).toBeDefined();
      expect(result.sql).toContain('SUM');
      expect(result.sql).toContain('GROUP BY');
    });
  });

  describe('describeIntent', () => {
    it('应该正确描述 SELECT 意图', () => {
      const intent: QueryIntent = {
        type: 'select',
        entities: {
          tables: ['users', 'orders']
        },
        conditions: {}
      };

      const description = (generator as any).describeIntent(intent);

      expect(description).toContain('查询明细数据');
      expect(description).toContain('users');
      expect(description).toContain('orders');
    });

    it('应该正确描述 AGGREGATE 意图', () => {
      const intent: QueryIntent = {
        type: 'aggregate',
        entities: {
          tables: ['orders']
        },
        conditions: {},
        aggregations: {
          function: 'COUNT',
          column: '*'
        }
      };

      const description = (generator as any).describeIntent(intent);

      expect(description).toContain('统计聚合');
      expect(description).toContain('COUNT');
    });
  });

  describe('describeConditions', () => {
    it('应该正确描述查询条件', () => {
      const conditions = {
        timeRange: {
          relative: '最近一个月'
        },
        orderBy: {
          column: 'amount',
          direction: 'DESC'
        },
        limit: 10
      };

      const description = (generator as any).describeConditions(conditions);

      expect(description).toContain('时间范围');
      expect(description).toContain('最近一个月');
      expect(description).toContain('排序');
      expect(description).toContain('amount');
      expect(description).toContain('DESC');
      expect(description).toContain('限制');
      expect(description).toContain('10');
    });

    it('应该处理空条件', () => {
      const description = (generator as any).describeConditions(null);
      expect(description).toBe('无特殊条件');
    });
  });

  describe('formatSQL', () => {
    it('应该格式化有效的 SQL', () => {
      const sql = 'select * from users where id=1';
      const formatted = (generator as any).formatSQL(sql);

      expect(formatted).toBeTruthy();
      // node-sql-parser 会将 SQL 格式化为大写
      expect(formatted.toLowerCase()).toContain('select');
      expect(formatted.toLowerCase()).toContain('from');
    });

    it('应该返回原始 SQL 如果格式化失败', () => {
      const invalidSql = 'INVALID SQL SYNTAX';
      const formatted = (generator as any).formatSQL(invalidSql);

      expect(formatted).toBe(invalidSql);
    });
  });

  describe('validateSQLStructure', () => {
    it('应该验证有效的 SELECT 查询', () => {
      const sql = 'SELECT * FROM users';
      expect(() => {
        (generator as any).validateSQLStructure(sql);
      }).not.toThrow();
    });

    it('应该拒绝非 SELECT 查询', () => {
      const sql = 'DELETE FROM users WHERE id = 1';
      expect(() => {
        (generator as any).validateSQLStructure(sql);
      }).toThrow('不允许的 SQL 类型');
    });

    it('应该拒绝无效的 SQL 语法', () => {
      const sql = 'INVALID SQL';
      expect(() => {
        (generator as any).validateSQLStructure(sql);
      }).toThrow('SQL 结构验证失败');
    });
  });

  describe('parseAIResponse', () => {
    it('应该解析有效的 JSON 响应', () => {
      const response = JSON.stringify({
        sql: 'SELECT * FROM users',
        explanation: '查询所有用户',
        confidence: 0.95,
        usedTables: ['users'],
        usedColumns: ['*']
      });

      const result = (generator as any).parseAIResponse(response);

      expect(result.sql).toBe('SELECT * FROM users');
      expect(result.explanation).toBe('查询所有用户');
      expect(result.confidence).toBe(0.95);
    });

    it('应该处理 JSON 前后有额外文本的情况', () => {
      const response = `
        这是一个查询：
        ${JSON.stringify({
          sql: 'SELECT * FROM users',
          explanation: '查询所有用户'
        })}
        结束
      `;

      const result = (generator as any).parseAIResponse(response);
      expect(result.sql).toBe('SELECT * FROM users');
    });

    it('应该在缺少 sql 字段时抛出错误', () => {
      const response = JSON.stringify({
        explanation: '查询所有用户'
      });

      expect(() => {
        (generator as any).parseAIResponse(response);
      }).toThrow('AI 响应缺少 sql 字段');
    });

    it('应该在无效 JSON 时抛出错误', () => {
      const response = 'NOT A JSON';

      expect(() => {
        (generator as any).parseAIResponse(response);
      }).toThrow('AI 响应中未找到有效的 JSON 格式');
    });
  });
});
