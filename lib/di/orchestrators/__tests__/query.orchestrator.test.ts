/**
 * QueryOrchestrator 单元测试
 */

import 'reflect-metadata';
import { QueryOrchestrator } from '../query.orchestrator';
import type { IntentRecognizer, QueryIntent } from '@/lib/nlp/intent-recognizer';
import type { EntityResolver } from '@/lib/nlp/entity-resolver';
import type { TimeParser } from '@/lib/nlp/time-parser';
import type { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import type { CrossDatabaseHandler } from '@/lib/sql/generator/cross-db-handler';
import type { QueryExecutor } from '@/lib/sql/executor/query-executor';
import type { ResultFormatter } from '@/lib/sql/executor/result-formatter';
import type { QueryCacheManager } from '@/lib/cache/query-cache-manager';
import type { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';

describe('QueryOrchestrator', () => {
  let orchestrator: QueryOrchestrator;
  let mockIntentRecognizer: jest.Mocked<IntentRecognizer>;
  let mockEntityResolver: jest.Mocked<EntityResolver>;
  let mockTimeParser: jest.Mocked<TimeParser>;
  let mockSQLGenerator: jest.Mocked<SQLGenerator>;
  let mockCrossDbHandler: jest.Mocked<CrossDatabaseHandler>;
  let mockQueryExecutor: jest.Mocked<QueryExecutor>;
  let mockResultFormatter: jest.Mocked<ResultFormatter>;
  let mockCacheManager: jest.Mocked<QueryCacheManager>;
  let mockMetadataRetriever: jest.Mocked<MetadataRetriever>;

  beforeEach(() => {
    // 创建 mock 对象
    mockIntentRecognizer = {
      recognize: jest.fn(),
    } as any;

    mockEntityResolver = {
      resolve: jest.fn(),
    } as any;

    mockTimeParser = {
      parse: jest.fn(),
    } as any;

    mockSQLGenerator = {
      generate: jest.fn(),
    } as any;

    mockCrossDbHandler = {} as any;

    mockQueryExecutor = {
      execute: jest.fn(),
    } as any;

    mockResultFormatter = {} as any;

    mockCacheManager = {
      getResult: jest.fn(),
      setResult: jest.fn(),
    } as any;

    mockMetadataRetriever = {
      retrieveContext: jest.fn(),
    } as any;

    // 创建编排器实例
    orchestrator = new QueryOrchestrator(
      mockIntentRecognizer,
      mockEntityResolver,
      mockTimeParser,
      mockSQLGenerator,
      mockCrossDbHandler,
      mockQueryExecutor,
      mockResultFormatter,
      mockCacheManager,
      mockMetadataRetriever
    );
  });

  describe('processNaturalLanguageQuery', () => {
    it('应该成功处理自然语言查询', async () => {
      // 准备测试数据
      const query = '查询所有用户';
      const mockIntent: QueryIntent = {
        type: 'select',
        entities: ['users'],
        conditions: [],
      };
      const mockContext = {
        tables: [
          {
            tableName: 'users',
            databaseName: 'main',
            columns: [],
          },
        ],
        relationships: [],
        columns: [],
      };
      const mockSQLResult = {
        sql: 'SELECT * FROM users',
        explanation: '查询所有用户',
        usedColumns: ['*'],
      };
      const mockExecResult = {
        success: true,
        data: [{ id: 1, name: 'Test' }],
        rowCount: 1,
        executionTime: 100,
        metadata: {
          columns: [
            { name: 'id', type: 'int' },
            { name: 'name', type: 'varchar' },
          ],
        },
      };

      // 设置 mock 返回值
      mockCacheManager.getResult.mockResolvedValue(null); // 无缓存
      mockIntentRecognizer.recognize.mockResolvedValue(mockIntent);
      mockEntityResolver.resolve.mockResolvedValue(mockIntent.entities);
      mockMetadataRetriever.retrieveContext.mockResolvedValue(mockContext);
      mockSQLGenerator.generate.mockResolvedValue(mockSQLResult);
      mockQueryExecutor.execute.mockResolvedValue(mockExecResult);

      // 执行查询
      const result = await orchestrator.processNaturalLanguageQuery(query);

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockExecResult.data);
      expect(result.metadata?.generatedSQL).toBe(mockSQLResult.sql);
      expect(result.metadata?.rowCount).toBe(1);

      // 验证调用顺序
      expect(mockIntentRecognizer.recognize).toHaveBeenCalledWith(query);
      expect(mockMetadataRetriever.retrieveContext).toHaveBeenCalled();
      expect(mockSQLGenerator.generate).toHaveBeenCalledWith(mockIntent, mockContext);
      expect(mockQueryExecutor.execute).toHaveBeenCalled();
    });

    it('应该在找不到相关表时返回错误', async () => {
      const query = '查询不存在的表';
      const mockIntent: QueryIntent = {
        type: 'select',
        entities: [],
        conditions: [],
      };

      mockCacheManager.getResult.mockResolvedValue(null);
      mockIntentRecognizer.recognize.mockResolvedValue(mockIntent);
      mockEntityResolver.resolve.mockResolvedValue([]);
      mockMetadataRetriever.retrieveContext.mockResolvedValue({
        tables: [],
        relationships: [],
        columns: [],
      });

      const result = await orchestrator.processNaturalLanguageQuery(query);

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到相关的数据表');
    });

    it('应该使用缓存结果', async () => {
      const query = '查询所有用户';
      const cachedResult = {
        data: [{ id: 1, name: 'Cached' }],
        metadata: {
          generatedSQL: 'SELECT * FROM users',
          explanation: '查询所有用户',
          rowCount: 1,
          executionTime: 0,
          fromCache: true,
          columns: [],
        },
      };

      mockCacheManager.getResult.mockResolvedValue(cachedResult);

      const result = await orchestrator.processNaturalLanguageQuery(query, {
        enableCache: true,
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.fromCache).toBe(true);
      expect(mockIntentRecognizer.recognize).not.toHaveBeenCalled();
    });

    it('应该在 explainOnly 模式下只生成 SQL 不执行', async () => {
      const query = '查询所有用户';
      const mockIntent: QueryIntent = {
        type: 'select',
        entities: ['users'],
        conditions: [],
      };
      const mockContext = {
        tables: [{ tableName: 'users', databaseName: 'main', columns: [] }],
        relationships: [],
        columns: [],
      };
      const mockSQLResult = {
        sql: 'SELECT * FROM users',
        explanation: '查询所有用户',
        usedColumns: ['*'],
      };

      mockCacheManager.getResult.mockResolvedValue(null);
      mockIntentRecognizer.recognize.mockResolvedValue(mockIntent);
      mockEntityResolver.resolve.mockResolvedValue(mockIntent.entities);
      mockMetadataRetriever.retrieveContext.mockResolvedValue(mockContext);
      mockSQLGenerator.generate.mockResolvedValue(mockSQLResult);

      const result = await orchestrator.processNaturalLanguageQuery(query, {
        explainOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.generatedSQL).toBe(mockSQLResult.sql);
      expect(mockQueryExecutor.execute).not.toHaveBeenCalled();
    });

    it('应该处理查询执行失败', async () => {
      const query = '查询所有用户';
      const mockIntent: QueryIntent = {
        type: 'select',
        entities: ['users'],
        conditions: [],
      };
      const mockContext = {
        tables: [{ tableName: 'users', databaseName: 'main', columns: [] }],
        relationships: [],
        columns: [],
      };
      const mockSQLResult = {
        sql: 'SELECT * FROM users',
        explanation: '查询所有用户',
        usedColumns: ['*'],
      };

      mockCacheManager.getResult.mockResolvedValue(null);
      mockIntentRecognizer.recognize.mockResolvedValue(mockIntent);
      mockEntityResolver.resolve.mockResolvedValue(mockIntent.entities);
      mockMetadataRetriever.retrieveContext.mockResolvedValue(mockContext);
      mockSQLGenerator.generate.mockResolvedValue(mockSQLResult);
      mockQueryExecutor.execute.mockResolvedValue({
        success: false,
        error: 'Database connection failed',
        rowCount: 0,
        executionTime: 0,
        metadata: { columns: [] },
      });

      const result = await orchestrator.processNaturalLanguageQuery(query);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });
  });

  describe('executeSQL', () => {
    it('应该成功执行直接 SQL 查询', async () => {
      const sql = 'SELECT * FROM users';
      const connectionId = 'conn-1';
      const mockExecResult = {
        success: true,
        data: [{ id: 1, name: 'Test' }],
        rowCount: 1,
        executionTime: 50,
        metadata: {
          columns: [
            { name: 'id', type: 'int' },
            { name: 'name', type: 'varchar' },
          ],
        },
      };

      mockCacheManager.getResult.mockResolvedValue(null);
      mockQueryExecutor.execute.mockResolvedValue(mockExecResult);

      const result = await orchestrator.executeSQL(sql, connectionId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockExecResult.data);
      expect(result.metadata?.generatedSQL).toBe(sql);
    });

    it('应该使用缓存的 SQL 结果', async () => {
      const sql = 'SELECT * FROM users';
      const connectionId = 'conn-1';
      const cachedData = {
        data: [{ id: 1, name: 'Cached' }],
        columns: [{ name: 'id', type: 'int' }],
      };

      mockCacheManager.getResult.mockResolvedValue(cachedData);

      const result = await orchestrator.executeSQL(sql, connectionId, {
        enableCache: true,
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.fromCache).toBe(true);
      expect(mockQueryExecutor.execute).not.toHaveBeenCalled();
    });
  });

  describe('explainQuery', () => {
    it('应该返回查询意图解释', async () => {
      const query = '查询所有用户';
      const mockIntent: QueryIntent = {
        type: 'select',
        entities: ['users'],
        conditions: [],
      };
      const mockContext = {
        tables: [{ tableName: 'users', databaseName: 'main', columns: [] }],
        relationships: [],
        columns: [],
      };

      mockIntentRecognizer.recognize.mockResolvedValue(mockIntent);
      mockEntityResolver.resolve.mockResolvedValue(mockIntent.entities);
      mockMetadataRetriever.retrieveContext.mockResolvedValue(mockContext);

      const explanation = await orchestrator.explainQuery(query);

      expect(explanation.intent).toEqual(mockIntent);
      expect(explanation.context).toEqual(mockContext);
      expect(explanation.sqlPattern).toContain('SELECT');
      expect(explanation.suggestions).toBeDefined();
    });
  });
});
