/**
 * 分表组识别器
 * 识别具有相同结构的分表并自动分组，优化关系推断
 */

import type { TableMeta, ColumnMeta } from '@prisma/client';
import { createHash } from 'crypto';

/**
 * 分表组信息
 */
export interface ShardGroupInfo {
  groupName: string;
  basePattern: string;
  structureHash: string;
  tables: Array<{
    id: number;
    tableName: string;
  }>;
  tableCount: number;
  description?: string;
}

/**
 * 分表模式匹配结果
 */
interface PatternMatch {
  basePattern: string;
  suffix: string;
  confidence: number;
}

/**
 * 表结构信息（用于比较）
 */
interface TableStructure {
  tableId: number;
  tableName: string;
  structureHash: string;
  columns: Array<{
    columnName: string;
    dataType: string;
    isNullable: boolean;
    isPrimaryKey: boolean;
  }>;
}

/**
 * 分表组检测器
 */
export class ShardGroupDetector {
  /**
   * 从表列表中识别分表组
   *
   * @param tables - 包含字段信息的表列表
   * @returns 识别出的分表组列表
   */
  detectShardGroups(
    tables: Array<TableMeta & { columns: ColumnMeta[] }>
  ): ShardGroupInfo[] {
    // 1. 计算每个表的结构哈希
    const tableStructures = tables.map(table => this.computeTableStructure(table));

    // 2. 按结构哈希分组
    const structureGroups = this.groupByStructureHash(tableStructures);

    // 3. 对每个结构组，尝试识别分表模式
    const shardGroups: ShardGroupInfo[] = [];

    for (const [structureHash, tablesInGroup] of Object.entries(structureGroups)) {
      // 只有多个表才可能是分表组
      if (tablesInGroup.length < 2) {
        continue;
      }

      // 尝试识别分表模式
      const patterns = this.identifyShardPatterns(tablesInGroup.map(t => t.tableName));

      for (const pattern of patterns) {
        // 过滤出符合该模式的表
        const matchingTables = tablesInGroup.filter(t =>
          this.matchesPattern(t.tableName, pattern.basePattern)
        );

        if (matchingTables.length >= 2) {
          shardGroups.push({
            groupName: this.generateGroupName(pattern.basePattern),
            basePattern: pattern.basePattern,
            structureHash,
            tables: matchingTables.map(t => ({
              id: t.tableId,
              tableName: t.tableName,
            })),
            tableCount: matchingTables.length,
            description: `自动识别的分表组：${pattern.basePattern}，包含 ${matchingTables.length} 个分表`,
          });
        }
      }
    }

    return shardGroups;
  }

  /**
   * 计算表的结构信息和哈希
   */
  private computeTableStructure(
    table: TableMeta & { columns: ColumnMeta[] }
  ): TableStructure {
    // 按列名排序，确保相同结构的表生成相同的哈希
    const sortedColumns = [...table.columns].sort((a, b) =>
      a.columnName.localeCompare(b.columnName)
    );

    const columns = sortedColumns.map(col => ({
      columnName: col.columnName,
      dataType: col.dataType,
      isNullable: col.isNullable,
      isPrimaryKey: col.isPrimaryKey,
    }));

    // 生成结构哈希
    const structureString = JSON.stringify(columns);
    const structureHash = createHash('sha256').update(structureString).digest('hex');

    return {
      tableId: table.id,
      tableName: table.tableName,
      structureHash,
      columns,
    };
  }

  /**
   * 按结构哈希分组
   */
  private groupByStructureHash(
    structures: TableStructure[]
  ): Record<string, TableStructure[]> {
    const groups: Record<string, TableStructure[]> = {};

    for (const structure of structures) {
      if (!groups[structure.structureHash]) {
        groups[structure.structureHash] = [];
      }
      groups[structure.structureHash].push(structure);
    }

    return groups;
  }

