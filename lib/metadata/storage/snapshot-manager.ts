/**
 * 元数据快照管理器
 * 负责创建、管理和恢复元数据快照
 *
 * 快照用途：
 * - 版本回溯
 * - 变更对比
 * - 数据恢复
 */

import prisma from '@/lib/prisma/client';
import type { SnapshotType } from '@prisma/client';

/**
 * 快照选项
 */
export interface SnapshotOptions {
  /** 快照备注 */
  note?: string;

  /** 是否包含关系数据 */
  includeRelationships?: boolean;

  /** 是否包含语义标注 */
  includeSemantics?: boolean;
}

/**
 * 快照数据
 */
export interface SnapshotData {
  version: number;
  snapshotData: any;
  createdAt: Date;
}

/**
 * 快照管理器类
 */
export class SnapshotManager {
  /**
   * 创建数据库快照
   */
  async createDatabaseSnapshot(
    databaseId: number,
    options: SnapshotOptions = {}
  ): Promise<SnapshotData> {
    // 获取数据库完整数据
    const database = await prisma.databaseMeta.findUnique({
      where: { id: databaseId },
      include: {
        tables: {
          include: {
            columns: true,
            ...(options.includeRelationships && {
              explicitRelationshipsAsSource: true,
              explicitRelationshipsAsTarget: true,
              inferredRelationshipsAsSource: true,
              inferredRelationshipsAsTarget: true,
            }),
          },
        },
      },
    });

    if (!database) {
      throw new Error(`数据库不存在: databaseId=${databaseId}`);
    }

    // 获取当前最新版本号
    const latestSnapshot = await prisma.metadataSnapshot.findFirst({
      where: {
        snapshotType: 'database',
        entityId: databaseId,
      },
      orderBy: { version: 'desc' },
    });

    const newVersion = (latestSnapshot?.version ?? 0) + 1;

    // 准备快照数据
    const snapshotData = this.prepareDatabaseSnapshot(database, options);

    // 保存快照
    const snapshot = await prisma.metadataSnapshot.create({
      data: {
        snapshotType: 'database',
        entityId: databaseId,
        version: newVersion,
        snapshotData: snapshotData as any,
      },
    });

    console.log(`✓ 创建数据库快照: ${database.databaseName} - v${newVersion}`);

    return {
      version: newVersion,
      snapshotData,
      createdAt: snapshot.createdAt,
    };
  }

  /**
   * 创建表快照
   */
  async createTableSnapshot(
    tableId: number,
    options: SnapshotOptions = {}
  ): Promise<SnapshotData> {
    // 获取表完整数据
    const table = await prisma.tableMeta.findUnique({
      where: { id: tableId },
      include: {
        columns: true,
        ...(options.includeRelationships && {
          explicitRelationshipsAsSource: true,
          explicitRelationshipsAsTarget: true,
          inferredRelationshipsAsSource: true,
          inferredRelationshipsAsTarget: true,
        }),
      },
    });

    if (!table) {
      throw new Error(`表不存在: tableId=${tableId}`);
    }

    // 获取当前最新版本号
    const latestSnapshot = await prisma.metadataSnapshot.findFirst({
      where: {
        snapshotType: 'table',
        entityId: tableId,
      },
      orderBy: { version: 'desc' },
    });

    const newVersion = (latestSnapshot?.version ?? 0) + 1;

    // 准备快照数据
    const snapshotData = this.prepareTableSnapshot(table, options);

    // 保存快照
    const snapshot = await prisma.metadataSnapshot.create({
      data: {
        snapshotType: 'table',
        entityId: tableId,
        version: newVersion,
        snapshotData: snapshotData as any,
      },
    });

    console.log(`✓ 创建表快照: ${table.tableName} - v${newVersion}`);

    return {
      version: newVersion,
      snapshotData,
      createdAt: snapshot.createdAt,
    };
  }

  /**
   * 创建列快照
   */
  async createColumnSnapshot(
    columnId: number,
    options: SnapshotOptions = {}
  ): Promise<SnapshotData> {
    // 获取列数据
    const column = await prisma.columnMeta.findUnique({
      where: { id: columnId },
    });

    if (!column) {
      throw new Error(`列不存在: columnId=${columnId}`);
    }

    // 获取当前最新版本号
    const latestSnapshot = await prisma.metadataSnapshot.findFirst({
      where: {
        snapshotType: 'column',
        entityId: columnId,
      },
      orderBy: { version: 'desc' },
    });

    const newVersion = (latestSnapshot?.version ?? 0) + 1;

    // 准备快照数据
    const snapshotData = this.prepareColumnSnapshot(column, options);

    // 保存快照
    const snapshot = await prisma.metadataSnapshot.create({
      data: {
        snapshotType: 'column',
        entityId: columnId,
        version: newVersion,
        snapshotData: snapshotData as any,
      },
    });

    console.log(`✓ 创建列快照: ${column.columnName} - v${newVersion}`);

    return {
      version: newVersion,
      snapshotData,
      createdAt: snapshot.createdAt,
    };
  }

  /**
   * 获取快照历史
   */
  async getSnapshotHistory(
    snapshotType: SnapshotType,
    entityId: number,
    limit: number = 10
  ) {
    return await prisma.metadataSnapshot.findMany({
      where: {
        snapshotType,
        entityId,
      },
      orderBy: { version: 'desc' },
      take: limit,
    });
  }

