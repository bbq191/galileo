/**
 * 最终测试：验证查询修复
 */

import { IntentRecognizer } from '@/lib/nlp/intent-recognizer';
import { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import { SQLGenerator } from '@/lib/sql/generator/sql-generator';
import prisma from '@/lib/prisma/client';

async function main() {
  try {
    console.log('=== 最终测试：统计tb_chatroom_relation表的数据 ===\n');

    const testQuery = '统计tb_chatroom_relation表的数据';

    // 1. 意图识别
    console.log('1. 意图识别...');
    const intentRecognizer = new IntentRecognizer();
    const intent = await intentRecognizer.recognize(testQuery);
    console.log('✓ 意图类型:', intent.type);
    console.log('✓ 涉及的表:', intent.entities.tables);
    console.log('✓ 涉及的字段:', intent.entities.columns);
    if (intent.ambiguities && intent.ambiguities.length > 0) {
      console.log('⚠️  警告:');
      intent.ambiguities.forEach(a => console.log(`   - ${a}`));
    }

    // 2. 元数据检索
    console.log('\n2. 元数据检索...');
    const metadataRetriever = new MetadataRetriever();
    const context = await metadataRetriever.retrieveContext(intent);
    console.log(`✓ 检索到 ${context.tables.length} 个表`);
    context.tables.forEach(t => {
      console.log(`  表: ${t.databaseName}.${t.tableName}`);
      console.log(`  字段: ${t.columns.map(c => c.columnName).join(', ')}`);
    });

    // 3. SQL 生成
    console.log('\n3. SQL 生成...');
    const sqlGenerator = new SQLGenerator();
    const sqlResult = await sqlGenerator.generate(intent, context, {
      useCache: false,
      maxRetries: 3,
    });

    console.log('\n✅ SQL 生成成功！');
    console.log('生成的 SQL:');
    console.log('  ' + sqlResult.sql);
    console.log('\nSQL 说明:', sqlResult.explanation);
    console.log('置信度:', sqlResult.confidence);
    console.log('使用的表:', sqlResult.usedTables);
    console.log('使用的字段:', sqlResult.usedColumns);

    if (sqlResult.warnings && sqlResult.warnings.length > 0) {
      console.log('\n⚠️  警告:');
      sqlResult.warnings.forEach(w => console.log(`   - ${w}`));
    }

    // 验证 SQL
    console.log('\n4. 验证生成的 SQL...');
    const sql = sqlResult.sql.toUpperCase();

    const checks = [
      { name: '不包含 TOP 语法', pass: !sql.includes(' TOP '), result: '' },
      { name: '使用 MySQL 语法', pass: sql.includes('LIMIT') || !sql.includes('TOP'), result: '' },
      { name: '不包含无效占位符', pass: !/WHERE\s+\?/i.test(sqlResult.sql) && !/\?\s+LIMIT/i.test(sqlResult.sql), result: '' },
      { name: '只使用表中字段', pass: sqlResult.usedColumns.every(col =>
        context.tables[0].columns.some(c => c.columnName === col)
      ), result: '' },
    ];

    checks.forEach(check => {
      console.log(`${check.pass ? '✓' : '✗'} ${check.name}`);
    });

    const allPassed = checks.every(c => c.pass);
    console.log(`\n${allPassed ? '🎉 所有检查通过！' : '❌ 部分检查失败'}`);

    // 清理
    await intentRecognizer.cleanup();
    await metadataRetriever.cleanup();

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
