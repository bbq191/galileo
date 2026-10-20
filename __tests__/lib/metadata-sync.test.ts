/**
 * 增量元数据同步：结构哈希、跳过未变化的表、表注释与行数
 */
import 'reflect-metadata';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const collector = {
  collectDatabases: jest.fn(async (..._args: any[]): Promise<any[]> => []),
  collectTables: jest.fn<(...args: any[]) => Promise<any[]>>(),
  collectColumns: jest.fn<(...args: any[]) => Promise<any[]>>(),
  getTableDDL: jest.fn<(...args: any[]) => Promise<string>>(),
  collectForeignKeys: jest.fn(async (..._args: any[]): Promise<any[]> => []),
};
const trackTableChange = jest.fn(async (..._args: any[]) => undefined);
const trackColumnChange = jest.fn(async (..._args: any[]) => undefined);

jest.mock('@/lib/metadata/collectors', () => ({
  CollectorFactory: { createCollector: () => collector },
}));
jest.mock('@/lib/metadata/inference', () => ({ RelationshipInferencer: class {} }));
jest.mock('@/lib/metadata/storage', () => ({ changeTracker: { trackTableChange, trackColumnChange } }));
jest.mock('@/lib/di/setup', () => ({ getService: jest.fn() }));

import { MetadataSyncService } from '@/lib/metadata/sync/metadata-sync-service';
import { computeStructureHash, normalizeDDL } from '@/lib/metadata/sync/structure-hash';

const DDL = (autoIncrement: number) =>
  `CREATE TABLE \`orders\` (\n  \`id\` int NOT NULL AUTO_INCREMENT,\n  PRIMARY KEY (\`id\`)\n) ENGINE=InnoDB AUTO_INCREMENT=${autoIncrement} DEFAULT CHARSET=utf8mb4`;

describe('structure-hash', () => {
  it('去掉 AUTO_INCREMENT=N 后，数据写入不改变哈希', () => {
    expect(normalizeDDL(DDL(5))).not.toContain('AUTO_INCREMENT=');
    expect(normalizeDDL(DDL(5))).toContain('NOT NULL AUTO_INCREMENT,'); // 列属性保留
    expect(computeStructureHash(DDL(5))).toBe(computeStructureHash(DDL(9999)));
  });

  it('结构变化时哈希变化；DDL 为空时返回 null', () => {
    expect(computeStructureHash(DDL(1))).not.toBe(computeStructureHash(DDL(1).replace('int', 'bigint')));
    expect(computeStructureHash('')).toBeNull();
    expect(computeStructureHash(undefined)).toBeNull();
  });
});

