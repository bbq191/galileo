/**
 * 业务域种子数据
 * 用于跨库关系推断的业务域分组
 */

import { PrismaClient } from '@/app/generated/prisma';

const prisma = new PrismaClient();

const businessDomainSeeds = [
  {
    name: '默认域',
    description: '未分类的数据库默认归属此域',
    ownerTeam: '平台团队',
  },
  {
    name: '用户中心',
    description: '用户账号、权限、认证等相关数据库',
    ownerTeam: '用户团队',
  },
  {
    name: '订单系统',
    description: '订单、交易、支付等相关数据库',
    ownerTeam: '订单团队',
  },
  {
    name: '商品中心',
    description: '商品、库存、分类等相关数据库',
    ownerTeam: '商品团队',
  },
  {
    name: '财务系统',
    description: '财务核算、报表、结算等相关数据库',
    ownerTeam: '财务团队',
  },
  {
    name: '营销系统',
    description: '营销活动、优惠券、会员等相关数据库',
    ownerTeam: '营销团队',
  },
  {
    name: '物流系统',
    description: '物流、配送、仓储等相关数据库',
    ownerTeam: '物流团队',
  },
  {
    name: '客服系统',
    description: '客服、工单、反馈等相关数据库',
    ownerTeam: '客服团队',
  },
  {
    name: '数据分析',
    description: '数据仓库、BI、统计分析等相关数据库',
    ownerTeam: '数据团队',
  },
  {
    name: '运营系统',
    description: '运营管理、内容管理等相关数据库',
    ownerTeam: '运营团队',
  },
];

async function seedBusinessDomains() {
  console.log('开始初始化业务域...');

  for (const domain of businessDomainSeeds) {
    await prisma.businessDomain.upsert({
      where: { name: domain.name },
      update: {},
      create: domain,
    });
  }

  console.log(`✓ 成功创建 ${businessDomainSeeds.length} 个业务域`);
}

export default seedBusinessDomains;

// 如果直接运行此脚本
if (require.main === module) {
  seedBusinessDomains()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
