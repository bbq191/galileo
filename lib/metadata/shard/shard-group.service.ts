/**
 * 分表组管理服务
 * 负责分表组的识别、创建、更新和查询
 */

import { PrismaClient } from '@prisma/client';
import { ShardGroupDetector, type ShardGroupInfo } from './shard-group-detector';

/**
 * 分表组管理选项
 */
export interface ShardGroupManagementOptions {
  /** 是否自动识别分表组 */
  autoDetect?: boolean;
  /** 最小分表数量（少于此数量不视为分表组） */
  minShardCount?: number;
  /** 是否验证结构一致性 */
  validateStructure?: boolean;
}

/**
 * 分表组统计信息
 */
export interface ShardGroupStats {
  totalGroups: number;
  totalShardedTables: number;
  avgTablesPerGroup: number;
  groups: Array<{
    groupName: string;
    tableCount: number;
    basePattern: string;
  }>;
}

/**
 * 分表组服务
 */
export class ShardGroupService {
  private detector: ShardGroupDetector;

  constructor(private prisma: PrismaClient) {
    this.detector = new ShardGroupDetector();
  }

  /**
   * 识别并创建数据库的分表组
   *
   * @param databaseId - 数据库 ID
   * @param options - 管理选项
   * @returns 创建的分表组列表
   */
  async identifyAndCreateShardGroups(
    databaseId: number,
    options: ShardGroupManagementOptions = {}
  ): Promise<ShardGroupInfo[]> {
    const { minShardCount = 2, validateStructure = true } = options;

    console.log(`\n开始识别数据库 ${databaseId} 的分表组...`);

    // 1. 获取数据库的所有表及其字段
    const tables = await this.prisma.tableMeta.findMany({
      where: { databaseId },
      include: {
        columns: {
          orderBy: { ordinalPosition: 'asc' },
        },
      },
    });

    console.log(`总表数: ${tables.length}`);

    if (tables.length < minShardCount) {
      console.log('表数量不足，无法识别分表组');
      return [];
    }

    // 2. 使用检测器识别分表组
    const detectedGroups = this.detector.detectShardGroups(tables);

    console.log(`检测到 ${detectedGroups.length} 个潜在分表组`);

    // 3. 过滤并创建分表组
    const createdGroups: ShardGroupInfo[] = [];

    for (const group of detectedGroups) {
      // 检查最小分表数量
      if (group.tableCount < minShardCount) {
        console.log(`跳过分表组 ${group.groupName}: 表数量不足 (${group.tableCount})`);
        continue;
      }

      // 验证结构一致性
      if (validateStructure) {
        const groupTables = tables.filter((t) =>
          group.tables.some((gt) => gt.id === t.id)
        );

        if (!this.detector.validateStructureConsistency(groupTables)) {
          console.log(`跳过分表组 ${group.groupName}: 结构不一致`);
          continue;
        }
      }

      try {
        // 检查是否已存在
        const existing = await this.prisma.tableShardGroup.findUnique({
          where: {
            databaseId_groupName: {
              databaseId,
              groupName: group.groupName,
            },
          },
        });

        if (existing) {
          // 更新现有分表组
          await this.updateShardGroup(existing.id, group);
          console.log(`更新分表组: ${group.groupName} (${group.tableCount} 个表)`);
        } else {
          // 创建新分表组
          await this.createShardGroup(databaseId, group);
          console.log(`创建分表组: ${group.groupName} (${group.tableCount} 个表)`);
        }

        createdGroups.push(group);
      } catch (error) {
        console.error(`创建分表组 ${group.groupName} 失败:`, error);
      }
    }

    console.log(`成功创建/更新 ${createdGroups.length} 个分表组\n`);

    return createdGroups;
  }

  /**
   * 创建分表组
   */
  private async createShardGroup(
    databaseId: number,
    groupInfo: ShardGroupInfo
  ): Promise<void> {
    // 使用事务确保原子性
    await this.prisma.$transaction(async (tx) => {
      // 1. 创建分表组记录
      const shardGroup = await tx.tableShardGroup.create({
        data: {
          databaseId,
          groupName: groupInfo.groupName,
          baseTablePattern: groupInfo.basePattern,
          structureHash: groupInfo.structureHash,
          tableCount: groupInfo.tableCount,
          description: groupInfo.description,
          identificationMethod: 'auto',
        },
      });

      // 2. 更新表的 shardGroupId
      await tx.tableMeta.updateMany({
        where: {
          id: { in: groupInfo.tables.map((t) => t.id) },
        },
        data: {
          shardGroupId: shardGroup.id,
        },
      });
    });
  }

