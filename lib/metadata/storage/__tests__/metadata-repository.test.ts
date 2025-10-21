/**
 * 元数据仓储测试
 */

import { metadataRepository } from '../metadata-repository';
import prisma from '@/lib/prisma/client';
import type { DataSource } from '@/app/generated/prisma';

/**
 * 测试元数据仓储的 CRUD 操作
 * 注意：需要本地 MariaDB 运行并正确配置 Prisma
 */
export async function testMetadataRepository() {
  console.log('\n========================================');
  console.log('元数据仓储测试');
  console.log('========================================\n');

  let testDataSource: DataSource | null = null;
  let testDatabaseId: number | null = null;
  let testTableId: number | null = null;
  let testColumnId: number | null = null;

  try {
    // ========================================
    // 1. 数据库元数据测试
    // ========================================
    console.log('1. 测试数据库元数据操作...');

    // 1.1 准备：创建测试数据源
    console.log('  1.1 创建测试数据源...');
    testDataSource = await prisma.dataSource.create({
      data: {
        name: 'Test Source for Repository',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        passwordEncrypted: '',
      },
    });
    console.log(`  ✓ 数据源已创建 (ID: ${testDataSource.id})`);

    // 1.2 创建数据库元数据
    console.log('  1.2 创建数据库元数据...');
    const database = await metadataRepository.createDatabase({
      sourceId: testDataSource.id,
      databaseName: 'test_db_repo',
      semanticDescription: '测试数据库',
    });
    testDatabaseId = database.id;
    console.log(`  ✓ 数据库元数据已创建 (ID: ${database.id})`);

    // 1.3 获取数据库元数据
    console.log('  1.3 获取数据库元数据...');
    const fetchedDatabase = await metadataRepository.getDatabaseById(database.id);
    if (!fetchedDatabase) {
      throw new Error('获取数据库元数据失败');
    }
    console.log(`  ✓ 数据库元数据已获取: ${fetchedDatabase.databaseName}`);

    // 1.4 按数据源获取数据库列表
    console.log('  1.4 按数据源获取数据库列表...');
    const databases = await metadataRepository.getDatabasesBySource(testDataSource.id);
    console.log(`  ✓ 找到 ${databases.length} 个数据库`);

    // 1.5 更新数据库元数据
    console.log('  1.5 更新数据库元数据...');
    const updatedDatabase = await metadataRepository.updateDatabase(database.id, {
      semanticDescription: '更新后的测试数据库',
    });
    console.log(`  ✓ 数据库元数据已更新: ${updatedDatabase.semanticDescription}`);

    // 1.6 测试 Upsert
    console.log('  1.6 测试数据库 Upsert...');
    const upsertedDatabase = await metadataRepository.upsertDatabase({
      sourceId: testDataSource.id,
      databaseName: 'test_db_repo',
      semanticDescription: 'Upsert 测试',
    });
    console.log(`  ✓ Upsert 成功: ${upsertedDatabase.semanticDescription}`);

    console.log();

    // ========================================
    // 2. 表元数据测试
    // ========================================
    console.log('2. 测试表元数据操作...');

    // 2.1 创建表元数据
    console.log('  2.1 创建表元数据...');
    const table = await metadataRepository.createTable({
      databaseId: database.id,
      tableName: 'test_table',
      tableComment: '测试表',
      semanticDescription: '用于测试的表',
      rowCount: BigInt(100),
    });
    testTableId = table.id;
    console.log(`  ✓ 表元数据已创建 (ID: ${table.id})`);

    // 2.2 获取表元数据
    console.log('  2.2 获取表元数据...');
    const fetchedTable = await metadataRepository.getTableById(table.id);
    if (!fetchedTable) {
      throw new Error('获取表元数据失败');
    }
    console.log(`  ✓ 表元数据已获取: ${fetchedTable.tableName}`);

    // 2.3 按数据库获取表列表
    console.log('  2.3 按数据库获取表列表...');
    const tables = await metadataRepository.getTablesByDatabase(database.id);
    console.log(`  ✓ 找到 ${tables.length} 张表`);

    // 2.4 分页获取表列表
    console.log('  2.4 分页获取表列表...');
    const paginatedTables = await metadataRepository.getTablesPaginated(database.id, {
      page: 1,
      limit: 10,
    });
    console.log(`  ✓ 分页结果: ${paginatedTables.data.length}/${paginatedTables.total}`);
    console.log(`     总页数: ${paginatedTables.totalPages}, 当前页: ${paginatedTables.page}`);

    // 2.5 搜索表
    console.log('  2.5 搜索表...');
    const searchResult = await metadataRepository.getTablesPaginated(database.id, {
      search: 'test',
      page: 1,
      limit: 10,
    });
    console.log(`  ✓ 搜索到 ${searchResult.total} 张表`);

    // 2.6 更新表元数据
    console.log('  2.6 更新表元数据...');
    const updatedTable = await metadataRepository.updateTable(table.id, {
      semanticDescription: '更新后的测试表',
      rowCount: BigInt(200),
    });
    console.log(`  ✓ 表元数据已更新: ${updatedTable.semanticDescription}, 行数: ${updatedTable.rowCount}`);

    // 2.7 测试 Upsert
    console.log('  2.7 测试表 Upsert...');
    const upsertedTable = await metadataRepository.upsertTable({
      databaseId: database.id,
      tableName: 'test_table',
      tableComment: 'Upsert 测试',
      rowCount: BigInt(300),
    });
    console.log(`  ✓ Upsert 成功: ${upsertedTable.tableComment}, 行数: ${upsertedTable.rowCount}`);

    console.log();

    // ========================================
    // 3. 字段元数据测试
    // ========================================
    console.log('3. 测试字段元数据操作...');

    // 3.1 创建字段元数据
    console.log('  3.1 创建字段元数据...');
    const column = await metadataRepository.createColumn({
      tableId: table.id,
      columnName: 'id',
      dataType: 'int',
      columnType: 'INT',
      ordinalPosition: 1,
      isNullable: false,
      isPrimaryKey: true,
      columnComment: 'ID',
      semanticDescription: '主键ID',
    });
    testColumnId = column.id;
    console.log(`  ✓ 字段元数据已创建 (ID: ${column.id})`);

    // 3.2 获取字段元数据
    console.log('  3.2 获取字段元数据...');
    const fetchedColumn = await metadataRepository.getColumnById(column.id);
    if (!fetchedColumn) {
      throw new Error('获取字段元数据失败');
    }
    console.log(`  ✓ 字段元数据已获取: ${fetchedColumn.columnName}`);

    // 3.3 按表获取字段列表
    console.log('  3.3 按表获取字段列表...');
    const columns = await metadataRepository.getColumnsByTable(table.id);
    console.log(`  ✓ 找到 ${columns.length} 个字段`);

    // 3.4 批量 Upsert 字段
    console.log('  3.4 批量 Upsert 字段...');
    const batchColumns = [
      {
        tableId: table.id,
        columnName: 'name',
        dataType: 'varchar',
        columnType: 'VARCHAR(100)',
        ordinalPosition: 2,
        isNullable: false,
        columnComment: '名称',
      },
      {
        tableId: table.id,
        columnName: 'created_at',
        dataType: 'datetime',
        columnType: 'DATETIME',
        ordinalPosition: 3,
        isNullable: false,
        columnComment: '创建时间',
      },
    ];
    const batchResult = await metadataRepository.batchUpsertColumns(batchColumns);
    console.log(`  ✓ 批量创建成功: ${batchResult.successCount}, 失败: ${batchResult.failureCount}`);

    // 3.5 更新字段元数据
    console.log('  3.5 更新字段元数据...');
    const updatedColumn = await metadataRepository.updateColumn(column.id, {
      semanticDescription: '更新后的主键ID',
    });
    console.log(`  ✓ 字段元数据已更新: ${updatedColumn.semanticDescription}`);

    console.log();

    // ========================================
    // 4. 显式关系测试
    // ========================================
    console.log('4. 测试显式关系操作...');

    // 4.1 创建第二张表
    console.log('  4.1 创建第二张表...');
    const table2 = await metadataRepository.createTable({
      databaseId: database.id,
      tableName: 'test_table_2',
      tableComment: '测试表2',
    });
    console.log(`  ✓ 表2已创建 (ID: ${table2.id})`);

    // 4.2 创建外键字段
    const fkColumn = await metadataRepository.createColumn({
      tableId: table2.id,
      columnName: 'test_table_id',
      dataType: 'int',
      columnType: 'INT',
      ordinalPosition: 1,
      isNullable: false,
    });

    // 4.3 创建显式关系
    console.log('  4.2 创建显式关系...');
    const explicitRel = await metadataRepository.createExplicitRelationship({
      sourceTableId: table2.id,
      sourceColumnId: fkColumn.id,
      targetTableId: table.id,
      targetColumnId: column.id,
      constraintName: 'fk_test_table',
    });
    console.log(`  ✓ 显式关系已创建 (ID: ${explicitRel.id})`);

    // 4.4 按表获取显式关系
    console.log('  4.3 按表获取显式关系...');
    const explicitRels = await metadataRepository.getExplicitRelationshipsBySourceTable(table2.id);
    console.log(`  ✓ 找到 ${explicitRels.length} 个显式关系`);

    // 4.5 Upsert 显式关系
    console.log('  4.4 Upsert 显式关系...');
    const upsertedRel = await metadataRepository.upsertExplicitRelationship({
      sourceTableId: table2.id,
      sourceColumnId: fkColumn.id,
      targetTableId: table.id,
      targetColumnId: column.id,
      constraintName: 'fk_test_table_updated',
    });
    console.log(`  ✓ 显式关系 Upsert 成功: ${upsertedRel.constraintName}`);

    console.log();

    // ========================================
    // 5. 推断关系测试
    // ========================================
    console.log('5. 测试推断关系操作...');

    // 5.1 创建推断关系
    console.log('  5.1 创建推断关系...');
    const inferredRel = await metadataRepository.createInferredRelationship({
      sourceTableId: table2.id,
      sourceColumnId: fkColumn.id,
      targetTableId: table.id,
      targetColumnId: column.id,
      confidenceScore: 0.95,
      inferenceMethod: 'rule',
    });
    console.log(`  ✓ 推断关系已创建 (ID: ${inferredRel.id}, 置信度: ${inferredRel.confidenceScore})`);

    // 5.2 按表获取推断关系
    console.log('  5.2 按表获取推断关系...');
    const inferredRels = await metadataRepository.getInferredRelationshipsBySourceTable(table2.id);
    console.log(`  ✓ 找到 ${inferredRels.length} 个推断关系`);

    // 5.3 验证推断关系
    console.log('  5.3 验证推断关系...');
    const verifiedRel = await metadataRepository.verifyInferredRelationship(
      inferredRel.id,
      {
        isVerified: true,
        verifiedBy: 'test_user',
      }
    );
    console.log(`  ✓ 推断关系已验证: ${verifiedRel.isVerified}`);

    // 5.4 Upsert 推断关系
    console.log('  5.4 Upsert 推断关系...');
    const upsertedInferredRel = await metadataRepository.upsertInferredRelationship({
      sourceTableId: table2.id,
      sourceColumnId: fkColumn.id,
      targetTableId: table.id,
      targetColumnId: column.id,
      confidenceScore: 0.98,
      inferenceMethod: 'ai',
    });
    console.log(`  ✓ 推断关系 Upsert 成功, 新置信度: ${upsertedInferredRel.confidenceScore}`);

    console.log();

    // ========================================
    // 6. 元数据变更追踪测试
    // ========================================
    console.log('6. 测试元数据变更追踪...');

    // 6.1 创建变更记录
    console.log('  6.1 创建变更记录...');
    const change = await metadataRepository.createMetadataChange({
      changeType: 'table_modified',
      entityType: 'table',
      entityId: table.id,
      oldValue: { rowCount: 100 },
      newValue: { rowCount: 300 },
    });
    console.log(`  ✓ 变更记录已创建 (ID: ${change.id})`);

    // 6.2 获取变更历史
    console.log('  6.2 获取表的变更历史...');
    const changes = await metadataRepository.getMetadataChanges('table', table.id);
    console.log(`  ✓ 找到 ${changes.length} 条变更记录`);

    // 6.3 获取最近的变更
    console.log('  6.3 获取最近的变更...');
    const recentChanges = await metadataRepository.getRecentChanges(10);
    console.log(`  ✓ 最近 ${recentChanges.length} 条变更`);
    recentChanges.forEach((c) => {
      console.log(`     - ${c.changeType} (${c.entityType}) at ${c.changedAt.toISOString()}`);
    });

    console.log();

    // ========================================
    // 7. 清理测试数据
    // ========================================
    console.log('7. 清理测试数据...');

    // 7.1 删除字段
    console.log('  7.1 删除字段...');
    await metadataRepository.deleteColumn(column.id);
    console.log('  ✓ 字段已删除');

    // 7.2 删除表
    console.log('  7.2 删除表...');
    await metadataRepository.deleteTable(table.id);
    await metadataRepository.deleteTable(table2.id);
    console.log('  ✓ 表已删除');

    // 7.3 删除数据库
    console.log('  7.3 删除数据库...');
    await metadataRepository.deleteDatabase(database.id);
    console.log('  ✓ 数据库已删除');

    // 7.4 删除数据源
    console.log('  7.4 删除数据源...');
    await prisma.dataSource.delete({ where: { id: testDataSource.id } });
    console.log('  ✓ 数据源已删除');

    console.log();
    console.log('========================================');
    console.log('✓ 所有测试通过');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n✗ 测试失败:', error);

    // 清理可能残留的测试数据
    try {
      if (testColumnId) {
        await metadataRepository.deleteColumn(testColumnId).catch(() => {});
      }
      if (testTableId) {
        await metadataRepository.deleteTable(testTableId).catch(() => {});
      }
      if (testDatabaseId) {
        await metadataRepository.deleteDatabase(testDatabaseId).catch(() => {});
      }
      if (testDataSource) {
        await prisma.dataSource.delete({ where: { id: testDataSource.id } }).catch(() => {});
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
  testMetadataRepository()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
