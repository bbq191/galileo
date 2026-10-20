/**
 * 分表组展开与 Prompt
 */
import 'reflect-metadata';
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { expandShardGroups } from '@/lib/metadata/shard/shard-expander';
import { renderShardGroupNote } from '@/lib/sql/generator/prompts/shard-prompt';
import { SQLGenerator } from '@/lib/sql/generator/sql-generator';

const columns = [{ columnName: 'id', dataType: 'int', isPrimaryKey: true }, { columnName: 'amount', dataType: 'decimal' }];

function table(id: number, tableName: string): any {
  return { id, databaseName: 'shop', tableName, columns, primaryKeys: ['id'], indexes: [], database: { id: 1, databaseName: 'shop', sourceId: 1 } };
}

function contextOf(...tables: any[]): any {
  return { tables, relationships: [], columns: tables.flatMap((t) => t.columns), estimatedComplexity: 'low' };
}

/** order_0 ~ order_{n-1} 组成分表组 7；users 不属于任何分表组 */
function fakePrisma(shardCount: number) {
  const members = Array.from({ length: shardCount }, (_, i) => ({ id: 100 + i, tableName: `order_${i}`, rowCount: BigInt(i * 10) }));
  return {
    members,
    prisma: {
      tableMeta: {
        findMany: jest.fn(async (args: any) => {
          if (args.where.id) {
            return args.where.id.in
              .filter((id: number) => id >= 100)
              .map((id: number) => ({ id, shardGroupId: 7, shardGroup: { id: 7, groupName: 'order', baseTablePattern: 'order_*' } }));
          }
          return members;
        }),
      },
    },
  };
}

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('expandShardGroups', () => {
  it('命中分表时加入同组全部分表：代表表携带清单，成员复用结构并标记 shardOf', async () => {
    const { prisma } = fakePrisma(4);

    const expanded = await expandShardGroups(prisma as any, contextOf(table(102, 'order_2'), table(1, 'users')));

    expect(expanded.tables.map((t) => t.tableName)).toEqual(['order_2', 'users', 'order_0', 'order_1', 'order_3']);
    const [representative] = expanded.tables;
    expect(representative.shardGroup).toEqual({
      id: 7,
      groupName: 'order',
      baseTablePattern: 'order_*',
      tableNames: ['order_0', 'order_1', 'order_2', 'order_3'],
    });
    const member = expanded.tables.find((t) => t.tableName === 'order_3')!;
    expect(member).toMatchObject({ id: 103, shardOf: 'order_2', rowCount: 30, columns });
    expect(member.shardGroup).toBeUndefined();
    // 扁平字段列表不因成员表重复
    expect(expanded.columns).toHaveLength(4);
  });

  it('检索时命中同组多张分表：只保留一个代表，其余作为成员', async () => {
    const { prisma } = fakePrisma(3);

    const expanded = await expandShardGroups(prisma as any, contextOf(table(100, 'order_0'), table(101, 'order_1')));

    expect(expanded.tables).toHaveLength(3);
    expect(expanded.tables.filter((t) => t.shardGroup)).toHaveLength(1);
    expect(expanded.tables.find((t) => t.tableName === 'order_1')!.shardOf).toBe('order_0');
  });

  it('超过展开上限：不展开，给出提示', async () => {
    process.env.SHARD_EXPAND_LIMIT = '3';
    const { prisma } = fakePrisma(5);

    const expanded = await expandShardGroups(prisma as any, contextOf(table(100, 'order_0')));

    expect(expanded.tables.map((t) => t.tableName)).toEqual(['order_0']);
    expect(expanded.tables[0].shardGroup).toBeUndefined();
    expect(expanded.warnings![0]).toContain('共 5 张分表，超过展开上限 3');
  });

  it('没有分表组时原样返回', async () => {
    const { prisma } = fakePrisma(0);
    const context = contextOf(table(1, 'users'));

    expect(await expandShardGroups(prisma as any, context)).toBe(context);
  });
});

describe('分表 Prompt', () => {
  it('列出全部分表并要求 UNION ALL', () => {
    const note = renderShardGroupNote({
      ...table(100, 'order_0'),
      shardGroup: { id: 7, groupName: 'order', baseTablePattern: 'order_*', tableNames: ['order_0', 'order_1'] },
    });

    expect(note).toContain('共 2 张结构相同的分表');
    expect(note).toContain('`shop`.`order_0`、`shop`.`order_1`');
    expect(note).toContain('UNION ALL');
  });

  it('SQLGenerator 只描述代表表一次，成员表不单独展开', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const aiClient = {
      chat: jest.fn(async (..._args: any[]) =>
        JSON.stringify({ sql: 'SELECT COUNT(*) FROM `shop`.`order_0`', explanation: '', confidence: 1, usedTables: [], usedColumns: [] })
      ),
    };
    const generator = new SQLGenerator(
      aiClient as any,
      { analyzeCrossDatabaseQuery: () => ({ isCrossDatabase: false, databases: ['shop'], crossDbJoins: [] }) } as any,
      { getSQL: async () => null, setSQL: async () => undefined } as any
    );
    const { prisma } = fakePrisma(3);
    const context = await expandShardGroups(prisma as any, contextOf(table(100, 'order_0')));

    await generator.generate({ type: 'aggregate', entities: {}, conditions: {} } as any, context);

    const prompt = (aiClient.chat.mock.calls[0] as any[])[0][1].content as string;
    expect(prompt.match(/### 表: /g)).toHaveLength(1);
    expect(prompt).toContain('分表组 order');
    expect(prompt).toContain('`shop`.`order_2`');
  });
});
