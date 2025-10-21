/**
 * MySQL Schema 采集器测试
 */

import connectionManager from '@/lib/database/connection-manager';
import type { DatabaseConfig } from '@/lib/database';
import { MySQLSchemaCollector } from '../mysql-schema-collector';

/**
 * 测试 MySQL 采集器
 * 注意：需要本地 MySQL/MariaDB 运行
 */
export async function testMySQLCollector() {
  console.log('\n========================================');
  console.log('MySQL Schema 采集器测试');
  console.log('========================================\n');

  try {
    // 1. 创建测试连接
    const config: DatabaseConfig = {
      id: 'test-collector',
      name: 'Test Collector Connection',
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '', // 根据实际情况修改
      databases: ['galileo_metadata'],
    };

    console.log('1. 创建数据库连接...');
    await connectionManager.createConnection(config);
    const pool = await connectionManager.getConnection('test-collector');
    console.log('✓ 连接创建成功\n');

    // 2. 创建采集器
    console.log('2. 创建 MySQL 采集器...');
    const collector = new MySQLSchemaCollector(pool);
    console.log('✓ 采集器创建成功\n');

    // 3. 测试采集数据库列表
    console.log('3. 测试采集数据库列表...');
    const databases = await collector.collectDatabases('test-collector');
    console.log(`✓ 找到 ${databases.length} 个数据库`);
    databases.forEach((db) => {
      console.log(`   - ${db.name} (${db.tableCount} 张表)`);
    });
    console.log();

    // 4. 测试采集表
    const testDb = 'galileo_metadata';
    console.log(`4. 测试采集表 (${testDb})...`);
    const tables = await collector.collectTables('test-collector', testDb);
    console.log(`✓ 找到 ${tables.length} 张表`);
    tables.slice(0, 5).forEach((table) => {
      console.log(
        `   - ${table.tableName} (${table.engine || 'N/A'}) - ${table.rowCount || 0} 行`
      );
    });
    if (tables.length > 5) {
      console.log(`   ... 还有 ${tables.length - 5} 张表`);
    }
    console.log();

    // 5. 测试采集字段（第一张表）
    if (tables.length > 0) {
      const firstTable = tables[0].tableName;
      console.log(`5. 测试采集字段 (${testDb}.${firstTable})...`);
      const columns = await collector.collectColumns(
        'test-collector',
        testDb,
        firstTable
      );
      console.log(`✓ 找到 ${columns.length} 个字段`);
      columns.slice(0, 5).forEach((col) => {
        console.log(
          `   - ${col.columnName} (${col.columnType}) ${col.isNullable ? 'NULL' : 'NOT NULL'} ${col.columnKey === 'PRI' ? '[PK]' : ''}`
        );
      });
      if (columns.length > 5) {
        console.log(`   ... 还有 ${columns.length - 5} 个字段`);
      }
      console.log();

      // 6. 测试采集索引
      console.log(`6. 测试采集索引 (${testDb}.${firstTable})...`);
      const indexes = await collector.collectIndexes(
        'test-collector',
        testDb,
        firstTable
      );
      console.log(`✓ 找到 ${indexes.length} 个索引`);
      indexes.forEach((idx) => {
        const cols = idx.columns.map((c) => c.columnName).join(', ');
        console.log(
          `   - ${idx.indexName} (${idx.indexType}) ${idx.isUnique ? '[UNIQUE]' : ''}: ${cols}`
        );
      });
      console.log();
    }

    // 7. 测试采集外键
    console.log(`7. 测试采集外键 (${testDb})...`);
    const foreignKeys = await collector.collectForeignKeys(
      'test-collector',
      testDb
    );
    console.log(`✓ 找到 ${foreignKeys.length} 个外键`);
    foreignKeys.slice(0, 5).forEach((fk) => {
      console.log(
        `   - ${fk.tableName}.${fk.columnName} → ${fk.referencedTableName}.${fk.referencedColumnName}`
      );
    });
    if (foreignKeys.length > 5) {
      console.log(`   ... 还有 ${foreignKeys.length - 5} 个外键`);
    }
    console.log();

    // 8. 测试采集视图
    console.log(`8. 测试采集视图 (${testDb})...`);
    const views = await collector.collectViews('test-collector', testDb);
    console.log(`✓ 找到 ${views.length} 个视图`);
    views.forEach((view) => {
      console.log(
        `   - ${view.viewName} ${view.isUpdatable ? '[UPDATABLE]' : ''}`
      );
    });
    console.log();

    // 9. 测试完整采集
    console.log(`9. 测试完整采集 (${testDb})...`);
    const result = await collector.collectAll('test-collector', testDb);
    console.log('✓ 完整采集成功');
    console.log(`\n采集统计:`);
    console.log(`  - 表: ${result.stats.tableCount}`);
    console.log(`  - 字段: ${result.stats.columnCount}`);
    console.log(`  - 索引: ${result.stats.indexCount}`);
    console.log(`  - 外键: ${result.stats.foreignKeyCount}`);
    console.log(`  - 视图: ${result.stats.viewCount}`);
    console.log(`  - 耗时: ${result.stats.duration}ms`);

    // 10. 清理
    console.log('\n10. 清理测试连接...');
    await connectionManager.closeConnection('test-collector');
    console.log('✓ 连接已关闭');

    console.log('\n========================================');
    console.log('✓ 所有测试通过');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n✗ 测试失败:', error);
    throw error;
  }
}

// 如果直接运行此文件
if (require.main === module) {
  testMySQLCollector()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