describe('MetadataSyncService 增量同步', () => {
  const existing = { id: 10, tableName: 'orders', structureHash: computeStructureHash(DDL(1)) };
  const column = { columnName: 'id', dataType: 'int', columnType: 'int', columnComment: '', isNullable: 0, columnKey: 'PRI', defaultValue: null, ordinalPosition: 1 };

  let repo: Record<string, jest.Mock<(...args: any[]) => Promise<any>>>;
  let prisma: any;

  function createService(existingTables: any[] = [existing]) {
    repo = {
      upsertDatabase: jest.fn(async () => ({ id: 1 })),
      getTablesByDatabase: jest.fn(async () => existingTables),
      updateTable: jest.fn(async () => ({})),
      upsertTable: jest.fn(async (input: any) => ({ id: 10, ...input })),
      getColumnsByTable: jest.fn(async () => [{ id: 100, columnName: 'id', dataType: 'int', columnType: 'int', isNullable: false }]),
      upsertColumn: jest.fn(async (input: any) => ({ id: 100, ...input })),
      deleteColumn: jest.fn(async () => ({})),
      deleteTable: jest.fn(async () => ({})),
    };
    prisma = {
      dataSource: { findUnique: jest.fn(async () => ({ id: 1, type: 'mysql' })), update: jest.fn(async () => ({})) },
      columnMeta: { groupBy: jest.fn(async () => [{ tableId: 10, _count: { _all: 7 } }]) },
    };
    const connectionManager = { getConnection: jest.fn(async () => ({})) };
    return new MetadataSyncService(prisma, connectionManager as any, repo as any);
  }

  const sync = (service: MetadataSyncService, extra: Record<string, unknown> = {}) =>
    service.syncDataSource({ dataSourceId: 1, databases: ['shop'], trackChanges: true, ...extra });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    collector.collectTables.mockResolvedValue([
      { tableName: 'orders', tableComment: '订单表', rowCount: 1234, tableType: 'BASE TABLE' },
    ]);
    collector.collectColumns.mockReset();
    collector.collectColumns.mockResolvedValue([column]);
    collector.getTableDDL.mockReset();
    trackTableChange.mockClear();
    trackColumnChange.mockClear();
  });

  it('结构未变化（仅 AUTO_INCREMENT 变化）：只更新表级信息，跳过字段采集与写入', async () => {
    collector.getTableDDL.mockResolvedValue(DDL(5000));
    const service = createService();

    const result = await sync(service);

    expect(collector.collectColumns).not.toHaveBeenCalled();
    expect(repo.upsertColumn).not.toHaveBeenCalled();
    expect(repo.updateTable).toHaveBeenCalledWith(10, expect.objectContaining({
      tableComment: '订单表',
      rowCount: BigInt(1234),
      lastSyncedAt: expect.any(Date),
    }));
    expect(result).toMatchObject({ tableCount: 1, unchangedTableCount: 1, columnCount: 7 });
    expect(trackTableChange).not.toHaveBeenCalled();
  });

  it('结构变化：全量同步该表，记录表修改，并写入表注释与行数', async () => {
    collector.getTableDDL.mockResolvedValue(DDL(1).replace('int', 'bigint'));
    const service = createService();

    const result = await sync(service);

    expect(collector.collectColumns).toHaveBeenCalled();
    expect(repo.upsertTable).toHaveBeenCalledWith(expect.objectContaining({
      tableName: 'orders',
      tableComment: '订单表',
      rowCount: BigInt(1234),
      structureHash: computeStructureHash(DDL(1).replace('int', 'bigint')),
    }));
    expect(result.unchangedTableCount).toBe(0);
    expect(result.changes?.tablesModified).toBe(1);
    expect(trackTableChange).toHaveBeenCalledWith('table_modified', expect.anything(), existing);
  });

  it('isNullable 为 0/1 时与库中布尔值一致，不误报字段修改', async () => {
    collector.getTableDDL.mockResolvedValue(DDL(1).replace('int', 'bigint'));

    const result = await sync(createService());

    expect(result.changes?.columnsModified).toBe(0);
    expect(trackColumnChange).not.toHaveBeenCalled();
  });

  it('新表：全量同步并记录新增', async () => {
    collector.getTableDDL.mockResolvedValue(DDL(1));

    const result = await sync(createService([]));

    expect(collector.collectColumns).toHaveBeenCalled();
    expect(result.changes?.tablesAdded).toBe(1);
  });

  it('fullSync：结构未变化也重新同步字段', async () => {
    collector.getTableDDL.mockResolvedValue(DDL(1));

    const result = await sync(createService(), { fullSync: true });

    expect(collector.collectColumns).toHaveBeenCalled();
    expect(result.unchangedTableCount).toBe(0);
    expect(result.changes?.tablesModified).toBe(0);
  });

  it('DDL 获取失败：按全量处理，不误报修改，也不覆盖已有哈希', async () => {
    collector.getTableDDL.mockResolvedValue('');

    const result = await sync(createService());

    expect(collector.collectColumns).toHaveBeenCalled();
    expect(result.changes?.tablesModified).toBe(0);
    expect(repo.upsertTable).toHaveBeenCalledWith(expect.objectContaining({ structureHash: undefined }));
  });

  it('采集器不支持 DDL（如 PostgreSQL）：按全量处理', async () => {
    const { getTableDDL } = collector;
    delete (collector as any).getTableDDL;
    try {
      const result = await sync(createService());

      expect(collector.collectColumns).toHaveBeenCalled();
      expect(result.unchangedTableCount).toBe(0);
    } finally {
      collector.getTableDDL = getTableDDL;
    }
  });
});
