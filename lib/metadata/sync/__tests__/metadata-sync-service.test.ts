/**
 * 元数据同步服务测试
 */

import { metadataSyncService } from '../metadata-sync-service';
import { metadataRepository } from '@/lib/metadata/storage';
import connectionManager from '@/lib/database/connection-manager';
import prisma from '@/lib/prisma/client';
import type { DatabaseConfig } from '@/lib/database';
import type { DataSource } from '@/app/generated/prisma';

/**
 * 测试元数据同步服务
 * 注意：需要本地 MySQL/MariaDB 运行
 */
export async function testMetadataSyncService() {
  console.log('\n========================================');
  console.log('元数据同步服务测试');
  console.log('========================================\n');

  let testDataSource: DataSource | null = null;
  const testConnectionId = 'test-sync-service';

  try {
    // ========================================
    // 准备测试数据
    // ========================================
    console.log('准备测试环境...');

    // 1. 创建测试数据库连接
    const config: DatabaseConfig = {
      id: testConnectionId,
      name: 'Test Sync Service Connection',
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '', // 根据实际情况修改
      databases: ['galileo_metadata'],
    };

    console.log('  - 创建数据库连接...');
    await connectionManager.createConnection(config);
    console.log('  ✓ 连接创建成功');

    // 2. 创建测试数据源
    console.log('  - 创建测试数据源...');
    testDataSource = await prisma.dataSource.create({
      data: {
        name: 'Test Sync Source',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        passwordEncrypted: '',
      },
    });
    console.log(`  ✓ 数据源创建成功 (ID: ${testDataSource.id})`);

    // 3. 将数据源 ID 更新为连接 ID（用于测试）
    // 注意：实际使用中，连接 ID 应该和数据源 ID 一致
    await connectionManager.closeConnection(testConnectionId);
    const newConfig = { ...config, id: String(testDataSource.id) };
    await connectionManager.createConnection(newConfig);
    console.log('  ✓ 连接 ID 已同步');

    console.log('✓ 测试环境准备完成\n');

    // ========================================
    // 1. 基础同步测试
    // ========================================
    console.log('1. 测试基础元数据同步...');

    console.log('  1.1 同步单个数据库 (galileo_metadata)...');
    const startTime1 = Date.now();
    const result1 = await metadataSyncService.syncDataSource({
      dataSourceId: testDataSource.id,
      databases: ['galileo_metadata'],
      inferRelationships: false, // 先不推断关系
      trackChanges: true,
    });

    console.log(`  ✓ 同步完成，耗时: ${result1.duration}ms`);
    console.log(`     数据库: ${result1.databaseCount}`);
    console.log(`     表: ${result1.tableCount}`);
    console.log(`     字段: ${result1.columnCount}`);
    console.log(`     显式关系: ${result1.explicitRelationshipCount}`);

    if (result1.errors.length > 0) {
      console.log(`     错误: ${result1.errors.length} 个`);
      result1.errors.slice(0, 3).forEach((err) => {
        console.log(`       - ${err}`);
      });
    }

    console.log();

    // ========================================
    // 2. 增量同步测试
    // ========================================
    console.log('2. 测试增量同步...');

    console.log('  2.1 第二次同步相同的数据库...');
    const result2 = await metadataSyncService.syncDataSource({
      dataSourceId: testDataSource.id,
      databases: ['galileo_metadata'],
      inferRelationships: false,
      trackChanges: true,
    });

    console.log(`  ✓ 增量同步完成，耗时: ${result2.duration}ms`);
    console.log(`     数据库: ${result2.databaseCount}`);
    console.log(`     表: ${result2.tableCount}`);
    console.log(`     字段: ${result2.columnCount}`);

    if (result2.changes) {
      console.log('     变更统计:');
      console.log(`       新增表: ${result2.changes.tablesAdded}`);
      console.log(`       删除表: ${result2.changes.tablesRemoved}`);
      console.log(`       修改表: ${result2.changes.tablesModified}`);
      console.log(`       新增字段: ${result2.changes.columnsAdded}`);
      console.log(`       删除字段: ${result2.changes.columnsRemoved}`);
      console.log(`       修改字段: ${result2.changes.columnsModified}`);
    }

    console.log();

    // ========================================
    // 3. 关系推断测试
    // ========================================
    console.log('3. 测试关系推断同步...');

    console.log('  3.1 开启关系推断重新同步...');
    const result3 = await metadataSyncService.syncDataSource({
      dataSourceId: testDataSource.id,
      databases: ['galileo_metadata'],
      inferRelationships: true,
      minConfidence: 0.70,
      trackChanges: true,
    });

    console.log(`  ✓ 同步完成，耗时: ${result3.duration}ms`);
    console.log(`     推断关系: ${result3.inferredRelationshipCount}`);

    console.log();

    // ========================================
    // 4. 查询同步后的元数据
    // ========================================
    console.log('4. 查询同步后的元数据...');

    // 4.1 查询数据库列表
    console.log('  4.1 查询数据库列表...');
    const databases = await metadataRepository.getDatabasesBySource(testDataSource.id);
    console.log(`  ✓ 找到 ${databases.length} 个数据库`);
    databases.forEach((db) => {
      console.log(`     - ${db.databaseName} (同步时间: ${db.lastSyncedAt?.toISOString()})`);
    });

    // 4.2 查询表列表（第一个数据库）
    if (databases.length > 0) {
      const firstDb = databases[0];
      console.log(`  4.2 查询表列表 (${firstDb.databaseName})...`);
      const tables = await metadataRepository.getTablesByDatabase(firstDb.id);
      console.log(`  ✓ 找到 ${tables.length} 张表`);
      tables.slice(0, 5).forEach((table) => {
        console.log(`     - ${table.tableName} (${table.rowCount || 0} 行)`);
      });
      if (tables.length > 5) {
        console.log(`     ... 还有 ${tables.length - 5} 张表`);
      }

      // 4.3 查询字段列表（第一张表）
      if (tables.length > 0) {
        const firstTable = tables[0];
        console.log(`  4.3 查询字段列表 (${firstTable.tableName})...`);
        const columns = await metadataRepository.getColumnsByTable(firstTable.id);
        console.log(`  ✓ 找到 ${columns.length} 个字段`);
        columns.slice(0, 5).forEach((col) => {
          console.log(
            `     - ${col.columnName} (${col.columnType}) ${col.isPrimaryKey ? '[PK]' : ''}`
          );
        });
        if (columns.length > 5) {
          console.log(`     ... 还有 ${columns.length - 5} 个字段`);
        }

        // 4.4 查询显式关系
        console.log(`  4.4 查询显式关系 (${firstTable.tableName})...`);
        const explicitRels = await metadataRepository.getExplicitRelationshipsBySourceTable(
          firstTable.id
        );
        console.log(`  ✓ 找到 ${explicitRels.length} 个显式关系`);
        explicitRels.slice(0, 3).forEach((rel: any) => {
          console.log(`     - ${rel.constraintName || 'N/A'}`);
        });

        // 4.5 查询推断关系
        console.log(`  4.5 查询推断关系 (${firstTable.tableName})...`);
        const inferredRels = await metadataRepository.getInferredRelationshipsBySourceTable(
          firstTable.id
        );
        console.log(`  ✓ 找到 ${inferredRels.length} 个推断关系`);
        inferredRels.slice(0, 3).forEach((rel: any) => {
          console.log(
            `     - ${rel.inferenceMethod} (置信度: ${rel.confidenceScore}, 已验证: ${rel.isVerified})`
          );
        });
      }
    }

    console.log();

    // ========================================
    // 5. 分页查询测试
    // ========================================
    console.log('5. 测试分页查询...');

    if (databases.length > 0) {
      const firstDb = databases[0];

      // 5.1 分页查询表
      console.log('  5.1 分页查询表（第 1 页，每页 5 条）...');
      const page1 = await metadataRepository.getTablesPaginated(firstDb.id, {
        page: 1,
        limit: 5,
      });
      console.log(`  ✓ 第 1 页: ${page1.data.length} 条`);
      console.log(`     总记录: ${page1.total}, 总页数: ${page1.totalPages}`);
      console.log(`     hasNext: ${page1.hasNext}, hasPrev: ${page1.hasPrev}`);

      // 5.2 搜索表
      console.log('  5.2 搜索表（关键词: "meta"）...');
      const searchResult = await metadataRepository.getTablesPaginated(firstDb.id, {
        search: 'meta',
        page: 1,
        limit: 10,
      });
      console.log(`  ✓ 搜索结果: ${searchResult.data.length} 条`);
      searchResult.data.slice(0, 3).forEach((table) => {
        console.log(`     - ${table.tableName}`);
      });

      // 5.3 排序查询
      console.log('  5.3 按行数降序查询表...');
      const sortedResult = await metadataRepository.getTablesPaginated(firstDb.id, {
        orderBy: 'rowCount',
        orderDirection: 'desc',
        page: 1,
        limit: 5,
      });
      console.log(`  ✓ 排序结果: ${sortedResult.data.length} 条`);
      sortedResult.data.forEach((table) => {
        console.log(`     - ${table.tableName}: ${table.rowCount || 0} 行`);
      });
    }

    console.log();

    // ========================================
    // 6. 变更历史测试
    // ========================================
    console.log('6. 测试变更历史...');

    console.log('  6.1 查询最近 10 条变更...');
    const recentChanges = await metadataRepository.getRecentChanges(10);
    console.log(`  ✓ 找到 ${recentChanges.length} 条变更记录`);
    recentChanges.slice(0, 5).forEach((change) => {
      console.log(
        `     - ${change.changeType} (${change.entityType}) at ${change.changedAt.toISOString()}`
      );
    });

    console.log();

    // ========================================
    // 7. 性能统计
    // ========================================
    console.log('7. 性能统计...');
    console.log(`  首次同步耗时: ${result1.duration}ms`);
    console.log(`  增量同步耗时: ${result2.duration}ms`);
    console.log(`  关系推断同步耗时: ${result3.duration}ms`);

    if (result1.tableCount > 0) {
      console.log(`  平均每张表同步耗时: ${Math.round(result1.duration / result1.tableCount)}ms`);
    }

    console.log();

    // ========================================
    // 8. 清理测试数据
    // ========================================
    console.log('8. 清理测试数据...');

    // 清理元数据（级联删除）
    for (const db of databases) {
      await metadataRepository.deleteDatabase(db.id);
    }
    console.log('  ✓ 元数据已清理');

    // 删除数据源
    await prisma.dataSource.delete({ where: { id: testDataSource.id } });
    console.log('  ✓ 数据源已删除');

    // 关闭连接
    await connectionManager.closeConnection(String(testDataSource.id));
    console.log('  ✓ 连接已关闭');

    console.log();
    console.log('========================================');
    console.log('✓ 所有测试通过');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n✗ 测试失败:', error);

    // 清理可能残留的测试数据
    try {
      if (testDataSource) {
        // 清理元数据
        const databases = await metadataRepository.getDatabasesBySource(testDataSource.id);
        for (const db of databases) {
          await metadataRepository.deleteDatabase(db.id).catch(() => {});
        }

        // 删除数据源
        await prisma.dataSource.delete({ where: { id: testDataSource.id } }).catch(() => {});

        // 关闭连接
        await connectionManager.closeConnection(String(testDataSource.id)).catch(() => {});
      }
    } catch (cleanupError) {
      console.error('清理失败:', cleanupError);
    }

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此文件
if (require.main === module) {
  testMetadataSyncService()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
