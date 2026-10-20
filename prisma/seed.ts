/**
 * Prisma Seed Script
 * 初始化数据库种子数据
 */

// Prisma 7 不再自动加载 .env，必须在导入数据库客户端之前加载
import 'dotenv/config';
import prisma from '@/lib/prisma/client';
import seedDataDictionary from './seeds/data-dictionary';
import seedBusinessDomains from './seeds/business-domains';
import seedAdminUser from './seeds/admin-user';

async function main() {
  console.log('========================================');
  console.log('开始执行数据库种子数据初始化...');
  console.log('========================================\n');

  // 初始化管理员账号
  await seedAdminUser();

  console.log('');

  // 初始化业务域
  await seedBusinessDomains();

  console.log('');

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
    await prisma.$disconnect();
  });
