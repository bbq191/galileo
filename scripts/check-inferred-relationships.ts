/**
 * 检查推断关系数据
 * 用于调试跨库关系推断功能
 */

import prisma from '@/lib/prisma/client';

async function checkInferredRelationships() {
  console.log('\n========================================');
  console.log('检查推断关系数据');
  console.log('========================================\n');

  try {
    // 1. 检查所有数据源
    const dataSources = await prisma.dataSource.findMany({
      select: {
        id: true,
        name: true,
        databases: {
          select: {
            id: true,
            databaseName: true,
          },
        },
      },
    });

    console.log(`找到 ${dataSources.length} 个数据源:\n`);
    dataSources.forEach((ds) => {
      console.log(`  [${ds.id}] ${ds.name}`);
      ds.databases.forEach((db) => {
        console.log(`    - ${db.databaseName} (ID: ${db.id})`);
      });
    });

    // 2. 检查推断关系总数
    const totalInferred = await prisma.inferredRelationship.count();
    console.log(`\n推断关系总数: ${totalInferred}\n`);

    if (totalInferred === 0) {
      console.log('⚠️  没有找到任何推断关系！\n');
      console.log('可能的原因:');
      console.log('  1. 还没有执行关系推断');
      console.log('  2. 推断过程中出现错误');
      console.log('  3. 没有发现符合条件的关系\n');
      return;
    }

    // 3. 查询所有推断关系，并检查是否跨库
    const inferredRelationships = await prisma.inferredRelationship.findMany({
      include: {
        sourceTable: {
          include: {
            database: {
              select: {
                databaseName: true,
                sourceId: true,
              },
            },
          },
        },
        targetTable: {
          include: {
            database: {
              select: {
                databaseName: true,
                sourceId: true,
              },
            },
          },
        },
        sourceColumn: {
          select: {
            columnName: true,
          },
        },
        targetColumn: {
          select: {
            columnName: true,
          },
        },
      },
      orderBy: {
        confidenceScore: 'desc',
      },
    });

    // 4. 分类统计
    const crossDatabaseRelations = inferredRelationships.filter(
      (rel) =>
        rel.sourceTable.database.databaseName !== rel.targetTable.database.databaseName
    );

    const sameDatabaseRelations = inferredRelationships.filter(
      (rel) =>
        rel.sourceTable.database.databaseName === rel.targetTable.database.databaseName
    );

    console.log('关系统计:');
    console.log(`  - 库内关系: ${sameDatabaseRelations.length}`);
    console.log(`  - 跨库关系: ${crossDatabaseRelations.length} 🔗\n`);

    // 5. 显示跨库关系详情
    if (crossDatabaseRelations.length > 0) {
      console.log('========================================');
      console.log('跨库关系详情:');
      console.log('========================================\n');

      crossDatabaseRelations.forEach((rel, index) => {
        console.log(`${index + 1}. ${rel.sourceTable.database.databaseName}.${rel.sourceTable.tableName}.${rel.sourceColumn.columnName}`);
        console.log(`   → ${rel.targetTable.database.databaseName}.${rel.targetTable.tableName}.${rel.targetColumn.columnName}`);
        console.log(`   置信度: ${rel.confidenceScore}`);
        console.log(`   推断方法: ${rel.inferenceMethod}`);
        console.log(`   已验证: ${rel.isVerified ? '✓' : '✗'}`);
        if (rel.reasoning) {
          console.log(`   推断理由: ${rel.reasoning}`);
        }
        console.log('');
      });
    } else {
      console.log('========================================');
      console.log('⚠️  没有发现跨库关系');
      console.log('========================================\n');

      console.log('可能的原因:');
      console.log('  1. 数据源只有一个数据库');
      console.log('  2. 不同数据库之间没有关联字段');
      console.log('  3. 推断时 crossDatabase 参数设置为 false\n');

      // 显示一些库内关系作为参考
      if (sameDatabaseRelations.length > 0) {
        console.log('库内关系示例（前 5 条）:\n');
        sameDatabaseRelations.slice(0, 5).forEach((rel, index) => {
          console.log(`${index + 1}. ${rel.sourceTable.database.databaseName}.${rel.sourceTable.tableName}.${rel.sourceColumn.columnName}`);
          console.log(`   → ${rel.targetTable.database.databaseName}.${rel.targetTable.tableName}.${rel.targetColumn.columnName}`);
          console.log(`   置信度: ${rel.confidenceScore}\n`);
        });
      }
    }

    // 6. 按推断方法统计
    const byMethod = inferredRelationships.reduce((acc, rel) => {
      acc[rel.inferenceMethod] = (acc[rel.inferenceMethod] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('按推断方法统计:');
    Object.entries(byMethod).forEach(([method, count]) => {
      console.log(`  - ${method}: ${count}`);
    });

    // 7. 置信度分布
    const highConfidence = inferredRelationships.filter(
      (rel) => parseFloat(rel.confidenceScore.toString()) >= 0.8
    ).length;
    const mediumConfidence = inferredRelationships.filter(
      (rel) =>
        parseFloat(rel.confidenceScore.toString()) >= 0.6 &&
        parseFloat(rel.confidenceScore.toString()) < 0.8
    ).length;
    const lowConfidence = inferredRelationships.filter(
      (rel) => parseFloat(rel.confidenceScore.toString()) < 0.6
    ).length;

    console.log('\n置信度分布:');
    console.log(`  - 高 (≥0.8): ${highConfidence}`);
    console.log(`  - 中 (0.6-0.8): ${mediumConfidence}`);
    console.log(`  - 低 (<0.6): ${lowConfidence}`);

    console.log('\n========================================');
    console.log('检查完成');
    console.log('========================================\n');
  } catch (error) {
    console.error('检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkInferredRelationships();
