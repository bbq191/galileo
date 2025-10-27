/**
 * 上下文构建器
 * 将检索到的元数据组装成完整的上下文
 */

import { PrismaClient } from '@prisma/client';
import { TableContext, ColumnContext, MetadataContext, RelationshipContext } from './types';

/**
 * 上下文构建器
 */
export class ContextBuilder {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
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
    // 注意：这里需要实际执行 SQL 查询
    // 为了安全，这里只是占位实现
    // 实际应该通过 connection manager 获取连接并查询
    try {
      // TODO: 实现实际的数据查询
      // const connection = await getConnection(table.database.sourceId);
      // const [rows] = await connection.query(
      //   `SELECT DISTINCT \`${columnName}\` FROM \`${table.database.databaseName}\`.\`${table.tableName}\` LIMIT ${limit}`
      // );
      // return rows.map((r: any) => r[columnName]);

      return []; // 暂时返回空数组
    } catch (error) {
      console.warn(`获取示例数据失败 (${table.tableName}.${columnName}):`, error);
      return [];
    }
  }

  /**
   * 获取表索引
   */
  private async getTableIndexes(tableId: number): Promise<string[]> {
    // TODO: 从数据库获取索引信息
    // 目前 schema 中可能没有索引表，需要扩展
    return [];
  }

  /**
   * 构建关系上下文
   */
  async buildRelationshipContexts(
    tableIds: number[]
  ): Promise<RelationshipContext[]> {
    const relationships: RelationshipContext[] = [];

    // 1. 获取显式关系（外键）
    const explicitRels = await this.prisma.explicitRelationship.findMany({
      where: {
        OR: [
          { sourceTableId: { in: tableIds } },
          { targetTableId: { in: tableIds } },
        ],
      },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });

    for (const rel of explicitRels) {
      relationships.push({
        id: rel.id,
        sourceTable: (rel.sourceTable as any).tableName,
        sourceColumn: (rel.sourceColumn as any).columnName,
        targetTable: (rel.targetTable as any).tableName,
        targetColumn: (rel.targetColumn as any).columnName,
        type: 'explicit',
      });
    }

    // 2. 获取高置信度的推断关系
    const inferredRels = await this.prisma.inferredRelationship.findMany({
      where: {
        OR: [
          { sourceTableId: { in: tableIds } },
          { targetTableId: { in: tableIds } },
        ],
        confidenceScore: { gte: 0.75 }, // 置信度阈值
        isVerified: true, // 优先使用已验证的关系
      },
      include: {
        sourceTable: true,
        targetTable: true,
        sourceColumn: true,
        targetColumn: true,
      },
    });

    for (const rel of inferredRels) {
      relationships.push({
        id: rel.id,
        sourceTable: (rel.sourceTable as any).tableName,
        sourceColumn: (rel.sourceColumn as any).columnName,
        targetTable: (rel.targetTable as any).tableName,
        targetColumn: (rel.targetColumn as any).columnName,
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
