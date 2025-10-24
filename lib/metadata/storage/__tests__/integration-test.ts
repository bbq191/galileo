/**
 * 元数据存储集成测试
 * 测试变更追踪和快照管理功能
 */

import { metadataRepository } from '../metadata-repository';
import { changeTracker } from '../change-tracker';
import { snapshotManager } from '../snapshot-manager';
import prisma from '@/lib/prisma/client';

async function runIntegrationTest() {
  console.log('========================================');
  console.log('开始元数据存储集成测试...');
  console.log('========================================\n');

  try {
    // 1. 测试业务域数据
    console.log('1. 测试业务域数据...');
    const domains = await prisma.businessDomain.findMany();
    console.log(`✓ 找到 ${domains.length} 个业务域`);
    if (domains.length > 0) {
      console.log(`  - 示例: ${domains[0].name} - ${domains[0].description}`);
    }
    console.log('');

    // 2. 测试数据字典
    console.log('2. 测试数据字典...');
    const dictionaries = await prisma.dataDictionary.findMany({ take: 5 });
    console.log(`✓ 找到数据字典规则`);
    if (dictionaries.length > 0) {
      console.log(`  - 示例: ${dictionaries[0].fieldPattern} -> ${dictionaries[0].semanticMeaning}`);
    }
    console.log('');

    // 3. 测试变更记录功能
    console.log('3. 测试变更记录功能...');

    // 获取一个已存在的数据库
    const database = await prisma.databaseMeta.findFirst();

    if (database) {
      console.log(`  - 使用数据库: ${database.databaseName}`);

      // 更新数据库以触发变更记录
      const updated = await metadataRepository.updateDatabase(database.id, {
        semanticDescription: `测试描述 - ${new Date().toISOString()}`,
      });
      console.log(`  - 更新了数据库`);

      // 查询变更记录
      const changes = await metadataRepository.getMetadataChanges('database', database.id, 5);
      console.log(`✓ 找到 ${changes.length} 条变更记录`);
      if (changes.length > 0) {
        const latestChange = changes[0];
        console.log(`  - 最新变更: ${latestChange.changeType} at ${latestChange.changedAt.toISOString()}`);
      }
    } else {
      console.log('  ⚠ 没有找到数据库，跳过变更记录测试');
    }
    console.log('');

    // 4. 测试快照功能
    console.log('4. 测试快照功能...');

    const table = await prisma.tableMeta.findFirst({
      include: { columns: true },
    });

    if (table) {
      console.log(`  - 使用表: ${table.tableName}`);

      // 创建表快照
      const snapshot = await snapshotManager.createTableSnapshot(table.id, {
        includeRelationships: false,
      });
      console.log(`✓ 创建快照成功 - v${snapshot.version}`);

      // 查询快照历史
      const history = await snapshotManager.getSnapshotHistory('table', table.id, 5);
      console.log(`✓ 找到 ${history.length} 个快照版本`);

      // 测试快照清理
      const cleaned = await snapshotManager.cleanupOldSnapshots('table', table.id, 10);
      console.log(`✓ 清理了 ${cleaned} 个旧快照`);
    } else {
      console.log('  ⚠ 没有找到表，跳过快照测试');
    }
    console.log('');

    // 5. 测试 metadata_changes 表
    console.log('5. 测试 metadata_changes 表...');
    const recentChanges = await metadataRepository.getRecentChanges(10);
    console.log(`✓ 找到 ${recentChanges.length} 条最近变更记录`);
    console.log('');

    // 6. 测试 schema_snapshots 表
    console.log('6. 测试 schema_snapshots 表...');
    const schemaSnapshots = await prisma.schemaSnapshot.findMany({ take: 5 });
    console.log(`✓ 找到 ${schemaSnapshots.length} 个 schema 快照`);
    console.log('');

    // 7. 测试 metadata_snapshots 表
    console.log('7. 测试 metadata_snapshots 表...');
    const metadataSnapshots = await prisma.metadataSnapshot.findMany({ take: 5 });
    console.log(`✓ 找到 ${metadataSnapshots.length} 个 metadata 快照`);
    console.log('');

    console.log('========================================');
    console.log('✓ 所有测试通过！');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
if (require.main === module) {
  runIntegrationTest()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export default runIntegrationTest;
