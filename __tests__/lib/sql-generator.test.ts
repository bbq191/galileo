/**
 * SQLGenerator：Prompt 追加内容与 SQL 缓存变体
 */
import 'reflect-metadata';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import { buildSQLCacheVariant } from '@/lib/cache/sql-cache-variant';

const SQL = 'SELECT COUNT(*) FROM `live`.`tb_room`';

function contextFor(sourceId: number, databaseName = 'live'): any {
  return {
    tables: [
      {
        databaseName,
        tableName: 'tb_room',
        database: { databaseName, sourceId },
        columns: [{ columnName: 'id', dataType: 'int', isPrimaryKey: true }],
      },
    ],
    relationships: [],
    columns: [],
    estimatedComplexity: 'low',
  };
}

function createGenerator() {
  const aiClient = {
    chat: jest.fn(async (..._args: any[]) =>
      JSON.stringify({ sql: SQL, explanation: '统计', confidence: 0.9, usedTables: ['tb_room'], usedColumns: [] })
    ),
  };
  const crossDbHandler = {
    analyzeCrossDatabaseQuery: () => ({ isCrossDatabase: false, databases: ['live'], crossDbJoins: [] }),
  };
  const queryCacheManager = {
    getSQL: jest.fn(async (..._args: any[]): Promise<any> => null),
    setSQL: jest.fn(async (..._args: any[]) => undefined),
  };
  const generator = new SQLGenerator(aiClient as any, crossDbHandler as any, queryCacheManager as any);
  return { generator, aiClient, queryCacheManager };
}

const intent: any = { type: 'aggregate', entities: { tables: ['tb_room'] }, conditions: {} };

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('SQLGenerator', () => {
  it('promptAppendix 追加到发送给 AI 的 Prompt 末尾', async () => {
    const { generator, aiClient } = createGenerator();

    await generator.generate(intent, contextFor(1), { promptAppendix: '## 业务规则和约定\n- 测试规则' });

    const [messages] = aiClient.chat.mock.calls[0] as any[];
    expect(messages[1].content.endsWith('## 业务规则和约定\n- 测试规则')).toBe(true);
  });

  it('SQL 缓存读写使用包含上下文表与规则摘要的变体', async () => {
    const { generator, queryCacheManager } = createGenerator();
    const context = contextFor(1);

    await generator.generate(intent, context, { promptAppendixDigest: 'abc' });

    const variant = buildSQLCacheVariant(context, 'abc');
    expect(variant).toBe('1:live.tb_room|abc');
    expect(queryCacheManager.getSQL).toHaveBeenCalledWith(intent, variant);
    expect(queryCacheManager.setSQL).toHaveBeenCalledWith(intent, expect.objectContaining({ sql: SQL }), variant);
  });

  it('不同数据源的同名库表使用不同的缓存变体', () => {
    expect(buildSQLCacheVariant(contextFor(1))).not.toBe(buildSQLCacheVariant(contextFor(2)));
  });
});
