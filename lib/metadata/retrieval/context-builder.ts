/**
 * 上下文构建器
 * 将检索到的元数据组装成完整的上下文
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import { TableContext, ColumnContext, MetadataContext, RelationshipContext } from './types';
import { connectionManager } from '@/lib/database';

/**
 * 上下文构建器
 */
export class ContextBuilder {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * 构建表上下文
   */
  async buildTableContext(
    table: any,
    options: {
      includeSampleData?: boolean;
      includeIndexes?: boolean;
    } = {}
  ): Promise<TableContext> {
    // 获取字段信息
    const columns = await this.prisma.columnMeta.findMany({
      where: { tableId: table.id },
      orderBy: { ordinalPosition: 'asc' },
    });

    // 主键
    const primaryKeys = columns
      .filter((c: any) => c.isPrimaryKey)
      .map((c: any) => c.columnName);

    // 构建字段上下文
    const columnContexts: ColumnContext[] = await Promise.all(
      columns.map(async (col: any) => {
        const context: ColumnContext = {
          id: col.id,
          columnName: col.columnName,
          dataType: col.dataType,
          columnComment: col.columnComment,
          semanticDescription: col.semanticDescription,
          isPrimaryKey: col.isPrimaryKey,
          isNullable: col.isNullable,
        };

        // 可选：获取示例数据
        if (options.includeSampleData) {
          context.sampleValues = await this.getSampleValues(
            table,
            col.columnName,
            3
          );
        }

        return context;
      })
    );

    // 索引信息（可选）
    const indexes = options.includeIndexes
      ? await this.getTableIndexes(table.id)
      : [];

    return {
      id: table.id,
      databaseName: table.database?.databaseName || '',
      tableName: table.tableName,
      tableComment: table.tableComment,
      semanticDescription: table.semanticDescription,
      columns: columnContexts,
      primaryKeys,
      indexes,
      rowCount: table.rowCount,
      database: table.database ? {
        id: table.database.id,
        databaseName: table.database.databaseName,
        sourceId: table.database.sourceId,
      } : undefined,
    };
  }

