/**
 * 测试脚本：验证查询修复
 */

import { IntentRecognizer } from '@/lib/nlp/intent-recognizer';
import { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('=== 测试查询修复 ===\n');

    const testQuery = '统计tb_chatroom_relation表的数据';

    // 1. 意图识别
    console.log(`1. 测试意图识别: "${testQuery}"\n`);
    const intentRecognizer = new IntentRecognizer();
    const intent = await intentRecognizer.recognize(testQuery);

    console.log('识别的意图:');
    console.log('  类型:', intent.type);
    console.log('  涉及的表:', intent.entities.tables);
    console.log('  涉及的字段:', intent.entities.columns);
    console.log('  聚合操作:', intent.aggregations);
    console.log('  条件:', intent.conditions);
    console.log('  警告/歧义:', intent.ambiguities);

    // 2. 元数据检索
    console.log('\n2. 测试元数据检索\n');
    const metadataRetriever = new MetadataRetriever();
    const context = await metadataRetriever.retrieveContext(intent);

    console.log(`检索到 ${context.tables.length} 个表:`);
    context.tables.forEach(t => {
      console.log(`\n  表: ${t.databaseName}.${t.tableName}`);
      console.log(`  字段 (${t.columns.length}):`);
      t.columns.forEach(c => {
        console.log(`    - ${c.columnName} (${c.dataType})`);
      });
    });

    // 3. SQL 生成
    console.log('\n3. 测试 SQL 生成\n');
    const sqlGenerator = new SQLGenerator();
    const sqlResult = await sqlGenerator.generate(intent, context);

    console.log('生成的 SQL:');
    console.log(sqlResult.sql);
    console.log('\nSQL 解释:');
    console.log(sqlResult.explanation);
    console.log('\n使用的表:', sqlResult.usedTables);
    console.log('使用的字段:', sqlResult.usedColumns);
    console.log('置信度:', sqlResult.confidence);

    if (sqlResult.warnings && sqlResult.warnings.length > 0) {
      console.log('\n⚠️  警告:');
      sqlResult.warnings.forEach(w => console.log(`  - ${w}`));
    }

    console.log('\n✅ 测试完成！');

    // 清理
    await intentRecognizer.cleanup();
    await metadataRetriever.cleanup();

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
      console.error('堆栈:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
