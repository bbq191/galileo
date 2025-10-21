/**
 * Prisma Seed Script
 * 初始化数据库种子数据
 */

import seedDataDictionary from './seeds/data-dictionary';

async function main() {
  console.log('========================================');
  console.log('开始执行数据库种子数据初始化...');
  console.log('========================================\n');

  // 初始化数据字典
  await seedDataDictionary();

  console.log('\n========================================');
  console.log('✓ 所有种子数据初始化完成');
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('种子数据初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    const { PrismaClient } = await import('@/app/generated/prisma');
    const prisma = new PrismaClient();
    await prisma.$disconnect();
  });
