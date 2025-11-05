/**
 * 调试脚本：检查 tb_chatroom_relation 表的元数据
 */

import prisma from '@/lib/prisma/client';
import { MetadataRetriever } from '@/lib/metadata/retrieval/metadata-retriever';
import { IntentRecognizer } from '@/lib/nlp/intent-recognizer';

async function main() {
  try {
    console.log('=== 检查 tb_chatroom_relation 表的元数据 ===\n');

    // 1. 查询表元数据
    const table = await prisma.tableMeta.findFirst({
      where: {
        tableName: 'tb_chatroom_relation',
      },
      include: {
        database: true,
        columns: {
          orderBy: { ordinalPosition: 'asc' },
        },
      },
    });

    if (!table) {
      console.log('❌ 未找到表 tb_chatroom_relation');
      return;
    }

    console.log(`✅ 找到表: ${table.databaseName}.${table.tableName}`);
    console.log(`   表注释: ${table.tableComment || '无'}`);
    console.log(`   语义描述: ${table.tableSemanticDescription || '无'}`);
    console.log(`\n字段列表 (${table.columns.length} 个):`);
    table.columns.forEach((col: any) => {
      console.log(`  - ${col.columnName} (${col.dataType})${col.isPrimaryKey ? ' [主键]' : ''}`);
      if (col.columnComment) {
        console.log(`    注释: ${col.columnComment}`);
      }
      if (col.semanticDescription) {
        console.log(`    语义: ${col.semanticDescription}`);
      }
    });

    // 2. 测试意图识别
    console.log('\n=== 测试意图识别 ===\n');
    const intentRecognizer = new IntentRecognizer();
    const intent = await intentRecognizer.recognize('统计tb_chatroom_relation表的数据');
    console.log('识别的意图:', JSON.stringify(intent, null, 2));

    // 3. 测试元数据检索
    console.log('\n=== 测试元数据检索 ===\n');
    const metadataRetriever = new MetadataRetriever();
    const context = await metadataRetriever.retrieveContext(intent);
    console.log(`检索到 ${context.tables.length} 个表:`);
    context.tables.forEach(t => {
      console.log(`\n表: ${t.databaseName}.${t.tableName}`);
      console.log(`字段数: ${t.columns.length}`);
      console.log(`字段列表:`);
      t.columns.forEach(c => {
        console.log(`  - ${c.columnName} (${c.dataType})${c.isPrimaryKey ? ' [主键]' : ''}`);
      });
    });

    // 4. 检查是否有 cash 字段
    console.log('\n=== 检查 cash 字段 ===\n');
    const hasCashField = table.columns.some((col: any) => col.columnName === 'cash');
    console.log(`tb_chatroom_relation 表${hasCashField ? '有' : '没有'} cash 字段`);

    if (!hasCashField) {
      console.log('\n⚠️  问题确认：表中没有 cash 字段，但 SQL 生成器使用了该字段');
    }

    // 清理
    await intentRecognizer.cleanup();
    await metadataRetriever.cleanup();

  } catch (error) {
    console.error('错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
