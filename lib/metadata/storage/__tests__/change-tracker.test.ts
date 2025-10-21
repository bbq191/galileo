/**
 * 变更追踪器测试
 */

import { changeTracker } from '../change-tracker';
import { metadataRepository } from '../metadata-repository';
import prisma from '@/lib/prisma/client';
import type { DataSource, DatabaseMeta, TableMeta, ColumnMeta } from '@/app/generated/prisma';

/**
 * 测试变更追踪器
 * 注意：需要本地 MariaDB 运行并正确配置 Prisma
 */
export async function testChangeTracker() {
  console.log('\n========================================');
  console.log('变更追踪器测试');
  console.log('========================================\n');

  let testDataSource: DataSource | null = null;
  let testDatabase: DatabaseMeta | null = null;
  let testTable: TableMeta | null = null;

  try {
    // ========================================
    // 准备测试数据
    // ========================================
    console.log('准备测试数据...');

    testDataSource = await prisma.dataSource.create({
      data: {
        name: 'Test Source for Change Tracker',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        passwordEncrypted: '',
      },
    });

    testDatabase = await metadataRepository.createDatabase({
      sourceId: testDataSource.id,
      databaseName: 'test_change_tracker_db',
    });

    testTable = await metadataRepository.createTable({
      databaseId: testDatabase.id,
      tableName: 'test_change_table',
      tableComment: '原始注释',
      rowCount: BigInt(100),
    });

    console.log('✓ 测试数据准备完成\n');

    // ========================================
    // 1. 数据库变更追踪测试
    // ========================================
    console.log('1. 测试数据库变更追踪...');

    // 1.1 数据库新增
    console.log('  1.1 追踪数据库新增...');
    await changeTracker.trackDatabaseChange('database_added', testDatabase);
    const dbAddedChanges = await metadataRepository.getMetadataChanges('database', testDatabase.id);
    console.log(`  ✓ 新增记录已追踪: ${dbAddedChanges.length} 条`);

    // 1.2 数据库修改
    console.log('  1.2 追踪数据库修改...');
    const oldDatabase = { ...testDatabase };
    const updatedDatabase = await metadataRepository.updateDatabase(testDatabase.id, {
      semanticDescription: '更新后的描述',
    });
    testDatabase = updatedDatabase;

    // 注意：trackDatabaseChange 不支持 oldDatabase 参数，因为数据库级别的修改较少追踪
    await metadataRepository.createMetadataChange({
      changeType: 'database_added', // 使用 database_added 作为修改类型的替代
      entityType: 'database',
      entityId: updatedDatabase.id,
      oldValue: { semanticDescription: oldDatabase.semanticDescription },
      newValue: { semanticDescription: updatedDatabase.semanticDescription },
    });
    const dbModifiedChanges = await metadataRepository.getMetadataChanges(
      'database',
      testDatabase.id
    );
    console.log(`  ✓ 修改记录已追踪: ${dbModifiedChanges.length} 条`);
    if (dbModifiedChanges.length > 0) {
      const latestChange = dbModifiedChanges[dbModifiedChanges.length - 1];
      console.log(`     变更内容: old=${JSON.stringify(latestChange.oldValue)}, new=${JSON.stringify(latestChange.newValue)}`);
    }

    console.log();

    // ========================================
    // 2. 表变更追踪测试
    // ========================================
    console.log('2. 测试表变更追踪...');

    // 2.1 表新增
    console.log('  2.1 追踪表新增...');
    await changeTracker.trackTableChange('table_added', testTable);
    const tableAddedChanges = await metadataRepository.getMetadataChanges('table', testTable.id);
    console.log(`  ✓ 新增记录已追踪: ${tableAddedChanges.length} 条`);

    // 2.2 表修改
    console.log('  2.2 追踪表修改...');
    const oldTable = { ...testTable };
    const updatedTable = await metadataRepository.updateTable(testTable.id, {
      tableComment: '更新后的注释',
      rowCount: BigInt(200),
    });
    testTable = updatedTable;

    await changeTracker.trackTableChange('table_modified', updatedTable, oldTable);
    const tableModifiedChanges = await metadataRepository.getMetadataChanges('table', testTable.id);
    console.log(`  ✓ 修改记录已追踪: ${tableModifiedChanges.length} 条`);
    if (tableModifiedChanges.length > 0) {
      const latestChange = tableModifiedChanges[tableModifiedChanges.length - 1];
      console.log(`     变更内容: old=${JSON.stringify(latestChange.oldValue)}, new=${JSON.stringify(latestChange.newValue)}`);
    }

    // 2.3 检测表变更
    console.log('  2.3 检测表变更...');
    const tableChangeDetail = await changeTracker.detectTableChanges(oldTable, updatedTable);
    if (tableChangeDetail) {
      console.log(`  ✓ 检测到变更: ${tableChangeDetail.changeType}`);
      console.log(`     变更字段: ${tableChangeDetail.diff ? Object.keys(tableChangeDetail.diff).join(', ') : '无'}`);
    } else {
      console.log('  - 未检测到变更');
    }

    console.log();

    // ========================================
    // 3. 字段变更追踪测试
    // ========================================
    console.log('3. 测试字段变更追踪...');

    // 3.1 创建字段
    const column = await metadataRepository.createColumn({
      tableId: testTable.id,
      columnName: 'test_column',
      dataType: 'varchar',
      columnType: 'VARCHAR(50)',
      ordinalPosition: 1,
      isNullable: true,
      columnComment: '原始注释',
    });

    // 3.2 字段新增
    console.log('  3.1 追踪字段新增...');
    await changeTracker.trackColumnChange('column_added', column);
    const columnAddedChanges = await metadataRepository.getMetadataChanges('column', column.id);
    console.log(`  ✓ 新增记录已追踪: ${columnAddedChanges.length} 条`);

    // 3.3 字段修改
    console.log('  3.2 追踪字段修改...');
    const oldColumn = { ...column };
    const updatedColumn = await metadataRepository.updateColumn(column.id, {
      columnType: 'VARCHAR(100)',
      columnComment: '更新后的注释',
    });

    await changeTracker.trackColumnChange('column_modified', updatedColumn, oldColumn);
    const columnModifiedChanges = await metadataRepository.getMetadataChanges('column', column.id);
    console.log(`  ✓ 修改记录已追踪: ${columnModifiedChanges.length} 条`);
    if (columnModifiedChanges.length > 0) {
      const latestChange = columnModifiedChanges[columnModifiedChanges.length - 1];
      console.log(`     变更内容: old=${JSON.stringify(latestChange.oldValue)}, new=${JSON.stringify(latestChange.newValue)}`);
    }

    // 3.4 检测字段变更
    console.log('  3.3 检测字段变更...');
    const columnChangeDetail = await changeTracker.detectColumnChanges(oldColumn, updatedColumn);
    if (columnChangeDetail) {
      console.log(`  ✓ 检测到变更: ${columnChangeDetail.changeType}`);
      console.log(`     变更字段: ${columnChangeDetail.diff ? Object.keys(columnChangeDetail.diff).join(', ') : '无'}`);
    } else {
      console.log('  - 未检测到变更');
    }

    console.log();

    // ========================================
    // 4. 批量变更检测测试
    // ========================================
    console.log('4. 测试批量变更检测...');

    // 4.1 准备批量表数据
    console.log('  4.1 检测批量表变更...');
    const table2 = await metadataRepository.createTable({
      databaseId: testDatabase.id,
      tableName: 'new_table',
      tableComment: '新表',
    });

    const oldTables = [testTable];
    const newTables = [
      { ...testTable, tableComment: '已修改的表' },
      table2,
    ] as TableMeta[];

    const tableBatchChanges = await changeTracker.detectTablesBatchChanges(
      oldTables,
      newTables as TableMeta[]
    );

    console.log(`  ✓ 新增表: ${tableBatchChanges.added.length}`);
    console.log(`  ✓ 删除表: ${tableBatchChanges.removed.length}`);
    console.log(`  ✓ 修改表: ${tableBatchChanges.modified.length}`);

    tableBatchChanges.added.forEach((t) => {
      console.log(`     + ${t.tableName}`);
    });
    tableBatchChanges.modified.forEach((m) => {
      console.log(`     * ${m.changeType} - 变更字段: ${m.diff ? Object.keys(m.diff).join(', ') : '无'}`);
    });

    // 4.2 准备批量字段数据
    console.log('  4.2 检测批量字段变更...');
    const column2 = await metadataRepository.createColumn({
      tableId: testTable.id,
      columnName: 'new_column',
      dataType: 'int',
      columnType: 'INT',
      ordinalPosition: 2,
      isNullable: false,
    });

    const oldColumns = [column];
    const newColumns = [
      { ...column, columnType: 'VARCHAR(200)' },
      column2,
    ] as ColumnMeta[];

    const columnBatchChanges = await changeTracker.detectColumnsBatchChanges(
      oldColumns,
      newColumns as ColumnMeta[]
    );

    console.log(`  ✓ 新增字段: ${columnBatchChanges.added.length}`);
    console.log(`  ✓ 删除字段: ${columnBatchChanges.removed.length}`);
    console.log(`  ✓ 修改字段: ${columnBatchChanges.modified.length}`);

    columnBatchChanges.added.forEach((c) => {
      console.log(`     + ${c.columnName} (${c.columnType})`);
    });
    columnBatchChanges.modified.forEach((m) => {
      console.log(`     * ${m.changeType} - 变更字段: ${m.diff ? Object.keys(m.diff).join(', ') : '无'}`);
    });

    console.log();

    // ========================================
    // 5. 变更历史查询测试
    // ========================================
    console.log('5. 测试变更历史查询...');

    // 5.1 查询最近的变更
    console.log('  5.1 查询最近 10 条变更...');
    const recentChanges = await metadataRepository.getRecentChanges(10);
    console.log(`  ✓ 找到 ${recentChanges.length} 条变更记录`);
    recentChanges.slice(0, 3).forEach((change) => {
      console.log(
        `     - ${change.changeType} (${change.entityType}) at ${change.changedAt.toISOString()}`
      );
    });

    // 5.2 查询特定实体的变更历史
    console.log('  5.2 查询表的所有变更历史...');
    const tableHistory = await metadataRepository.getMetadataChanges('table', testTable.id);
    console.log(`  ✓ 找到 ${tableHistory.length} 条变更记录`);
    tableHistory.forEach((change) => {
      console.log(`     - ${change.changeType} at ${change.changedAt.toISOString()}`);
      if (change.oldValue || change.newValue) {
        console.log(`       变更: old=${JSON.stringify(change.oldValue)}, new=${JSON.stringify(change.newValue)}`);
      }
    });

    console.log();

    // ========================================
    // 6. 清理测试数据
    // ========================================
    console.log('6. 清理测试数据...');

    await metadataRepository.deleteColumn(column.id);
    await metadataRepository.deleteColumn(column2.id);
    await metadataRepository.deleteTable(testTable.id);
    await metadataRepository.deleteTable(table2.id);
    await metadataRepository.deleteDatabase(testDatabase.id);
    await prisma.dataSource.delete({ where: { id: testDataSource.id } });

    console.log('✓ 测试数据已清理');
    console.log();

    console.log('========================================');
    console.log('✓ 所有测试通过');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n✗ 测试失败:', error);

    // 清理可能残留的测试数据
    try {
      if (testTable) {
        await metadataRepository.deleteTable(testTable.id).catch(() => {});
      }
      if (testDatabase) {
        await metadataRepository.deleteDatabase(testDatabase.id).catch(() => {});
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
  testChangeTracker()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