  /**
   * 获取指定版本的快照
   */
  async getSnapshotByVersion(
    snapshotType: SnapshotType,
    entityId: number,
    version: number
  ) {
    return await prisma.metadataSnapshot.findFirst({
      where: {
        snapshotType,
        entityId,
        version,
      },
    });
  }

  /**
   * 对比两个快照
   */
  async compareSnapshots(
    snapshotType: SnapshotType,
    entityId: number,
    version1: number,
    version2: number
  ) {
    const [snapshot1, snapshot2] = await Promise.all([
      this.getSnapshotByVersion(snapshotType, entityId, version1),
      this.getSnapshotByVersion(snapshotType, entityId, version2),
    ]);

    if (!snapshot1 || !snapshot2) {
      throw new Error('快照不存在');
    }

    return {
      version1,
      version2,
      data1: snapshot1.snapshotData,
      data2: snapshot2.snapshotData,
      diff: this.calculateDiff(snapshot1.snapshotData as any, snapshot2.snapshotData as any),
    };
  }

  /**
   * 清理旧快照（保留最近 N 个版本）
   */
  async cleanupOldSnapshots(
    snapshotType: SnapshotType,
    entityId: number,
    keepCount: number = 10
  ): Promise<number> {
    const snapshots = await prisma.metadataSnapshot.findMany({
      where: {
        snapshotType,
        entityId,
      },
      orderBy: { version: 'desc' },
      select: { id: true },
    });

    if (snapshots.length <= keepCount) {
      return 0;
    }

    const snapshotsToDelete = snapshots.slice(keepCount);
    const idsToDelete = snapshotsToDelete.map((s) => s.id);

    const result = await prisma.metadataSnapshot.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    console.log(`清理了 ${result.count} 个旧快照`);
    return result.count;
  }

  /**
   * 批量清理所有实体的旧快照
   */
  async cleanupAllOldSnapshots(keepCount: number = 10): Promise<{
    databases: number;
    tables: number;
    columns: number;
  }> {
    const types: SnapshotType[] = ['database', 'table', 'column'];
    const results = {
      databases: 0,
      tables: 0,
      columns: 0,
    };

    for (const type of types) {
      // 获取所有该类型的实体
      const entities = await prisma.metadataSnapshot.findMany({
        where: { snapshotType: type },
        distinct: ['entityId'],
        select: { entityId: true },
      });

      for (const entity of entities) {
        const cleaned = await this.cleanupOldSnapshots(
          type,
          entity.entityId,
          keepCount
        );

        if (type === 'database') results.databases += cleaned;
        else if (type === 'table') results.tables += cleaned;
        else if (type === 'column') results.columns += cleaned;
      }
    }

    return results;
  }

  /**
   * 准备数据库快照数据
   */
  private prepareDatabaseSnapshot(database: any, options: SnapshotOptions): any {
    const snapshot: any = {
      id: database.id,
      sourceId: database.sourceId,
      databaseName: database.databaseName,
      domainId: database.domainId,
      semanticDescription: database.semanticDescription,
      lastSyncedAt: database.lastSyncedAt?.toISOString(),
      tables: database.tables?.map((table: any) => this.prepareTableSnapshot(table, options)) || [],
    };

    return snapshot;
  }

  /**
   * 准备表快照数据
   */
  private prepareTableSnapshot(table: any, options: SnapshotOptions): any {
    const snapshot: any = {
      id: table.id,
      databaseId: table.databaseId,
      tableName: table.tableName,
      tableComment: table.tableComment,
      semanticDescription: table.semanticDescription,
      semanticPriority: table.semanticPriority,
      rowCount: table.rowCount?.toString(),
      structureHash: table.structureHash,
      createdTime: table.createdTime?.toISOString(),
      updatedTime: table.updatedTime?.toISOString(),
      lastSyncedAt: table.lastSyncedAt?.toISOString(),
      columns: table.columns?.map((col: any) => this.prepareColumnSnapshot(col, options)) || [],
    };

    if (options.includeRelationships) {
      snapshot.relationships = {
        explicit: {
          asSource: table.explicitRelationshipsAsSource || [],
          asTarget: table.explicitRelationshipsAsTarget || [],
        },
        inferred: {
          asSource: table.inferredRelationshipsAsSource || [],
          asTarget: table.inferredRelationshipsAsTarget || [],
        },
      };
    }

    return snapshot;
  }

  /**
   * 准备列快照数据
   */
  private prepareColumnSnapshot(column: any, options: SnapshotOptions): any {
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

  /**
   * 计算两个对象的差异
   */
  private calculateDiff(obj1: any, obj2: any): any {
    const diff: any = {};

    const allKeys = new Set([
      ...Object.keys(obj1 || {}),
      ...Object.keys(obj2 || {}),
    ]);

    for (const key of allKeys) {
      const val1 = obj1?.[key];
      const val2 = obj2?.[key];

      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        diff[key] = {
          old: val1,
          new: val2,
        };
      }
    }

    return diff;
  }
}

/**
 * 导出默认实例
 */
export const snapshotManager = new SnapshotManager();
