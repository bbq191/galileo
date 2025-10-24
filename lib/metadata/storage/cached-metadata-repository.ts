/**
 * 带缓存的元数据仓储
 * 在原有仓储基础上添加多级缓存支持
 */

import { metadataRepository } from './metadata-repository';
import { multiLevelCache } from '@/lib/cache';
import type { TableMeta, ColumnMeta, DatabaseMeta } from '@/app/generated/prisma';
import type { PaginatedResult, QueryOptions } from './types';

/**
 * 带缓存的元数据仓储类
 */
export class CachedMetadataRepository {
  /**
   * 获取表元数据（带缓存）
   */
  async getTableById(id: number): Promise<TableMeta | null> {
    return await multiLevelCache.get(
      'table_meta',
      { id, version: 'latest' },
      async () => {
        return await metadataRepository.getTableById(id);
      }
    );
  }

  /**
   * 获取表的所有列（带缓存）
   */
  async getTableColumns(tableId: number): Promise<ColumnMeta[]> {
    return await multiLevelCache.get('column_meta', { tableId }, async () => {
      return await metadataRepository.getTableColumns(tableId);
    });
  }

  /**
   * 获取数据库元数据（带缓存）
   */
  async getDatabaseById(id: number): Promise<DatabaseMeta | null> {
    return await multiLevelCache.get('database_meta', { id }, async () => {
      return await metadataRepository.getDatabaseById(id);
    });
  }

  /**
   * 获取数据源的所有数据库（带缓存）
   */
  async getDatabasesBySource(sourceId: number): Promise<DatabaseMeta[]> {
    return await multiLevelCache.get('databases_list', { sourceId }, async () => {
      return await metadataRepository.getDatabasesBySource(sourceId);
    });
  }

  /**
   * 获取表列表（分页，带缓存）
   */
  async getTablesPaginated(
    databaseId: number,
    options: QueryOptions
  ): Promise<PaginatedResult<TableMeta>> {
    // 生成缓存键参数
    const cacheParams = {
      databaseId,
      page: options.page || 1,
      limit: options.limit || 20,
      search: options.search || 'none',
    };

    return await multiLevelCache.get('tables_paginated', cacheParams, async () => {
      return await metadataRepository.getTablesPaginated(databaseId, options);
    });
  }

  /**
   * 获取表的显式关系（带缓存）
   */
  async getExplicitRelationshipsByTable(tableId: number) {
    return await multiLevelCache.get(
      'explicit_relationships',
      { tableId },
      async () => {
        return await metadataRepository.getExplicitRelationshipsByTable(tableId);
      }
    );
  }

  /**
   * 获取表的推断关系（带缓存）
   */
  async getInferredRelationshipsByTable(tableId: number, minConfidence: number = 0.7) {
    return await multiLevelCache.get(
      'inferred_relationships',
      { tableId, minConfidence },
      async () => {
        return await metadataRepository.getInferredRelationshipsByTable(
          tableId,
          minConfidence
        );
      }
    );
  }

  // ==================== 缓存失效方法 ====================

  /**
   * 表结构变更时失效相关缓存
   */
  async invalidateTableCache(tableId: number): Promise<void> {
    await multiLevelCache.invalidate('table_structure_changed', `metadata:table:${tableId}:*`);
    await multiLevelCache.invalidate('table_structure_changed', `metadata:column:table:${tableId}`);
  }

  /**
   * 数据库同步后失效相关缓存
   */
  async invalidateDatabaseCache(databaseId: number): Promise<void> {
    await multiLevelCache.invalidate('database_synced', `metadata:database:${databaseId}:*`);
    await multiLevelCache.invalidate('database_synced', `tables:list:db:${databaseId}:*`);
  }

  /**
   * 关系变更时失效相关缓存
   */
  async invalidateRelationshipCache(tableId?: number): Promise<void> {
    if (tableId) {
      await multiLevelCache.invalidate(
        'relationship_added',
        `relationships:*:table:${tableId}:*`
      );
      await multiLevelCache.invalidate('relationship_added', `graph:table:${tableId}:*`);
    } else {
      await multiLevelCache.invalidate('relationship_added', 'relationships:*');
      await multiLevelCache.invalidate('relationship_added', 'graph:*');
    }
  }

  /**
   * 手动触发同步时清空所有缓存
   */
  async invalidateAllCache(): Promise<void> {
    await multiLevelCache.clear();
  }

  // ==================== 直接调用原始方法（写操作） ====================

  /**
   * 创建表元数据（写操作，不缓存）
   */
  async createTable(input: any): Promise<TableMeta> {
    const table = await metadataRepository.createTable(input);
    // 失效相关缓存
    await this.invalidateDatabaseCache(input.databaseId);
    return table;
  }

  /**
   * 更新表元数据（写操作，不缓存）
   */
  async updateTable(id: number, input: any): Promise<TableMeta> {
    const table = await metadataRepository.updateTable(id, input);
    // 失效相关缓存
    await this.invalidateTableCache(id);
    return table;
  }

  /**
   * 删除表元数据（写操作，不缓存）
   */
  async deleteTable(id: number): Promise<void> {
    const table = await metadataRepository.getTableById(id);
    await metadataRepository.deleteTable(id);
    // 失效相关缓存
    if (table) {
      await this.invalidateTableCache(id);
      await this.invalidateDatabaseCache(table.databaseId);
    }
  }

  // ==================== 其他直接透传方法 ====================

  /**
   * 批量保存表元数据
   */
  async batchSaveTables(databaseId: number, tables: any[]) {
    const result = await metadataRepository.batchSaveTables(databaseId, tables);
    await this.invalidateDatabaseCache(databaseId);
    return result;
  }

  /**
   * 批量保存列元数据
   */
  async batchSaveColumns(tableId: number, columns: any[]) {
    const result = await metadataRepository.batchSaveColumns(tableId, columns);
    await this.invalidateTableCache(tableId);
    return result;
  }

  /**
   * 批量保存显式关系
   */
  async batchSaveExplicitRelationships(relationships: any[]) {
    const result = await metadataRepository.batchSaveExplicitRelationships(relationships);
    await this.invalidateRelationshipCache();
    return result;
  }

  /**
   * 批量保存推断关系
   */
  async batchSaveInferredRelationships(relationships: any[]) {
    const result = await metadataRepository.batchSaveInferredRelationships(relationships);
    await this.invalidateRelationshipCache();
    return result;
  }
}

// 导出单例
export const cachedMetadataRepository = new CachedMetadataRepository();
