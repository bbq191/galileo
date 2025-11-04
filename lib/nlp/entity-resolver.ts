/**
 * 实体解析器
 * 负责将提取的实体名称映射到实际的数据库表和字段
 */

import { PrismaClient } from '@prisma/client';
import { EntityMatch } from './types';

/**
 * 实体解析器
 */
export class EntityResolver {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * 搜索匹配的表
   */
  async searchTables(hint: string, limit: number = 10): Promise<EntityMatch[]> {
    try {
      // 处理带数据库前缀的表名（如 db_live.tb_live_all_room）
      let tableName = hint;
      let databaseName: string | undefined;

      if (hint.includes('.')) {
        const parts = hint.split('.');
        if (parts.length === 2) {
          databaseName = parts[0];
          tableName = parts[1];
          console.log(`[EntityResolver] 检测到数据库前缀: ${databaseName}, 表名: ${tableName}`);
        }
      }

      // 1. 精确匹配
      const exactMatchWhere: any = {
        tableName: {
          equals: tableName,
        },
      };

      // 如果指定了数据库名，添加数据库过滤条件
      if (databaseName) {
        exactMatchWhere.database = {
          databaseName: {
            equals: databaseName,
          },
        };
      }

      const exactMatches = await this.prisma.tableMeta.findMany({
        where: exactMatchWhere,
        include: {
          database: true,
        },
        take: limit,
      });

      if (exactMatches.length > 0) {
        console.log(`[EntityResolver] 找到 ${exactMatches.length} 个精确匹配的表`);
        return exactMatches.map((table: Record<string, any>) => ({
          hint,
          matched: table,
          score: 1.0,
          type: 'exact' as const,
        }));
      }

      // 2. 模糊匹配（包含查询）
      const fuzzyMatchWhere: any = {
        OR: [
          { tableName: { contains: tableName } },
          { tableComment: { contains: tableName } },
          { semanticDescription: { contains: tableName } },
        ],
      };

      // 如果指定了数据库名，添加数据库过滤条件
      if (databaseName) {
        fuzzyMatchWhere.database = {
          databaseName: {
            contains: databaseName,
          },
        };
      }

      const fuzzyMatches = await this.prisma.tableMeta.findMany({
        where: fuzzyMatchWhere,
        include: {
          database: true,
        },
        take: limit,
      });

      console.log(`[EntityResolver] 找到 ${fuzzyMatches.length} 个模糊匹配的表`);

      // 计算模糊匹配分数
      return fuzzyMatches.map((table: Record<string, any>) => ({
        hint,
        matched: table,
        score: this.calculateTableMatchScore(tableName, table),
        type: 'fuzzy' as const,
      }));
    } catch (error) {
      console.error('搜索表时出错:', error);
      return [];
    }
  }

  /**
   * 搜索匹配的字段
   */
  async searchColumns(
    hint: string,
    tableId?: number,
    limit: number = 10
  ): Promise<EntityMatch[]> {
    try {
      const where: any = {
        OR: [
          { columnName: { contains: hint } },
          { columnComment: { contains: hint } },
          { semanticDescription: { contains: hint } },
        ],
      };

      // 如果指定了表ID，限制搜索范围
      if (tableId) {
        where.tableId = tableId;
      }

      const matches = await this.prisma.columnMeta.findMany({
        where,
        include: {
          table: {
            include: {
              database: true,
            },
          },
        },
        take: limit,
      });

      return matches.map((column: Record<string, any>) => ({
        hint,
        matched: column,
        score: this.calculateColumnMatchScore(hint, column),
        type: 'fuzzy' as const,
      }));
    } catch (error) {
      console.error('搜索字段时出错:', error);
      return [];
    }
  }

  /**
   * 计算表匹配分数
   */
  private calculateTableMatchScore(hint: string, table: Record<string, any>): number {
    let score = 0;
    const hintLower = hint.toLowerCase();
    const tableName = table.tableName.toLowerCase();
    const tableComment = (table.tableComment || '').toLowerCase();
    const semanticDesc = (table.semanticDescription || '').toLowerCase();

    // 精确匹配
    if (tableName === hintLower) {
      return 1.0;
    }

    // 表名包含提示词
    if (tableName.includes(hintLower)) {
      score += 0.7;
    }

    // 注释包含提示词
    if (tableComment.includes(hintLower)) {
      score += 0.5;
    }

    // 语义描述包含提示词
    if (semanticDesc.includes(hintLower)) {
      score += 0.6;
    }

    // 归一化到 0-1
    return Math.min(score, 1.0);
  }

  /**
   * 计算字段匹配分数
   */
  private calculateColumnMatchScore(hint: string, column: Record<string, any>): number {
    let score = 0;
    const hintLower = hint.toLowerCase();
    const columnName = column.columnName.toLowerCase();
    const columnComment = (column.columnComment || '').toLowerCase();
    const semanticDesc = (column.semanticDescription || '').toLowerCase();

    // 精确匹配
    if (columnName === hintLower) {
      return 1.0;
    }

    // 字段名包含提示词
    if (columnName.includes(hintLower)) {
      score += 0.7;
    }

    // 注释包含提示词
    if (columnComment.includes(hintLower)) {
      score += 0.5;
    }

    // 语义描述包含提示词
    if (semanticDesc.includes(hintLower)) {
      score += 0.6;
    }

    // 归一化到 0-1
    return Math.min(score, 1.0);
  }

  /**
   * 选择最佳匹配
   */
  selectBestMatch(matches: EntityMatch[]): EntityMatch | null {
    if (matches.length === 0) {
      return null;
    }

    // 按分数排序
    const sorted = [...matches].sort((a, b) => b.score - a.score);

    // 如果最高分明显高于第二高分，返回最高分
    if (sorted.length === 1 || sorted[0].score - sorted[1].score > 0.2) {
      return sorted[0];
    }

    // 否则返回 null，表示有歧义
    return null;
  }

  /**
   * 关闭数据库连接
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