  /**
   * 更新分表组
   */
  private async updateShardGroup(
    groupId: number,
    groupInfo: ShardGroupInfo
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 更新分表组信息
      await tx.tableShardGroup.update({
        where: { id: groupId },
        data: {
          baseTablePattern: groupInfo.basePattern,
          structureHash: groupInfo.structureHash,
          tableCount: groupInfo.tableCount,
          description: groupInfo.description,
        },
      });

      // 2. 清除旧的分表关联
      await tx.tableMeta.updateMany({
        where: { shardGroupId: groupId },
        data: { shardGroupId: null },
      });

      // 3. 设置新的分表关联
      await tx.tableMeta.updateMany({
        where: {
          id: { in: groupInfo.tables.map((t) => t.id) },
        },
        data: {
          shardGroupId: groupId,
        },
      });
    });
  }

  /**
   * 获取数据库的分表组列表
   *
   * @param databaseId - 数据库 ID
   * @returns 分表组列表
   */
  async getShardGroups(databaseId: number) {
    return await this.prisma.tableShardGroup.findMany({
      where: { databaseId },
      include: {
        tables: {
          select: {
            id: true,
            tableName: true,
            rowCount: true,
          },
        },
      },
      orderBy: { tableCount: 'desc' },
    });
  }

  /**
   * 获取表所属的分表组
   *
   * @param tableId - 表 ID
   * @returns 分表组信息（如果存在）
   */
  async getTableShardGroup(tableId: number) {
    const table = await this.prisma.tableMeta.findUnique({
      where: { id: tableId },
      include: {
        shardGroup: {
          include: {
            tables: {
              select: {
                id: true,
                tableName: true,
              },
            },
          },
        },
      },
    });

    return table?.shardGroup;
  }

  /**
   * 获取分表组统计信息
   *
   * @param databaseId - 数据库 ID
   * @returns 统计信息
   */
  async getShardGroupStats(databaseId: number): Promise<ShardGroupStats> {
    const groups = await this.getShardGroups(databaseId);

    const totalGroups = groups.length;
    const totalShardedTables = groups.reduce((sum, g) => sum + g.tableCount, 0);
    const avgTablesPerGroup = totalGroups > 0 ? totalShardedTables / totalGroups : 0;

    return {
      totalGroups,
      totalShardedTables,
      avgTablesPerGroup: Math.round(avgTablesPerGroup * 10) / 10,
      groups: groups.map((g) => ({
        groupName: g.groupName,
        tableCount: g.tableCount,
        basePattern: g.baseTablePattern,
      })),
    };
  }

  /**
   * 删除分表组
   *
   * @param groupId - 分表组 ID
   */
  async deleteShardGroup(groupId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. 清除表的分表组关联
      await tx.tableMeta.updateMany({
        where: { shardGroupId: groupId },
        data: { shardGroupId: null },
      });

      // 2. 删除分表组
      await tx.tableShardGroup.delete({
        where: { id: groupId },
      });
    });
  }

  /**
   * 清理数据库的所有分表组
   *
   * @param databaseId - 数据库 ID
   */
  async clearShardGroups(databaseId: number): Promise<number> {
    const groups = await this.prisma.tableShardGroup.findMany({
      where: { databaseId },
      select: { id: true },
    });

    for (const group of groups) {
      await this.deleteShardGroup(group.id);
    }

    return groups.length;
  }

  /**
   * 手动创建分表组
   *
   * @param databaseId - 数据库 ID
   * @param groupName - 分表组名称
   * @param tableIds - 表 ID 列表
   * @param description - 描述
   */
  async createManualShardGroup(
    databaseId: number,
    groupName: string,
    tableIds: number[],
    description?: string
  ): Promise<void> {
    // 验证所有表都属于同一个数据库
    const tables = await this.prisma.tableMeta.findMany({
      where: {
        id: { in: tableIds },
        databaseId,
      },
      include: {
        columns: {
          orderBy: { ordinalPosition: 'asc' },
        },
      },
    });

    if (tables.length !== tableIds.length) {
      throw new Error('部分表不属于指定数据库');
    }

    // 验证结构一致性
    if (!this.detector.validateStructureConsistency(tables)) {
      throw new Error('分表结构不一致');
    }

    // 计算结构哈希
    const structureHash = this.detector.computeStructureHash(tables[0].columns);

    // 推断基表模式
    const basePattern = this.inferBasePattern(tables.map((t) => t.tableName));

    // 创建分表组
    await this.prisma.$transaction(async (tx) => {
      const shardGroup = await tx.tableShardGroup.create({
        data: {
          databaseId,
          groupName,
          baseTablePattern: basePattern,
          structureHash,
          tableCount: tableIds.length,
          description: description || `手动创建的分表组：${groupName}`,
          identificationMethod: 'manual',
        },
      });

      await tx.tableMeta.updateMany({
        where: { id: { in: tableIds } },
        data: { shardGroupId: shardGroup.id },
      });
    });
  }

  /**
   * 推断基表模式
   */
  private inferBasePattern(tableNames: string[]): string {
    if (tableNames.length === 0) {
      return '*';
    }

    if (tableNames.length === 1) {
      return `${tableNames[0]}*`;
    }

    // 找出最长公共前缀
    let prefix = tableNames[0];
    for (let i = 1; i < tableNames.length; i++) {
      let j = 0;
      while (j < prefix.length && j < tableNames[i].length && prefix[j] === tableNames[i][j]) {
        j++;
      }
      prefix = prefix.slice(0, j);
    }

    return prefix ? `${prefix}*` : '*';
  }
}