  /**
   * 获取示例值
   */
  private async getSampleValues(
    table: any,
    columnName: string,
    limit: number
  ): Promise<any[]> {
    try {
      // 检查表是否有必需的数据库信息
      if (!table.database?.sourceId || !table.database?.databaseName || !table.tableName) {
        console.warn(`表信息不完整，无法获取示例数据:`, {
          hasSourceId: !!table.database?.sourceId,
          hasDatabaseName: !!table.database?.databaseName,
          hasTableName: !!table.tableName
        });
        return [];
      }

      const sourceId = table.database.sourceId.toString();

      // 检查连接是否存在
      const hasConnection = await connectionManager.hasConnection(sourceId);
      if (!hasConnection) {
        console.warn(`数据源连接不存在: ${sourceId}`);
        return [];
      }

      // 获取连接池
      const pool = await connectionManager.getConnection(sourceId);
      const connection = await pool.getConnection();

      try {
        // 构建安全的查询 SQL
        const sql = `
          SELECT DISTINCT \`${columnName}\`
          FROM \`${table.database.databaseName}\`.\`${table.tableName}\`
          WHERE \`${columnName}\` IS NOT NULL
          LIMIT ${limit}
        `;

        // 执行查询
        const [rows] = await connection.query(sql) as any;

        // 释放连接
        connection.release();

        // 提取示例值
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map((r: any) => r[columnName]).filter(v => v !== null && v !== undefined);
        }

        return [];
      } catch (queryError) {
        // 确保连接被释放
        connection.release();
        throw queryError;
      }
    } catch (error: any) {
      // 只在非预期错误时记录警告
      if (error.code !== 'ER_NO_SUCH_TABLE' && error.code !== 'ER_BAD_DB_ERROR') {
        console.warn(`获取示例数据失败 (${table.tableName}.${columnName}):`, error.message);
      }
      return [];
    }
  }

  /**
   * 获取表索引
   */
  private async getTableIndexes(tableId: number): Promise<string[]> {
    try {
      // 从数据库获取表信息
      const table = await this.prisma.tableMeta.findUnique({
        where: { id: tableId },
        include: {
          database: {
            include: {
              source: true,
            },
          },
        },
      });

      if (!table || !table.database || !table.database.source) {
        return [];
      }

      // 获取数据库连接
      const source = table.database.source;
      const databaseName = table.database.databaseName;
      const tableName = table.tableName;

      // 从实际数据库查询索引信息
      const connectionId = source.id.toString();

      const pool = await connectionManager.getConnection(connectionId);

      // 查询索引信息（MySQL/MariaDB）
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(
          `SHOW INDEX FROM \`${databaseName}\`.\`${tableName}\``
        ) as any;

        // 释放连接
        connection.release();

        // 提取唯一的索引名称
        const indexes = new Set<string>();
        for (const row of rows as any[]) {
          if (row.Key_name && row.Key_name !== 'PRIMARY') {
            indexes.add(row.Key_name);
          }
        }

        return Array.from(indexes);
      } catch (queryError) {
        // 确保连接被释放
        connection.release();
        throw queryError;
      }
    } catch (error: any) {
      // 静默失败，返回空数组
      // 索引信息不是必需的，不应阻塞主流程
      if (error.code !== 'ER_NO_SUCH_TABLE' && error.code !== 'ER_BAD_DB_ERROR') {
        console.warn(`获取索引信息失败 (tableId: ${tableId}):`, error.message);
      }
      return [];
    }
  }

  /**
   * 构建关系上下文（懒加载优化：使用批量查询和 select）
   */
  async buildRelationshipContexts(
    tableIds: number[]
  ): Promise<RelationshipContext[]> {
    const relationships: RelationshipContext[] = [];

    // 1. 获取显式关系（外键）- 懒加载优化：使用 select 而不是 include
    const explicitRels = await this.prisma.explicitRelationship.findMany({
      where: {
        OR: [
          { sourceTableId: { in: tableIds } },
          { targetTableId: { in: tableIds } },
        ],
      },
      select: {
        id: true,
        sourceTableId: true,
        targetTableId: true,
        sourceColumnId: true,
        targetColumnId: true,
      },
    });

    // 2. 获取高置信度的推断关系 - 懒加载优化：使用 select 而不是 include
    const inferredRels = await this.prisma.inferredRelationship.findMany({
      where: {
        OR: [
          { sourceTableId: { in: tableIds } },
          { targetTableId: { in: tableIds } },
        ],
        confidenceScore: { gte: 0.75 }, // 置信度阈值
        isVerified: true, // 优先使用已验证的关系
      },
      select: {
        id: true,
        sourceTableId: true,
        targetTableId: true,
        sourceColumnId: true,
        targetColumnId: true,
        confidenceScore: true,
      },
    });

    // 3. 批量获取需要的表和列信息
    const allTableIds = new Set<number>();
    const allColumnIds = new Set<number>();

    for (const rel of [...explicitRels, ...inferredRels]) {
      allTableIds.add(rel.sourceTableId);
      allTableIds.add(rel.targetTableId);
      allColumnIds.add(rel.sourceColumnId);
      allColumnIds.add(rel.targetColumnId);
    }

    // 批量查询表信息
    const tables = await this.prisma.tableMeta.findMany({
      where: { id: { in: Array.from(allTableIds) } },
      select: { id: true, tableName: true },
    });

    // 批量查询列信息
    const columns = await this.prisma.columnMeta.findMany({
      where: { id: { in: Array.from(allColumnIds) } },
      select: { id: true, columnName: true },
    });

    // 构建映射以便快速查找
    const tableMap = new Map(tables.map((t: any) => [t.id, t.tableName]));
    const columnMap = new Map(columns.map((c: any) => [c.id, c.columnName]));

    // 4. 构建显式关系上下文
    for (const rel of explicitRels) {
      relationships.push({
        id: rel.id,
        sourceTable: tableMap.get(rel.sourceTableId) || '',
        sourceColumn: columnMap.get(rel.sourceColumnId) || '',
        targetTable: tableMap.get(rel.targetTableId) || '',
        targetColumn: columnMap.get(rel.targetColumnId) || '',
        type: 'explicit',
      });
    }

    // 5. 构建推断关系上下文
    for (const rel of inferredRels) {
      relationships.push({
        id: rel.id,
        sourceTable: tableMap.get(rel.sourceTableId) || '',
        sourceColumn: columnMap.get(rel.sourceColumnId) || '',
        targetTable: tableMap.get(rel.targetTableId) || '',
        targetColumn: columnMap.get(rel.targetColumnId) || '',
        type: 'inferred',
        confidence: Number(rel.confidenceScore),
      });
    }

    return relationships;
  }

  /**
   * 构建完整的元数据上下文
   */
  async buildMetadataContext(
    tables: any[],
    options: {
      includeSampleData?: boolean;
      includeIndexes?: boolean;
    } = {}
  ): Promise<MetadataContext> {
    // 构建表上下文
    const tableContexts = await Promise.all(
      tables.map(t => this.buildTableContext(t, options))
    );

    // 获取表关系
    const tableIds = tableContexts.map(t => t.id);
    const relationships = await this.buildRelationshipContexts(tableIds);

    // 扁平化所有字段
    const allColumns = tableContexts.flatMap(t => t.columns);

    // 评估复杂度
    const complexity = this.assessComplexity(tableContexts, relationships);

    return {
      tables: tableContexts,
      relationships,
      columns: allColumns,
      estimatedComplexity: complexity,
    };
  }

  /**
   * 评估查询复杂度
   */
  private assessComplexity(
    tables: TableContext[],
    relationships: RelationshipContext[]
  ): 'low' | 'medium' | 'high' {
    const tableCount = tables.length;
    const totalColumns = tables.reduce((sum, t) => sum + t.columns.length, 0);
    const crossDbJoins = this.countCrossDbJoins(tables, relationships);

    // 简单查询
    if (tableCount === 1 && totalColumns < 20) {
      return 'low';
    }

    // 中等查询
    if (tableCount <= 3 && crossDbJoins === 0 && totalColumns < 50) {
      return 'medium';
    }

    // 复杂查询
    return 'high';
  }

  /**
   * 统计跨库 JOIN 数量
   */
  private countCrossDbJoins(
    tables: TableContext[],
    relationships: RelationshipContext[]
  ): number {
    let count = 0;

    for (const rel of relationships) {
      const sourceTable = tables.find(t => t.tableName === rel.sourceTable);
      const targetTable = tables.find(t => t.tableName === rel.targetTable);

      if (
        sourceTable &&
        targetTable &&
        sourceTable.databaseName !== targetTable.databaseName
      ) {
        count++;
      }
    }

    return count;
  }

  /**
   * 关闭数据库连接
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
