/**
 * 初始管理员种子数据
 *
 * 环境变量：
 * - ADMIN_USERNAME：管理员用户名，默认 admin
 * - ADMIN_INITIAL_PASSWORD：初始密码；未设置时随机生成并打印一次
 *
 * 幂等：用户已存在时跳过，不会重置密码（重置请使用 npm run user:create -- <username> --reset）
 */

import { randomBytes } from 'crypto';
import prisma from '@/lib/prisma/client';
import { hashPassword } from '@/lib/auth/password';

const MIN_PASSWORD_LENGTH = 12;

async function seedAdminUser() {
  console.log('开始初始化管理员账号...');

  const username = process.env.ADMIN_USERNAME || 'admin';
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`✓ 管理员账号 "${username}" 已存在，跳过（未修改密码）`);
    return;
  }

  const configuredPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (configuredPassword && configuredPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_INITIAL_PASSWORD 长度不能少于 ${MIN_PASSWORD_LENGTH} 个字符`);
  }
  const password = configuredPassword || randomBytes(12).toString('base64url');

  await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      displayName: '系统管理员',
      role: 'admin',
    },
  });

  console.log(`✓ 已创建管理员账号 "${username}"`);
  if (!configuredPassword) {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────');
    console.log(`  │ 初始密码: ${password}`);
    console.log('  │ 仅显示这一次，请立即保存并在首次登录后修改');
    console.log('  └──────────────────────────────────────────────');
  }
}

export default seedAdminUser;

// 如果直接运行此脚本
if (require.main === module) {
  seedAdminUser()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
