#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

async function searchInsuranceTables() {
  const prisma = new PrismaClient();

  try {
    const tables = await prisma.tableMeta.findMany({
      where: {
        OR: [
          { tableName: { contains: '保险' } },
          { tableName: { contains: 'insurance' } },
          { tableName: { contains: '寿险' } },
          { tableComment: { contains: '寿险' } },
          { tableComment: { contains: '保险' } },
          { tableSemanticDescription: { contains: '寿险' } },
          { tableSemanticDescription: { contains: '保险' } }
        ]
      },
      take: 20
    });

    console.log(`找到 ${tables.length} 个保险相关的表:`);
    tables.forEach((table, i) => {
      console.log(`${i + 1}. ${table.tableName}`);
      if (table.tableComment) console.log(`   注释: ${table.tableComment}`);
      if (table.tableSemanticDescription) console.log(`   描述: ${table.tableSemanticDescription}`);
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('搜索失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

searchInsuranceTables();
