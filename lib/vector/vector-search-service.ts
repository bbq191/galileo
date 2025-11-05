/**
 * 向量搜索服务
 * 集成向量化和搜索功能，提供元数据的语义搜索能力
 */

import { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma/client';
import { VectorStore } from './vector-store';
import { EmbeddingGenerator } from './embedding-generator';
import { VectorIndexConfig, VectorSearchOptions, VectorSearchResult } from './types';
import Redis from 'ioredis';

/**
 * 元数据项类型
 */
export interface MetadataItem {
  id: string;
  type: 'table' | 'column' | 'database';
  name: string;
  description: string;
  metadata: Record<string, any>;
}

/**
 * 向量搜索服务配置
 */
export interface VectorSearchServiceConfig {
  /** 是否启用 Redis 持久化 */
  enableRedis?: boolean;
  /** Redis 配置 */
  redisConfig?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  /** 向量维度 */
  dimension?: number;
}

/**
 * 向量搜索服务
 * 提供元数据的向量化和语义搜索
 */
export class VectorSearchService {
  private prisma: PrismaClient;
  private embedder: EmbeddingGenerator;
  private tableStore: VectorStore;
  private columnStore: VectorStore;
  private redis?: Redis;
  private initialized = false;

  constructor(config: VectorSearchServiceConfig = {}) {
    this.prisma = prisma;
    this.embedder = new EmbeddingGenerator();

    // 初始化 Redis（可选）
    if (config.enableRedis && config.redisConfig) {
      this.redis = new Redis(config.redisConfig);
    }

    const dimension = config.dimension || 384;

    // 创建表向量存储
    const tableConfig: VectorIndexConfig = {
      name: 'tables',
      dimension,
      persistent: config.enableRedis !== false,
      redisPrefix: 'vector:tables',
    };
    this.tableStore = new VectorStore(tableConfig, this.redis);

    // 创建字段向量存储
    const columnConfig: VectorIndexConfig = {
      name: 'columns',
      dimension,
      persistent: config.enableRedis !== false,
      redisPrefix: 'vector:columns',
    };
    this.columnStore = new VectorStore(columnConfig, this.redis);
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('正在初始化向量搜索服务...');

    // 初始化向量存储
    await this.tableStore.initialize();
    await this.columnStore.initialize();

    // 如果向量存储为空，建立索引
    if (this.tableStore.size() === 0) {
      console.log('向量索引为空，开始建立索引...');
      await this.buildIndex();
    }

    this.initialized = true;
    console.log('✓ 向量搜索服务初始化完成');
  }

  /**
   * 建立向量索引
   * 为数据库中的所有表和字段生成向量
   */
  async buildIndex(): Promise<void> {
    console.log('开始为元数据建立向量索引...');

    // 1. 为表建立索引
    await this.indexTables();

    // 2. 为字段建立索引
    await this.indexColumns();

    console.log('✓ 向量索引建立完成');
  }

  /**
   * 为表建立索引
   */
  private async indexTables(): Promise<void> {
    console.log('正在为表建立索引...');

    // 获取所有表
    const tables = await this.prisma.tableMeta.findMany({
      include: {
        database: true,
      },
    });

    console.log(`找到 ${tables.length} 个表，开始向量化...`);

    // 批量处理
    const batchSize = 50;
    for (let i = 0; i < tables.length; i += batchSize) {
      const batch = tables.slice(i, i + batchSize);

      // 生成向量
      const embeddings = await Promise.all(
        batch.map(async (table: any) => {
          const text = this.buildTableText(table);
          const { vector } = await this.embedder.generate(text);
          return {
            id: `table:${table.id}`,
            vector,
            data: {
              id: table.id,
              type: 'table',
              tableName: table.tableName,
              databaseName: table.database?.databaseName,
              tableComment: table.tableComment,
              semanticDescription: table.semanticDescription,
            },
            metadata: {
              databaseId: table.databaseId,
              rowCount: table.rowCount,
            },
          };
        })
      );

      // 批量添加到向量存储
      await this.tableStore.addBatch(embeddings);

      console.log(`已处理 ${Math.min(i + batchSize, tables.length)}/${tables.length} 个表`);
    }

    console.log(`✓ 表索引建立完成，共 ${tables.length} 个表`);
  }

  /**
   * 为字段建立索引
   */
  private async indexColumns(): Promise<void> {
    console.log('正在为字段建立索引...');

    // 获取所有字段
    const columns = await this.prisma.columnMeta.findMany({
      include: {
        table: {
          include: {
            database: true,
          },
        },
      },
    });

    console.log(`找到 ${columns.length} 个字段，开始向量化...`);

    // 批量处理
    const batchSize = 100;
    for (let i = 0; i < columns.length; i += batchSize) {
      const batch = columns.slice(i, i + batchSize);

      // 生成向量
      const embeddings = await Promise.all(
        batch.map(async (column: any) => {
          const text = this.buildColumnText(column);
          const { vector } = await this.embedder.generate(text);
          return {
            id: `column:${column.id}`,
            vector,
            data: {
              id: column.id,
              type: 'column',
              columnName: column.columnName,
              tableName: column.table?.tableName,
              databaseName: column.table?.database?.databaseName,
              dataType: column.dataType,
              columnComment: column.columnComment,
              semanticDescription: column.semanticDescription,
            },
            metadata: {
              tableId: column.tableId,
              isPrimaryKey: column.isPrimaryKey,
              isNullable: column.isNullable,
            },
          };
        })
      );

      // 批量添加到向量存储
      await this.columnStore.addBatch(embeddings);

      console.log(`已处理 ${Math.min(i + batchSize, columns.length)}/${columns.length} 个字段`);
    }

    console.log(`✓ 字段索引建立完成，共 ${columns.length} 个字段`);
  }

  /**
   * 构建表的文本表示（用于向量化）
   */
  private buildTableText(table: any): string {
    const parts: string[] = [];

    // 表名（权重高）
    parts.push(table.tableName);
    parts.push(table.tableName);

    // 数据库名
    if (table.database?.databaseName) {
      parts.push(table.database.databaseName);
    }

    // 表注释
    if (table.tableComment) {
      parts.push(table.tableComment);
    }

    // 语义描述（权重高）
    if (table.semanticDescription) {
      parts.push(table.semanticDescription);
      parts.push(table.semanticDescription);
    }

    return parts.join(' ');
  }

  /**
   * 构建字段的文本表示（用于向量化）
   */
  private buildColumnText(column: any): string {
    const parts: string[] = [];

    // 字段名（权重高）
    parts.push(column.columnName);
    parts.push(column.columnName);

    // 表名和数据库名（上下文）
    if (column.table?.tableName) {
      parts.push(column.table.tableName);
    }
    if (column.table?.database?.databaseName) {
      parts.push(column.table.database.databaseName);
    }

    // 数据类型
    if (column.dataType) {
      parts.push(column.dataType);
    }

    // 字段注释
    if (column.columnComment) {
      parts.push(column.columnComment);
    }

    // 语义描述（权重高）
    if (column.semanticDescription) {
      parts.push(column.semanticDescription);
      parts.push(column.semanticDescription);
    }

    return parts.join(' ');
  }

  /**
   * 搜索表
   */
  async searchTables(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.tableStore.searchByText(query, {
      limit: options.limit || 10,
      threshold: options.threshold || 0.5,
      filter: options.filter,
    });
  }

  /**
   * 搜索字段
   */
  async searchColumns(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.columnStore.searchByText(query, {
      limit: options.limit || 10,
      threshold: options.threshold || 0.5,
      filter: options.filter,
    });
  }

  /**
   * 添加或更新表向量
   */
  async upsertTableVector(tableId: number): Promise<void> {
    const table = await this.prisma.tableMeta.findUnique({
      where: { id: tableId },
      include: { database: true },
    });

    if (!table) {
      throw new Error(`Table not found: ${tableId}`);
    }

    const text = this.buildTableText(table);
    const { vector } = await this.embedder.generate(text);

    const id = `table:${table.id}`;
    if (this.tableStore.has(id)) {
      await this.tableStore.update(
        id,
        vector,
        {
          id: table.id,
          type: 'table',
          tableName: table.tableName,
          databaseName: table.database?.databaseName,
          tableComment: table.tableComment,
          semanticDescription: table.semanticDescription,
        },
        {
          databaseId: table.databaseId,
          rowCount: table.rowCount,
        }
      );
    } else {
      await this.tableStore.add(
        id,
        vector,
        {
          id: table.id,
          type: 'table',
          tableName: table.tableName,
          databaseName: table.database?.databaseName,
          tableComment: table.tableComment,
          semanticDescription: table.semanticDescription,
        },
        {
          databaseId: table.databaseId,
          rowCount: table.rowCount,
        }
      );
    }
  }

  /**
   * 添加或更新字段向量
   */
  async upsertColumnVector(columnId: number): Promise<void> {
    const column = await this.prisma.columnMeta.findUnique({
      where: { id: columnId },
      include: {
        table: {
          include: {
            database: true,
          },
        },
      },
    });

    if (!column) {
      throw new Error(`Column not found: ${columnId}`);
    }

    const text = this.buildColumnText(column);
    const { vector } = await this.embedder.generate(text);

    const id = `column:${column.id}`;
    if (this.columnStore.has(id)) {
      await this.columnStore.update(
        id,
        vector,
        {
          id: column.id,
          type: 'column',
          columnName: column.columnName,
          tableName: (column.table as any)?.tableName,
          databaseName: (column.table as any)?.database?.databaseName,
          dataType: column.dataType,
          columnComment: column.columnComment,
          semanticDescription: column.semanticDescription,
        },
        {
          tableId: column.tableId,
          isPrimaryKey: column.isPrimaryKey,
          isNullable: column.isNullable,
        }
      );
    } else {
      await this.columnStore.add(
        id,
        vector,
        {
          id: column.id,
          type: 'column',
          columnName: column.columnName,
          tableName: (column.table as any)?.tableName,
          databaseName: (column.table as any)?.database?.databaseName,
          dataType: column.dataType,
          columnComment: column.columnComment,
          semanticDescription: column.semanticDescription,
        },
        {
          tableId: column.tableId,
          isPrimaryKey: column.isPrimaryKey,
          isNullable: column.isNullable,
        }
      );
    }
  }

  /**
   * 删除表向量
   */
  async deleteTableVector(tableId: number): Promise<void> {
    await this.tableStore.delete(`table:${tableId}`);
  }

  /**
   * 删除字段向量
   */
  async deleteColumnVector(columnId: number): Promise<void> {
    await this.columnStore.delete(`column:${columnId}`);
  }

  /**
   * 重建索引
   */
  async rebuildIndex(): Promise<void> {
    console.log('正在重建向量索引...');

    // 清空现有索引
    await this.tableStore.clear();
    await this.columnStore.clear();

    // 重新建立索引
    await this.buildIndex();

    console.log('✓ 向量索引重建完成');
  }

  /**
   * 获取索引统计信息
   */
  async getStats() {
    const tableStats = await this.tableStore.getStats();
    const columnStats = await this.columnStore.getStats();

    return {
      tables: tableStats,
      columns: columnStats,
      total: {
        items: tableStats.totalItems + columnStats.totalItems,
        sizeBytes: tableStats.sizeBytes + columnStats.sizeBytes,
      },
    };
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    await this.prisma.$disconnect();
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
