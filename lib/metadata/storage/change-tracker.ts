/**
 * 元数据变更追踪器
 * 负责检测和记录元数据变更
 */

// 使用延迟导入避免循环依赖
import type { CreateMetadataChangeInput } from './types';
import type { DatabaseMeta, TableMeta, ColumnMeta } from '@/app/generated/prisma';

// 延迟获取 metadataRepository 以避免循环依赖
const getMetadataRepository = () => {
  const mod = require('./metadata-repository');
  return mod.metadataRepository;
};

/**
 * 变更类型
 */
export type ChangeType =
  | 'database_added'
  | 'database_removed'
  | 'table_added'
  | 'table_removed'
  | 'table_modified'
  | 'column_added'
  | 'column_removed'
  | 'column_modified';

/**
 * 变更详情
 */
export interface ChangeDetail {
  changeType: ChangeType;
  entityType: 'database' | 'table' | 'column';
  entityId: number;
  entityName: string;
  oldValue?: any;
  newValue?: any;
  diff?: Record<string, { old: any; new: any }>;
}

/**
 * 变更追踪器类
 */
export class ChangeTracker {
  /**
   * BigInt 安全的 JSON 序列化
   */
  private safeStringify(value: any): string {
    return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  }

  /**
   * 比较两个对象，返回差异字段
   */
  private getDiff(oldObj: any, newObj: any, ignoreFields: string[] = []): Record<string, { old: any; new: any }> | null {
    const diff: Record<string, { old: any; new: any }> = {};
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      // 跳过忽略的字段
      if (ignoreFields.includes(key)) {
        continue;
      }

      const oldValue = oldObj[key];
      const newValue = newObj[key];

      // 比较值（使用 BigInt 安全的序列化）
      if (this.safeStringify(oldValue) !== this.safeStringify(newValue)) {
        diff[key] = { old: oldValue, new: newValue };
      }
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }

  /**
   * 记录数据库变更
   */
  async trackDatabaseChange(
    changeType: 'database_added' | 'database_removed',
    database: DatabaseMeta
  ): Promise<void> {
    const input: CreateMetadataChangeInput = {
      changeType,
      entityType: 'database',
      entityId: database.id,
      newValue:
        changeType === 'database_added' ? this.safeStringify(this.serializeDatabase(database)) : null,
      oldValue:
        changeType === 'database_removed' ? this.safeStringify(this.serializeDatabase(database)) : null,
    };

    await getMetadataRepository().createMetadataChange(input);

    console.log(`[ChangeTracker] ${changeType}: ${database.databaseName}`);
  }

  /**
   * 记录表变更
   */
  async trackTableChange(
    changeType: 'table_added' | 'table_removed' | 'table_modified',
    table: TableMeta,
    oldTable?: TableMeta
  ): Promise<void> {
    let oldValue: string | null = null;
    let newValue: string | null = null;

    if (changeType === 'table_added') {
      newValue = this.safeStringify(this.serializeTable(table));
    } else if (changeType === 'table_removed') {
      oldValue = this.safeStringify(this.serializeTable(table));
    } else if (changeType === 'table_modified' && oldTable) {
      oldValue = this.safeStringify(this.serializeTable(oldTable));
      newValue = this.safeStringify(this.serializeTable(table));
    }

    const input: CreateMetadataChangeInput = {
      changeType,
      entityType: 'table',
      entityId: table.id,
      oldValue,
      newValue,
    };

    await getMetadataRepository().createMetadataChange(input);

    console.log(`[ChangeTracker] ${changeType}: ${table.tableName}`);
  }

  /**
   * 记录字段变更
   */
  async trackColumnChange(
    changeType: 'column_added' | 'column_removed' | 'column_modified',
    column: ColumnMeta,
    oldColumn?: ColumnMeta
  ): Promise<void> {
    let oldValue: string | null = null;
    let newValue: string | null = null;

    if (changeType === 'column_added') {
      newValue = this.safeStringify(this.serializeColumn(column));
    } else if (changeType === 'column_removed') {
      oldValue = this.safeStringify(this.serializeColumn(column));
    } else if (changeType === 'column_modified' && oldColumn) {
      oldValue = this.safeStringify(this.serializeColumn(oldColumn));
      newValue = this.safeStringify(this.serializeColumn(column));
    }

    const input: CreateMetadataChangeInput = {
      changeType,
      entityType: 'column',
      entityId: column.id,
      oldValue,
      newValue,
    };

    await getMetadataRepository().createMetadataChange(input);

    console.log(`[ChangeTracker] ${changeType}: ${column.columnName}`);
  }

  /**
   * 检测表的变更
   */
  async detectTableChanges(
    oldTable: TableMeta,
    newTable: TableMeta
  ): Promise<ChangeDetail | null> {
    // 忽略的字段（不算作变更）
    const ignoreFields = ['id', 'createdAt', 'updatedAt', 'lastSyncedAt'];

    const diff = this.getDiff(oldTable, newTable, ignoreFields);

    if (!diff) {
      return null;
    }

    await this.trackTableChange('table_modified', newTable, oldTable);

    return {
      changeType: 'table_modified',
      entityType: 'table',
      entityId: newTable.id,
      entityName: newTable.tableName,
      oldValue: this.serializeTable(oldTable),
      newValue: this.serializeTable(newTable),
      diff,
    };
  }

