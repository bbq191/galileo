#!/usr/bin/env tsx

/**
 * 测试修复后的查询流程
 */

import { IntentRecognizer } from '../lib/nlp/intent-recognizer';
import { MetadataRetriever } from '../lib/metadata/retrieval/metadata-retriever';
import { SQLGenerator } from '../lib/sql/generator/sql-generator';

async function testFixedQuery() {
  console.log('=== 测试修复后的查询流程 ===\n');

  const query = '寿险观看时长top10';
  console.log(`测试查询: "${query}"\n`);

  try {
    // 1. 意图识别
    console.log('1. 意图识别...');
    const intentRecognizer = new IntentRecognizer();
    const intent = await intentRecognizer.recognize(query, { useCache: false });

    console.log('识别的意图:');
    console.log(`  类型: ${intent.type}`);
    console.log(`  涉及的表: ${intent.entities.tables.join(', ') || '无'}`);
    console.log(`  涉及的字段: ${intent.entities.columns.join(', ') || '无'}`);
    console.log(`  聚合操作: ${intent.aggregations ? JSON.stringify(intent.aggregations) : '无'}`);
    console.log(`  条件: ${JSON.stringify(intent.conditions)}`);
    if (intent.ambiguities && intent.ambiguities.length > 0) {
      console.log(`  警告/歧义:`);
      intent.ambiguities.forEach((amb, i) => console.log(`    ${i + 1}. ${amb}`));
    }
    console.log();

    // 2. 元数据检索
    console.log('2. 元数据检索...');
    const metadataRetriever = new MetadataRetriever();
    const context = await metadataRetriever.retrieveContext(intent);

    console.log(`检索到 ${context.tables.length} 个表:`);
    context.tables.forEach((table, i) => {
      console.log(`  ${i + 1}. ${table.databaseName}.${table.tableName}`);
      console.log(`     字段 (${table.columns.length}): ${table.columns.map(c => c.columnName).join(', ')}`);
    });
    console.log();

    // 3. SQL 生成
    console.log('3. SQL 生成...');
    const sqlGenerator = new SQLGenerator();
    const result = await sqlGenerator.generate(intent, context, { useCache: false });

    console.log('生成的 SQL:');
    console.log(result.sql);
    console.log();
    console.log('SQL 解释:');
    console.log(result.explanation);
    console.log();
    console.log('使用的表:', result.usedTables.join(', '));
    console.log('使用的字段:', result.usedColumns.join(', '));
    console.log('置信度:', result.confidence);

    if (result.warnings && result.warnings.length > 0) {
      console.log('警告:');
      result.warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
    }

    console.log('\n✅ 测试完成！');

    // 清理
    await intentRecognizer.cleanup();

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error((error as Error).stack);
    process.exit(1);
  }

  process.exit(0);
}

testFixedQuery();
