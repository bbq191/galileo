/**
 * 检查 openser 数据库的关系
 */

import prisma from '@/lib/prisma/client';

async function checkOpenserRelationships() {
  console.log('\n========================================');
  console.log('检查 openser 数据库的关系');
  console.log('========================================\n');

  try {
    // 查找所有与 openser 相关的推断关系
    const openserRels = await prisma.inferredRelationship.findMany({
      include: {
        sourceTable: {
          include: {
            database: {
              select: {
                databaseName: true,
              },
            },
          },
        },
        targetTable: {
          include: {
            database: {
              select: {
                databaseName: true,
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
      where: {
        OR: [
          {
            sourceTable: {
              database: {
                databaseName: 'openser',
              },
            },
          },
          {
            targetTable: {
              database: {
                databaseName: 'openser',
              },
            },
          },
        ],
      },
    });

    console.log(`找到 ${openserRels.length} 条与 openser 相关的关系\n`);

    // 分类统计
    const openserAsSource = openserRels.filter(
      (r) => r.sourceTable.database.databaseName === 'openser'
    );
    const openserAsTarget = openserRels.filter(
      (r) => r.targetTable.database.databaseName === 'openser'
    );

    console.log(`openser 作为源: ${openserAsSource.length} 条`);
    console.log(`openser 作为目标: ${openserAsTarget.length} 条\n`);

    // 显示详情
    if (openserAsSource.length > 0) {
      console.log('========================================');
      console.log('openser 作为源的关系:');
      console.log('========================================\n');

      openserAsSource.forEach((rel, index) => {
        console.log(`${index + 1}. ${rel.sourceTable.database.databaseName}.${rel.sourceTable.tableName}.${rel.sourceColumn.columnName}`);
        console.log(`   → ${rel.targetTable.database.databaseName}.${rel.targetTable.tableName}.${rel.targetColumn.columnName}`);
        console.log(`   置信度: ${rel.confidenceScore}\n`);
      });
    }

    if (openserAsTarget.length > 0) {
      console.log('========================================');
      console.log('openser 作为目标的关系（前10条）:');
      console.log('========================================\n');

      openserAsTarget.slice(0, 10).forEach((rel, index) => {
        console.log(`${index + 1}. ${rel.sourceTable.database.databaseName}.${rel.sourceTable.tableName}.${rel.sourceColumn.columnName}`);
        console.log(`   → ${rel.targetTable.database.databaseName}.${rel.targetTable.tableName}.${rel.targetColumn.columnName}`);
        console.log(`   置信度: ${rel.confidenceScore}\n`);
      });
    }

    console.log('========================================\n');
  } catch (error) {
    console.error('检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkOpenserRelationships();