  /**
   * 检测字段的变更
   */
  async detectColumnChanges(
    oldColumn: ColumnMeta,
    newColumn: ColumnMeta
  ): Promise<ChangeDetail | null> {
    // 忽略的字段
    const ignoreFields = ['id', 'createdAt', 'updatedAt'];

    const diff = this.getDiff(oldColumn, newColumn, ignoreFields);

    if (!diff) {
      return null;
    }

    await this.trackColumnChange('column_modified', newColumn, oldColumn);

    return {
      changeType: 'column_modified',
      entityType: 'column',
      entityId: newColumn.id,
      entityName: newColumn.columnName,
      oldValue: this.serializeColumn(oldColumn),
      newValue: this.serializeColumn(newColumn),
      diff,
    };
  }

  /**
   * 批量检测表变更
   */
  async detectTablesBatchChanges(
    oldTables: TableMeta[],
    newTables: TableMeta[]
  ): Promise<{
    added: TableMeta[];
    removed: TableMeta[];
    modified: ChangeDetail[];
  }> {
    const oldTableMap = new Map(oldTables.map((t) => [t.tableName, t]));
    const newTableMap = new Map(newTables.map((t) => [t.tableName, t]));

    const added: TableMeta[] = [];
    const removed: TableMeta[] = [];
    const modified: ChangeDetail[] = [];

    // 检测新增的表
    for (const newTable of newTables) {
      if (!oldTableMap.has(newTable.tableName)) {
        added.push(newTable);
        await this.trackTableChange('table_added', newTable);
      }
    }

    // 检测删除的表
    for (const oldTable of oldTables) {
      if (!newTableMap.has(oldTable.tableName)) {
        removed.push(oldTable);
        await this.trackTableChange('table_removed', oldTable);
      }
    }

    // 检测修改的表
    for (const newTable of newTables) {
      const oldTable = oldTableMap.get(newTable.tableName);
      if (oldTable) {
        const change = await this.detectTableChanges(oldTable, newTable);
        if (change) {
          modified.push(change);
        }
      }
    }

    return { added, removed, modified };
  }

  /**
   * 批量检测字段变更
   */
  async detectColumnsBatchChanges(
    oldColumns: ColumnMeta[],
    newColumns: ColumnMeta[]
  ): Promise<{
    added: ColumnMeta[];
    removed: ColumnMeta[];
    modified: ChangeDetail[];
  }> {
    const oldColumnMap = new Map(oldColumns.map((c) => [c.columnName, c]));
    const newColumnMap = new Map(newColumns.map((c) => [c.columnName, c]));

    const added: ColumnMeta[] = [];
    const removed: ColumnMeta[] = [];
    const modified: ChangeDetail[] = [];

    // 检测新增的字段
    for (const newColumn of newColumns) {
      if (!oldColumnMap.has(newColumn.columnName)) {
        added.push(newColumn);
        await this.trackColumnChange('column_added', newColumn);
      }
    }

    // 检测删除的字段
    for (const oldColumn of oldColumns) {
      if (!newColumnMap.has(oldColumn.columnName)) {
        removed.push(oldColumn);
        await this.trackColumnChange('column_removed', oldColumn);
      }
    }

    // 检测修改的字段
    for (const newColumn of newColumns) {
      const oldColumn = oldColumnMap.get(newColumn.columnName);
      if (oldColumn) {
        const change = await this.detectColumnChanges(oldColumn, newColumn);
        if (change) {
          modified.push(change);
        }
      }
    }

    return { added, removed, modified };
  }

  /**
   * 序列化数据库对象
   */
  private serializeDatabase(database: DatabaseMeta): any {
    return {
      id: database.id,
      sourceId: database.sourceId,
      databaseName: database.databaseName,
      domainId: database.domainId,
      semanticDescription: database.semanticDescription,
      lastSyncedAt: database.lastSyncedAt?.toISOString(),
    };
  }

  /**
   * 序列化表对象
   */
  private serializeTable(table: TableMeta): any {
    return {
      id: table.id,
      databaseId: table.databaseId,
      tableName: table.tableName,
      tableComment: table.tableComment,
      semanticDescription: table.semanticDescription,
      semanticPriority: table.semanticPriority,
      rowCount: table.rowCount.toString(),
      structureHash: table.structureHash,
      createdTime: table.createdTime?.toISOString(),
      updatedTime: table.updatedTime?.toISOString(),
      lastSyncedAt: table.lastSyncedAt?.toISOString(),
    };
  }

  /**
   * 序列化字段对象
   */
  private serializeColumn(column: ColumnMeta): any {
    return {
      id: column.id,
      tableId: column.tableId,
      columnName: column.columnName,
      dataType: column.dataType,
      columnType: column.columnType,
      columnComment: column.columnComment,
      semanticDescription: column.semanticDescription,
      semanticSource: column.semanticSource,
      isNullable: column.isNullable,
      isPrimaryKey: column.isPrimaryKey,
      isUnique: column.isUnique,
      defaultValue: column.defaultValue,
      ordinalPosition: column.ordinalPosition,
    };
  }
}

/**
 * 默认导出单例
 */
export const changeTracker = new ChangeTracker();