  /**
   * 识别分表模式
   * 支持常见的分表命名模式：
   * - table_0, table_1, table_2 (数字后缀)
   * - table_2023, table_2024 (年份)
   * - table_202301, table_202302 (年月)
   * - table_20230101, table_20230102 (日期)
   * - table_00, table_01, table_ff (十六进制)
   * - table_a, table_b, table_c (字母)
   */
  private identifyShardPatterns(tableNames: string[]): PatternMatch[] {
    const patterns: Map<string, PatternMatch> = new Map();

    // 尝试找出共同的前缀和不同的后缀
    for (let i = 0; i < tableNames.length; i++) {
      for (let j = i + 1; j < tableNames.length; j++) {
        const table1 = tableNames[i];
        const table2 = tableNames[j];

        // 查找公共前缀
        const commonPrefix = this.findCommonPrefix(table1, table2);

        if (commonPrefix.length === 0) {
          continue;
        }

        const suffix1 = table1.slice(commonPrefix.length);
        const suffix2 = table2.slice(commonPrefix.length);

        // 验证后缀是否符合分表模式
        const confidence = this.calculatePatternConfidence(suffix1, suffix2);

        if (confidence > 0.5) {
          const basePattern = `${commonPrefix}*`;

          if (!patterns.has(basePattern) || patterns.get(basePattern)!.confidence < confidence) {
            patterns.set(basePattern, {
              basePattern,
              suffix: suffix1,
              confidence,
            });
          }
        }
      }
    }

    return Array.from(patterns.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 查找两个字符串的公共前缀
   */
  private findCommonPrefix(str1: string, str2: string): string {
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
      i++;
    }
    return str1.slice(0, i);
  }

  /**
   * 计算后缀模式的置信度
   * 判断两个后缀是否符合分表模式
   */
  private calculatePatternConfidence(suffix1: string, suffix2: string): number {
    // 空后缀不是分表
    if (!suffix1 || !suffix2) {
      return 0;
    }

    // 去除可能的分隔符（如果有）
    const pureSuffix1 = suffix1.replace(/^[_\-.]/, '');
    const pureSuffix2 = suffix2.replace(/^[_\-.]/, '');

    // 去除分隔符后仍然为空，不是有效的分表模式
    if (!pureSuffix1 || !pureSuffix2) {
      return 0;
    }

    // 长度相同增加置信度
    const lengthMatch = pureSuffix1.length === pureSuffix2.length ? 0.3 : 0;

    // 检查各种模式
    let patternScore = 0;

    // 数字模式
    if (/^\d+$/.test(pureSuffix1) && /^\d+$/.test(pureSuffix2)) {
      patternScore = 0.8;
    }
    // 年份模式 (20xx)
    else if (/^20\d{2}$/.test(pureSuffix1) && /^20\d{2}$/.test(pureSuffix2)) {
      patternScore = 0.9;
    }
    // 年月模式 (202301)
    else if (/^20\d{4}$/.test(pureSuffix1) && /^20\d{4}$/.test(pureSuffix2)) {
      patternScore = 0.9;
    }
    // 日期模式 (20230101)
    else if (/^20\d{6}$/.test(pureSuffix1) && /^20\d{6}$/.test(pureSuffix2)) {
      patternScore = 0.95;
    }
    // 十六进制模式
    else if (/^[0-9a-fA-F]+$/.test(pureSuffix1) && /^[0-9a-fA-F]+$/.test(pureSuffix2)) {
      patternScore = 0.7;
    }
    // 字母模式
    else if (/^[a-zA-Z]+$/.test(pureSuffix1) && /^[a-zA-Z]+$/.test(pureSuffix2)) {
      patternScore = 0.6;
    }

    return Math.min(lengthMatch + patternScore, 1.0);
  }

  /**
   * 检查表名是否匹配模式
   */
  private matchesPattern(tableName: string, pattern: string): boolean {
    // 将模式转换为正则表达式
    // 例如：order_* -> ^order_
    const basePattern = pattern.replace('*', '');
    return tableName.startsWith(basePattern);
  }

  /**
   * 生成分表组名称
   */
  private generateGroupName(basePattern: string): string {
    // 去除结尾的通配符和分隔符
    return basePattern.replace(/[*_\-.]$/, '');
  }

  /**
   * 验证分表组的结构一致性
   *
   * @param tables - 分表组中的表列表
   * @returns 是否结构一致
   */
  validateStructureConsistency(
    tables: Array<TableMeta & { columns: ColumnMeta[] }>
  ): boolean {
    if (tables.length < 2) {
      return true;
    }

    const structures = tables.map(t => this.computeTableStructure(t));
    const firstHash = structures[0].structureHash;

    return structures.every(s => s.structureHash === firstHash);
  }

  /**
   * 计算结构哈希（公共方法）
   *
   * @param columns - 列信息
   * @returns 结构哈希
   */
  computeStructureHash(columns: ColumnMeta[]): string {
    const sortedColumns = [...columns].sort((a, b) =>
      a.columnName.localeCompare(b.columnName)
    );

    const columnsData = sortedColumns.map(col => ({
      columnName: col.columnName,
      dataType: col.dataType,
      isNullable: col.isNullable,
      isPrimaryKey: col.isPrimaryKey,
    }));

    const structureString = JSON.stringify(columnsData);
    return createHash('sha256').update(structureString).digest('hex');
  }
}
